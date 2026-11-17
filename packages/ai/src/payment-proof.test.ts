import { describe, expect, it } from "vitest";
import { sanitizeProof } from "./payment-proof";

describe("sanitizeProof", () => {
  it("keeps plausible values and converts rupees to minor units", () => {
    const x = sanitizeProof({ isPaymentReceipt: true, amount: 6500, date: "2026-11-17", reference: "TID 0123456789", status: "successful", confidence: 0.9, senderName: " Hassan Raza " });
    expect(x).toMatchObject({ amountMinor: 650_000, date: "2026-11-17", referenceNorm: "0123456789", senderName: "Hassan Raza", status: "successful" });
  });
  it("drops anything implausible instead of trusting it", () => {
    const x = sanitizeProof({ isPaymentReceipt: true, amount: -5, date: "17/11/2026", reference: "", status: "done" as never, confidence: 7 });
    expect(x).toMatchObject({ amountMinor: null, date: null, reference: null, status: null, confidence: 1 });
    expect(sanitizeProof({ isPaymentReceipt: true, amount: 99_999_999, date: "2026-02-30", reference: null, status: null, confidence: 0.5 })).toMatchObject({ amountMinor: null, date: null });
  });
});
