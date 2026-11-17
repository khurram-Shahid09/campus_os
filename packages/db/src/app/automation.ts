/**
 * Scheduled automation (Stage 2), run by apps/worker. Each job runs once per school per local day, inside
 * `withSchool` (row-level security on). All numbers come from SQL; packages/core decides who gets what and words it.
 *
 *   02:00  risk_scores    rules-based dropout risk for every active student
 *   07:00  morning_brief  owner's WhatsApp brief (yesterday's facts)
 *   10:00  fee_reminders  reminder ladder (Mon–Sat): WhatsApp step 1/2, then a principal call
 */
import { and, eq, sql } from "drizzle-orm";
import {
  familyReminderText, isReminderDay, morningBrief, planReminders, scoreRisk, todayIn, type BriefFacts, type ReminderFamily,
} from "@campusos/core";
import type { Db, Tx } from "../index";
import * as s from "../schema/index";
import { queueToFamily } from "./commands";
import { withSchool } from "./scoped";
import { newMessageStatus } from "./messaging";

export interface SchoolCtx {
  schoolId: string;
  schoolName: string;
  /** local date in the school's timezone (UTC midnight) */
  today: Date;
  settings: { automation?: { reminders?: boolean; brief?: boolean } };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// ---------------- risk ----------------

export async function runRiskScores(tx: Tx, c: SchoolCtx) {
  const t = iso(c.today);
  const rows = await tx.execute<{
    id: string; n14: number; p14: number; nb: number; pb: number; streak: number; months: number; oldest: number;
  }>(sql`
    with recs as (
      select r.student_id, a.date, r.status
      from ${s.attendanceRecords} r join ${s.attendanceSessions} a on a.id = r.session_id
      where r.school_id = ${c.schoolId} and a.date > ${t}::date - 74 and a.date <= ${t}::date
    ),
    att as (
      select student_id,
        count(*) filter (where date > ${t}::date - 14)::int as n14,
        count(*) filter (where date > ${t}::date - 14 and status <> 'absent')::int as p14,
        count(*) filter (where date <= ${t}::date - 14)::int as nb,
        count(*) filter (where date <= ${t}::date - 14 and status <> 'absent')::int as pb,
        max(date) filter (where status <> 'absent') as last_present
      from recs group by student_id
    ),
    streak as (
      select r.student_id, count(*)::int as n from recs r join att on att.student_id = r.student_id
      where r.status = 'absent' and (att.last_present is null or r.date > att.last_present) group by r.student_id
    ),
    fees as (
      select family_id, count(*)::int as months, max(${t}::date - due_date)::int as oldest
      from ${s.invoices}
      where school_id = ${c.schoolId} and balance_minor > 0 and status <> 'void' and due_date < ${t}::date
      group by family_id
    )
    select st.id, coalesce(att.n14,0) as n14, coalesce(att.p14,0) as p14, coalesce(att.nb,0) as nb, coalesce(att.pb,0) as pb,
      coalesce(streak.n,0) as streak, coalesce(fees.months,0) as months, coalesce(fees.oldest,0) as oldest
    from ${s.students} st
    left join att on att.student_id = st.id
    left join streak on streak.student_id = st.id
    left join fees on fees.family_id = st.family_id
    where st.school_id = ${c.schoolId} and st.status = 'active' and st.deleted_at is null
  `);

  const counts = { scored: 0, high: 0, watch: 0 };
  const values: (typeof s.riskScores.$inferInsert)[] = [];
  for (const r of rows) {
    // too few school days to judge attendance: leave it out rather than guess
    const res = scoreRisk({
      attendancePct14: r.n14 >= 5 ? (r.p14 / r.n14) * 100 : null,
      attendancePctBaseline: r.nb >= 10 ? (r.pb / r.nb) * 100 : null,
      consecutiveAbsences: r.streak,
      oldestOverdueDays: r.oldest,
      unpaidMonths: r.months,
    });
    counts.scored++;
    if (res.band === "high") counts.high++;
    if (res.band === "watch") counts.watch++;
    values.push({ schoolId: c.schoolId, studentId: r.id, computedOn: c.today, score: res.score, band: res.band, reasons: res.reasons, modelVersion: "rules-v1" });
  }
  for (let i = 0; i < values.length; i += 500) {
    await tx.insert(s.riskScores).values(values.slice(i, i + 500)).onConflictDoUpdate({
      target: [s.riskScores.studentId, s.riskScores.computedOn],
      set: { score: sql`excluded.score`, band: sql`excluded.band`, reasons: sql`excluded.reasons` },
    });
  }
  return counts;
}

// ---------------- morning brief ----------------

export async function getBriefFacts(tx: Tx, c: SchoolCtx): Promise<BriefFacts> {
  const t = iso(c.today);
  const [r] = await tx.execute<{
    y_total: string; y_n: number; m_total: string; recovered: string; o60: string; o60_fam: number;
    sessions: number; present: number; marked_total: number; sections: number; staff_absent: number; staff_late: number;
    at_risk: number; approvals: number;
  }>(sql`
    select
      (select coalesce(sum(amount_minor),0)::bigint from ${s.payments} where school_id = ${c.schoolId} and status = 'confirmed' and paid_on = ${t}::date - 1) as y_total,
      (select count(*)::int from ${s.payments} where school_id = ${c.schoolId} and status = 'confirmed' and paid_on = ${t}::date - 1) as y_n,
      (select coalesce(sum(amount_minor),0)::bigint from ${s.payments} where school_id = ${c.schoolId} and status = 'confirmed'
         and paid_on >= date_trunc('month', ${t}::date - 1)::date and paid_on < ${t}::date) as m_total,
      (select coalesce(sum(value_minor),0)::bigint from ${s.roiEvents} where school_id = ${c.schoolId} and kind = 'fee_recovered'
         and occurred_at >= date_trunc('month', ${t}::date - 1)) as recovered,
      (select coalesce(sum(balance_minor),0)::bigint from ${s.invoices} where school_id = ${c.schoolId} and balance_minor > 0 and status <> 'void' and due_date < ${t}::date - 60) as o60,
      (select count(distinct family_id)::int from ${s.invoices} where school_id = ${c.schoolId} and balance_minor > 0 and status <> 'void' and due_date < ${t}::date - 60) as o60_fam,
      (select count(*)::int from ${s.attendanceSessions} where school_id = ${c.schoolId} and date = ${t}::date - 1) as sessions,
      (select count(*) filter (where r.status <> 'absent')::int from ${s.attendanceRecords} r join ${s.attendanceSessions} a on a.id = r.session_id
         where a.school_id = ${c.schoolId} and a.date = ${t}::date - 1) as present,
      (select count(*)::int from ${s.attendanceRecords} r join ${s.attendanceSessions} a on a.id = r.session_id
         where a.school_id = ${c.schoolId} and a.date = ${t}::date - 1) as marked_total,
      (select count(*)::int from ${s.sections} sec join ${s.academicYears} y on y.id = sec.academic_year_id and y.is_current where sec.school_id = ${c.schoolId}) as sections,
      (select count(*) filter (where status = 'absent')::int from ${s.staffAttendance} where school_id = ${c.schoolId} and date = ${t}::date - 1) as staff_absent,
      (select count(*) filter (where status = 'late')::int from ${s.staffAttendance} where school_id = ${c.schoolId} and date = ${t}::date - 1) as staff_late,
      (select count(*)::int from ${s.riskScores} where school_id = ${c.schoolId} and computed_on = ${t}::date and band = 'high') as at_risk,
      (select count(*)::int from ${s.studentFeeAdjustments} where school_id = ${c.schoolId} and status = 'requested') as approvals
  `);
  const names = await tx.execute<{ name: string }>(sql`
    select st.name from ${s.riskScores} rs join ${s.students} st on st.id = rs.student_id
    where rs.school_id = ${c.schoolId} and rs.computed_on = ${t}::date and rs.band = 'high' order by rs.score desc, st.name limit 3
  `);
  const schoolDay = (r?.sessions ?? 0) > 0; // no registers at all yesterday = holiday: say nothing about attendance
  return {
    school: c.schoolName,
    dateLabel: c.today.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
    collectedYesterdayMinor: Number(r?.y_total ?? 0),
    paymentsYesterday: r?.y_n ?? 0,
    collectedMonthMinor: Number(r?.m_total ?? 0),
    recoveredMonthMinor: Number(r?.recovered ?? 0),
    overdue60Minor: Number(r?.o60 ?? 0),
    overdue60Families: r?.o60_fam ?? 0,
    attendancePct: schoolDay && r!.marked_total ? Math.round((r!.present / r!.marked_total) * 100) : null,
    classesUnmarked: schoolDay ? Math.max(0, (r?.sections ?? 0) - (r?.sessions ?? 0)) : 0,
    staffAbsent: r?.staff_absent ?? 0,
    staffLate: r?.staff_late ?? 0,
    atRiskNames: names.map((n) => n.name),
    atRiskTotal: r?.at_risk ?? 0,
    pendingApprovals: r?.approvals ?? 0,
  };
}

export async function runMorningBrief(tx: Tx, c: SchoolCtx) {
  const facts = await getBriefFacts(tx, c);
  const text = morningBrief(facts);
  const [brief] = await tx.insert(s.dailyBriefs).values({
    schoolId: c.schoolId, date: c.today, facts: { ...facts, ur: text.ur }, text: text.en, status: "ready",
  }).returning({ id: s.dailyBriefs.id });
  const owners = await tx
    .select({ phone: s.users.phoneE164, userId: s.users.id })
    .from(s.memberships)
    .innerJoin(s.users, eq(s.users.id, s.memberships.userId))
    .where(and(eq(s.memberships.schoolId, c.schoolId), eq(s.memberships.role, "owner"), eq(s.memberships.status, "active")));
  for (const o of owners) {
    await tx.insert(s.messages).values({
      schoolId: c.schoolId, toPhone: o.phone, channel: "whatsapp", format: "text", category: "brief", templateKey: "morning_brief",
      // not put in the staff outbox (it is the owner's private summary): sent by the WhatsApp API once connected
      body: { ur: text.ur, en: text.en }, payload: { briefId: brief!.id, to: "owner" },
      status: newMessageStatus() === "simulated" ? "simulated" : "pending_api", sentAt: newMessageStatus() === "simulated" ? new Date() : null,
    });
  }
  return { briefId: brief!.id, owners: owners.length };
}

// ---------------- fee reminders ----------------

export async function runFeeReminders(tx: Tx, c: SchoolCtx) {
  const t = iso(c.today);
  const invoices = await tx.execute<{ id: string; family_id: string; period: string; due_date: string; balance: string; steps: number[] | null }>(sql`
    select i.id, i.family_id, i.period, i.due_date::text, i.balance_minor::bigint as balance,
      (select array_agg(re.step_no) from ${s.reminderEvents} re where re.invoice_id = i.id) as steps
    from ${s.invoices} i
    where i.school_id = ${c.schoolId} and i.balance_minor > 0 and i.status <> 'void' and i.due_date < ${t}::date
  `);
  if (!invoices.length) return { messages: 0, calls: 0, families: 0 };
  const familyIds = [...new Set(invoices.map((i) => i.family_id))];
  const fam = await tx.execute<{ id: string; phone: string | null; opt_in: boolean | null; voice: boolean | null; last_msg: string | null; promised: string | null }>(sql`
    select f.id, g.phone_e164 as phone, g.whatsapp_opt_in as opt_in, g.prefers_voice as voice,
      (select max(re.sent_at)::text from ${s.reminderEvents} re where re.family_id = f.id and re.channel <> 'principal_call') as last_msg,
      (select max(p.promised_on)::text from ${s.promisesToPay} p where p.family_id = f.id and p.status = 'open') as promised
    from ${s.families} f left join ${s.guardians} g on g.id = f.primary_guardian_id
    where f.school_id = ${c.schoolId} and f.id in (${sql.join(familyIds.map((id) => sql`${id}`), sql`, `)})
  `);
  const families: ReminderFamily[] = fam.map((f) => ({
    familyId: f.id,
    hasPhone: Boolean(f.phone && f.opt_in),
    prefersVoice: Boolean(f.voice),
    lastMessageAt: f.last_msg ? new Date(f.last_msg) : null,
    promisedUntil: f.promised ? new Date(`${f.promised}T00:00:00Z`) : null,
    invoices: invoices.filter((i) => i.family_id === f.id).map((i) => ({
      id: i.id, period: i.period, dueDate: new Date(`${i.due_date}T00:00:00Z`), balanceMinor: Number(i.balance), doneSteps: i.steps ?? [],
    })),
  }));

  const plan = planReminders(families, { today: c.today });
  let messages = 0;
  let calls = 0;
  for (const p of plan) {
    let messageId: string | null = null;
    if (p.channel !== "principal_call") {
      // voice notes need the audio sender (Stage 3); until then the Urdu text goes out and staff can read it aloud
      messageId = await queueToFamily(tx, c, p.familyId, {
        category: "fee", templateKey: `fee_reminder_${p.step}`,
        body: familyReminderText({ totalMinor: p.totalDueMinor, months: p.overdueMonths, school: c.schoolName, step: p.step }),
        payload: { invoiceId: p.invoiceId, step: p.step, wantsVoice: p.channel === "whatsapp_voice" },
      });
      if (!messageId) continue;
      messages++;
    } else calls++;
    await tx.insert(s.reminderEvents).values({
      schoolId: c.schoolId, invoiceId: p.invoiceId, familyId: p.familyId, stepNo: p.step, channel: p.channel, messageId,
      sentAt: new Date(),
      // simulated messages never reached the parent: they are shown, but earn no "recovered" credit
      outcome: p.channel === "principal_call" ? "call_needed" : newMessageStatus() === "simulated" ? "simulated" : "queued",
    }).onConflictDoNothing();
  }
  return { messages, calls, families: families.length };
}

// ---------------- scheduler ----------------

interface JobDef {
  job: "risk_scores" | "morning_brief" | "fee_reminders";
  hour: number;
  run: (tx: Tx, c: SchoolCtx) => Promise<Record<string, unknown>>;
  enabled: (c: SchoolCtx) => boolean;
}

export const JOBS: JobDef[] = [
  { job: "risk_scores", hour: 2, run: runRiskScores, enabled: (_c: SchoolCtx) => true },
  { job: "morning_brief", hour: 7, run: runMorningBrief, enabled: (c: SchoolCtx) => c.settings.automation?.brief !== false },
  {
    job: "fee_reminders", hour: 10, run: runFeeReminders,
    enabled: (c: SchoolCtx) => c.settings.automation?.reminders !== false && isReminderDay(c.today),
  },
];
export type JobName = JobDef["job"];
const MAX_ATTEMPTS = 3;

function localHour(timeZone: string, now: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** Take the day's slot for a job. Returns false if it already ran (or failed 3 times) today. */
async function claim(db: Db, c: SchoolCtx, job: string): Promise<string | null> {
  return withSchool(db, c.schoolId, async (tx) => {
    const rows = await tx.execute<{ id: string }>(sql`
      insert into ${s.jobRuns} (school_id, job, run_on, status) values (${c.schoolId}, ${job}, ${iso(c.today)}::date, 'running')
      on conflict (school_id, job, run_on) do update
        set status = 'running', attempts = ${s.jobRuns.attempts} + 1, started_at = now(), error = null
        where ${s.jobRuns.status} = 'failed' and ${s.jobRuns.attempts} < ${MAX_ATTEMPTS}
      returning id
    `);
    return rows[0]?.id ?? null;
  });
}

/**
 * Runs every job that is due for every school. Safe to call as often as you like (the worker calls it every
 * 10 minutes): each job runs once per school per local day. `only` forces one job now (manual "run now").
 */
export async function runDueJobs(db: Db, opts: { now?: Date; schoolId?: string; only?: JobName } = {}) {
  const now = opts.now ?? new Date();
  const schools = await db
    .select()
    .from(s.schools)
    .where(and(eq(s.schools.isDemo, false), ...(opts.schoolId ? [eq(s.schools.id, opts.schoolId)] : [])));
  const report: { school: string; job: string; status: string; result?: unknown; error?: string }[] = [];
  for (const sc of schools) {
    const c: SchoolCtx = { schoolId: sc.id, schoolName: sc.name, today: todayIn(sc.timezone, now), settings: (sc.settings ?? {}) as SchoolCtx["settings"] };
    const hour = localHour(sc.timezone, now);
    for (const j of JOBS) {
      if (opts.only ? j.job !== opts.only : hour < j.hour || !j.enabled(c)) continue;
      const runId = await claim(db, c, j.job);
      if (!runId) continue;
      try {
        const result: Record<string, unknown> = await withSchool(db, c.schoolId, (tx) => j.run(tx, c));
        await withSchool(db, c.schoolId, (tx) => tx.update(s.jobRuns).set({ status: "done", result, finishedAt: new Date() }).where(eq(s.jobRuns.id, runId)));
        report.push({ school: sc.name, job: j.job, status: "done", result });
      } catch (e) {
        const error = e instanceof Error ? `${e.message}${e.cause instanceof Error ? `: ${e.cause.message}` : ""}` : String(e);
        await withSchool(db, c.schoolId, (tx) => tx.update(s.jobRuns).set({ status: "failed", error: error.slice(0, 1000), finishedAt: new Date() }).where(eq(s.jobRuns.id, runId)));
        report.push({ school: sc.name, job: j.job, status: "failed", error });
      }
    }
  }
  return report;
}

// ---------------- reads for the screens ----------------

export async function getJobRuns(tx: Tx, schoolId: string, days = 14) {
  return tx.select().from(s.jobRuns)
    .where(and(eq(s.jobRuns.schoolId, schoolId), sql`${s.jobRuns.runOn} > current_date - ${days}::int`))
    .orderBy(sql`${s.jobRuns.runOn} desc, ${s.jobRuns.startedAt} desc`);
}

export async function getLatestBrief(tx: Tx, schoolId: string) {
  const [b] = await tx.select().from(s.dailyBriefs).where(eq(s.dailyBriefs.schoolId, schoolId)).orderBy(sql`${s.dailyBriefs.date} desc, ${s.dailyBriefs.createdAt} desc`).limit(1);
  return b ?? null;
}

/** Students at risk on the latest scoring day, with their last follow-up call. */
export async function getRiskList(tx: Tx, schoolId: string) {
  const rows = await tx.execute<{
    student_id: string; name: string; class_name: string | null; section: string | null; score: number; band: string;
    reasons: { text: string }[]; phone: string | null; guardian: string | null; computed_on: string; last_outcome: string | null; last_call: string | null;
  }>(sql`
    with latest as (select max(computed_on) as d from ${s.riskScores} where school_id = ${schoolId})
    select rs.student_id, st.name, cl.name as class_name, sec.name as section, rs.score, rs.band, rs.reasons, g.phone_e164 as phone, g.name as guardian,
      rs.computed_on::text,
      (select f.outcome from ${s.riskFollowups} f where f.student_id = rs.student_id order by f.created_at desc limit 1) as last_outcome,
      (select f.created_at::text from ${s.riskFollowups} f where f.student_id = rs.student_id order by f.created_at desc limit 1) as last_call
    from ${s.riskScores} rs
    join latest on rs.computed_on = latest.d
    join ${s.students} st on st.id = rs.student_id and st.status = 'active'
    left join ${s.enrollments} e on e.student_id = st.id
    left join ${s.academicYears} y on y.id = e.academic_year_id and y.is_current
    left join ${s.sections} sec on sec.id = e.section_id and y.id is not null
    left join ${s.classes} cl on cl.id = sec.class_id
    left join ${s.families} fam on fam.id = st.family_id
    left join ${s.guardians} g on g.id = fam.primary_guardian_id
    where rs.school_id = ${schoolId} and rs.band in ('high','watch') and (y.id is not null or e.id is null)
    order by rs.score desc, st.name
    limit 100
  `);
  return rows;
}

/** Families whose reminders did not work: the principal should call (reminder step 3). */
export async function getFeeCalls(tx: Tx, schoolId: string) {
  return tx.execute<{ id: string; family_id: string; guardian: string | null; phone: string | null; children: string | null; balance: string; months: number; since: string }>(sql`
    select re.id, re.family_id, g.name as guardian, g.phone_e164 as phone,
      (select string_agg(st.name, ', ') from ${s.students} st where st.family_id = re.family_id and st.status = 'active') as children,
      (select coalesce(sum(balance_minor),0)::bigint from ${s.invoices} i where i.family_id = re.family_id and i.balance_minor > 0 and i.status <> 'void') as balance,
      (select count(*)::int from ${s.invoices} i where i.family_id = re.family_id and i.balance_minor > 0 and i.status <> 'void') as months,
      re.sent_at::text as since
    from ${s.reminderEvents} re
    join ${s.families} f on f.id = re.family_id
    left join ${s.guardians} g on g.id = f.primary_guardian_id
    where re.school_id = ${schoolId} and re.channel = 'principal_call' and re.outcome = 'call_needed'
    order by re.sent_at
  `);
}

export async function getRecoveredThisMonth(tx: Tx, schoolId: string, today: Date) {
  const [r] = await tx.execute<{ v: string; n: number }>(sql`
    select coalesce(sum(value_minor),0)::bigint as v, count(*) filter (where value_minor > 0)::int as n from ${s.roiEvents}
    where school_id = ${schoolId} and kind = 'fee_recovered' and occurred_at >= date_trunc('month', ${iso(today)}::date)
  `);
  return { recoveredMinor: Number(r?.v ?? 0), payments: r?.n ?? 0 };
}

export async function setAutomationSettings(tx: Tx, schoolId: string, input: { reminders: boolean; brief: boolean }) {
  await tx.update(s.schools)
    .set({ settings: sql`coalesce(${s.schools.settings}, '{}'::jsonb) || ${JSON.stringify({ automation: input })}::jsonb` })
    .where(eq(s.schools.id, schoolId));
}

