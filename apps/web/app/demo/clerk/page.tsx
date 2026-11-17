import Link from "next/link";
import { formatMoney } from "@campusos/core";
import { getPaymentsOn, getPendingProofs } from "@campusos/db/roles";
import { Badge, Card, PageTitle, SavesNote } from "@/components/ui";
import { demoCtx } from "@/lib/ctx";
import { approveProofAction, rejectProofAction } from "../actions";
import { CashCounter } from "./cash-counter";

export const dynamic = "force-dynamic";

export default async function ClerkHome() {
  const { db, ctx } = await demoCtx("accountant");
  const [proofs, today] = await Promise.all([getPendingProofs(db, ctx.schoolId), getPaymentsOn(db, ctx.schoolId, ctx.asOf)]);
  const todayTotal = today.reduce((a, p) => a + p.amountMinor, 0);

  return (
    <div className="space-y-5">
      <PageTitle role="Fee clerk" title="Fee counter" sub={`Collected today: ${formatMoney(todayTotal)} from ${today.length} payments`} />
      <SavesNote>
        no receipt books, no writing challans, no matching wallet screenshots against bank statements. Receipts go to parents
        automatically as a voice note or message.
      </SavesNote>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Cash payment" sub="Search a child or family, enter the amount, done.">
          <CashCounter />
        </Card>

        <Card title="Payment screenshots" sub={`${proofs.length} waiting. Parents sent these on WhatsApp.`}>
          {proofs.length === 0 && <p className="text-sm text-muted">All caught up.</p>}
          <ul className="space-y-3">
            {proofs.map((p) => (
              <li key={p.id} data-testid="proof" className={`rounded-xl border p-3 ${p.duplicateOn ? "border-danger/50 bg-danger-soft/50" : "border-line"}`}>
                <div className="flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageKey} alt="Payment screenshot sent by parent" className="h-28 w-20 shrink-0 rounded-md border border-line object-cover" />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold">{p.family ?? "Unknown sender"}</p>
                      <Badge tone={p.extracted.source === "demo" ? "warn" : "brand"}>{p.extracted.source === "demo" ? "demo read" : "AI read"}</Badge>
                    </div>
                    <p className="tabular mt-1 text-lg font-semibold">{formatMoney(p.extracted.amountMinor)}</p>
                    <p className="text-xs text-muted">
                      {p.extracted.bank} · {p.extracted.reference} · {p.extracted.date}
                    </p>
                    <p className="text-xs text-muted">
                      Family owes {formatMoney(p.familyBalanceMinor)} · match {Math.round(p.extracted.confidence * 100)}%
                    </p>
                    {p.duplicateOn && (
                      <p className="mt-1 text-xs font-semibold text-danger">⚠ Same screenshot was already used on {p.duplicateOn}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {p.duplicateOn ? (
                    <form action={rejectProofAction} className="flex-1">
                      <input type="hidden" name="proofId" value={p.id} />
                      <input type="hidden" name="reason" value="duplicate" />
                      <button data-testid="reject-duplicate" className="w-full rounded-lg bg-danger py-2 text-sm font-semibold text-white">
                        Reject reused screenshot
                      </button>
                    </form>
                  ) : (
                    <>
                      <form action={approveProofAction} className="flex-1">
                        <input type="hidden" name="proofId" value={p.id} />
                        <input type="hidden" name="familyId" value={p.familyId ?? ""} />
                        <input type="hidden" name="amountMinor" value={p.extracted.amountMinor} />
                        <input type="hidden" name="reference" value={p.extracted.reference} />
                        <button data-testid="approve-proof" className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white">
                          Approve & send receipt
                        </button>
                      </form>
                      <form action={rejectProofAction}>
                        <input type="hidden" name="proofId" value={p.id} />
                        <input type="hidden" name="reason" value="unreadable" />
                        <button className="rounded-lg border border-line px-3 py-2 text-sm">Reject</button>
                      </form>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Today's payments">
        {today.length === 0 && <p className="text-sm text-muted">No payments yet today.</p>}
        <ul className="divide-y divide-line text-sm">
          {today.slice(0, 10).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate">
                {p.family} <span className="text-xs text-muted">· {p.method}</span>
                {p.attributed && (
                  <span className="ml-1.5">
                    <Badge tone="brand">after reminder</Badge>
                  </span>
                )}
              </span>
              <span className="tabular font-semibold">{formatMoney(p.amountMinor)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="text-sm text-muted">
        Fee slips go out on WhatsApp as a picture parents can understand without reading.{" "}
        <Link href="/demo/clerk/slips" className="font-semibold text-brand underline">
          See a fee slip →
        </Link>
      </p>
    </div>
  );
}
