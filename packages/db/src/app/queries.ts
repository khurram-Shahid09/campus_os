/** Read queries for the working app. Run inside `withSchool` (RLS on); every query also filters school_id. */
import { and, asc, desc, eq, gt, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { classOrder } from "@campusos/core";
import type { Tx } from "../index";
import * as s from "../schema/index";
import type { AppCtx } from "./commands";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function getCurrentYear(tx: Tx, ctx: AppCtx) {
  const [y] = await tx.select().from(s.academicYears).where(and(eq(s.academicYears.schoolId, ctx.schoolId), eq(s.academicYears.isCurrent, true))).limit(1);
  return y ?? null;
}

/** Classes with their sections, student counts and fee per head. */
export async function getClassesSetup(tx: Tx, ctx: AppCtx) {
  const year = await getCurrentYear(tx, ctx);
  const classes = await tx.select().from(s.classes).where(eq(s.classes.schoolId, ctx.schoolId));
  const sections = year
    ? await tx
        .select({
          id: s.sections.id, classId: s.sections.classId, name: s.sections.name, classTeacherStaffId: s.sections.classTeacherStaffId,
          teacherName: s.staff.name,
          students: sql<number>`(select count(*)::int from ${s.enrollments} e join ${s.students} st on st.id = e.student_id
                     where e.section_id = ${s.sections.id} and st.status = 'active')`,
        })
        .from(s.sections)
        .leftJoin(s.staff, eq(s.staff.id, s.sections.classTeacherStaffId))
        .where(and(eq(s.sections.schoolId, ctx.schoolId), eq(s.sections.academicYearId, year.id)))
    : [];
  const fees = year ? await tx.select().from(s.feeStructures).where(and(eq(s.feeStructures.schoolId, ctx.schoolId), eq(s.feeStructures.academicYearId, year.id))) : [];
  return classes
    .sort((a, b) => a.level - b.level || classOrder(a.name) - classOrder(b.name) || a.name.localeCompare(b.name))
    .map((c) => ({
      ...c,
      sections: sections.filter((x) => x.classId === c.id).sort((a, b) => a.name.localeCompare(b.name)),
      fees: Object.fromEntries(fees.filter((f) => f.classId === c.id).map((f) => [f.feeHeadId, f.amountMinor])) as Record<string, number>,
    }));
}

export async function getFeeHeads(tx: Tx, ctx: AppCtx) {
  return tx.select().from(s.feeHeads).where(eq(s.feeHeads.schoolId, ctx.schoolId)).orderBy(asc(s.feeHeads.name));
}

export async function getSetupProgress(tx: Tx, ctx: AppCtx) {
  const [r] = await tx.execute<{ classes: number; fees: number; students: number; invoices: number; team: number; phones: number }>(sql`
    select
      (select count(*)::int from ${s.classes} where school_id = ${ctx.schoolId}) as classes,
      (select count(*)::int from ${s.feeStructures} where school_id = ${ctx.schoolId} and amount_minor > 0) as fees,
      (select count(*)::int from ${s.students} where school_id = ${ctx.schoolId} and status = 'active') as students,
      (select count(*)::int from ${s.invoices} where school_id = ${ctx.schoolId}) as invoices,
      (select count(*)::int from ${s.memberships} where school_id = ${ctx.schoolId} and status = 'active') as team,
      (select count(*)::int from ${s.guardians} where school_id = ${ctx.schoolId} and phone_e164 <> '') as phones
  `);
  return r!;
}

export async function getTeam(tx: Tx, ctx: AppCtx) {
  return tx
    .select({ userId: s.users.id, name: s.users.name, phone: s.users.phoneE164, role: s.memberships.role, lastLoginAt: s.users.lastLoginAt })
    .from(s.memberships)
    .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
    .where(and(eq(s.memberships.schoolId, ctx.schoolId), eq(s.memberships.status, "active")))
    .orderBy(asc(s.memberships.role), asc(s.users.name));
}

export async function getStaffList(tx: Tx, ctx: AppCtx) {
  return tx
    .select({
      id: s.staff.id, name: s.staff.name, phone: s.staff.phoneE164, designation: s.staff.designation, userId: s.staff.userId,
      todayStatus: s.staffAttendance.status, minutesLate: s.staffAttendance.minutesLate,
    })
    .from(s.staff)
    .leftJoin(s.staffAttendance, and(eq(s.staffAttendance.staffId, s.staff.id), eq(s.staffAttendance.date, ctx.today)))
    .where(and(eq(s.staff.schoolId, ctx.schoolId), isNull(s.staff.deletedAt), isNull(s.staff.leftOn)))
    .orderBy(asc(s.staff.name));
}

export async function listStudents(tx: Tx, ctx: AppCtx, f: { q?: string; sectionId?: string; status?: string; limit?: number; offset?: number }) {
  const year = await getCurrentYear(tx, ctx);
  const q = f.q?.trim();
  const digits = q?.replace(/\D/g, "");
  const conds = [eq(s.students.schoolId, ctx.schoolId), isNull(s.students.deletedAt), eq(s.students.status, f.status ?? "active")];
  if (f.sectionId) conds.push(eq(s.enrollments.sectionId, f.sectionId));
  if (q) {
    conds.push(or(
      ilike(s.students.name, `%${q}%`), ilike(s.students.admissionNo, `${q}%`), ilike(s.guardians.name, `%${q}%`),
      ...(digits && digits.length >= 4 ? [ilike(s.guardians.phoneE164, `%${digits.replace(/^0/, "")}%`)] : []),
    )!);
  }
  return tx
    .select({
      id: s.students.id, name: s.students.name, admissionNo: s.students.admissionNo, gender: s.students.gender, familyId: s.students.familyId,
      className: s.classes.name, section: s.sections.name, sectionId: s.sections.id, guardianName: s.guardians.name, phone: s.guardians.phoneE164,
      balanceMinor: sql<number>`(select coalesce(sum(balance_minor),0)::bigint from ${s.invoices} i where i.family_id = ${s.students.familyId} and i.balance_minor > 0 and i.status <> 'void')`.mapWith(Number),
    })
    .from(s.students)
    .leftJoin(s.enrollments, and(eq(s.enrollments.studentId, s.students.id), year ? eq(s.enrollments.academicYearId, year.id) : sql`false`))
    .leftJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
    .leftJoin(s.classes, eq(s.classes.id, s.sections.classId))
    .leftJoin(s.families, eq(s.families.id, s.students.familyId))
    .leftJoin(s.guardians, eq(s.guardians.id, s.families.primaryGuardianId))
    .where(and(...conds))
    .orderBy(asc(s.classes.level), asc(s.sections.name), asc(s.students.name))
    .limit(f.limit ?? 100)
    .offset(f.offset ?? 0);
}

export async function getStudent(tx: Tx, ctx: AppCtx, studentId: string) {
  const year = await getCurrentYear(tx, ctx);
  const [st] = await tx
    .select({ student: s.students, sectionId: s.sections.id, section: s.sections.name, className: s.classes.name, classId: s.classes.id })
    .from(s.students)
    .leftJoin(s.enrollments, and(eq(s.enrollments.studentId, s.students.id), year ? eq(s.enrollments.academicYearId, year.id) : sql`false`))
    .leftJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
    .leftJoin(s.classes, eq(s.classes.id, s.sections.classId))
    .where(and(eq(s.students.schoolId, ctx.schoolId), eq(s.students.id, studentId)));
  if (!st) return null;
  const [att] = await tx.execute<{ present: number; total: number }>(sql`
    select count(*) filter (where r.status in ('present','late'))::int as present, count(*)::int as total
    from ${s.attendanceRecords} r join ${s.attendanceSessions} a on a.id = r.session_id
    where r.school_id = ${ctx.schoolId} and r.student_id = ${studentId} and a.date > ${iso(ctx.today)}::date - 30
  `);
  const adjustments = await tx.select().from(s.studentFeeAdjustments).where(and(eq(s.studentFeeAdjustments.schoolId, ctx.schoolId), eq(s.studentFeeAdjustments.studentId, studentId))).orderBy(desc(s.studentFeeAdjustments.createdAt));
  return { ...st, attendance30: att ?? { present: 0, total: 0 }, adjustments };
}

export async function getFamily(tx: Tx, ctx: AppCtx, familyId: string) {
  const [fam] = await tx.select().from(s.families).where(and(eq(s.families.schoolId, ctx.schoolId), eq(s.families.id, familyId)));
  if (!fam) return null;
  const guardians = await tx.select().from(s.guardians).where(and(eq(s.guardians.familyId, familyId), isNull(s.guardians.deletedAt)));
  const year = await getCurrentYear(tx, ctx);
  const children = await tx
    .select({ id: s.students.id, name: s.students.name, status: s.students.status, admissionNo: s.students.admissionNo, className: s.classes.name, section: s.sections.name })
    .from(s.students)
    .leftJoin(s.enrollments, and(eq(s.enrollments.studentId, s.students.id), year ? eq(s.enrollments.academicYearId, year.id) : sql`false`))
    .leftJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
    .leftJoin(s.classes, eq(s.classes.id, s.sections.classId))
    .where(and(eq(s.students.schoolId, ctx.schoolId), eq(s.students.familyId, familyId)))
    .orderBy(asc(s.students.name));
  const invoices = await tx.select().from(s.invoices).where(and(eq(s.invoices.schoolId, ctx.schoolId), eq(s.invoices.familyId, familyId), ne(s.invoices.status, "void"))).orderBy(desc(s.invoices.period));
  const payments = await tx.select().from(s.payments).where(and(eq(s.payments.schoolId, ctx.schoolId), eq(s.payments.familyId, familyId))).orderBy(desc(s.payments.createdAt)).limit(50);
  const balanceMinor = invoices.reduce((sum, i) => sum + Math.max(0, i.balanceMinor), 0);
  return { family: fam, guardians, primary: guardians.find((g) => g.id === fam.primaryGuardianId) ?? guardians[0] ?? null, children, invoices, payments, balanceMinor };
}

/** Cash counter search: by child name, father name, admission no., or phone digits. */
export async function searchFamilies(tx: Tx, ctx: AppCtx, q: string, limit = 8) {
  const term = q.trim();
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "").replace(/^0/, "");
  const rows = await tx.execute<{ family_id: string; guardian: string; phone: string; children: string; balance: string }>(sql`
    select f.id as family_id, coalesce(g.name, f.display_name) as guardian, coalesce(g.phone_e164, '') as phone,
      string_agg(distinct st.name || ' (' || st.admission_no || ')', ', ') as children,
      (select coalesce(sum(balance_minor),0)::bigint from ${s.invoices} i where i.family_id = f.id and i.balance_minor > 0 and i.status <> 'void') as balance
    from ${s.families} f
    left join ${s.guardians} g on g.id = f.primary_guardian_id
    join ${s.students} st on st.family_id = f.id and st.status = 'active'
    where f.school_id = ${ctx.schoolId} and (
      st.name ilike ${"%" + term + "%"} or g.name ilike ${"%" + term + "%"} or st.admission_no = ${term}
      ${digits.length >= 4 ? sql`or g.phone_e164 like ${"%" + digits + "%"}` : sql``}
    )
    group by f.id, g.name, f.display_name, g.phone_e164
    order by guardian limit ${limit}
  `);
  return rows.map((r) => ({ familyId: r.family_id, guardian: r.guardian, phone: r.phone, children: r.children, balanceMinor: Number(r.balance) }));
}

