import Link from "next/link";
import { formatMoney } from "@campusos/core";
import { getPaymentsOnDay } from "@campusos/db/app";
import { Badge, Card, PageTitle } from "@/components/ui";
import { requireApp } from "@/lib/auth";
import { Counter } from "./counter";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Cash({ searchParams }: { searchParams: Promise<{ family?: string; day?: string }> }) {
  const sp = await searchParams;
  const { ctx, run } = await requireApp("fees.collect");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") ? new Date(`${sp.day}T00:00:00Z`) : ctx.today;
  const payments = await run((tx, c) => getPaymentsOnDay(tx, c, day));
  const live = payments.filter((p) => p.status === "confirmed");
  const byMethod = live.reduce<Record<string, number>>((m, p) => ({ ...m, [p.method]: (m[p.method] ?? 0) + p.amountMinor }), {});
  const isToday = day.getTime() === ctx.today.getTime();

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <PageTitle role="Cash counter" title="Take a payment" sub="Search, enter the amount, save. The receipt number is given automatically and the parent's WhatsApp message is ready to send." />
        <Counter initialFamilyId={sp.family && UUID.test(sp.family) ? sp.family : undefined} />
      </div>
      <Card title={isToday ? "Today's collection" : `Collection on ${day.toLocaleDateString("en-GB", { timeZone: "UTC" })}`} sub="Match this with the cash in the drawer before closing.">
        <p className="text-3xl font-semibold tabular" data-testid="day-total">{formatMoney(live.reduce((a, p) => a + p.amountMinor, 0))}</p>
        <p className="text-xs text-muted">{Object.entries(byMethod).map(([k, v]) => `${k}: ${formatMoney(v)}`).join(" · ") || "No payments yet"}</p>
        <ul className="mt-3 max-h-[420px] divide-y divide-line overflow-auto text-sm">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
              <Link href={`/app/receipts/${p.id}`} className="min-w-0 truncate hover:underline">
                <span className="text-muted tabular">#{p.receiptNo}</span> {p.guardian}
              </Link>
              <span className="shrink-0 tabular">
                {p.status !== "confirmed" && <Badge tone="danger">{p.status}</Badge>} {formatMoney(p.amountMinor)}
              </span>
            </li>
          ))}
        </ul>
        <form className="mt-3 flex gap-2 text-sm">
          <input type="date" name="day" defaultValue={day.toISOString().slice(0, 10)} className="rounded-lg border border-line px-2 py-1" />
          <button className="rounded-lg border border-line px-3 py-1">Show day</button>
        </form>
      </Card>
    </div>
  );
}
