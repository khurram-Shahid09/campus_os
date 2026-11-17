import { describe, expect, it } from "vitest";
import { normalizeReference, proofWarnings, suggestFamilies, type MatchCandidate, type ProofReading } from "./index";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const reading = (o: Partial<ProofReading> = {}): ProofReading => ({
  isPaymentReceipt: true, amountMinor: 650_000, date: d("2026-11-17"), reference: "TID 0123456789", method: "mobile_wallet",
  senderName: "Hassan Raza", receiverName: "Al-Noor Grammar School", status: "successful", confidence: 0.95, ...o,
});
const fams: MatchCandidate[] = [
  { familyId: "hassan", guardianName: "Hassan Raza", childNames: ["Ali Hassan", "Fatima Hassan"], openBalancesMinor: [300_000, 350_000] },
  { familyId: "khalid", guardianName: "Khalid Mehmood", childNames: ["Omar Khalid"], openBalancesMinor: [650_000] },
  { familyId: "asif", guardianName: "Asif Ali", childNames: ["Hira Asif"], openBalancesMinor: [250_000] },
];

describe("payment screenshot matching", () => {
  it("ranks the family whose name and full balance both match first", () => {
    const s = suggestFamilies(reading(), fams);
    expect(s.map((x) => x.familyId)).toEqual(["hassan", "khalid"]);
    expect(s[0]!.reasons.join(" ")).toMatch(/everything the family owes.*sender name/);
  });

  it("matches the oldest month(s) and single months", () => {
    expect(suggestFamilies(reading({ senderName: null, amountMinor: 300_000 }), fams)[0]).toMatchObject({ familyId: "hassan", score: 40 });
    expect(suggestFamilies(reading({ senderName: null, amountMinor: 350_000 }), fams)[0]).toMatchObject({ familyId: "hassan", score: 30 });
  });

  it("ignores common name parts like Muhammad so they don't create false matches", () => {
    const s = suggestFamilies(reading({ amountMinor: 1, senderName: "Muhammad Asif" }), fams);
    expect(s.map((x) => x.familyId)).toEqual(["asif"]);
  });

  it("suggests nobody when nothing matches", () => {
    expect(suggestFamilies(reading({ amountMinor: 123, senderName: "Zubair Shah" }), fams)).toEqual([]);
  });

  it("normalises transaction IDs for duplicate checks", () => {
    expect(normalizeReference("TID: 0123-45 6789")).toBe("0123456789");
    expect(normalizeReference("ref#AB12cd99")).toBe("AB12CD99");
    expect(normalizeReference("12")).toBeNull();
  });

  it("warns on duplicates, failed or future transactions and wrong receiver", () => {
    const ctx = { today: d("2026-11-18"), schoolName: "Al-Noor Grammar School", duplicateImage: false, duplicateReference: false };
    expect(proofWarnings(reading(), ctx)).toEqual([]);
    const codes = (r: ProofReading, c = ctx) => proofWarnings(r, c).map((w) => w.code);
    expect(codes(reading(), { ...ctx, duplicateReference: true })).toEqual(["duplicate_reference"]);
    expect(codes(reading({ status: "failed" }))).toEqual(["not_successful"]);
    expect(codes(reading({ date: d("2026-11-20") }))).toEqual(["future_date"]);
    expect(codes(reading({ receiverName: "Zubair Traders" }))).toEqual(["receiver_mismatch"]);
    expect(codes(reading({ isPaymentReceipt: false, amountMinor: null }))).toEqual(["not_receipt", "no_amount"]);
    expect(proofWarnings(reading({ date: d("2026-09-01") }), ctx)[0]).toMatchObject({ code: "old_date", blocking: false });
  });
});