export async function getOpenInvoicesForFamily(tx: Tx, ctx: AppCtx, familyId: string) {
  return tx.select().from(s.invoices)
    .where(and(eq(s.invoices.schoolId, ctx.schoolId), eq(s.invoices.familyId, familyId), gt(s.invoices.balanceMinor, 0), ne(s.invoices.status, "void")))
    .orderBy(asc(s.invoices.dueDate));
}

export async function getInvoiceRuns(tx: Tx, ctx: AppCtx) {
  return tx.execute<{ period: string; invoices: number; total: string; paid: string; balance: string; due_date: string }>(sql`
    select period, count(*)::int as invoices, sum(total_minor)::bigint as total, sum(paid_minor)::bigint as paid,
      sum(balance_minor)::bigint as balance, min(due_date)::text as due_date
    from ${s.invoices} where school_id = ${ctx.schoolId} and status <> 'void'
    group by period order by period desc limit 24
  `);
}

/** Invoices with lines, family and children: for printing fee slips. */
export async function getSlips(tx: Tx, ctx: AppCtx, f: { period: string; invoiceIds?: string[]; sectionId?: string }) {
  const invs = await tx
    .select({ invoice: s.invoices, guardian: s.guardians.name, phone: s.guardians.phoneE164 })
    .from(s.invoices)
    .innerJoin(s.families, eq(s.families.id, s.invoices.familyId))
    .leftJoin(s.guardians, eq(s.guardians.id, s.families.primaryGuardianId))
    .where(and(
      eq(s.invoices.schoolId, ctx.schoolId), eq(s.invoices.period, f.period), ne(s.invoices.status, "void"),
      ...(f.invoiceIds?.length ? [inArray(s.invoices.id, f.invoiceIds)] : []),
    ))
    .orderBy(asc(s.guardians.name));
  if (!invs.length) return [];
  const lines = await tx.select().from(s.invoiceLines).where(inArray(s.invoiceLines.invoiceId, invs.map((i) => i.invoice.id)));
  const prior = await tx.execute<{ family_id: string; arrears: string }>(sql`
    select family_id, sum(balance_minor)::bigint as arrears from ${s.invoices}
    where school_id = ${ctx.schoolId} and period < ${f.period} and balance_minor > 0 and status <> 'void' group by family_id
  `);
  const arrears = new Map(prior.map((p) => [p.family_id, Number(p.arrears)]));
  return invs.map((i) => ({
    ...i,
    lines: lines.filter((l) => l.invoiceId === i.invoice.id),
    arrearsMinor: arrears.get(i.invoice.familyId) ?? 0,
  }));
}

