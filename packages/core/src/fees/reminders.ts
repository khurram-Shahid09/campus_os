import { daysBetween } from "../shared/dates";
import type { Minor } from "../shared/money";

/**
 * Fee reminder ladder (pure). Decides who gets which reminder today. One family gets at most one reminder per
 * run, about everything it owes, so parents are not flooded with one message per month. Steps go one at a time:
 * a family that never got step 1 gets step 1 first, even if the invoice is very old.
 */
export type ReminderChannel = "whatsapp_text" | "whatsapp_voice" | "principal_call";

export interface LadderStep {
  step: number;
  /** days after the due date */
  afterDays: number;
  channel: ReminderChannel;
}

export const DEFAULT_LADDER: LadderStep[] = [
  { step: 1, afterDays: 3, channel: "whatsapp_text" },
  { step: 2, afterDays: 10, channel: "whatsapp_text" },
  { step: 3, afterDays: 20, channel: "principal_call" },
];

export interface ReminderInvoice {
  id: string;
  period: string;
  dueDate: Date;
  balanceMinor: Minor;
  /** steps already queued/sent for this invoice */
  doneSteps: number[];
}

export interface ReminderFamily {
  familyId: string;
  hasPhone: boolean;
  prefersVoice: boolean;
  invoices: ReminderInvoice[];
  /** last WhatsApp reminder queued for this family (any invoice) */
  lastMessageAt: Date | null;
  /** a promise to pay on or after today pauses reminders */
  promisedUntil: Date | null;
}

export interface PlannedReminder {
  familyId: string;
  invoiceId: string;
  step: number;
  channel: ReminderChannel;
  totalDueMinor: Minor;
  overdueMonths: number;
  oldestPeriod: string;
  daysOverdue: number;
}

export interface PlanOptions {
  today: Date;
  ladder?: LadderStep[];
  /** minimum days between two WhatsApp reminders to the same family */
  minGapDays?: number;
}

export function planReminders(families: ReminderFamily[], opts: PlanOptions): PlannedReminder[] {
  const ladder = [...(opts.ladder ?? DEFAULT_LADDER)].sort((a, b) => a.step - b.step);
  const minGap = opts.minGapDays ?? 5;
  const out: PlannedReminder[] = [];

  for (const f of families) {
    if (f.promisedUntil && daysBetween(opts.today, f.promisedUntil) >= 0) continue;
    const overdue = f.invoices
      .filter((i) => i.balanceMinor > 0 && daysBetween(i.dueDate, opts.today) > 0)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.id.localeCompare(b.id));
    if (!overdue.length) continue;
    const oldest = overdue[0]!;
    const daysOverdue = daysBetween(oldest.dueDate, opts.today);

    // lowest step not yet done whose day has come; without a phone only the principal call is possible
    const next = ladder.find(
      (s) => !oldest.doneSteps.includes(s.step) && s.afterDays <= daysOverdue && (f.hasPhone || s.channel === "principal_call"),
    );
    if (!next) continue;
    // without a phone, earlier WhatsApp steps are impossible: they must not block the call
    if (f.hasPhone && ladder.some((s) => s.step < next.step && !oldest.doneSteps.includes(s.step))) continue;
    const isMessage = next.channel !== "principal_call";
    if (isMessage && f.lastMessageAt && daysBetween(f.lastMessageAt, opts.today) < minGap) continue;

    out.push({
      familyId: f.familyId,
      invoiceId: oldest.id,
      step: next.step,
      channel: isMessage && f.prefersVoice ? "whatsapp_voice" : next.channel,
      totalDueMinor: overdue.reduce((sum, i) => sum + i.balanceMinor, 0),
      overdueMonths: overdue.length,
      oldestPeriod: oldest.period,
      daysOverdue,
    });
  }
  return out;
}

/** True on days the school sends reminders: not Sunday (weekly holiday in Pakistan). */
export function isReminderDay(today: Date): boolean {
  return today.getUTCDay() !== 0;
}
