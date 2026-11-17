import type { Minor } from "../shared/money";

/**
 * Savings engine. Inputs are SQL aggregates of roi_events for one school and period.
 * Measured lines come straight from the school's own data. Estimates use assumptions the school can edit,
 * and must always be shown with the "estimate" label and their assumption.
 */
export interface SavingsFacts {
  recoveredMinor: Minor;
  concessionsControlledMinor: Minor;
  studentsKept: number;
  automatedReminders: number;
  attendanceSessions: number;
  digitalPages: number;
}

/** ASSUMPTION defaults; validate by timing real staff (docs/17 A5). */
export interface SavingsAssumptions {
  minutesPerManualCall: number;
  rollCallMinutesBefore: number;
  rollCallMinutesWithApp: number;
  printCostPerPageMinor: Minor;
}

export const DEFAULT_SAVINGS_ASSUMPTIONS: SavingsAssumptions = {
  minutesPerManualCall: 3,
  rollCallMinutesBefore: 8,
  rollCallMinutesWithApp: 1,
  printCostPerPageMinor: 500,
};

export type SavingsKind = "measured" | "estimate";

export interface SavingsLine {
  key: "recovered" | "concessions" | "students_kept" | "staff_hours" | "teacher_hours" | "printing";
  kind: SavingsKind;
  valueMinor?: Minor;
  minutes?: number;
  count?: number;
  assumption?: string;
}

export interface SavingsSummary {
  lines: SavingsLine[];
  measuredMoneyMinor: Minor;
  subscriptionMinor: Minor;
  /** Measured money minus subscription. Estimates are never included. */
  netGainMinor: Minor;
  /** Measured money / subscription, rounded down to one decimal; null if subscription is 0. */
  multiple: number | null;
}

export function summarizeSavings(
  facts: SavingsFacts,
  subscriptionMinor: Minor,
  a: SavingsAssumptions = DEFAULT_SAVINGS_ASSUMPTIONS,
): SavingsSummary {
  const perSession = Math.max(0, a.rollCallMinutesBefore - a.rollCallMinutesWithApp);
  const lines: SavingsLine[] = [
    { key: "recovered", kind: "measured", valueMinor: facts.recoveredMinor },
    { key: "concessions", kind: "measured", valueMinor: facts.concessionsControlledMinor },
    { key: "students_kept", kind: "measured", count: facts.studentsKept },
    {
      key: "staff_hours",
      kind: "estimate",
      minutes: facts.automatedReminders * a.minutesPerManualCall,
      assumption: `${a.minutesPerManualCall} min per manual fee call`,
    },
    {
      key: "teacher_hours",
      kind: "estimate",
      minutes: facts.attendanceSessions * perSession,
      assumption: `roll call ${a.rollCallMinutesBefore} min before, ${a.rollCallMinutesWithApp} min with app`,
    },
    {
      key: "printing",
      kind: "estimate",
      valueMinor: facts.digitalPages * a.printCostPerPageMinor,
      assumption: `Rs ${a.printCostPerPageMinor / 100} per printed page`,
    },
  ];
  const measuredMoneyMinor = facts.recoveredMinor + facts.concessionsControlledMinor;
  const multiple =
    subscriptionMinor > 0 ? Math.floor((measuredMoneyMinor * 10) / subscriptionMinor) / 10 : null;
  return {
    lines,
    measuredMoneyMinor,
    subscriptionMinor,
    netGainMinor: measuredMoneyMinor - subscriptionMinor,
    multiple,
  };
}
