/**
 * Write commands used by the demo role screens. Each runs in one transaction and writes audit_logs for
 * money and attendance changes. Messages are recorded with status "simulated" (no real WhatsApp send in demo).
 */
import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  absenceAlertText,
  allocatePayment,
  balanceReplyText,
  demoReceiptImageKey,
  invoiceStatusFor,
  isRecoveredByReminder,
  receiptText,
  type Bilingual,
} from "@campusos/core";
import type { Db } from "../index";
import * as s from "../schema/index";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface Ctx {
  schoolId: string;
  schoolName: string;
  asOf: Date;
  actorRole: "owner" | "principal" | "accountant" | "teacher" | "parent";
}

const shortName = (name: string) => name.replace(/\s*\(DEMO\)\s*$/, "");

async function audit(tx: Tx, ctx: Ctx, action: string, entity: string, entityId: string | null, before: unknown, after: unknown) {
  await tx.insert(s.auditLogs).values({
    schoolId: ctx.schoolId, action, entity, entityId, before: before ?? null,
    after: { ...(after as object), _actorRole: ctx.actorRole, _demo: true },
  });
}

async function guardianFor(tx: Tx, schoolId: string, familyId: string) {
  const [g] = await tx
    .select({ id: s.guardians.id, phone: s.guardians.phoneE164, prefersVoice: s.guardians.prefersVoice })
    .from(s.families)
    .innerJoin(s.guardians, eq(s.guardians.id, s.families.primaryGuardianId))
    .where(and(eq(s.families.schoolId, schoolId), eq(s.families.id, familyId)));
  return g ?? null;
}

async function sendToParent(
  tx: Tx,
  ctx: Ctx,
  familyId: string,
  m: { category: string; templateKey: string; body: Bilingual; format?: "text" | "voice" | "image"; payload?: unknown },
) {
  const g = await guardianFor(tx, ctx.schoolId, familyId);
  if (!g) return null;
  const [row] = await tx
    .insert(s.messages)
    .values({
      schoolId: ctx.schoolId, familyId, guardianId: g.id, toPhone: g.phone, channel: "whatsapp",
      format: m.format ?? (g.prefersVoice ? "voice" : "text"), category: m.category, templateKey: m.templateKey,
      body: m.body, payload: m.payload ?? null, status: "simulated", sentAt: new Date(),
    })
    .returning({ id: s.messages.id });
  return row?.id ?? null;
}

// ---------- teacher: attendance ----------
export async function submitAttendance(
  db: Db,
  ctx: Ctx,
  input: { sectionId: string; absentStudentIds: string[]; durationSeconds: number },
) {
  return db.transaction(async (tx) => {
    const roster = await tx
      .select({ id: s.students.id, name: s.students.name, gender: s.students.gender, familyId: s.students.familyId })
      .from(s.enrollments)
      .innerJoin(s.students, eq(s.students.id, s.enrollments.studentId))
      .where(and(eq(s.enrollments.schoolId, ctx.schoolId), eq(s.enrollments.sectionId, input.sectionId), eq(s.students.status, "active")));
    if (!roster.length) throw new Error("Section has no students");
    const absent = new Set(input.absentStudentIds.filter((id) => roster.some((r) => r.id === id)));

    const [existing] = await tx
      .select({ id: s.attendanceSessions.id })
      .from(s.attendanceSessions)
      .where(and(eq(s.attendanceSessions.schoolId, ctx.schoolId), eq(s.attendanceSessions.sectionId, input.sectionId), eq(s.attendanceSessions.date, ctx.asOf)));
    if (existing) {
      await tx.delete(s.attendanceRecords).where(eq(s.attendanceRecords.sessionId, existing.id));
      await tx.delete(s.attendanceSessions).where(eq(s.attendanceSessions.id, existing.id));
    }
    const [session] = await tx
      .insert(s.attendanceSessions)
      .values({ schoolId: ctx.schoolId, sectionId: input.sectionId, date: ctx.asOf, submittedAt: new Date(), method: "tap", durationSeconds: Math.round(input.durationSeconds) })
      .returning({ id: s.attendanceSessions.id });
    await tx.insert(s.attendanceRecords).values(
      roster.map((r) => ({ schoolId: ctx.schoolId, sessionId: session!.id, studentId: r.id, status: absent.has(r.id) ? "absent" : "present" })),
    );
    let alerts = 0;
    for (const r of roster.filter((x) => absent.has(x.id))) {
      const id = await sendToParent(tx, ctx, r.familyId, {
        category: "attendance", templateKey: "absence_alert", format: "voice",
        body: absenceAlertText({ child: r.name, gender: r.gender === "F" ? "F" : "M", school: shortName(ctx.schoolName) }),
      });
      if (id) alerts++;
    }
    await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "attendance_taken", refTable: "attendance_sessions", refId: session!.id, occurredAt: new Date() });
    await audit(tx, ctx, existing ? "update" : "create", "attendance_sessions", session!.id, null, {
      sectionId: input.sectionId, date: ctx.asOf.toISOString().slice(0, 10), absent: [...absent],
    });
    return { sessionId: session!.id, total: roster.length, absent: absent.size, alerts };
  });
}

