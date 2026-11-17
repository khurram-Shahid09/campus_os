"use client";

import { useState, useTransition } from "react";
import { formatMoney } from "@campusos/core";
import { familyLedgerAction, recordCashAction, searchFamiliesAction } from "../actions";

type Family = Awaited<ReturnType<typeof searchFamiliesAction>>[number];
type Ledger = Awaited<ReturnType<typeof familyLedgerAction>>;
type Done = Awaited<ReturnType<typeof recordCashAction>>;

export function CashCounter() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Family[]>([]);
  const [family, setFamily] = useState<Family | null>(null);
  const [ledger, setLedger] = useState<Ledger>([]);
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const search = (value: string) => {
    setQ(value);
    if (value.trim().length < 2) return setResults([]);
    start(async () => setResults(await searchFamiliesAction(value)));
  };

  const choose = (f: Family) =>
    start(async () => {
      setFamily(f);
      setResults([]);
      setDone(null);
      const l = await familyLedgerAction(f.id);
      setLedger(l);
      setAmount(l[0] ? String(Math.round(l[0].balanceMinor / 100)) : "");
    });

  const pay = () =>
    start(async () => {
      if (!family) return;
      setError(null);
      try {
        setDone(await recordCashAction({ familyId: family.id, amountRupees: Number(amount) }));
      } catch {
        setError("Enter a valid amount.");
      }
    });

  const reset = () => {
    setFamily(null);
    setLedger([]);
    setAmount("");
    setDone(null);
    setQ("");
  };

  if (done && family) {
    return (
      <div data-testid="cash-done" className="space-y-3">
        <div className="rounded-xl bg-brand p-4 text-white">
          <p className="text-sm text-white/80">{family.family}</p>
          <p className="tabular text-2xl font-bold">{formatMoney(Math.round(Number(amount) * 100))} received</p>
          <p className="text-sm text-white/85">
            Cleared {done.months} month{done.months === 1 ? "" : "s"} · still due {formatMoney(Math.max(0, done.remainingMinor))}
          </p>
        </div>
        <div className="rounded-xl border border-line p-3 text-sm">
          <p className="text-xs font-semibold text-muted">Receipt sent to parent on WhatsApp</p>
          <p dir="rtl" lang="ur" className="mt-1 text-base leading-loose">{done.receipt.ur}</p>
          <p className="text-xs text-muted">{done.receipt.en}</p>
        </div>
        <button onClick={reset} className="w-full rounded-lg border border-line py-2 text-sm font-semibold">
          Next payment
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!family && (
        <>
          <input
            value={q}
            onChange={(e) => search(e.target.value)}
            placeholder="Child name, family or admission no."
            data-testid="family-search"
            className="w-full rounded-lg border border-line px-3 py-2.5 text-base outline-none focus:border-brand"
          />
          <ul className="divide-y divide-line">
            {results.map((f) => (
              <li key={f.id}>
                <button onClick={() => choose(f)} data-testid="family-result" className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm">
                  <span className="min-w-0">
                    <span className="block font-semibold">{f.family}</span>
                    <span className="block truncate text-xs text-muted">{f.children}</span>
                  </span>
                  <span className={`tabular shrink-0 font-semibold ${f.balanceMinor > 0 ? "text-danger" : "text-brand"}`}>
                    {f.balanceMinor > 0 ? formatMoney(f.balanceMinor) : "Paid up"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {pending && <p className="text-xs text-muted">Searching…</p>}
        </>
      )}

      {family && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{family.family}</p>
              <p className="text-xs text-muted">{family.children}</p>
            </div>
            <button onClick={reset} className="text-xs text-muted underline">
              change
            </button>
          </div>
          <ul className="space-y-1 text-sm">
            {ledger.map((l) => (
              <li key={l.id} className="flex justify-between rounded-lg bg-paper px-3 py-1.5">
                <span>{l.period}</span>
                <span className="tabular font-medium">{formatMoney(l.balanceMinor)}</span>
              </li>
            ))}
            {ledger.length === 0 && <li className="text-muted">Nothing due.</li>}
          </ul>
          <label className="block text-sm">
            <span className="text-muted">Amount received (Rs)</span>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
              data-testid="cash-amount"
              className="tabular mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-xl font-semibold outline-none focus:border-brand"
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            onClick={pay}
            disabled={pending || !amount}
            data-testid="cash-submit"
            className="w-full rounded-lg bg-brand py-3 font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Receive & send receipt"}
          </button>
          <p className="text-xs text-muted">Oldest months are cleared first. Every payment is logged with who entered it.</p>
        </div>
      )}
    </div>
  );
}
