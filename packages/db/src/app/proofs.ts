/**
 * Payment screenshots (Stage 3). AI reads the image elsewhere (packages/ai); here we store it, check duplicates
 * in SQL, and let a person approve or reject. Approval records a normal payment with receipt and audit log.
 */
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { can, normalizeReference } from "@campusos/core";
import type { Tx } from "../index";
import * as s from "../schema/index";
import { AppError, assertCan, queueToFamily, recordPayment, type AppCtx } from "./commands";

async function audit(tx: Tx, ctx: AppCtx, action: string, entityId: string, before: unknown, after: unknown) {
  await tx.insert(s.auditLogs).values({
    schoolId: ctx.schoolId, actorUserId: ctx.userId, action, entity: "payment_proofs", entityId,
    before: before ?? null, after: { ...(after as object), _role: ctx.role },
  });
}

const NO_ID = "00000000-0000-0000-0000-000000000000";

/** Has this exact image, or this transaction ID, been seen before? Checked on upload and again at approval. */
export async function proofDuplicates(
  tx: Tx,
  ctx: Pick<AppCtx, "schoolId">,
  input: { imageHash: string | null; referenceNorm: string | null; exceptProofId?: string },
) {
  const except = input.exceptProofId ?? NO_ID;
  const [r] = await tx.execute<{ img: number; ref_proof: number; ref_payment: number }>(sql`
    select
      (select count(*)::int from ${s.paymentProofs} where school_id = ${ctx.schoolId}
         and image_hash = ${input.imageHash ?? ""} and id <> ${except}::uuid) as img,
      (select count(*)::int from ${s.paymentProofs} where school_id = ${ctx.schoolId}
         and reference_norm = ${input.referenceNorm ?? ""} and status = 'approved' and id <> ${except}::uuid) as ref_proof,
      (select count(*)::int from ${s.payments} where school_id = ${ctx.schoolId} and status = 'confirmed'
         and regexp_replace(upper(coalesce(reference, '')), '[^A-Z0-9]', '', 'g') = ${input.referenceNorm ?? ""}) as ref_payment
  `);
  return {
    duplicateImage: Boolean(input.imageHash) && (r?.img ?? 0) > 0,
    duplicateReference: Boolean(input.referenceNorm) && (r?.ref_proof ?? 0) + (r?.ref_payment ?? 0) > 0,
  };
}

export async function createProof(
  tx: Tx,
  ctx: AppCtx,
  input: { imageKey: string; imageHash: string; imageMime: string; extracted: Record<string, unknown> & { referenceNorm: string | null }; familyId?: string | null },
) {
  assertCan(ctx, "fees.collect");
  const [p] = await tx.insert(s.paymentProofs).values({
    schoolId: ctx.schoolId, imageKey: input.imageKey, imageHash: input.imageHash, imageMime: input.imageMime, extracted: input.extracted,
    referenceNorm: input.extracted.referenceNorm, familyId: input.familyId ?? null, suggestedFamilyId: input.familyId ?? null,
    status: "pending", source: "upload", uploadedByUserId: ctx.userId,
  }).returning({ id: s.paymentProofs.id });
  await audit(tx, ctx, "upload", p!.id, null, { imageHash: input.imageHash, read: input.extracted.source });
  return { proofId: p!.id };
}

/**
 * A person confirms the screenshot: records the payment (receipt no., allocation, WhatsApp receipt) and links the
 * proof. A duplicate image or transaction ID blocks approval; only the owner can override, with a reason.
 */
export async function approveProof(
  tx: Tx,
  ctx: AppCtx,
  input: { proofId: string; familyId: string; amountMinor: number; method: "wallet" | "bank"; reference: string | null; overrideDuplicate?: boolean },
) {
  assertCan(ctx, "fees.collect");
  const [p] = await tx.select().from(s.paymentProofs)
    .where(and(eq(s.paymentProofs.schoolId, ctx.schoolId), eq(s.paymentProofs.id, input.proofId))).for("update");
  if (!p || p.status !== "pending") throw new AppError("This screenshot was already handled.");
  const refNorm = normalizeReference(input.reference);
  const dup = await proofDuplicates(tx, ctx, { imageHash: p.imageHash, referenceNorm: refNorm, exceptProofId: p.id });
  if ((dup.duplicateImage || dup.duplicateReference) && !(input.overrideDuplicate && can(ctx.role, "fees.reverse"))) {
    throw new AppError(
      dup.duplicateReference
        ? "This transaction ID was already used for another payment. Only the owner can approve it anyway."
        : "This exact screenshot was sent before. Only the owner can approve it anyway.",
    );
  }
  const pay = await recordPayment(tx, ctx, {
    familyId: input.familyId, amountMinor: input.amountMinor, method: input.method, reference: refNorm ?? undefined, note: "From payment screenshot",
  });
  await tx.update(s.paymentProofs).set({
    status: "approved", paymentId: pay.paymentId, familyId: input.familyId, reviewedAt: new Date(), reviewedByUserId: ctx.userId, referenceNorm: refNorm,
  }).where(eq(s.paymentProofs.id, p.id));
  await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "page_digital", refTable: "payment_proofs", refId: p.id, occurredAt: new Date() });
  const aiAmount = (p.extracted as { amountMinor?: number | null }).amountMinor ?? null;
  await audit(tx, ctx, "approve", p.id, { status: "pending" }, {
    familyId: input.familyId, amountMinor: input.amountMinor, paymentId: pay.paymentId, aiAmountMinor: aiAmount,
    amountChangedByPerson: aiAmount !== null && aiAmount !== input.amountMinor, overrideDuplicate: Boolean(input.overrideDuplicate),
  });
  return pay;
}

