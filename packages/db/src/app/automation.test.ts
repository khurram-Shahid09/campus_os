/**
 * Scheduler integration test against the real Postgres: one throwaway school, overdue fees, and the
 * reminder ladder run across several simulated days. Also checks jobs run once per day and payment attribution.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { buildImportPreview, guessColumns, periodOf, todayIn } from "@campusos/core";
import { createDb } from "../index";
import * as s from "../schema/index";
import {
  commitImport, createSchool, getFeeCalls, getLatestBrief, getRiskList, logFeeCall, markMessageSent, recordPayment, requestOtp,
  runDueJobs, runInvoices, verifyOtp, withSchool, type AppCtx,
} from "./index";

process.env.AUTH_SECRET ??= "test-secret-at-least-16-chars";
const db = createDb();
const PHONE = "+923009990009";
const DAY = 86_400_000;
const T = todayIn("Asia/Karachi");
/** 11:00 in Karachi on day T + n */
const at = (n: number) => new Date(T.getTime() + n * DAY + 6 * 3600_000);
let ctx: AppCtx;

async function cleanup() {
  const [u] = await db.select().from(s.users).where(eq(s.users.phoneE164, PHONE));
  if (u) {
    const ms = await db.select().from(s.memberships).where(eq(s.memberships.userId, u.id));
    const ids = ms.map((m) => m.schoolId);
    if (ids.length) {
      for (const t of Object.values(s)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (t && typeof t === "object" && "schoolId" in t && (t as unknown) !== s.schools) await db.delete(t as any).where(inArray((t as any).schoolId, ids));
      }
      await db.delete(s.schools).where(inArray(s.schools.id, ids));
    }
    await db.delete(s.sessions).where(eq(s.sessions.userId, u.id));
    await db.delete(s.users).where(eq(s.users.id, u.id));
  }
  await db.delete(s.otpChallenges).where(eq(s.otpChallenges.phoneE164, PHONE));
}

beforeAll(async () => {
  await cleanup();
  const { code } = await requestOtp(db, PHONE, null, "dev");
  const { userId } = await verifyOtp(db, PHONE, code, null);
  const { schoolId } = await createSchool(db, { userId, ownerName: "Auto Owner", schoolName: "Automation Test School", city: "Multan", yearStartsOn: new Date(Date.UTC(T.getUTCFullYear() - 1, 3, 1)) });
  const [sc] = await db.select().from(s.schools).where(eq(s.schools.id, schoolId));
  ctx = { schoolId, schoolName: sc!.name, userId, role: "owner", today: T, settings: sc!.settings as AppCtx["settings"] };
  const rows = [
    ["GR", "Name", "Father", "Class", "Section", "Phone", "Fee"],
    ["1", "Zain", "Kamran", "Class 2", "A", "0300-7770001", "4000"],
    ["2", "Maryam", "Kamran", "Class 4", "A", "0300-7770001", "4000"],
    ["3", "Usman", "Tariq", "Class 2", "A", "", "4000"], // no phone
  ];
  await withSchool(db, schoolId, (tx) => commitImport(tx, ctx, buildImportPreview(rows, guessColumns(rows[0]!))));
  // a month billed 40 days ago, due 39 days ago: overdue
  const old = new Date(T.getTime() - 40 * DAY);
  await withSchool(db, schoolId, (tx) => runInvoices(tx, { ...ctx, today: old }, { period: periodOf(old), extraHeadIds: [], dueDate: new Date(T.getTime() - 39 * DAY) }));
});

afterAll(async () => {
  await cleanup();
  await db.$client.end();
});

const jobs = (day: number) => runDueJobs(db, { now: at(day), schoolId: ctx.schoolId });
const events = () => withSchool(db, ctx.schoolId, (tx) => tx.select().from(s.reminderEvents).orderBy(s.reminderEvents.stepNo));

