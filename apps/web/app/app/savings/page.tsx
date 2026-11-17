import { formatMoney, summarizeSavings, type SavingsLine } from "@campusos/core";
import { getActiveStudentCount, getSavingsFacts } from "@campusos/db/queries";
import { Badge, Card, PageTitle } from "@/components/ui";
import { requireApp } from "@/lib/auth";
import { PrintButton } from "../print-button";

const LABEL: Record<SavingsLine["key"], string> = {
  recovered: "Fees recovered by reminders",
  concessions: "Discounts you said no to",
  students_kept: "Students kept after a principal's call",
  staff_hours: "Office time not spent on fee calls",
  teacher_hours: "Teacher time saved on roll call",
  printing: "Paper and printing saved",
};

function value(l: SavingsLine) {
  if (l.valueMinor !== undefined) return formatMoney(l.valueMinor);
  if (l.minutes !== undefined) return `${Math.round(l.minutes / 60)} hours`;
  return `${l.count ?? 0}`;
}

export default async function Savings() {
  const { ctx, run } = await requireApp("dashboard.owner");
  const settings = ctx.settings as { pricePerStudentMinor?: number; campusosLiveOn?: string };
  const price = settings.pricePerStudentMinor ?? 3000; // Rs 30 per student per month (docs/17 A3, ASSUMPTION)
  const monthStart = new Date(Date.UTC(ctx.today.getUTCFullYear(), ctx.today.getUTCMonth(), 1));
  const liveOn = settings.campusosLiveOn ? new Date(`${settings.campusosLiveOn}T00:00:00Z`) : null;
  const now = new Date();
  const { students, month, since } = await run(async (tx, c) => ({
    students: await getActiveStudentCount(tx, c.schoolId),
    month: await getSavingsFacts(tx, c.schoolId, monthStart, now),
    since: await getSavingsFacts(tx, c.schoolId, liveOn ?? new Date(0), now),
  }));
  const monthsLive = liveOn
    ? Math.max(1, (ctx.today.getUTCFullYear() - liveOn.getUTCFullYear()) * 12 + ctx.today.getUTCMonth() - liveOn.getUTCMonth() + 1)
    : 1;
  const m = summarizeSavings(month, students * price);
  const all = summarizeSavings(since, students * price * monthsLive);
  const measured = m.lines.filter((l) => l.kind === "measured");
  const estimates = m.lines.filter((l) => l.kind === "estimate");

  return (
    <div className="space-y-5">
      <PageTitle role="Savings" title="What CampusOS saved you"
        sub="Money figures are measured from your own records. Time and paper are estimates, always shown with how they are worked out."
        right={<PrintButton label="Print for the board" />} />

      <Card>
        <div className="grid gap-4 md:grid-cols-3" data-testid="savings-hero">
          <div>
            <p className="text-xs text-muted">Money measured this month</p>
            <p className="text-3xl font-semibold tabular text-brand">{formatMoney(m.measuredMoneyMinor)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">CampusOS cost this month</p>
            <p className="text-3xl font-semibold tabular">{formatMoney(m.subscriptionMinor)}</p>
            <p className="text-[11px] text-muted">{students} students × Rs {price / 100} (pilot price, not final)</p>
          </div>
          <div>
            <p className="text-xs text-muted">Return on cost (measured money only)</p>
            <p className="text-3xl font-semibold tabular">{m.multiple !== null ? `${m.multiple}×` : "—"}</p>
            <p className="text-[11px] text-muted">Net {formatMoney(m.netGainMinor)}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Measured" sub="Counted from payments, decisions and calls in CampusOS. No guesses.">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="py-1" /><th className="text-right">This month</th><th className="text-right">Since start</th></tr></thead>
            <tbody>
              {measured.map((l) => (
                <tr key={l.key} className="border-t border-line">
                  <td className="py-2">{LABEL[l.key]}</td>
                  <td className="text-right font-semibold tabular">{value(l)}</td>
                  <td className="text-right tabular text-muted">{value(all.lines.find((x) => x.key === l.key)!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Recovered = paid within 7 days after a reminder that really reached the parent. Simulated WhatsApp messages are never counted.
          </p>
        </Card>
        <Card title="Estimated" sub="Worked out from counts in CampusOS and the assumption shown. Check them against your own staff.">
          <ul className="space-y-2 text-sm">
            {estimates.map((l) => (
              <li key={l.key} className="flex items-start justify-between gap-3 border-t border-line pt-2">
                <span>{LABEL[l.key]} <Badge>estimate</Badge><span className="block text-xs text-muted">{l.assumption}</span></span>
                <span className="text-right font-semibold tabular">{value(l)}<span className="block text-xs font-normal text-muted">since start: {value(all.lines.find((x) => x.key === l.key)!)}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="What was counted this month">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li><b className="tabular">{month.automatedReminders}</b> WhatsApp messages sent for you</li>
          <li><b className="tabular">{month.attendanceSessions}</b> registers taken on a phone</li>
          <li><b className="tabular">{month.digitalPages}</b> slips, receipts and records with no paper</li>
          <li><b className="tabular">{month.studentsKept}</b> families who said their child will stay</li>
        </ul>
      </Card>
    </div>
  );
}
