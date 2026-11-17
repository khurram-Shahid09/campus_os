/** Read queries for the role screens (principal, clerk, teacher, parent, owner extras). All scoped by school_id. */
import { and, asc, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { Queryable as Db } from "../index";
import * as s from "../schema/index";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface DemoContext {
  school: typeof s.schools.$inferSelect;
  asOf: Date;
  liveOn: Date;
}

export async function getDemoContext(db: Db, slug = "demo-grammar-school"): Promise<DemoContext | null> {
  const [school] = await db.select().from(s.schools).where(eq(s.schools.slug, slug)).limit(1);
  if (!school) return null;
  const st = school.settings as { demoAsOf?: string; campusosLiveOn?: string };
  const asOf = st.demoAsOf ? new Date(`${st.demoAsOf}T00:00:00Z`) : new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const liveOn = st.campusosLiveOn ? new Date(`${st.campusosLiveOn}T00:00:00Z`) : asOf;
  return { school, asOf, liveOn };
}

// ---------- teacher ----------
export async function getSectionsToday(db: Db, schoolId: string, day: Date) {
  const rows = await db.execute<{ id: string; label: string; level: number; teacher: string | null; marked: boolean; students: number }>(sql`
    select sec.id, c.name || ' ' || sec.name as label, c.level, st.name as teacher,
      exists(select 1 from ${s.attendanceSessions} a where a.section_id = sec.id and a.date = ${iso(day)}) as marked,
      (select count(*)::int from ${s.enrollments} e join ${s.students} stu on stu.id = e.student_id
        where e.section_id = sec.id and stu.status = 'active') as students
    from ${s.sections} sec
    join ${s.classes} c on c.id = sec.class_id
    left join ${s.staff} st on st.id = sec.class_teacher_staff_id
    where sec.school_id = ${schoolId}
    order by c.level, sec.name
  `);
  return rows.map((r) => ({ ...r }));
}

export async function getSectionRoster(db: Db, schoolId: string, sectionId: string) {
  return db
    .select({ id: s.students.id, name: s.students.name, gender: s.students.gender, rollNo: s.enrollments.rollNo })
    .from(s.enrollments)
    .innerJoin(s.students, eq(s.students.id, s.enrollments.studentId))
    .where(and(eq(s.enrollments.schoolId, schoolId), eq(s.enrollments.sectionId, sectionId), eq(s.students.status, "active")))
    .orderBy(asc(s.students.name));
}

// ---------- clerk ----------
export async function searchFamilies(db: Db, schoolId: string, q: string, limit = 8) {
  const like = `%${q.trim()}%`;
  const rows = await db.execute<{ id: string; family: string; children: string; balance: string; phone: string | null }>(sql`
    select f.id, f.display_name as family,
      (select string_agg(stu.name, ', ' order by stu.name) from ${s.students} stu where stu.family_id = f.id and stu.status = 'active') as children,
      coalesce((select sum(i.balance_minor) from ${s.invoices} i where i.family_id = f.id and i.balance_minor > 0), 0)::bigint as balance,
      g.phone_e164 as phone
    from ${s.families} f
    left join ${s.guardians} g on g.id = f.primary_guardian_id
    where f.school_id = ${schoolId} and (
      f.display_name ilike ${like}
      or exists(select 1 from ${s.students} stu where stu.family_id = f.id and (stu.name ilike ${like} or stu.admission_no ilike ${like}))
    )
    order by balance desc
    limit ${limit}
  `);
  return rows.map((r) => ({ id: r.id, family: r.family, children: r.children ?? "", balanceMinor: Number(r.balance), phone: r.phone }));
}

export async function getOpenInvoices(db: Db, schoolId: string, familyId: string) {
  return db
    .select({ id: s.invoices.id, period: s.invoices.period, dueDate: s.invoices.dueDate, totalMinor: s.invoices.totalMinor, balanceMinor: s.invoices.balanceMinor })
    .from(s.invoices)
    .where(and(eq(s.invoices.schoolId, schoolId), eq(s.invoices.familyId, familyId), gt(s.invoices.balanceMinor, 0)))
    .orderBy(asc(s.invoices.dueDate));
}

export async function getPendingProofs(db: Db, schoolId: string) {
  const rows = await db.execute<{
    id: string; family_id: string | null; family: string | null; image_key: string; extracted: Record<string, unknown>;
    created_at: string; duplicate_of: string | null; duplicate_on: string | null; balance: string | null;
  }>(sql`
    select p.id, p.family_id, f.display_name as family, p.image_key, p.extracted, p.created_at::text,
      d.id as duplicate_of, d.created_at::date::text as duplicate_on,
      (select sum(i.balance_minor) from ${s.invoices} i where i.family_id = p.family_id and i.balance_minor > 0)::bigint as balance
    from ${s.paymentProofs} p
    left join ${s.families} f on f.id = p.family_id
    left join lateral (
      select o.id, o.created_at from ${s.paymentProofs} o
      where o.school_id = p.school_id and o.image_hash = p.image_hash and o.id <> p.id and o.status = 'approved'
      order by o.created_at limit 1
    ) d on true
    where p.school_id = ${schoolId} and p.status = 'pending'
    order by p.created_at
  `);
  return rows.map((r) => ({
    id: r.id,
    familyId: r.family_id,
    family: r.family,
    imageKey: r.image_key,
    extracted: r.extracted as { amountMinor: number; date: string; reference: string; bank: string; senderName?: string; confidence: number; source: string },
    duplicateOn: r.duplicate_of ? r.duplicate_on : null,
    familyBalanceMinor: Number(r.balance ?? 0),
  }));
}

export async function getPaymentsOn(db: Db, schoolId: string, day: Date) {
  const rows = await db.execute<{ id: string; family: string; amount: string; method: string; attributed: boolean; created_at: string }>(sql`
    select p.id, f.display_name as family, p.amount_minor::bigint as amount, p.method, p.attributed_to_campusos as attributed, p.created_at::text
    from ${s.payments} p join ${s.families} f on f.id = p.family_id
    where p.school_id = ${schoolId} and p.paid_on = ${iso(day)} and p.status = 'confirmed'
    order by p.created_at desc
  `);
  return rows.map((r) => ({ id: r.id, family: r.family, amountMinor: Number(r.amount), method: r.method, attributed: r.attributed }));
}

export async function getLatestSlip(db: Db, schoolId: string, familyId: string) {
  const [inv] = await db
    .select()
    .from(s.invoices)
    .where(and(eq(s.invoices.schoolId, schoolId), eq(s.invoices.familyId, familyId)))
    .orderBy(desc(s.invoices.dueDate))
    .limit(1);
  if (!inv) return null;
  const lines = await db.execute<{ child: string; class_label: string; amount: string; discount: string; photo_url: string | null }>(sql`
    select stu.name as child, c.name || ' ' || sec.name as class_label, l.amount_minor::bigint as amount,
      l.discount_minor::bigint as discount, stu.photo_url
    from ${s.invoiceLines} l
    join ${s.students} stu on stu.id = l.student_id
    left join ${s.enrollments} e on e.student_id = stu.id
    left join ${s.sections} sec on sec.id = e.section_id
    left join ${s.classes} c on c.id = sec.class_id
    where l.invoice_id = ${inv.id}
  `);
  const [arrears] = await db.execute<{ total: string }>(sql`
    select coalesce(sum(balance_minor), 0)::bigint as total from ${s.invoices}
    where family_id = ${familyId} and balance_minor > 0 and id <> ${inv.id}
  `);
  return {
    invoice: inv,
    lines: lines.map((l) => ({ child: l.child, classLabel: l.class_label, amountMinor: Number(l.amount), discountMinor: Number(l.discount) })),
    arrearsMinor: Number(arrears?.total ?? 0),
  };
}

// ---------- principal ----------
export async function getStaffToday(db: Db, schoolId: string, day: Date) {
  return db
    .select({ id: s.staff.id, name: s.staff.name, designation: s.staff.designation, status: s.staffAttendance.status, minutesLate: s.staffAttendance.minutesLate })
    .from(s.staffAttendance)
    .innerJoin(s.staff, eq(s.staff.id, s.staffAttendance.staffId))
    .where(and(eq(s.staffAttendance.schoolId, schoolId), eq(s.staffAttendance.date, day), ne(s.staffAttendance.status, "present")))
    .orderBy(desc(s.staffAttendance.minutesLate));
}

export async function getCallList(db: Db, schoolId: string, limit = 8) {
  const rows = await db.execute<{
    student_id: string; name: string; class_label: string; score: number; reasons: { text: string }[];
    phone: string | null; family_id: string; followup: string | null;
  }>(sql`
    select stu.id as student_id, stu.name, c.name || ' ' || sec.name as class_label, r.score, r.reasons,
      g.phone_e164 as phone, stu.family_id,
      (select fu.outcome from ${s.riskFollowups} fu where fu.student_id = stu.id order by fu.created_at desc limit 1) as followup
    from ${s.riskScores} r
    join ${s.students} stu on stu.id = r.student_id
    join ${s.enrollments} e on e.student_id = stu.id
    join ${s.sections} sec on sec.id = e.section_id
    join ${s.classes} c on c.id = sec.class_id
    join ${s.families} f on f.id = stu.family_id
    left join ${s.guardians} g on g.id = f.primary_guardian_id
    where r.school_id = ${schoolId} and r.band = 'high'
      and r.computed_on = (select max(computed_on) from ${s.riskScores} where school_id = ${schoolId})
    order by r.score desc, stu.name
    limit ${limit}
  `);
  return rows.map((r) => ({
    studentId: r.student_id, name: r.name, classLabel: r.class_label, score: r.score,
    reasons: (r.reasons ?? []).map((x) => x.text), followup: r.followup,
  }));
}

// ---------- owner ----------
export async function getConcessionRequests(db: Db, schoolId: string) {
  const rows = await db.execute<{ id: string; child: string; requested: number; reason: string; fee: string }>(sql`
    select a.id, stu.name as child, a.requested_value as requested, a.reason,
      (select fs.amount_minor from ${s.feeStructures} fs
        join ${s.sections} sec on sec.class_id = fs.class_id
        join ${s.enrollments} e on e.section_id = sec.id and e.student_id = stu.id limit 1)::bigint as fee
    from ${s.studentFeeAdjustments} a join ${s.students} stu on stu.id = a.student_id
    where a.school_id = ${schoolId} and a.status = 'requested'
    order by a.created_at
  `);
  return rows.map((r) => ({ id: r.id, child: r.child, requestedPct: r.requested, reason: r.reason, monthlyFeeMinor: Number(r.fee ?? 0) }));
}

// ---------- parent (WhatsApp simulator) ----------
export async function getDemoFamilies(db: Db, schoolId: string) {
  const rows = await db.execute<{ id: string; family: string; guardian: string; children: string; balance: string; voice: boolean }>(sql`
    with f as (
      select f.id, f.display_name as family, g.name as guardian, g.prefers_voice as voice,
        (select string_agg(stu.name, ', ') from ${s.students} stu where stu.family_id = f.id and stu.status = 'active') as children,
        coalesce((select sum(i.balance_minor) from ${s.invoices} i where i.family_id = f.id and i.balance_minor > 0), 0)::bigint as balance,
        (select count(*) from ${s.messages} m where m.family_id = f.id and m.category = 'attendance') as absences,
        exists(select 1 from ${s.paymentProofs} p where p.family_id = f.id and p.status = 'pending') as has_proof
      from ${s.families} f join ${s.guardians} g on g.id = f.primary_guardian_id
      where f.school_id = ${schoolId}
    )
    select id, family, guardian, children, balance, voice from f
    where children is not null and balance > 0 and absences > 0 and voice and not has_proof
    order by absences desc, balance desc limit 4
  `);
  return rows.map((r) => ({ id: r.id, family: r.family, guardian: r.guardian, children: r.children, balanceMinor: Number(r.balance), prefersVoice: r.voice }));
}

export async function getFamilyChat(db: Db, schoolId: string, familyId: string, limit = 40) {
  const rows = await db
    .select()
    .from(s.messages)
    .where(and(eq(s.messages.schoolId, schoolId), eq(s.messages.familyId, familyId)))
    .orderBy(desc(s.messages.createdAt))
    .limit(limit);
  return rows.reverse();
}

export async function getFamilyHeader(db: Db, schoolId: string, familyId: string) {
  const [row] = await db
    .select({ family: s.families.displayName, guardian: s.guardians.name, phone: s.guardians.phoneE164 })
    .from(s.families)
    .innerJoin(s.guardians, eq(s.guardians.id, s.families.primaryGuardianId))
    .where(and(eq(s.families.schoolId, schoolId), eq(s.families.id, familyId)));
  return row ?? null;
}

export async function getFamiliesByIds(db: Db, schoolId: string, ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(s.families).where(and(eq(s.families.schoolId, schoolId), inArray(s.families.id, ids)));
}

export async function getOverdueOver(db: Db, schoolId: string, asOf: Date, days: number) {
  const cutoff = new Date(asOf.getTime() - days * 86_400_000);
  const [row] = await db.execute<{ total: string; families: number }>(sql`
    select coalesce(sum(balance_minor), 0)::bigint as total, count(distinct family_id)::int as families
    from ${s.invoices}
    where school_id = ${schoolId} and balance_minor > 0 and due_date < ${iso(cutoff)}
  `);
  return { totalMinor: Number(row?.total ?? 0), families: row?.families ?? 0 };
}
