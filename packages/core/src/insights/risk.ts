/**
 * Rules-based dropout risk (P1). Deterministic and explainable; AI only turns `reasons` into words later.
 */
export interface RiskInput {
  /** Attendance % over the last 14 school days (0-100), null if no data. */
  attendancePct14: number | null;
  /** Attendance % over the prior 60 school days (0-100), null if no data. */
  attendancePctBaseline: number | null;
  /** Consecutive school days absent up to today. */
  consecutiveAbsences: number;
  /** Days the family's oldest unpaid invoice is overdue (0 if none). */
  oldestOverdueDays: number;
  /** Number of unpaid months for the family. */
  unpaidMonths: number;
}

export type RiskBand = "low" | "watch" | "high";
export type RiskSignal = "attendance_drop" | "low_attendance" | "consecutive_absence" | "fee_overdue" | "unpaid_months";

export interface RiskReason {
  signal: RiskSignal;
  points: number;
  text: string;
}

export interface RiskResult {
  score: number;
  band: RiskBand;
  reasons: RiskReason[];
}

export function scoreRisk(input: RiskInput): RiskResult {
  const reasons: RiskReason[] = [];

  if (input.attendancePct14 !== null && input.attendancePctBaseline !== null) {
    const drop = input.attendancePctBaseline - input.attendancePct14;
    if (drop >= 25) reasons.push({ signal: "attendance_drop", points: 30, text: `Attendance fell ${Math.round(drop)} points in 2 weeks` });
    else if (drop >= 10) reasons.push({ signal: "attendance_drop", points: 15, text: `Attendance fell ${Math.round(drop)} points in 2 weeks` });
  }
  if (input.attendancePct14 !== null && input.attendancePct14 < 70) {
    reasons.push({ signal: "low_attendance", points: 15, text: `Only ${Math.round(input.attendancePct14)}% attendance in 2 weeks` });
  }
  if (input.consecutiveAbsences >= 5) {
    reasons.push({ signal: "consecutive_absence", points: 25, text: `Absent ${input.consecutiveAbsences} days in a row` });
  } else if (input.consecutiveAbsences >= 3) {
    reasons.push({ signal: "consecutive_absence", points: 10, text: `Absent ${input.consecutiveAbsences} days in a row` });
  }
  if (input.oldestOverdueDays > 60) {
    reasons.push({ signal: "fee_overdue", points: 25, text: `Fees overdue ${input.oldestOverdueDays} days` });
  } else if (input.oldestOverdueDays > 30) {
    reasons.push({ signal: "fee_overdue", points: 15, text: `Fees overdue ${input.oldestOverdueDays} days` });
  }
  if (input.unpaidMonths >= 3) {
    reasons.push({ signal: "unpaid_months", points: 10, text: `${input.unpaidMonths} months unpaid` });
  }

  const score = Math.min(100, reasons.reduce((s, r) => s + r.points, 0));
  const band: RiskBand = score >= 50 ? "high" : score >= 25 ? "watch" : "low";
  return { score, band, reasons };
}