// ---------- clerk: payments ----------
export async function recordPayment(
  db: Db,
  ctx: Ctx,
  input: { familyId: string; amountMinor: number; method: "cash" | "wallet" | "bank"; reference?: string; proofId?: string },
) {
  return db.transaction(async (tx) => {
    const open = await tx
      .select({ id: s.invoices.id, dueDate: s.invoices.dueDate, balanceMinor: s.invoices.balanceMinor, totalMinor: s.invoices.totalMinor, paidMinor: s.invoices.paidMinor })
      .from(s.invoices)
      .where(and(eq(s.invoices.schoolId, ctx.schoolId), eq(s.invoices.familyId, input.familyId), gt(s.invoices.balanceMinor, 0)));
    const { allocations, advanceMinor } = allocatePayment(input.amountMinor, open);

    const [lastReminder] = await tx
      .select({ id: s.reminderEvents.id, sentAt: s.reminderEvents.sentAt })
      .from(s.reminderEvents)
      .where(and(eq(s.reminderEvents.schoolId, ctx.schoolId), eq(s.reminderEvents.familyId, input.familyId)))
      .orderBy(desc(s.reminderEvents.sentAt))
      .limit(1);
    const attributed = isRecoveredByReminder(ctx.asOf, lastReminder?.sentAt ?? null);

    const [payment] = await tx
      .insert(s.payments)
      .values({
        schoolId: ctx.schoolId, familyId: input.familyId, amountMinor: input.amountMinor, method: input.method,
        reference: input.reference ?? null, paidOn: ctx.asOf, attributedToCampusos: attributed,
        attributedReminderEventId: attributed ? lastReminder!.id : null,
      })
      .returning({ id: s.payments.id });

    for (const a of allocations) {
      const inv = open.find((o) => o.id === a.invoiceId)!;
      await tx.insert(s.paymentAllocations).values({ schoolId: ctx.schoolId, paymentId: payment!.id, invoiceId: a.invoiceId, amountMinor: a.amountMinor });
      await tx
        .update(s.invoices)
        .set({ balanceMinor: a.newBalanceMinor, paidMinor: inv.paidMinor + a.amountMinor, status: invoiceStatusFor(inv.totalMinor, a.newBalanceMinor) })
        .where(eq(s.invoices.id, a.invoiceId));
    }
    const remainingMinor = open.reduce((sum, o) => sum + o.balanceMinor, 0) - (input.amountMinor - advanceMinor);

    if (attributed) {
      await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "fee_recovered", valueMinor: input.amountMinor, refTable: "payments", refId: payment!.id, occurredAt: new Date() });
    }
    if (input.proofId) {
      await tx.update(s.paymentProofs).set({ status: "approved", reviewedAt: new Date(), paymentId: payment!.id }).where(eq(s.paymentProofs.id, input.proofId));
      await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "page_digital", refTable: "payment_proofs", refId: input.proofId, occurredAt: new Date() });
    }
    const receipt = receiptText({ amountMinor: input.amountMinor, balanceMinor: remainingMinor, school: shortName(ctx.schoolName) });
    await sendToParent(tx, ctx, input.familyId, { category: "receipt", templateKey: "receipt", body: receipt });
    await audit(tx, ctx, "create", "payments", payment!.id, null, { familyId: input.familyId, amountMinor: input.amountMinor, method: input.method, allocations, advanceMinor, proofId: input.proofId ?? null });
    return { paymentId: payment!.id, allocations, advanceMinor, remainingMinor, attributed, receipt };
  });
}

