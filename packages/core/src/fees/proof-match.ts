import { daysBetween } from "../shared/dates";
import type { Minor } from "../shared/money";

/**
 * Payment screenshot matching (pure). AI only *reads* the screenshot into `ProofReading`; this code (not AI)
 * suggests which family paid and raises warnings. A person always confirms before any payment is saved.
 */
export interface ProofReading {
  isPaymentReceipt: boolean;
  amountMinor: Minor | null;
  date: Date | null;
  reference: string | null;
  method: string | null;
  senderName: string | null;
  receiverName: string | null;
  status: "successful" | "failed" | "pending" | null;
  confidence: number | null;
}

export interface MatchCandidate {
  familyId: string;
  guardianName: string;
  childNames: string[];
  /** open balances, oldest first */
  openBalancesMinor: Minor[];
}

export interface FamilySuggestion {
  familyId: string;
  score: number;
  reasons: string[];
}

export type ProofWarningCode =
  | "not_receipt"
  | "not_successful"
  | "no_amount"
  | "duplicate_image"
  | "duplicate_reference"
  | "future_date"
  | "old_date"
  | "low_confidence"
  | "receiver_mismatch";

export interface ProofWarning {
  code: ProofWarningCode;
  text: string;
  /** blocking warnings disable one-tap approve; the clerk must look closely */
  blocking: boolean;
}

const words = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z؀-ۿ\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !["muhammad", "mohammad", "muhammed", "syed", "mian", "malik", "bibi", "begum"].includes(w));

/** Normalise a transaction ID for duplicate checks: "TID: 0123-45 67" -> "01234567". */
export function normalizeReference(ref: string | null | undefined): string | null {
  const r = (ref ?? "").toUpperCase().replace(/^(TID|TRX|TXN|REF|ID)[\s:#.-]*/i, "").replace(/[^A-Z0-9]/g, "");
  return r.length >= 5 ? r : null;
}

export function suggestFamilies(reading: ProofReading, candidates: MatchCandidate[], limit = 3): FamilySuggestion[] {
  const amount = reading.amountMinor;
  const sender = new Set(words(reading.senderName));
  const out: FamilySuggestion[] = [];
  for (const c of candidates) {
    let score = 0;
    const reasons: string[] = [];
    if (amount !== null && amount > 0 && c.openBalancesMinor.length) {
      const total = c.openBalancesMinor.reduce((a, b) => a + b, 0);
      let running = 0;
      const prefixes = c.openBalancesMinor.map((b) => (running += b));
      if (amount === total) {
        score += 50;
        reasons.push("amount equals everything the family owes");
      } else if (prefixes.includes(amount)) {
        score += 40;
        reasons.push("amount equals their oldest unpaid month(s)");
      } else if (c.openBalancesMinor.includes(amount)) {
        score += 30;
        reasons.push("amount equals one unpaid month");
      }
    }
    if (sender.size) {
      const fam = new Set([...words(c.guardianName), ...c.childNames.flatMap((n) => words(n))]);
      const common = [...sender].filter((w) => fam.has(w));
      if (common.length) {
        score += Math.min(45, 25 + 10 * (common.length - 1));
        reasons.push(`sender name matches (${common.join(", ")})`);
      }
    }
    if (score > 0) out.push({ familyId: c.familyId, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score || a.familyId.localeCompare(b.familyId)).slice(0, limit);
}

export function proofWarnings(
  reading: ProofReading,
  ctx: { today: Date; schoolName: string; duplicateImage: boolean; duplicateReference: boolean },
): ProofWarning[] {
  const w: ProofWarning[] = [];
  if (!reading.isPaymentReceipt) w.push({ code: "not_receipt", text: "This does not look like a payment receipt.", blocking: true });
  if (reading.status && reading.status !== "successful") w.push({ code: "not_successful", text: `The transaction shows as ${reading.status}.`, blocking: true });
  if (reading.amountMinor === null) w.push({ code: "no_amount", text: "No amount could be read. Enter it by hand.", blocking: true });
  if (ctx.duplicateImage) w.push({ code: "duplicate_image", text: "This exact screenshot was already sent before.", blocking: true });
  if (ctx.duplicateReference) w.push({ code: "duplicate_reference", text: "This transaction ID was already used for another payment.", blocking: true });
  if (reading.date) {
    const age = daysBetween(reading.date, ctx.today);
    if (age < 0) w.push({ code: "future_date", text: "The receipt date is in the future.", blocking: true });
    else if (age > 30) w.push({ code: "old_date", text: `The receipt is ${age} days old.`, blocking: false });
  }
  if (reading.confidence !== null && reading.confidence < 0.6) w.push({ code: "low_confidence", text: "The screenshot was hard to read. Check every field.", blocking: false });
  if (reading.receiverName) {
    const school = new Set(words(ctx.schoolName));
    const recv = words(reading.receiverName);
    if (school.size && recv.length && !recv.some((x) => school.has(x)))
      w.push({ code: "receiver_mismatch", text: `Paid to "${reading.receiverName}", which does not look like the school's account.`, blocking: false });
  }
  return w;
}
