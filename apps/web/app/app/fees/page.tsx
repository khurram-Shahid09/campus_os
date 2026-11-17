import Link from "next/link";
import { addMonthsToPeriod, can, displayPkPhone, formatMoney, periodLabel, periodOf } from "@campusos/core";
import { getDefaulters, getDiscountRequests, getFeeHeads, getInvoiceRuns } from "@campusos/db/app";
import { ButtonLink, Card, PageTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/form";
import { requireApp } from "@/lib/auth";
import { queueRemindersBulkAction } from "../actions";
import { InvoiceRunForm } from "./run-form";
import { DiscountDecision } from "../discount-decision";

export default async function Fees() {
  const { ctx, run } = await requireApp("fees.view");
  const { runs, heads, defaulters, requests } = await run(async (tx, c) => ({
    runs: await getInvoiceRuns(tx, c),
    heads: await getFeeHeads(tx, c),
    defaulters: await getDefaulters(tx, c),
    requests: can(c.role, "fees.discount.approve") ? await getDiscountRequests(tx, c) : [],
  }));
  const thisPeriod = periodOf(ctx.today);
  const billedThis = runs.some((r) => r.period === thisPeriod);
  const nextPeriod = billedThis ? addMonthsToPeriod(thisPeriod, 1) : thisPeriod;
  const dueDay = String(ctx.settings.dueDay ?? 10).padStart(2, "0");
  // a due date already in the past would make every new slip overdue at once: give a week instead
  const plainDue = `${nextPeriod}-${dueDay}`;
  const weekOut = new Date(ctx.today.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const defaultDue = plainDue < ctx.today.toISOString().slice(0, 10) ? weekOut : plainDue;
  const extraHeads = heads.filter((h) => h.frequency !== "monthly");
  const totalOverdue = defaulters.reduce((a, d) => a + d.balanceMinor, 0);

  return (
    <div className="space-y-5">
      <PageTitle role="Fees" title="Fee slips and dues" right={can(ctx.role, "fees.collect") ? <ButtonLink href="/app/cash">Cash counter</ButtonLink> : undefined} />

      {can(ctx.role, "fees.run") && (
        <Card title="Make fee slips for a month" sub="One slip per family, brothers and sisters together, with approved discounts. Running it again only adds families that were missed.">
          <InvoiceRunForm defaultPeriod={nextPeriod} defaultDue={defaultDue} dueDay={dueDay} extraHeads={extraHeads.map((h) => ({ id: h.id, name: h.name }))} />
        </Card>
      )}

      {requests.length > 0 && (
        <Card title="Discount requests waiting for you">
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><Link href={`/app/students/${r.studentId}`} className="font-semibold">{r.student}</Link>: {r.percent}% · <span className="text-muted">{r.reason}</span></span>
                <DiscountDecision id={r.id} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Months billed">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="py-1">Month</th><th className="text-right">Slips</th><th className="text-right">Billed</th><th className="text-right">Collected</th><th className="text-right">Still due</th><th /></tr></thead>
          <tbody>
            {runs.map((r) => {
              const total = Number(r.total);
              const paid = Number(r.paid);
              return (
                <tr key={r.period} className="border-t border-line">
                  <td className="py-1.5 font-medium">{periodLabel(r.period)}</td>
                  <td className="text-right tabular">{r.invoices}</td>
                  <td className="text-right tabular">{formatMoney(total)}</td>
                  <td className="text-right tabular">{formatMoney(paid)} <span className="text-xs text-muted">{total ? `${Math.round((paid / total) * 100)}%` : ""}</span></td>
                  <td className="text-right tabular text-danger">{formatMoney(Number(r.balance))}</td>
                  <td className="text-right"><Link href={`/app/fees/slips?period=${r.period}`} className="text-brand underline">Print slips</Link></td>
                </tr>
              );
            })}
            {!runs.length && <tr><td colSpan={6} className="py-3 text-muted">No slips made yet.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card title={`Families with overdue fees (${defaulters.length})`} sub={`Total overdue ${formatMoney(totalOverdue)}. Oldest dues first.`}>
        <div id="defaulters" />
        <ActionForm action={queueRemindersBulkAction} resetOnOk={false} testId="defaulters">
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white"><tr className="text-left text-xs text-muted"><th className="w-6" /><th className="py-1">Father / guardian</th><th>Children</th><th className="text-right">Months</th><th className="text-right">Owes</th></tr></thead>
              <tbody>
                {defaulters.map((d) => (
                  <tr key={d.familyId} className="border-t border-line">
                    <td>{d.phone && <input type="checkbox" name="familyId" value={d.familyId} defaultChecked aria-label={`Remind ${d.guardian}`} />}</td>
                    <td className="py-1.5">
                      <Link href={`/app/families/${d.familyId}`} className="font-medium text-brand hover:underline">{d.guardian}</Link>
                      <span className="block text-xs text-muted tabular">{d.phone ? displayPkPhone(d.phone) : "no phone"}</span>
                    </td>
                    <td className="text-muted">{d.children}</td>
                    <td className="text-right tabular">{d.months}</td>
                    <td className="text-right font-semibold tabular text-danger">{formatMoney(d.balanceMinor)}</td>
                  </tr>
                ))}
                {!defaulters.length && <tr><td colSpan={5} className="py-3 text-muted">Nobody is overdue.</td></tr>}
              </tbody>
            </table>
          </div>
          {defaulters.length > 0 && can(ctx.role, "messages.send") && <div className="mt-3"><Submit variant="ghost">Add reminders for ticked families to WhatsApp outbox</Submit></div>}
        </ActionForm>
      </Card>
    </div>
  );
}