export async function rejectProof(db: Db, ctx: Ctx, input: { proofId: string; reason: "duplicate" | "unreadable" | "wrong_amount" }) {
  return db.transaction(async (tx) => {
    const [proof] = await tx.select().from(s.paymentProofs).where(and(eq(s.paymentProofs.schoolId, ctx.schoolId), eq(s.paymentProofs.id, input.proofId)));
    if (!proof) throw new Error("Proof not found");
    const status = input.reason === "duplicate" ? "duplicate" : "rejected";
    await tx.update(s.paymentProofs).set({ status, reviewedAt: new Date() }).where(eq(s.paymentProofs.id, proof.id));
    if (proof.familyId) {
      await sendToParent(tx, ctx, proof.familyId, {
        category: "receipt", templateKey: "proof_rejected",
        body: {
          ur: "آپ کی بھیجی گئی رسید قبول نہیں ہو سکی۔ براہ کرم اسکول آفس سے رابطہ کریں۔",
          en: "We could not accept the receipt you sent. Please contact the school office.",
        },
      });
    }
    await audit(tx, ctx, "reject", "payment_proofs", proof.id, { status: proof.status }, { status, reason: input.reason });
    return { status };
  });
}

// ---------- owner: concessions ----------
export async function decideConcession(db: Db, ctx: Ctx, input: { adjustmentId: string; decision: "approve" | "reject" }) {
  return db.transaction(async (tx) => {
    const [adj] = await tx
      .select()
      .from(s.studentFeeAdjustments)
      .where(and(eq(s.studentFeeAdjustments.schoolId, ctx.schoolId), eq(s.studentFeeAdjustments.id, input.adjustmentId)));
    if (!adj || adj.status !== "requested") throw new Error("Request not found or already decided");
    const pct = adj.requestedValue ?? 0;
    const approved = input.decision === "approve";
    await tx
      .update(s.studentFeeAdjustments)
      .set({ status: approved ? "approved" : "rejected", value: approved ? pct : 0 })
      .where(eq(s.studentFeeAdjustments.id, adj.id));
    if (!approved) {
      const [fee] = await tx.execute<{ amount: string }>(sql`
        select fs.amount_minor::bigint as amount from ${s.feeStructures} fs
        join ${s.sections} sec on sec.class_id = fs.class_id
        join ${s.enrollments} e on e.section_id = sec.id and e.student_id = ${adj.studentId}
        where fs.school_id = ${ctx.schoolId} limit 1
      `);
      const savedMinor = Math.round((Number(fee?.amount ?? 0) * pct) / 100);
      await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "concession_controlled", valueMinor: savedMinor, refTable: "student_fee_adjustments", refId: adj.id, occurredAt: new Date() });
    }
    await audit(tx, ctx, approved ? "approve" : "reject", "student_fee_adjustments", adj.id, { status: "requested" }, { status: approved ? "approved" : "rejected", pct });
    return { approved };
  });
}