describe("scheduler", () => {
  it("runs risk scores, the Morning Brief and reminders once on the day", async () => {
    const r = await jobs(T.getUTCDay() === 0 ? 1 : 0);
    expect(r.map((x) => `${x.job}:${x.status}`).sort()).toEqual(["fee_reminders:done", "morning_brief:done", "risk_scores:done"]);
    const again = await jobs(T.getUTCDay() === 0 ? 1 : 0);
    expect(again).toEqual([]); // already ran today
  });

  it("brief went to the owner's outbox, with numbers from SQL", async () => {
    const brief = await withSchool(db, ctx.schoolId, (tx) => getLatestBrief(tx, ctx.schoolId));
    expect(brief?.text).toContain("Automation Test School");
    const msgs = await withSchool(db, ctx.schoolId, (tx) => tx.select().from(s.messages).where(eq(s.messages.category, "brief")));
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.toPhone).toBe(PHONE);
  });

  it("step 1 WhatsApp for the family with a phone; the one without a phone (39 days late) goes to the call list", async () => {
    const ev = await events();
    expect(ev.map((e) => `${e.stepNo}:${e.channel}:${e.outcome}`)).toEqual(["1:whatsapp_text:queued", "3:principal_call:call_needed"]);
    const scores = await withSchool(db, ctx.schoolId, (tx) => tx.select().from(s.riskScores));
    expect(scores).toHaveLength(3);
    // one month 39 days late is 15 points: below "watch" (25), so nobody is flagged yet
    expect(await withSchool(db, ctx.schoolId, (tx) => getRiskList(tx, ctx.schoolId))).toHaveLength(0);
  });

  it("only a reminder actually sent gets credit for the payment that follows", async () => {
    const [ev] = await events();
    await withSchool(db, ctx.schoolId, (tx) => markMessageSent(tx, ctx, { messageId: ev!.messageId! }));
    expect((await events())[0]!.outcome).toBe("sent");
    const pay = await withSchool(db, ctx.schoolId, (tx) => recordPayment(tx, ctx, { familyId: ev!.familyId, amountMinor: 100_000, method: "cash" }));
    const [p] = await withSchool(db, ctx.schoolId, (tx) => tx.select().from(s.payments).where(eq(s.payments.id, pay.paymentId)));
    expect(p!.attributedToCampusos).toBe(true);
  });

  it("climbs the ladder over the following days, never two WhatsApps within 5 days", async () => {
    await jobs(3); // too soon after step 1
    expect((await events()).filter((e) => e.stepNo === 2)).toHaveLength(0);
    await jobs(7);
    expect((await events()).some((e) => e.stepNo === 2)).toBe(true);
    await jobs(14);
    const ev = await events();
    const calls = ev.filter((e) => e.channel === "principal_call");
    // Kamran family reaches step 3; Tariq family (no phone) went straight to the call list
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.outcome === "call_needed")).toBe(true);
  });

  it("the principal logs a promise, which takes the family off the call list", async () => {
    const before = await withSchool(db, ctx.schoolId, (tx) => getFeeCalls(tx, ctx.schoolId));
    expect(before).toHaveLength(2);
    await withSchool(db, ctx.schoolId, (tx) =>
      logFeeCall(tx, ctx, { reminderEventId: before[0]!.id, outcome: "promised", promisedOn: new Date(T.getTime() + 5 * DAY), amountMinor: 400_000 }),
    );
    const after = await withSchool(db, ctx.schoolId, (tx) => getFeeCalls(tx, ctx.schoolId));
    expect(after).toHaveLength(1);
  });

  it("a school that turned reminders off gets none", async () => {
    await db.update(s.schools).set({ settings: { ...ctx.settings, automation: { reminders: false } } }).where(eq(s.schools.id, ctx.schoolId));
    const r = await jobs(21);
    expect(r.map((x) => x.job)).not.toContain("fee_reminders");
    const runs = await withSchool(db, ctx.schoolId, (tx) => tx.select().from(s.jobRuns).where(and(eq(s.jobRuns.job, "fee_reminders"))));
    expect(runs.every((x) => x.status === "done")).toBe(true);
  });
});
