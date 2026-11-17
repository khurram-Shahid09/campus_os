import { daysBetween } from "../shared/dates";

export const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 7;

/**
 * A payment counts as "recovered by CampusOS" only if it was paid on or after a CampusOS reminder
 * for that family and within the window. Conservative on purpose: we would rather under-claim.
 */
export function isRecoveredByReminder(
  paidOn: Date,
  reminderSentAt: Date | null,
  windowDays = DEFAULT_ATTRIBUTION_WINDOW_DAYS,
): boolean {
  if (!reminderSentAt) return false;
  const d = daysBetween(reminderSentAt, paidOn);
  return d >= 0 && d <= windowDays;
}