// ---------- principal: dropout follow-up ----------
export async function logFollowup(
  db: Db,
  ctx: Ctx,
  input: { studentId: string; outcome: "will_return" | "fee_plan_agreed" | "leaving" | "no_answer" },
) {
  const [row] = await db
    .insert(s.riskFollowups)
    .values({ schoolId: ctx.schoolId, studentId: input.studentId, action: "called", outcome: input.outcome, byRole: ctx.actorRole })
    .returning({ id: s.riskFollowups.id });
  return { id: row!.id };
}

// ---------- parent: WhatsApp simulator ----------
export async function parentAskBalance(db: Db, ctx: Ctx, input: { familyId: string }) {
  return db.transaction(async (tx) => {
    const g = await guardianFor(tx, ctx.schoolId, input.familyId);
    if (!g) throw new Error("Family not found");
    await tx.insert(s.messages).values({
      schoolId: ctx.schoolId, familyId: input.familyId, guardianId: g.id, toPhone: g.phone, direction: "in", channel: "whatsapp",
      format: "voice", category: "system", body: { ur: "میری فیس کتنی باقی ہے؟", en: "How much fee do I owe?" }, status: "received", sentAt: new Date(),
    });
    const [due] = await tx.execute<{ total: string; months: number }>(sql`
      select coalesce(sum(balance_minor), 0)::bigint as total, count(*)::int as months from ${s.invoices}
      where school_id = ${ctx.schoolId} and family_id = ${input.familyId} and balance_minor > 0
    `);
    const body = balanceReplyText({ balanceMinor: Number(due?.total ?? 0), months: due?.months ?? 0 });
    await sendToParent(tx, ctx, input.familyId, { category: "system", templateKey: "balance_reply", body });
    return body;
  });
}

export async function parentSendScreenshot(db: Db, ctx: Ctx, input: { familyId: string }) {
  return db.transaction(async (tx) => {
    const g = await guardianFor(tx, ctx.schoolId, input.familyId);
    if (!g) throw new Error("Family not found");
    const open = await tx
      .select({ id: s.invoices.id, balanceMinor: s.invoices.balanceMinor, dueDate: s.invoices.dueDate })
      .from(s.invoices)
      .where(and(eq(s.invoices.schoolId, ctx.schoolId), eq(s.invoices.familyId, input.familyId), gt(s.invoices.balanceMinor, 0)))
      .orderBy(s.invoices.dueDate)
      .limit(1);
    const amountMinor = open[0]?.balanceMinor ?? 250_000;
    const reference = `TRX${Date.now() % 100000000}`;
    const date = ctx.asOf.toISOString().slice(0, 10);
    const imageKey = demoReceiptImageKey({ amountMinor, reference, kind: "Mobile wallet transfer", date });
    await tx.insert(s.messages).values({
      schoolId: ctx.schoolId, familyId: input.familyId, guardianId: g.id, toPhone: g.phone, direction: "in", channel: "whatsapp",
      format: "image", category: "receipt", payload: { imageKey }, status: "received", sentAt: new Date(),
    });
    const [proof] = await tx
      .insert(s.paymentProofs)
      .values({
        schoolId: ctx.schoolId, familyId: input.familyId, guardianId: g.id, imageKey, imageHash: `live-${Date.now()}`,
        suggestedFamilyId: input.familyId, status: "pending",
        extracted: { source: "demo", amountMinor, date, reference, bank: "Mobile wallet", confidence: 0.93 },
      })
      .returning({ id: s.paymentProofs.id });
    await sendToParent(tx, ctx, input.familyId, {
      category: "receipt", templateKey: "proof_received",
      body: { ur: "آپ کی رسید مل گئی۔ اسکول تصدیق کر کے آپ کو بتا دے گا۔", en: "We got your receipt. The school will confirm and let you know." },
    });
    return { proofId: proof!.id };
  });
}
