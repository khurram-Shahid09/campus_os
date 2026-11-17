"use server";

import { revalidatePath } from "next/cache";
import {
  decideConcession,
  logFollowup,
  parentAskBalance,
  parentSendScreenshot,
  recordPayment,
  rejectProof,
  submitAttendance,
} from "@campusos/db/commands";
import { getOpenInvoices, searchFamilies } from "@campusos/db/roles";
import { demoCtx } from "@/lib/ctx";

const uuid = /^[0-9a-f-]{36}$/i;
function id(v: FormDataEntryValue | string | null | undefined): string {
  const s = String(v ?? "");
  if (!uuid.test(s)) throw new Error("Invalid id");
  return s;
}
function revalidateAll() {
  for (const p of ["/demo/owner", "/demo/owner/brief", "/demo/principal", "/demo/clerk", "/demo/teacher", "/demo/parent"]) revalidatePath(p, "layout");
}

// ---------- teacher ----------
export async function submitAttendanceAction(input: { sectionId: string; absentStudentIds: string[]; durationSeconds: number }) {
  const { db, ctx } = await demoCtx("teacher");
  const r = await submitAttendance(db, ctx, {
    sectionId: id(input.sectionId),
    absentStudentIds: input.absentStudentIds.map((x) => id(x)),
    durationSeconds: Math.max(1, Math.min(3600, Number(input.durationSeconds) || 0)),
  });
  revalidateAll();
  return r;
}

// ---------- clerk ----------
export async function searchFamiliesAction(q: string) {
  const { db, ctx } = await demoCtx("accountant");
  if (q.trim().length < 2) return [];
  return searchFamilies(db, ctx.schoolId, q.slice(0, 60));
}

export async function familyLedgerAction(familyId: string) {
  const { db, ctx } = await demoCtx("accountant");
  const rows = await getOpenInvoices(db, ctx.schoolId, id(familyId));
  return rows.map((r) => ({ ...r, dueDate: r.dueDate.toISOString().slice(0, 10) }));
}

export async function recordCashAction(input: { familyId: string; amountRupees: number }) {
  const { db, ctx } = await demoCtx("accountant");
  const amountMinor = Math.round(Number(input.amountRupees) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Enter an amount");
  const r = await recordPayment(db, ctx, { familyId: id(input.familyId), amountMinor, method: "cash" });
  revalidateAll();
  return { remainingMinor: r.remainingMinor, attributed: r.attributed, receipt: r.receipt, months: r.allocations.length };
}

export async function approveProofAction(form: FormData) {
  const { db, ctx } = await demoCtx("accountant");
  const amountMinor = Number(form.get("amountMinor"));
  await recordPayment(db, ctx, {
    familyId: id(form.get("familyId")), amountMinor, method: "wallet",
    reference: String(form.get("reference") ?? "").slice(0, 40), proofId: id(form.get("proofId")),
  });
  revalidateAll();
}

export async function rejectProofAction(form: FormData) {
  const { db, ctx } = await demoCtx("accountant");
  const reason = form.get("reason") === "duplicate" ? "duplicate" : "unreadable";
  await rejectProof(db, ctx, { proofId: id(form.get("proofId")), reason });
  revalidateAll();
}

// ---------- owner ----------
export async function decideConcessionAction(form: FormData) {
  const { db, ctx } = await demoCtx("owner");
  await decideConcession(db, ctx, { adjustmentId: id(form.get("adjustmentId")), decision: form.get("decision") === "approve" ? "approve" : "reject" });
  revalidateAll();
}

// ---------- principal ----------
export async function logFollowupAction(form: FormData) {
  const { db, ctx } = await demoCtx("principal");
  const allowed = ["will_return", "fee_plan_agreed", "leaving", "no_answer"] as const;
  const o = String(form.get("outcome"));
  const outcome = (allowed as readonly string[]).includes(o) ? (o as (typeof allowed)[number]) : "no_answer";
  await logFollowup(db, ctx, { studentId: id(form.get("studentId")), outcome });
  revalidateAll();
}

// ---------- parent ----------
export async function parentBalanceAction(form: FormData) {
  const { db, ctx } = await demoCtx("parent");
  await parentAskBalance(db, ctx, { familyId: id(form.get("familyId")) });
  revalidateAll();
}

export async function parentScreenshotAction(form: FormData) {
  const { db, ctx } = await demoCtx("parent");
  await parentSendScreenshot(db, ctx, { familyId: id(form.get("familyId")) });
  revalidateAll();
}
