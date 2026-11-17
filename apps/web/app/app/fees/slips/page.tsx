import { formatMoney, paymentCodeFor, periodLabel, periodOf } from "@campusos/core";
import { getOpenInvoicesForFamily, getSlips } from "@campusos/db/app";
import { requireApp } from "@/lib/auth";
import { PrintButton } from "../../print-button";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Printable fee slips: big amount, due date, payment code, arrears. Two slips per A4 page. */
export default async function Slips({ searchParams }: { searchParams: Promise<{ period?: string; family?: string }> }) {
  const sp = await searchParams;
  const { ctx, run } = await requireApp("fees.view");
  const slips = await run(async (tx, c) => {
    if (sp.family && UUID.test(sp.family)) {
      const open = await getOpenInvoicesForFamily(tx, c, sp.family);
      const latest = open.at(-1);
      return latest ? getSlips(tx, c, { period: latest.period, invoiceIds: [latest.id] }) : [];
    }
    return getSlips(tx, c, { period: /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : periodOf(c.today) });
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted">{slips.length} slip{slips.length === 1 ? "" : "s"}. Two per A4 page.</p>
        <PrintButton />
      </div>
      {!slips.length && <p className="text-muted">No slips for this month.</p>}
      <div className="grid gap-4 print:block">
        {slips.map((x) => {
          const due = x.invoice.balanceMinor + x.arrearsMinor;
          return (
            <article key={x.invoice.id} className="break-inside-avoid rounded-xl border-2 border-ink/80 bg-white p-4 print:mb-4 print:h-[13.5cm] print:rounded-none">
              <div className="flex items-start justify-between gap-3 border-b border-line pb-2">
                <div>
                  <p className="text-lg font-bold">{ctx.schoolName}</p>
                  <p className="text-sm">Fee slip · {periodLabel(x.invoice.period)}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="text-muted">Slip no. (quote when paying)</p>
                  <p className="font-mono text-base font-bold tracking-wider">{paymentCodeFor(x.invoice.id)}</p>
                </div>
              </div>
              <p className="mt-2 text-sm"><span className="text-muted">Parent:</span> <b>{x.guardian}</b></p>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {x.lines.map((l) => (
                    <tr key={l.id}><td className="py-0.5">{l.description}</td><td className="text-right tabular">{formatMoney(l.amountMinor)}{l.discountMinor > 0 && <span className="text-xs text-muted"> − {formatMoney(l.discountMinor)} discount</span>}</td></tr>
                  ))}
                  {x.arrearsMinor > 0 && <tr><td className="py-0.5 font-medium">Previous months unpaid</td><td className="text-right font-medium tabular">{formatMoney(x.arrearsMinor)}</td></tr>}
                  {x.invoice.paidMinor > 0 && <tr><td className="py-0.5">Already paid this month</td><td className="text-right tabular">− {formatMoney(x.invoice.paidMinor)}</td></tr>}
                </tbody>
              </table>
              <div className="mt-3 flex items-end justify-between rounded-lg bg-paper px-3 py-2 print:bg-white print:border print:border-ink">
                <div>
                  <p className="text-xs text-muted">Pay by</p>
                  <p className="font-semibold">{x.invoice.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">Total to pay</p>
                  <p className="text-3xl font-bold tabular">{formatMoney(due)}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
