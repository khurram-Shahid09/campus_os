import Link from "next/link";
import { notFound } from "next/navigation";
import { can, formatMoney, periodLabel, type Bilingual } from "@campusos/core";
import { getMessageForPayment, getPayment } from "@campusos/db/app";
import { Badge, Card } from "@/components/ui";
import { ActionForm, Submit } from "@/components/form";
import { requireApp } from "@/lib/auth";
import { reversePaymentAction } from "../../actions";
import { PrintButton } from "../../print-button";
import { WaSend } from "../../wa-send";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHOD: Record<string, string> = { cash: "Cash", bank: "Bank deposit", wallet: "Mobile wallet", cheque: "Cheque" };

export default async function Receipt({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  if (!UUID.test(id)) notFound();
  const { ctx, run } = await requireApp("fees.view");
  const { p, msg } = await run(async (tx, c) => ({ p: await getPayment(tx, c, id), msg: await getMessageForPayment(tx, c, id) }));
  if (!p) notFound();
  const pay = p.payment;
  const body = msg?.body as Bilingual | null;

  return (
    <div className="mx-auto max-w-md space-y-4">
      {isNew && <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand print:hidden" data-testid="payment-saved">Payment saved. Receipt #{pay.receiptNo}.</p>}
      <article className="rounded-2xl border-2 border-ink/80 bg-white p-5 print:rounded-none" data-testid="receipt">
        <div className="flex items-start justify-between border-b border-line pb-2">
          <div>
            <p className="text-lg font-bold">{ctx.schoolName}</p>
            <p className="text-sm">{pay.reversalOf ? "Reversal" : "Fee receipt"}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted">Receipt no.</p>
            <p className="text-xl font-bold tabular">{pay.receiptNo}</p>
          </div>
        </div>
        {pay.status === "reversed" && <p className="mt-2"><Badge tone="danger">Reversed — not valid</Badge></p>}
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-muted">Date</dt><dd>{pay.paidOn.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Received from</dt><dd className="font-medium">{p.guardian}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">For</dt><dd className="text-right">{p.children.map((c) => c.name).join(", ")}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Paid by</dt><dd>{METHOD[pay.method] ?? pay.method}{pay.reference ? ` · ${pay.reference}` : ""}</dd></div>
          {p.allocations.map((a, i) => (
            <div key={i} className="flex justify-between"><dt className="text-muted">{periodLabel(a.period)}</dt><dd className="tabular">{formatMoney(a.amountMinor)}</dd></div>
          ))}
          {pay.note && <div className="flex justify-between gap-4"><dt className="text-muted">Note</dt><dd className="text-right">{pay.note}</dd></div>}
        </dl>
        <div className="mt-3 flex items-end justify-between rounded-lg bg-paper px-3 py-2 print:border print:border-ink print:bg-white">
          <span className="text-sm">Amount</span>
          <span className="text-3xl font-bold tabular">{formatMoney(pay.amountMinor)}</span>
        </div>
        <p className="mt-2 text-sm">Still due after this: <b className="tabular">{formatMoney(p.balanceNowMinor)}</b></p>
        <p className="mt-3 text-xs text-muted">Received by {p.receivedBy || "staff"} · CampusOS</p>
      </article>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <PrintButton label="Print receipt" />
        {msg && body && msg.status === "outbox" && <WaSend messageId={msg.id} phone={msg.toPhone} text={`${body.ur}\n\n${body.en}`} />}
        {msg && msg.status !== "outbox" && <span className="text-sm text-muted">WhatsApp receipt {msg.status === "skipped" ? "skipped" : "sent"}</span>}
        {!msg && <span className="text-sm text-muted">No WhatsApp number for this family.</span>}
        {can(ctx.role, "fees.collect") && <Link href="/app/cash" className="ml-auto text-sm font-semibold text-brand underline">Next payment →</Link>}
      </div>

      {can(ctx.role, "fees.reverse") && pay.status === "confirmed" && !pay.reversalOf && (
        <Card title="Reverse this payment" sub="Only for mistakes (wrong family, wrong amount). The receipt stays in the records with a reversal entry; nothing is deleted.">
          <ActionForm action={reversePaymentAction} className="flex flex-wrap gap-2 print:hidden">
            <input type="hidden" name="paymentId" value={pay.id} />
            <input name="reason" required minLength={3} placeholder="Why?" className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm" />
            <Submit variant="danger" confirm="Reverse this payment?">Reverse</Submit>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