export async function rejectProof(
  tx: Tx,
  ctx: AppCtx,
  input: { proofId: string; reason: "duplicate" | "not_paid" | "unreadable" | "other"; note?: string; tellFamilyId?: string | null },
) {
  assertCan(ctx, "fees.collect");
  const [p] = await tx.select().from(s.paymentProofs)
    .where(and(eq(s.paymentProofs.schoolId, ctx.schoolId), eq(s.paymentProofs.id, input.proofId))).for("update");
  if (!p || p.status !== "pending") throw new AppError("This screenshot was already handled.");
  const status = input.reason === "duplicate" ? "duplicate" : "rejected";
  await tx.update(s.paymentProofs).set({
    status, reviewedAt: new Date(), reviewedByUserId: ctx.userId, reviewNote: [input.reason, input.note?.trim()].filter(Boolean).join(": "),
  }).where(eq(s.paymentProofs.id, p.id));
  const familyId = input.tellFamilyId ?? p.familyId;
  if (familyId) {
    await queueToFamily(tx, ctx, familyId, {
      category: "receipt", templateKey: "proof_rejected",
      body: {
        ur: "آپ کی بھیجی گئی ادائیگی کی رسید قبول نہیں ہو سکی۔ براہ کرم اسکول آفس سے رابطہ کریں۔",
        en: "We could not accept the payment receipt you sent. Please contact the school office.",
      },
    });
  }
  await audit(tx, ctx, "reject", p.id, { status: "pending" }, { status, reason: input.reason, note: input.note ?? null });
}

export async function getProofs(tx: Tx, ctx: AppCtx, status: "pending" | "done", limit = 50) {
  return tx
    .select({ proof: s.paymentProofs, uploadedBy: s.users.name })
    .from(s.paymentProofs)
    .leftJoin(s.users, eq(s.users.id, s.paymentProofs.uploadedByUserId))
    .where(and(eq(s.paymentProofs.schoolId, ctx.schoolId), status === "pending" ? eq(s.paymentProofs.status, "pending") : ne(s.paymentProofs.status, "pending")))
    .orderBy(status === "pending" ? asc(s.paymentProofs.createdAt) : desc(s.paymentProofs.reviewedAt))
    .limit(limit);
}

export async function getProofImageInfo(tx: Tx, ctx: Pick<AppCtx, "schoolId">, proofId: string) {
  const [p] = await tx.select({ imageKey: s.paymentProofs.imageKey, mime: s.paymentProofs.imageMime })
    .from(s.paymentProofs).where(and(eq(s.paymentProofs.schoolId, ctx.schoolId), eq(s.paymentProofs.id, proofId)));
  return p ?? null;
}

/** An earlier read of the same image, so a re-sent screenshot does not cost another AI call. */
export async function getEarlierReading(tx: Tx, ctx: Pick<AppCtx, "schoolId">, imageHash: string) {
  const [p] = await tx.select({ extracted: s.paymentProofs.extracted }).from(s.paymentProofs)
    .where(and(eq(s.paymentProofs.schoolId, ctx.schoolId), eq(s.paymentProofs.imageHash, imageHash)))
    .orderBy(asc(s.paymentProofs.createdAt)).limit(1);
  return p?.extracted ?? null;
}

/** Families with active children, their names and open balances: input to core.suggestFamilies (code, not AI). */
export async function getMatchCandidates(tx: Tx, ctx: Pick<AppCtx, "schoolId">) {
  const rows = await tx.execute<{ family_id: string; guardian: string; children: string[] | null; balances: string[] | null }>(sql`
    select f.id as family_id, coalesce(g.name, f.display_name) as guardian,
      (select array_agg(st.name) from ${s.students} st where st.family_id = f.id and st.status = 'active') as children,
      (select array_agg(i.balance_minor::text order by i.due_date) from ${s.invoices} i
         where i.family_id = f.id and i.balance_minor > 0 and i.status <> 'void') as balances
    from ${s.families} f left join ${s.guardians} g on g.id = f.primary_guardian_id
    where f.school_id = ${ctx.schoolId} and f.deleted_at is null
      and exists (select 1 from ${s.students} st where st.family_id = f.id and st.status = 'active')
  `);
  return rows.map((r) => ({ familyId: r.family_id, guardianName: r.guardian, childNames: r.children ?? [], openBalancesMinor: (r.balances ?? []).map(Number) }));
}
