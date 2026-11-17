import type { Minor } from "../shared/money";
import { monthsBetweenPeriods } from "../shared/dates";

/**
 * Warnings only. Rules differ by province and change over time, so CampusOS warns and a human decides.
 * Defaults follow the 2019 Supreme Court ruling: yearly tuition increase up to 5%, up to 8% with regulator permission.
 */
export interface FeeRuleConfig {
  yearlyCapPct: number;
  withPermissionCapPct: number;
  /** Months that count as summer vacation (1-12). */
  summerMonths: number[];
  /** Fee head names allowed on a monthly slip without a warning. */
  allowedMonthlyHeads: string[];
}

export const DEFAULT_FEE_RULES: FeeRuleConfig = {
  yearlyCapPct: 5,
  withPermissionCapPct: 8,
  summerMonths: [6, 7],
  allowedMonthlyHeads: ["tuition"],
};

export type IncreaseVerdict = "ok" | "needs_permission" | "over_limit";

export function checkFeeIncrease(
  previousMinor: Minor,
  proposedMinor: Minor,
  cfg: FeeRuleConfig = DEFAULT_FEE_RULES,
): { verdict: IncreaseVerdict; increasePct: number } {
  if (previousMinor <= 0) return { verdict: "ok", increasePct: 0 };
  // Compare in integer basis points to avoid float edge cases at exactly 5%.
  const bps = Math.round(((proposedMinor - previousMinor) * 10_000) / previousMinor);
  const increasePct = bps / 100;
  if (bps <= cfg.yearlyCapPct * 100) return { verdict: "ok", increasePct };
  if (bps <= cfg.withPermissionCapPct * 100) return { verdict: "needs_permission", increasePct };
  return { verdict: "over_limit", increasePct };
}

export interface SlipLine {
  feeHead: string;
  period: string; // "2026-06"
  amountMinor: Minor;
}

export type SlipWarning =
  | { kind: "advance_summer_fee"; period: string }
  | { kind: "advance_period"; period: string; monthsAhead: number }
  | { kind: "extra_charge"; feeHead: string };

/** Check a fee slip issued in `issuePeriod` for lines regulators commonly object to. */
export function checkFeeSlip(
  issuePeriod: string,
  lines: SlipLine[],
  cfg: FeeRuleConfig = DEFAULT_FEE_RULES,
): SlipWarning[] {
  const warnings: SlipWarning[] = [];
  const allowed = new Set(cfg.allowedMonthlyHeads.map((h) => h.toLowerCase()));
  for (const line of lines) {
    const ahead = monthsBetweenPeriods(issuePeriod, line.period);
    const month = Number(line.period.split("-")[1]);
    if (ahead > 0 && cfg.summerMonths.includes(month)) {
      warnings.push({ kind: "advance_summer_fee", period: line.period });
    } else if (ahead > 0) {
      warnings.push({ kind: "advance_period", period: line.period, monthsAhead: ahead });
    }
    if (!allowed.has(line.feeHead.toLowerCase())) {
      warnings.push({ kind: "extra_charge", feeHead: line.feeHead });
    }
  }
  return warnings;
}