export async function getPayment(tx: Tx, ctx: AppCtx, paymentId: string) {
  const [p] = await tx
    .select({ payment: s.payments, guardian: s.guardians.name, phone: s.guardians.phoneE164, receivedBy: s.users.name })
    .from(s.payments)
    .innerJoin(s.families, eq(s.families.id, s.payments.familyId))
    .leftJoin(s.guardians, eq(s.guardians.id, s.families.primaryGuardianId))
    .leftJoin(s.users, eq(s.users.id, s.payments.receivedByUserId))
    .where(and(eq(s.payments.schoolId, ctx.schoolId), eq(s.payments.id, paymentId)));
  if (!p) return null;
  const allocations = await tx
    .select({ amountMinor: s.paymentAllocations.amountMinor, period: s.invoices.period })
    .from(s.paymentAllocations)
    .innerJoin(s.invoices, eq(s.invoices.id, s.paymentAllocations.invoiceId))
    .where(eq(s.paymentAllocations.paymentId, paymentId))
    .orderBy(asc(s.invoices.period));
  const children = await tx.select({ name: s.students.name, admissionNo: s.students.admissionNo }).from(s.students)
    .where(and(eq(s.students.familyId, p.payment.familyId), eq(s.students.status, "active")));
  const [bal] = await tx.execute<{ b: string }>(sql`select coalesce(sum(balance_minor),0)::bigint as b from ${s.invoices} where family_id = ${p.payment.familyId} and balance_minor > 0 and status <> 'void'`);
  return { ...p, allocations, children, balanceNowMinor: Number(bal?.b ?? 0) };
}

