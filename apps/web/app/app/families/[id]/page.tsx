import Link from "next/link";
import { notFound } from "next/navigation";
import { can, displayPkPhone, formatMoney, periodLabel } from "@campusos/core";
import { getFamily } from "@campusos/db/app";
import { Badge, ButtonLink, Card, PageTitle } from "@/components/ui";
import { ActionForm, Field, inputCls, Submit } from "@/components/form";
import { requireApp } from "@/lib/auth";
import { queueReminderAction, updateGuardianAction } from "../../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FamilyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { ctx, run } = await requireApp("fees.view");
  const f = await run((tx, c) => getFamily(tx, c, id));
  if (!f) notFound();
  const g = f.primary;

  return (
    <div className="max-w-3xl space-y-4">
      <PageTitle
        role="Family fee account"
        title={g?.name ?? f.family.displayName}
        sub={g?.phoneE164 ? displayPkPhone(g.phoneE164) : "No phone number"}
        right={
          <div className="flex gap-2">
            {can(ctx.role, "fees.collect") && <ButtonLink href={`/app/cash?family=${f.family.id}`}>Take payment</ButtonLink>}
            <ButtonLink href={`/app/fees/slips?family=${f.family.id}`} variant="ghost">Print slip</ButtonLink>
          </div>
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <Card><p className="text-xs text-muted">Owes now</p><p className={`text-2xl font-semibold tabular ${f.balanceMinor ? "text-danger" : ""}`} data-testid="family-balance">{formatMoney(f.balanceMinor)}</p></Card>
        <Card>
          <p className="text-xs text-muted">Children</p>
          <ul className="text-sm">
            {f.children.map((c) => (
              <li key={c.id}><Link href={`/app/students/${c.id}`} className="text-brand hover:underline">{c.name}</Link> <span className="text-muted">{c.className} {c.section}{c.status !== "active" ? ` · ${c.status}` : ""}</span></li>
            ))}
          </ul>
        </Card>
      </div>

      {f.balanceMinor > 0 && can(ctx.role, "messages.send") && g?.phoneE164 && (
        <ActionForm action={queueReminderAction}>
          <input type="hidden" name="familyId" value={f.family.id} />
          <Submit variant="ghost">Add fee reminder to WhatsApp outbox</Submit>
        </ActionForm>
      )}

      <Card title="Fee slips">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted"><th className="py-1">Month</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Owes</th></tr></thead>
          <tbody>
            {f.invoices.map((i) => (
              <tr key={i.id} className="border-t border-line">
                <td className="py-1.5">{periodLabel(i.period)}</td>
                <td>{i.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}</td>
                <td className="text-right tabular">{formatMoney(i.totalMinor)}</td>
                <td className="text-right tabular">{formatMoney(i.paidMinor)}</td>
                <td className={`text-right tabular ${i.balanceMinor > 0 ? "text-danger" : "text-muted"}`}>{formatMoney(i.balanceMinor)}</td>
              </tr>
            ))}
            {!f.invoices.length && <tr><td colSpan={5} className="py-3 text-muted">No slips yet.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card title="Payments">
        <ul className="divide-y divide-line text-sm">
          {f.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
              <span>
                <Link href={`/app/receipts/${p.id}`} className="text-brand hover:underline">Receipt #{p.receiptNo ?? "—"}</Link>{" "}
                <span className="text-muted">{p.paidOn.toLocaleDateString("en-GB", { timeZone: "UTC" })} · {p.method}</span>{" "}
                {p.status !== "confirmed" && <Badge tone="danger">{p.status}</Badge>}
              </span>
              <span className={`tabular ${p.amountMinor < 0 ? "text-danger" : ""}`}>{formatMoney(p.amountMinor)}</span>
            </li>
          ))}
          {!f.payments.length && <li className="py-2 text-muted">No payments yet.</li>}
        </ul>
      </Card>

      {g && can(ctx.role, "students.edit") && (
        <Card title="Parent contact" sub="This number gets fee slips, receipts and absence alerts on WhatsApp.">
          <ActionForm action={updateGuardianAction} resetOnOk={false} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="guardianId" value={g.id} />
            <input type="hidden" name="familyId" value={f.family.id} />
            <Field label="Name"><input name="name" defaultValue={g.name} className={inputCls} /></Field>
            <Field label="WhatsApp number"><input name="phone" defaultValue={g.phoneE164 ? displayPkPhone(g.phoneE164) : ""} className={inputCls} /></Field>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" name="prefersVoice" defaultChecked={g.prefersVoice} /> Prefers voice notes (can&apos;t read)</label>
            <div className="flex items-end"><Submit variant="ghost">Save</Submit></div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
