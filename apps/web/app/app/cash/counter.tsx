"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, periodLabel } from "@campusos/core";
import { familyDueAction, recordPaymentAction, searchFamiliesAppAction } from "../actions";

type Hit = Awaited<ReturnType<typeof searchFamiliesAppAction>>[number];
type Due = NonNullable<Awaited<ReturnType<typeof familyDueAction>>>;

export function Counter({ initialFamilyId }: { initialFamilyId?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [fam, setFam] = useState<Due | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const choose = (familyId: string) =>
    start(async () => {
      const d = await familyDueAction(familyId);
      setFam(d);
      setHits([]);
      setAmount(d && d.balanceMinor > 0 ? String(Math.round(d.balanceMinor / 100)) : "");
      setTimeout(() => amountRef.current?.select(), 50);
    });

  useEffect(() => {
    if (initialFamilyId) choose(initialFamilyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFamilyId]);

  function onSearch(v: string) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) return setHits([]);
    timer.current = setTimeout(async () => setHits(await searchFamiliesAppAction(v)), 250);
  }

  const save = () =>
    start(async () => {
      setError(null);
      const r = await recordPaymentAction({ familyId: fam!.familyId, amount, method, reference });
      if (r.error) return setError(r.error);
      router.push(`/app/receipts/${r.paymentId}?new=1`);
    });

  return (
    <div className="space-y-3">
      <input
        autoFocus value={q} onChange={(e) => onSearch(e.target.value)} data-testid="family-search"
        placeholder="Child name, father name, GR no. or phone"
        className="w-full rounded-xl border border-line bg-white px-4 py-3 text-base"
      />
      {hits.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {hits.map((h) => (
            <li key={h.familyId}>
              <button onClick={() => choose(h.familyId)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-paper" data-testid="family-hit">
                <span className="min-w-0"><span className="font-semibold">{h.guardian}</span><span className="block truncate text-xs text-muted">{h.children}</span></span>
                <span className={`shrink-0 text-sm tabular ${h.balanceMinor ? "text-danger" : "text-muted"}`}>{formatMoney(h.balanceMinor)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {fam && (
        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{fam.guardian}</p>
              <p className="text-sm text-muted">{fam.children.join(", ")}</p>
            </div>
            <button onClick={() => setFam(null)} className="text-sm text-muted underline">Change</button>
          </div>
          <div className="mt-3 rounded-lg bg-paper p-3 text-sm">
            {fam.open.length ? (
              <>
                {fam.open.map((o) => <p key={o.period} className="flex justify-between"><span>{periodLabel(o.period)}</span><span className="tabular">{formatMoney(o.balanceMinor)}</span></p>)}
                <p className="mt-1 flex justify-between border-t border-line pt-1 font-semibold"><span>Total due</span><span className="tabular" data-testid="due-total">{formatMoney(fam.balanceMinor)}</span></p>
              </>
            ) : <p className="text-muted">Nothing due. A payment now is kept as advance.</p>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); save(); }} className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm font-medium sm:col-span-1">
              Amount received (Rs)
              <input ref={amountRef} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" required data-testid="cash-amount"
                className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-xl font-semibold tabular" />
            </label>
            <label className="block text-sm font-medium">
              Paid by
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-3 text-sm">
                <option value="cash">Cash</option><option value="bank">Bank deposit</option><option value="wallet">JazzCash / Easypaisa</option><option value="cheque">Cheque</option>
              </select>
            </label>
            {method !== "cash" && (
              <label className="block text-sm font-medium">
                Reference / TID
                <input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-sm" />
              </label>
            )}
            <button disabled={pending} data-testid="cash-submit" className="rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60 sm:col-span-3">
              {pending ? "Saving…" : `Save payment and make receipt`}
            </button>
          </form>
          {error && <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
