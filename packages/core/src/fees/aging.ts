import type { Minor } from "../shared/money";
import { daysBetween } from "../shared/dates";

export type AgingBucket = "not_due" | "d0_30" | "d31_60" | "d61_90" | "d90_plus";
export const AGING_BUCKETS: AgingBucket[] = ["not_due", "d0_30", "d31_60", "d61_90", "d90_plus"];

export interface OpenBalance {
  balanceMinor: Minor;
  dueDate: Date;
}

export function bucketFor(dueDate: Date, asOf: Date): AgingBucket {
  const overdue = daysBetween(dueDate, asOf);
  if (overdue <= 0) return "not_due";
  if (overdue <= 30) return "d0_30";
  if (overdue <= 60) return "d31_60";
  if (overdue <= 90) return "d61_90";
  return "d90_plus";
}

/** Sum open balances into aging buckets. Zero/negative balances are ignored. */
export function ageBalances(rows: OpenBalance[], asOf: Date): Record<AgingBucket, Minor> {
  const out: Record<AgingBucket, Minor> = { not_due: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  for (const r of rows) {
    if (r.balanceMinor <= 0) continue;
    out[bucketFor(r.dueDate, asOf)] += r.balanceMinor;
  }
  return out;
}
