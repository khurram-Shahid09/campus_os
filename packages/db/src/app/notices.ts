/** WhatsApp notices (replace printed circulars) and report exports. Numbers come from SQL. */
import { sql } from "drizzle-orm";
import type { Tx } from "../index";
import * as s from "../schema/index";
import { AppError, assertCan, queueToFamily, type AppCtx } from "./commands";

export type NoticeAudience = { kind: "all" } | { kind: "section"; sectionId: string } | { kind: "dues" };

async function audienceFamilies(tx: Tx, ctx: AppCtx, a: NoticeAudience): Promise<string[]> {
  const rows = await tx.execute<{ family_id: string }>(sql`
    select distinct st.family_id from ${s.students} st
    join ${s.enrollments} e on e.student_id = st.id
    join ${s.academicYears} y on y.id = e.academic_year_id and y.is_current
    where st.school_id = ${ctx.schoolId} and st.status = 'active'
      ${a.kind === "section" ? sql`and e.section_id = ${a.sectionId}` : sql``}
      ${a.kind === "dues" ? sql`and exists (select 1 from ${s.invoices} i where i.family_id = st.family_id and i.balance_minor > 0 and i.status <> 'void' and i.due_date < ${ctx.today.toISOString().slice(0, 10)}::date)` : sql``}
  `);
  return rows.map((r) => r.family_id);
}

export async function countNoticeAudience(tx: Tx, ctx: AppCtx, a: NoticeAudience) {
  return (await audienceFamilies(tx, ctx, a)).length;
}

export async function sendNotice(tx: Tx, ctx: AppCtx, input: { audience: NoticeAudience; en: string; ur: string }) {
  assertCan(ctx, "messages.send");
  const en = input.en.trim();
  const ur = input.ur.trim();
  if (!en && !ur) throw new AppError("Write the notice.");
  if (en.length > 1000 || ur.length > 1000) throw new AppError("Keep the notice under 1,000 characters.");
  const families = await audienceFamilies(tx, ctx, input.audience);
  if (!families.length) throw new AppError("No families in that group.");
  let sent = 0;
  for (const familyId of families) {
    const id = await queueToFamily(tx, ctx, familyId, {
      category: "notice", templateKey: "notice",
      body: { ur: ur ? `${ur}\n${ctx.schoolName}` : `${en}\n${ctx.schoolName}`, en: en ? `${en} ${ctx.schoolName}` : "" },
      payload: { audience: input.audience.kind },
    });
    if (id) sent++;
  }
  // one printed circular per family that no longer needs printing
  await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "page_digital", quantity: sent, refTable: "messages", occurredAt: new Date() });
  await tx.insert(s.auditLogs).values({
    schoolId: ctx.schoolId, actorUserId: ctx.userId, action: "send", entity: "notices", after: { audience: input.audience, families: families.length, sent, en, ur },
  });
  return { families: families.length, sent, noPhone: families.length - sent };
}

// ---------------- report exports ----------------

export async function reportDefaulters(tx: Tx, ctx: AppCtx) {
  return tx.execute<Record<string, string | number>>(sql`
    select coalesce(g.name, f.display_name) as "Father / guardian", coalesce(g.phone_e164, '') as "Phone",
      (select string_agg(st.name || ' (' || st.admission_no || ')', ', ') from ${s.students} st where st.family_id = f.id and st.status = 'active') as "Children",
      count(i.id)::int as "Months unpaid", min(i.due_date)::text as "Oldest due date",
      (${ctx.today.toISOString().slice(0, 10)}::date - min(i.due_date))::int as "Days overdue",
      round(sum(i.balance_minor) / 100.0)::int as "Owes (Rs)"
    from ${s.invoices} i join ${s.families} f on f.id = i.family_id left join ${s.guardians} g on g.id = f.primary_guardian_id
    where i.school_id = ${ctx.schoolId} and i.balance_minor > 0 and i.status <> 'void' and i.due_date < ${ctx.today.toISOString().slice(0, 10)}::date
    group by f.id, g.name, f.display_name, g.phone_e164
    order by sum(i.balance_minor) desc
  `);
}

export async function reportPayments(tx: Tx, ctx: AppCtx, from: Date, to: Date) {
  return tx.execute<Record<string, string | number>>(sql`
    select p.paid_on::text as "Date", p.receipt_no as "Receipt no.", coalesce(g.name, f.display_name) as "Paid by",
      p.method as "Method", coalesce(p.reference, '') as "Reference", round(p.amount_minor / 100.0)::int as "Amount (Rs)",
      p.status as "Status", coalesce(u.name, '') as "Received by"
    from ${s.payments} p join ${s.families} f on f.id = p.family_id left join ${s.guardians} g on g.id = f.primary_guardian_id
    left join ${s.users} u on u.id = p.received_by_user_id
    where p.school_id = ${ctx.schoolId} and p.paid_on between ${from.toISOString().slice(0, 10)}::date and ${to.toISOString().slice(0, 10)}::date
    order by p.paid_on, p.receipt_no
  `);
}

export async function reportAttendanceMonth(tx: Tx, ctx: AppCtx, period: string) {
  return tx.execute<Record<string, string | number>>(sql`
    select st.admission_no as "GR", st.name as "Student", c.name || ' ' || sec.name as "Class",
      count(r.id) filter (where r.status = 'present')::int as "Present",
      count(r.id) filter (where r.status = 'late')::int as "Late",
      count(r.id) filter (where r.status = 'absent')::int as "Absent",
      case when count(r.id) = 0 then null else round(100.0 * count(r.id) filter (where r.status <> 'absent') / count(r.id))::int end as "Attendance %"
    from ${s.students} st
    join ${s.enrollments} e on e.student_id = st.id
    join ${s.academicYears} y on y.id = e.academic_year_id and y.is_current
    join ${s.sections} sec on sec.id = e.section_id join ${s.classes} c on c.id = sec.class_id
    left join ${s.attendanceRecords} r on r.student_id = st.id
      and r.session_id in (select a.id from ${s.attendanceSessions} a where a.school_id = ${ctx.schoolId} and to_char(a.date, 'YYYY-MM') = ${period})
    where st.school_id = ${ctx.schoolId} and st.status = 'active'
    group by st.id, st.admission_no, st.name, c.name, c.level, sec.name
    order by c.level, sec.name, st.name
  `);
}

export async function reportStaffMonth(tx: Tx, ctx: AppCtx, period: string) {
  return tx.execute<Record<string, string | number>>(sql`
    select st.name as "Staff", st.designation as "Designation",
      count(a.id) filter (where a.status = 'present')::int as "Present",
      count(a.id) filter (where a.status = 'late')::int as "Late days",
      coalesce(sum(a.minutes_late), 0)::int as "Minutes late",
      count(a.id) filter (where a.status = 'absent')::int as "Absent",
      count(a.id) filter (where a.status = 'leave')::int as "Leave"
    from ${s.staff} st
    left join ${s.staffAttendance} a on a.staff_id = st.id and to_char(a.date, 'YYYY-MM') = ${period}
    where st.school_id = ${ctx.schoolId} and st.deleted_at is null
    group by st.id, st.name, st.designation
    order by coalesce(sum(a.minutes_late), 0) desc, st.name
  `);
}
