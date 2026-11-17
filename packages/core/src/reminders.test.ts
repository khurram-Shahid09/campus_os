import { describe, expect, it } from "vitest";
import { familyReminderText, isReminderDay, planReminders, type ReminderFamily } from "./index";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const today = d("2026-11-18");
const fam = (over: Partial<ReminderFamily> = {}): ReminderFamily => ({
  familyId: "f1", hasPhone: true, prefersVoice: false, lastMessageAt: null, promisedUntil: null,
  invoices: [{ id: "i1", period: "2026-11", dueDate: d("2026-11-10"), balanceMinor: 300_000, doneSteps: [] }],
  ...over,
});

describe("reminder ladder", () => {
  it("sends step 1 three days after the due date, not before", () => {
    expect(planReminders([fam({ invoices: [{ id: "i1", period: "2026-11", dueDate: d("2026-11-16"), balanceMinor: 1, doneSteps: [] }] })], { today })).toEqual([]);
    const [r] = planReminders([fam({ invoices: [{ id: "i1", period: "2026-11", dueDate: d("2026-11-15"), balanceMinor: 1, doneSteps: [] }] })], { today });
    expect(r).toMatchObject({ step: 1, channel: "whatsapp_text", daysOverdue: 3 });
  });

  it("goes one step at a time even when the invoice is very old", () => {
    const old = fam({ invoices: [{ id: "i1", period: "2026-09", dueDate: d("2026-09-10"), balanceMinor: 5, doneSteps: [] }] });
    expect(planReminders([old], { today })[0]!.step).toBe(1);
    old.invoices[0]!.doneSteps = [1];
    expect(planReminders([old], { today })[0]!.step).toBe(2);
    old.invoices[0]!.doneSteps = [1, 2];
    expect(planReminders([old], { today })[0]).toMatchObject({ step: 3, channel: "principal_call" });
    old.invoices[0]!.doneSteps = [1, 2, 3];
    expect(planReminders([old], { today })).toEqual([]);
  });

  it("sends one message per family about the total, keyed to the oldest invoice", () => {
    const f = fam({
      invoices: [
        { id: "new", period: "2026-11", dueDate: d("2026-11-10"), balanceMinor: 300_000, doneSteps: [] },
        { id: "old", period: "2026-10", dueDate: d("2026-10-10"), balanceMinor: 200_000, doneSteps: [] },
        { id: "notdue", period: "2026-12", dueDate: d("2026-12-10"), balanceMinor: 300_000, doneSteps: [] },
        { id: "paid", period: "2026-09", dueDate: d("2026-09-10"), balanceMinor: 0, doneSteps: [] },
      ],
    });
    const r = planReminders([f], { today });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ invoiceId: "old", totalDueMinor: 500_000, overdueMonths: 2, oldestPeriod: "2026-10" });
  });

  it("waits at least 5 days between WhatsApp reminders, but not for the principal call", () => {
    expect(planReminders([fam({ lastMessageAt: d("2026-11-15") })], { today })).toEqual([]);
    expect(planReminders([fam({ lastMessageAt: d("2026-11-13") })], { today })).toHaveLength(1);
    const call = fam({ lastMessageAt: d("2026-11-17"), invoices: [{ id: "i", period: "2026-10", dueDate: d("2026-10-01"), balanceMinor: 1, doneSteps: [1, 2] }] });
    expect(planReminders([call], { today })[0]!.channel).toBe("principal_call");
  });

  it("families without a phone go straight to the principal call when it is due", () => {
    const f = fam({ hasPhone: false });
    expect(planReminders([f], { today })).toEqual([]); // 8 days: no call yet
    f.invoices[0]!.dueDate = d("2026-10-25");
    expect(planReminders([f], { today })[0]).toMatchObject({ step: 3, channel: "principal_call" });
  });

  it("pauses while a promise to pay is open, and uses voice for parents who can't read", () => {
    expect(planReminders([fam({ promisedUntil: d("2026-11-20") })], { today })).toEqual([]);
    expect(planReminders([fam({ promisedUntil: d("2026-11-17") })], { today })).toHaveLength(1);
    expect(planReminders([fam({ prefersVoice: true })], { today })[0]!.channel).toBe("whatsapp_voice");
  });

  it("does not send on Sunday", () => {
    expect(isReminderDay(d("2026-11-22"))).toBe(false);
    expect(isReminderDay(d("2026-11-23"))).toBe(true);
  });

  it("words the reminder from given numbers only", () => {
    const t = familyReminderText({ totalMinor: 500_000, months: 2, school: "ABC School", step: 2 });
    expect(t.en).toContain("Rs 5,000 (2 months) is still unpaid");
    expect(t.ur).toContain("5,000");
  });
});
