import { describe, expect, it } from "vitest";
import {
  ageBalances,
  bucketFor,
  checkFeeIncrease,
  checkFeeSlip,
  formatMoney,
  isRecoveredByReminder,
  monthsBetweenPeriods,
  scoreRisk,
  summarizeSavings,
} from "./index";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("money", () => {
  it("formats minor units as whole rupees", () => {
    expect(formatMoney(12_000_000)).toBe("Rs 120,000");
    expect(formatMoney(0)).toBe("Rs 0");
    expect(formatMoney(-250_000)).toBe("-Rs 2,500");
  });
  it("rejects non-integers", () => {
    expect(() => formatMoney(1.5)).toThrow();
  });
});

describe("aging", () => {
  it("buckets by days overdue", () => {
    const asOf = d("2026-11-17");
    expect(bucketFor(d("2026-11-20"), asOf)).toBe("not_due");
    expect(bucketFor(d("2026-11-17"), asOf)).toBe("not_due");
    expect(bucketFor(d("2026-11-16"), asOf)).toBe("d0_30");
    expect(bucketFor(d("2026-10-18"), asOf)).toBe("d0_30"); // 30 days
    expect(bucketFor(d("2026-10-17"), asOf)).toBe("d31_60");
    expect(bucketFor(d("2026-08-19"), asOf)).toBe("d61_90"); // 90 days
    expect(bucketFor(d("2026-08-18"), asOf)).toBe("d90_plus");
  });
  it("sums balances and ignores paid ones", () => {
    const r = ageBalances(
      [
        { balanceMinor: 200_000, dueDate: d("2026-11-10") },
        { balanceMinor: 300_000, dueDate: d("2026-11-01") },
        { balanceMinor: 0, dueDate: d("2026-01-01") },
        { balanceMinor: 150_000, dueDate: d("2026-05-01") },
      ],
      d("2026-11-17"),
    );
    expect(r.d0_30).toBe(500_000);
    expect(r.d90_plus).toBe(150_000);
    expect(r.not_due).toBe(0);
  });
});

describe("fee rule check", () => {
  it("allows up to 5%, permission up to 8%, warns above", () => {
    expect(checkFeeIncrease(200_000, 210_000).verdict).toBe("ok"); // exactly 5%
    expect(checkFeeIncrease(200_000, 210_200).verdict).toBe("needs_permission");
    expect(checkFeeIncrease(200_000, 216_000).verdict).toBe("needs_permission"); // exactly 8%
    expect(checkFeeIncrease(200_000, 216_200).verdict).toBe("over_limit");
    expect(checkFeeIncrease(200_000, 190_000).verdict).toBe("ok");
    expect(checkFeeIncrease(0, 100_000).verdict).toBe("ok");
  });
  it("flags advance summer fees and extra charges", () => {
    const w = checkFeeSlip("2026-03", [
      { feeHead: "Tuition", period: "2026-03", amountMinor: 200_000 },
      { feeHead: "Tuition", period: "2026-06", amountMinor: 200_000 },
      { feeHead: "Tuition", period: "2026-04", amountMinor: 200_000 },
      { feeHead: "Annual charges", period: "2026-03", amountMinor: 500_000 },
    ]);
    expect(w).toContainEqual({ kind: "advance_summer_fee", period: "2026-06" });
    expect(w).toContainEqual({ kind: "advance_period", period: "2026-04", monthsAhead: 1 });
    expect(w).toContainEqual({ kind: "extra_charge", feeHead: "Annual charges" });
    expect(w).toHaveLength(3);
  });
  it("counts months across years", () => {
    expect(monthsBetweenPeriods("2026-11", "2027-02")).toBe(3);
  });
});

describe("attribution", () => {
  it("counts payments within the window after a reminder only", () => {
    const sent = d("2026-11-10");
    expect(isRecoveredByReminder(d("2026-11-10"), sent)).toBe(true);
    expect(isRecoveredByReminder(d("2026-11-17"), sent)).toBe(true);
    expect(isRecoveredByReminder(d("2026-11-18"), sent)).toBe(false);
    expect(isRecoveredByReminder(d("2026-11-09"), sent)).toBe(false);
    expect(isRecoveredByReminder(d("2026-11-12"), null)).toBe(false);
  });
});

describe("risk score", () => {
  it("is low for a regular, paid-up student", () => {
    const r = scoreRisk({ attendancePct14: 95, attendancePctBaseline: 94, consecutiveAbsences: 0, oldestOverdueDays: 0, unpaidMonths: 0 });
    expect(r.band).toBe("low");
    expect(r.score).toBe(0);
  });
  it("is high when attendance collapses and fees are overdue", () => {
    const r = scoreRisk({ attendancePct14: 55, attendancePctBaseline: 92, consecutiveAbsences: 6, oldestOverdueDays: 75, unpaidMonths: 3 });
    expect(r.band).toBe("high");
    expect(r.score).toBe(100);
    expect(r.reasons.map((x) => x.signal)).toEqual(
      expect.arrayContaining(["attendance_drop", "low_attendance", "consecutive_absence", "fee_overdue", "unpaid_months"]),
    );
  });
  it("is watch for moderate signals", () => {
    const r = scoreRisk({ attendancePct14: 80, attendancePctBaseline: 92, consecutiveAbsences: 3, oldestOverdueDays: 0, unpaidMonths: 0 });
    expect(r.score).toBe(25);
    expect(r.band).toBe("watch");
  });
});

describe("savings", () => {
  const facts = {
    recoveredMinor: 12_000_000,
    concessionsControlledMinor: 1_000_000,
    studentsKept: 4,
    automatedReminders: 400,
    attendanceSessions: 360,
    digitalPages: 1300,
  };
  it("separates measured money from estimates", () => {
    const s = summarizeSavings(facts, 800_000);
    expect(s.measuredMoneyMinor).toBe(13_000_000);
    expect(s.netGainMinor).toBe(12_200_000);
    expect(s.multiple).toBe(16.2);
    const staff = s.lines.find((l) => l.key === "staff_hours")!;
    expect(staff.kind).toBe("estimate");
    expect(staff.minutes).toBe(1200);
    expect(s.lines.find((l) => l.key === "teacher_hours")!.minutes).toBe(360 * 7);
    expect(s.lines.find((l) => l.key === "printing")!.valueMinor).toBe(650_000);
  });
  it("never includes estimates in net gain", () => {
    const s = summarizeSavings({ ...facts, recoveredMinor: 0, concessionsControlledMinor: 0 }, 800_000);
    expect(s.netGainMinor).toBe(-800_000);
    expect(s.multiple).toBe(0);
  });
  it("handles zero subscription", () => {
    expect(summarizeSavings(facts, 0).multiple).toBeNull();
  });
});