export async function getPaymentsOnDay(tx: Tx, ctx: AppCtx, day: Date) {
  return tx
    .select({ id: s.payments.id, amountMinor: s.payments.amountMinor, method: s.payments.method, receiptNo: s.payments.receiptNo, status: s.payments.status,
      guardian: s.guardians.name, createdAt: s.payments.createdAt, receivedBy: s.users.name, familyId: s.payments.familyId })
    .from(s.payments)
    .innerJoin(s.families, eq(s.families.id, s.payments.familyId))
    .leftJoin(s.guardians, eq(s.guardians.id, s.families.primaryGuardianId))
    .leftJoin(s.users, eq(s.users.id, s.payments.receivedByUserId))
    .where(and(eq(s.payments.schoolId, ctx.schoolId), eq(s.payments.paidOn, day)))
    .orderBy(desc(s.payments.createdAt));
}

/** Families with money due, oldest first: the defaulter list. */
export async function getDefaulters(tx: Tx, ctx: AppCtx, limit = 200) {
  const rows = await tx.execute<{ family_id: string; guardian: string; phone: string; children: string; balance: string; months: number; oldest_due: string }>(sql`
    select i.family_id, coalesce(g.name, f.display_name) as guardian, coalesce(g.phone_e164,'') as phone,
      (select string_agg(st.name, ', ') from ${s.students} st where st.family_id = i.family_id and st.status = 'active') as children,
      sum(i.balance_minor)::bigint as balance, count(*)::int as months, min(i.due_date)::text as oldest_due
    from ${s.invoices} i
    join ${s.families} f on f.id = i.family_id
    left join ${s.guardians} g on g.id = f.primary_guardian_id
    where i.school_id = ${ctx.schoolId} and i.balance_minor > 0 and i.status <> 'void' and i.due_date < ${iso(ctx.today)}::date
    group by i.family_id, g.name, f.display_name, g.phone_e164
    order by min(i.due_date), sum(i.balance_minor) desc
    limit ${limit}
  `);
  return rows.map((r) => ({ familyId: r.family_id, guardian: r.guardian, phone: r.phone, children: r.children ?? "", balanceMinor: Number(r.balance), months: r.months, oldestDue: r.oldest_due }));
}

