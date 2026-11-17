/** Payment screenshot flow against the real Postgres: upload -> approve -> duplicate image / reference blocked. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { buildImportPreview, guessColumns, periodOf, todayIn } from "@campusos/core";
import { createDb } from "../index";
import * as s from "../schema/index";
import {
  approveProof, commitImport, createProof, createSchool, getFamily, getMatchCandidates, proofDuplicates, rejectProof, reportAttendanceMonth, reportPayments, requestOtp, sendNotice,
  runInvoices, verifyOtp, withSchool, type AppCtx,
} from "./index";

process.env.AUTH_SECRET ??= "test-secret-at-least-16-chars";
const db = createDb();
const PHONE = "+923009990010";
const T = todayIn("Asia/Karachi");
let ctx: AppCtx;
let familyId: string;

async function cleanup() {
  const [u] = await db.select().from(s.users).where(eq(s.users.phoneE164, PHONE));
  if (u) {
    const ids = (await db.select().from(s.memberships).where(eq(s.memberships.userId, u.id))).map((m) => m.schoolId);
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

const extracted = (ref: string | null) => ({ source: "ai", amountMinor: 400_000, referenceNorm: ref, senderName: "Kamran Ali" });

beforeAll(async () => {
  await cleanup();
  const { code } = await requestOtp(db, PHONE, null, "dev");
  const { userId } = await verifyOtp(db, PHONE, code, null);
  const { schoolId } = await createSchool(db, { userId, ownerName: "Proof Owner", schoolName: "Proof Test School", city: "Lahore", yearStartsOn: new Date(Date.UTC(T.getUTCFullYear() - 1, 3, 1)) });
  const [sc] = await db.select().from(s.schools).where(eq(s.schools.id, schoolId));
  ctx = { schoolId, schoolName: sc!.name, userId, role: "owner", today: T, settings: sc!.settings as AppCtx["settings"] };
  const rows = [["GR", "Name", "Father", "Class", "Phone", "Fee"], ["1", "Sana Kamran", "Kamran Ali", "Class 1", "0300-6660001", "4000"]];
  await withSchool(db, schoolId, (tx) => commitImport(tx, ctx, buildImportPreview(rows, guessColumns(rows[0]!))));
  await withSchool(db, schoolId, (tx) => runInvoices(tx, ctx, { period: periodOf(T), extraHeadIds: [], dueDate: T }));
  familyId = (await withSchool(db, schoolId, (tx) => getMatchCandidates(tx, ctx)))[0]!.familyId;
});

afterAll(async () => {
  await cleanup();
  await db.$client.end();
});

describe("payment screenshots", () => {
  it("approving a screenshot records the payment and clears the balance", async () => {
    const { proofId } = await withSchool(db, ctx.schoolId, (tx) => createProof(tx, ctx, { imageKey: "k1", imageHash: "hash-1", imageMime: "image/png", extracted: extracted("0398124577") }));
    const pay = await withSchool(db, ctx.schoolId, (tx) => approveProof(tx, { ...ctx, role: "accountant" }, { proofId, familyId, amountMinor: 400_000, method: "wallet", reference: "TID 0398124577" }));
    expect(pay.receiptNo).toBe(1);
    const fam = await withSchool(db, ctx.schoolId, (tx) => getFamily(tx, ctx, familyId));
    expect(fam!.balanceMinor).toBe(0);
    await expect(withSchool(db, ctx.schoolId, (tx) => approveProof(tx, ctx, { proofId, familyId, amountMinor: 1, method: "wallet", reference: null }))).rejects.toThrow(/already handled/);
  });

  it("the same image sent again is detected", async () => {
    const d = await withSchool(db, ctx.schoolId, (tx) => proofDuplicates(tx, ctx, { imageHash: "hash-1", referenceNorm: null }));
    expect(d).toEqual({ duplicateImage: true, duplicateReference: false });
  });

  it("a new screenshot with a used transaction ID is blocked for the clerk; only the owner can override", async () => {
    const { proofId } = await withSchool(db, ctx.schoolId, (tx) => createProof(tx, ctx, { imageKey: "k2", imageHash: "hash-2", imageMime: "image/png", extracted: extracted("0398124577") }));
    const clerk = { ...ctx, role: "accountant" as const };
    await expect(withSchool(db, ctx.schoolId, (tx) => approveProof(tx, clerk, { proofId, familyId, amountMinor: 400_000, method: "wallet", reference: "0398124577", overrideDuplicate: true }))).rejects.toThrow(/already used/);
    await withSchool(db, ctx.schoolId, (tx) => rejectProof(tx, clerk, { proofId, reason: "duplicate" }));
    const [p] = await withSchool(db, ctx.schoolId, (tx) => tx.select().from(s.paymentProofs).where(eq(s.paymentProofs.id, proofId)));
    expect(p!.status).toBe("duplicate");
    const msgs = await withSchool(db, ctx.schoolId, (tx) => tx.select().from(s.messages).where(eq(s.messages.templateKey, "proof_rejected")));
    expect(msgs).toHaveLength(0); // proof had no family: nobody to tell
  });
});

describe("notices and reports", () => {
  it("sends a notice to every family once, and to families with dues only when asked", async () => {
    const all = await withSchool(db, ctx.schoolId, (tx) => sendNotice(tx, ctx, { audience: { kind: "all" }, en: "School closed tomorrow.", ur: "کل اسکول بند ہے۔" }));
    expect(all).toEqual({ families: 1, sent: 1, noPhone: 0 });
    // the family paid in full above, so nobody has dues
    await expect(withSchool(db, ctx.schoolId, (tx) => sendNotice(tx, ctx, { audience: { kind: "dues" }, en: "Please pay", ur: "" }))).rejects.toThrow(/No families/);
    await expect(withSchool(db, ctx.schoolId, (tx) => sendNotice(tx, { ...ctx, role: "teacher" }, { audience: { kind: "all" }, en: "x", ur: "" }))).rejects.toThrow(/permission/);
  });

  it("report exports come from SQL with readable column names", async () => {
    const pays = await withSchool(db, ctx.schoolId, (tx) => reportPayments(tx, ctx, new Date(T.getTime() - 86_400_000), T));
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ "Receipt no.": 1, "Amount (Rs)": 4000, Method: "wallet", Reference: "0398124577" });
    const att = await withSchool(db, ctx.schoolId, (tx) => reportAttendanceMonth(tx, ctx, periodOf(T)));
    expect(att[0]).toMatchObject({ Student: "Sana Kamran", Present: 0 });
  });
});
