/**
 * Read queries for the owner dashboard. Every query is scoped by school_id.
 * All numbers come from SQL; packages/core only buckets and labels them.
 */
import { and, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";
import type { Queryable as Db } from "../index";
import * as s from "../schema/index";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function getSchoolBySlug(db: Db, slug: string) {
  const rows = await db.select().from(s.schools).where(eq(s.schools.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function getActiveStudentCount(db: Db, schoolId: string) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.students)
    .where(and(eq(s.students.schoolId, schoolId), eq(s.students.status, "active")));
  return row?.n ?? 0;
}

export async function getOpenBalances(db: Db, schoolId: string) {
  return db
    .select({ balanceMinor: s.invoices.balanceMinor, dueDate: s.invoices.dueDate })
    .from(s.invoices)
    .where(and(eq(s.invoices.schoolId, schoolId), gt(s.invoices.balanceMinor, 0), inArray(s.invoices.status, ["open", "partially_paid"])));
}

export async function getCollections(db: Db, schoolId: string, from: Date, to: Date) {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${s.payments.amountMinor}), 0)::bigint`, n: sql<number>`count(*)::int` })
    .from(s.payments)
    .where(
      and(
        eq(s.payments.schoolId, schoolId),
        eq(s.payments.status, "confirmed"),
        gte(s.payments.paidOn, from),
        lte(s.payments.paidOn, to),
      ),
    );
  return { totalMinor: Number(row?.total ?? 0), count: row?.n ?? 0 };
}

/** roi_events aggregated by kind for a period: input to core.summarizeSavings. */
export async function getSavingsFacts(db: Db, schoolId: string, from: Date, to: Date) {
  const rows = await db
    .select({
      kind: s.roiEvents.kind,
      quantity: sql<number>`coalesce(sum(${s.roiEvents.quantity}), 0)::int`,
      value: sql<number>`coalesce(sum(${s.roiEvents.valueMinor}), 0)::bigint`,
    })
    .from(s.roiEvents)
    .where(and(eq(s.roiEvents.schoolId, schoolId), gte(s.roiEvents.occurredAt, from), lte(s.roiEvents.occurredAt, to)))
    .groupBy(s.roiEvents.kind);
  const by = (k: string) => rows.find((r) => r.kind === k);
  return {
    recoveredMinor: Number(by("fee_recovered")?.value ?? 0),
    concessionsControlledMinor: Number(by("concession_controlled")?.value ?? 0),
    studentsKept: by("student_kept")?.quantity ?? 0,
    automatedReminders: by("reminder_automated")?.quantity ?? 0,
    attendanceSessions: by("attendance_taken")?.quantity ?? 0,
    digitalPages: by("page_digital")?.quantity ?? 0,
  };
}

export async function getTopDefaulters(db: Db, schoolId: string, asOf: Date, limit = 8) {
  const rows = await db.execute<{
    family_id: string;
    family: string;
    guardian_phone: string | null;
    prefers_voice: boolean | null;
    balance: string;
    oldest_due: string;
    months: number;
  }>(sql`
    select f.id as family_id, f.display_name as family, g.phone_e164 as guardian_phone, g.prefers_voice,
           sum(i.balance_minor)::bigint as balance, min(i.due_date)::text as oldest_due, count(*)::int as months
    from ${s.invoices} i
    join ${s.families} f on f.id = i.family_id and f.school_id = i.school_id
    left join ${s.guardians} g on g.id = f.primary_guardian_id and g.school_id = f.school_id
    where i.school_id = ${schoolId} and i.balance_minor > 0 and i.due_date < ${iso(asOf)}
    group by f.id, f.display_name, g.phone_e164, g.prefers_voice
    order by sum(i.balance_minor) desc
    limit ${limit}
  `);
  return rows.map((r) => ({
    familyId: r.family_id,
    family: r.family,
    prefersVoice: Boolean(r.prefers_voice),
    balanceMinor: Number(r.balance),
    oldestDue: new Date(`${r.oldest_due}T00:00:00Z`),
    months: r.months,
  }));
}

export async function getAttendanceOn(db: Db, schoolId: string, day: Date) {
  const rows = await db.execute<{ present: number; total: number; sessions: number }>(sql`
    select count(*) filter (where r.status <> 'absent')::int as present, count(*)::int as total,
           count(distinct a.id)::int as sessions
    from ${s.attendanceSessions} a
    join ${s.attendanceRecords} r on r.session_id = a.id and r.school_id = a.school_id
    where a.school_id = ${schoolId} and a.date = ${iso(day)}
  `);
  const r = rows[0];
  return { present: r?.present ?? 0, total: r?.total ?? 0, sessions: r?.sessions ?? 0 };
}

export async function getHighRiskStudents(db: Db, schoolId: string, limit = 6) {
  const latest = db
    .select({ d: sql`max(${s.riskScores.computedOn})` })
    .from(s.riskScores)
    .where(eq(s.riskScores.schoolId, schoolId));
  return db
    .select({
      studentId: s.students.id,
      name: s.students.name,
      score: s.riskScores.score,
      band: s.riskScores.band,
      reasons: s.riskScores.reasons,
    })
    .from(s.riskScores)
    .innerJoin(s.students, and(eq(s.students.id, s.riskScores.studentId), eq(s.students.schoolId, s.riskScores.schoolId)))
    .where(and(eq(s.riskScores.schoolId, schoolId), eq(s.riskScores.band, "high"), sql`${s.riskScores.computedOn} = (${latest})`))
    .orderBy(desc(s.riskScores.score))
    .limit(limit);
}

export async function getRiskCounts(db: Db, schoolId: string) {
  const rows = await db.execute<{ band: string; n: number }>(sql`
    select band, count(*)::int as n from ${s.riskScores}
    where school_id = ${schoolId}
      and computed_on = (select max(computed_on) from ${s.riskScores} where school_id = ${schoolId})
    group by band
  `);
  const get = (b: string) => rows.find((r) => r.band === b)?.n ?? 0;
  return { high: get("high"), watch: get("watch"), low: get("low") };
}

export async function getStaffLateness(db: Db, schoolId: string, from: Date, to: Date) {
  const rows = await db.execute<{ late_days: number; late_minutes: number; absent_days: number; staff_late: number; today_late: number }>(sql`
    select count(*) filter (where status = 'late')::int as late_days,
           coalesce(sum(minutes_late), 0)::int as late_minutes,
           count(*) filter (where status = 'absent')::int as absent_days,
           count(distinct staff_id) filter (where status = 'late')::int as staff_late,
           count(*) filter (where status = 'late' and date = ${iso(to)})::int as today_late
    from ${s.staffAttendance}
    where school_id = ${schoolId} and date between ${iso(from)} and ${iso(to)}
  `);
  const r = rows[0];
  return {
    lateDays: r?.late_days ?? 0,
    lateMinutes: r?.late_minutes ?? 0,
    absentDays: r?.absent_days ?? 0,
    staffLate: r?.staff_late ?? 0,
    todayLate: r?.today_late ?? 0,
  };
}