export async function getDiscountRequests(tx: Tx, ctx: AppCtx) {
  return tx
    .select({ id: s.studentFeeAdjustments.id, percent: s.studentFeeAdjustments.requestedValue, reason: s.studentFeeAdjustments.reason,
      createdAt: s.studentFeeAdjustments.createdAt, student: s.students.name, studentId: s.students.id })
    .from(s.studentFeeAdjustments)
    .innerJoin(s.students, eq(s.students.id, s.studentFeeAdjustments.studentId))
    .where(and(eq(s.studentFeeAdjustments.schoolId, ctx.schoolId), eq(s.studentFeeAdjustments.status, "requested")))
    .orderBy(asc(s.studentFeeAdjustments.createdAt));
}

// ---------- attendance ----------

export async function getSectionsWithStatus(tx: Tx, ctx: AppCtx, day: Date, only: string[] | "all") {
  const year = await getCurrentYear(tx, ctx);
  if (!year || (only !== "all" && !only.length)) return [];
  const rows = await tx
    .select({
      id: s.sections.id, name: s.sections.name, className: s.classes.name, level: s.classes.level, teacher: s.staff.name,
      students: sql<number>`(select count(*)::int from ${s.enrollments} e join ${s.students} st on st.id = e.student_id where e.section_id = ${s.sections.id} and st.status = 'active')`,
      absent: sql<number | null>`(select count(*) filter (where r.status = 'absent')::int from ${s.attendanceRecords} r where r.session_id = ${s.attendanceSessions.id})`,
      markedAt: s.attendanceSessions.submittedAt,
    })
    .from(s.sections)
    .innerJoin(s.classes, eq(s.classes.id, s.sections.classId))
    .leftJoin(s.staff, eq(s.staff.id, s.sections.classTeacherStaffId))
    .leftJoin(s.attendanceSessions, and(eq(s.attendanceSessions.sectionId, s.sections.id), eq(s.attendanceSessions.date, day)))
    .where(and(eq(s.sections.schoolId, ctx.schoolId), eq(s.sections.academicYearId, year.id), ...(only === "all" ? [] : [inArray(s.sections.id, only)])));
  return rows.sort((a, b) => a.level - b.level || a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
}

export async function getRoster(tx: Tx, ctx: AppCtx, sectionId: string, day: Date) {
  const year = await getCurrentYear(tx, ctx);
  if (!year) return null;
  const [sec] = await tx.select({ id: s.sections.id, name: s.sections.name, className: s.classes.name })
    .from(s.sections).innerJoin(s.classes, eq(s.classes.id, s.sections.classId))
    .where(and(eq(s.sections.schoolId, ctx.schoolId), eq(s.sections.id, sectionId)));
  if (!sec) return null;
  const students = await tx
    .select({ id: s.students.id, name: s.students.name, gender: s.students.gender, rollNo: s.enrollments.rollNo, admissionNo: s.students.admissionNo })
    .from(s.enrollments)
    .innerJoin(s.students, eq(s.students.id, s.enrollments.studentId))
    .where(and(eq(s.enrollments.schoolId, ctx.schoolId), eq(s.enrollments.sectionId, sectionId), eq(s.enrollments.academicYearId, year.id), eq(s.students.status, "active")))
    .orderBy(asc(s.enrollments.rollNo), asc(s.students.name));
  const [session] = await tx.select().from(s.attendanceSessions).where(and(eq(s.attendanceSessions.sectionId, sectionId), eq(s.attendanceSessions.date, day)));
  const records = session ? await tx.select().from(s.attendanceRecords).where(eq(s.attendanceRecords.sessionId, session.id)) : [];
  return { section: sec, students, session: session ?? null, records };
}

// ---------- outbox ----------

export async function getOutbox(tx: Tx, ctx: AppCtx, limit = 100) {
  return tx
    .select({ id: s.messages.id, toPhone: s.messages.toPhone, body: s.messages.body, category: s.messages.category, templateKey: s.messages.templateKey,
      createdAt: s.messages.createdAt, guardian: s.guardians.name, familyId: s.messages.familyId })
    .from(s.messages)
    .leftJoin(s.guardians, eq(s.guardians.id, s.messages.guardianId))
    .where(and(eq(s.messages.schoolId, ctx.schoolId), eq(s.messages.status, "outbox")))
    .orderBy(asc(s.messages.createdAt))
    .limit(limit);
}

export async function getOutboxCount(tx: Tx, ctx: AppCtx) {
  const [r] = await tx.select({ n: sql<number>`count(*)::int` }).from(s.messages).where(and(eq(s.messages.schoolId, ctx.schoolId), eq(s.messages.status, "outbox")));
  return r?.n ?? 0;
}

export async function getRecentActivity(tx: Tx, ctx: AppCtx, limit = 15) {
  return tx
    .select({ id: s.auditLogs.id, action: s.auditLogs.action, entity: s.auditLogs.entity, after: s.auditLogs.after, createdAt: s.auditLogs.createdAt, actor: s.users.name })
    .from(s.auditLogs)
    .leftJoin(s.users, eq(s.users.id, s.auditLogs.actorUserId))
    .where(eq(s.auditLogs.schoolId, ctx.schoolId))
    .orderBy(desc(s.auditLogs.createdAt))
    .limit(limit);
}

export async function getBilledForPeriod(tx: Tx, ctx: AppCtx, period: string) {
  const [r] = await tx.execute<{ total: string; n: number }>(sql`
    select coalesce(sum(total_minor),0)::bigint as total, count(*)::int as n from ${s.invoices}
    where school_id = ${ctx.schoolId} and period = ${period} and status <> 'void'`);
  return { totalMinor: Number(r?.total ?? 0), count: r?.n ?? 0 };
}

/** The outbox message queued for a payment's receipt (if the family has WhatsApp). */
export async function getMessageForPayment(tx: Tx, ctx: AppCtx, paymentId: string) {
  const [m] = await tx.select().from(s.messages)
    .where(and(eq(s.messages.schoolId, ctx.schoolId), eq(s.messages.templateKey, "receipt"), sql`${s.messages.payload}->>'paymentId' = ${paymentId}`))
    .limit(1);
  return m ?? null;
}
