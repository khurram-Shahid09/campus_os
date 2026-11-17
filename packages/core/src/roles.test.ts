import { describe, expect, it } from "vitest";
import { absenceAlertText, allocatePayment, feeReminderText, invoiceStatusFor, paymentCodeFor, receiptText } from "./index";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("payment allocation", () => {
  const invoices = [
    { id: "b", dueDate: d("2026-11-10"), balanceMinor: 300_000 },
    { id: "a", dueDate: d("2026-10-10"), balanceMinor: 300_000 },
    { id: "c", dueDate: d("2026-09-10"), balanceMinor: 0 },
  ];
  it("pays oldest first and skips paid invoices", () => {
    const r = allocatePayment(450_000, invoices);
    expect(r.allocations).toEqual([
      { invoiceId: "a", amountMinor: 300_000, newBalanceMinor: 0 },
      { invoiceId: "b", amountMinor: 150_000, newBalanceMinor: 150_000 },
    ]);
    expect(r.advanceMinor).toBe(0);
  });
  it("keeps overpayment as advance", () => {
    expect(allocatePayment(700_000, invoices).advanceMinor).toBe(100_000);
  });
  it("rejects zero, negative and fractional amounts", () => {
    expect(() => allocatePayment(0, invoices)).toThrow();
    expect(() => allocatePayment(-5, invoices)).toThrow();
    expect(() => allocatePayment(10.5, invoices)).toThrow();
  });
  it("derives invoice status", () => {
    expect(invoiceStatusFor(300_000, 0)).toBe("paid");
    expect(invoiceStatusFor(300_000, 100_000)).toBe("partially_paid");
    expect(invoiceStatusFor(300_000, 300_000)).toBe("open");
  });
});

describe("parent message templates", () => {
  it("uses gendered Urdu for absence alerts", () => {
    expect(absenceAlertText({ child: "Ayesha", gender: "F", school: "S" }).ur).toContain("نہیں آئی");
    expect(absenceAlertText({ child: "Ali", gender: "M", school: "S" }).ur).toContain("نہیں آیا");
  });
  it("puts the SQL amount in reminders and gets firmer at step 2", () => {
    const soft = feeReminderText({ child: "Ali", period: "2026-11", amountMinor: 250_000, school: "S", step: 1 });
    const firm = feeReminderText({ child: "Ali", period: "2026-11", amountMinor: 250_000, school: "S", step: 2 });
    expect(soft.en).toContain("Rs 2,500");
    expect(soft.ur).toContain("نومبر");
    expect(firm.en).toContain("still unpaid");
  });
  it("tells remaining balance on receipts", () => {
    expect(receiptText({ amountMinor: 100_000, balanceMinor: 50_000, school: "S" }).en).toContain("Remaining: Rs 500");
    expect(receiptText({ amountMinor: 100_000, balanceMinor: 0, school: "S" }).en).toContain("Nothing remaining");
  });
  it("makes a stable 12-digit payment code", () => {
    const c = paymentCodeFor("0f3a9c12-4b5e-4d6f-8a7b-1c2d3e4f5a6b");
    expect(c).toMatch(/^\d{4} \d{4} \d{4}$/);
    expect(paymentCodeFor("0f3a9c12-4b5e-4d6f-8a7b-1c2d3e4f5a6b")).toBe(c);
  });
});
