"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, toMinor } from "@campusos/core";
import { emptyExtraction, geminiConfigFromEnv, readPaymentProof, type StoredExtraction } from "@campusos/ai";
import * as cmd from "@campusos/db/app";
import { action, currentSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ALLOWED_IMAGES, MAX_UPLOAD_BYTES, saveImage } from "@/lib/storage";
import type { FormState } from "@/components/form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Clerk adds a screenshot a parent sent (today: to the school's WhatsApp; later: straight from the Business API).
 * The image is saved, read by AI *outside* any database transaction, then stored as a pending proof for a person
 * to confirm. If AI is busy or off, the proof is stored anyway and the clerk types the details.
 */
export async function uploadProofAction(_: FormState, f: FormData): Promise<FormState> {
  const session = await currentSession();
  if (!session?.school || !session.role || !can(session.role, "fees.collect")) return { error: "You don't have permission to do this." };
  const files = f.getAll("images").filter((x): x is File => x instanceof File && x.size > 0).slice(0, 10);
  if (!files.length) return { error: "Choose a screenshot." };
  const familyId = String(f.get("familyId") ?? "");
  const schoolId = session.school.id;
  const db = getDb();
  const cfg = process.env.AI_PROVIDER === "off" ? null : geminiConfigFromEnv();
  let added = 0;
  const notes: string[] = [];

  for (const file of files) {
    if (!ALLOWED_IMAGES[file.type]) {
      notes.push(`${file.name}: not a photo (use JPG, PNG, WEBP or HEIC).`);
      continue;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      notes.push(`${file.name}: larger than 8 MB.`);
      continue;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { key, hash } = await saveImage(schoolId, bytes, file.type);

    // same picture sent before: reuse that reading instead of paying for another AI call
    const earlier = (await cmd.withSchool(db, schoolId, (tx) => cmd.getEarlierReading(tx, { schoolId }, hash))) as StoredExtraction | null;
    let extracted: StoredExtraction;
    if (earlier) extracted = earlier;
    else if (!cfg) extracted = emptyExtraction("AI reading is switched off");
    else {
      try {
        extracted = await readPaymentProof(cfg, { bytes, mimeType: file.type });
      } catch (e) {
        extracted = emptyExtraction((e as Error).message);
        notes.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    const r = await action("fees.collect", (tx, ctx) =>
      cmd.createProof(tx, ctx, { imageKey: key, imageHash: hash, imageMime: file.type, extracted: { ...extracted }, familyId: UUID.test(familyId) ? familyId : null }),
    );
    if (r.error) return { error: r.error };
    added++;
  }
  revalidatePath("/app", "layout");
  if (!added) return { error: notes.join(" ") };
  return { ok: `${added} screenshot${added === 1 ? "" : "s"} added below.${notes.length ? ` ${notes.join(" ")}` : ""}` };
}

export async function approveProofAction(_: FormState, f: FormData): Promise<FormState> {
  const familyId = String(f.get("familyId") ?? "");
  const amount = String(f.get("amount") ?? "").replace(/[,\s]/g, "");
  const method = String(f.get("method") ?? "wallet");
  if (!UUID.test(familyId)) return { error: "Choose which family paid." };
  if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return { error: "Enter the amount." };
  if (method !== "wallet" && method !== "bank") return { error: "Choose wallet or bank." };
  const r = await action("fees.collect", (tx, ctx) =>
    cmd.approveProof(tx, ctx, {
      proofId: String(f.get("proofId")), familyId, amountMinor: toMinor(Number(amount)), method,
      reference: String(f.get("reference") ?? "").trim() || null, overrideDuplicate: f.get("override") === "on",
    }),
  );
  if (r.error) return { error: r.error };
  revalidatePath("/app", "layout");
  redirect(`/app/receipts/${r.result!.paymentId}?new=1&from=proofs`);
}

export async function rejectProofAction(_: FormState, f: FormData): Promise<FormState> {
  const reason = String(f.get("reason") ?? "") as "not_paid";
  if (!["duplicate", "not_paid", "unreadable", "other"].includes(reason)) return { error: "Choose a reason." };
  const familyId = String(f.get("familyId") ?? "");
  const r = await action("fees.collect", (tx, ctx) =>
    cmd.rejectProof(tx, ctx, { proofId: String(f.get("proofId")), reason, note: String(f.get("note") ?? ""), tellFamilyId: UUID.test(familyId) ? familyId : null }),
  );
  if (r.error) return { error: r.error };
  revalidatePath("/app", "layout");
  return { ok: "Rejected." };
}
