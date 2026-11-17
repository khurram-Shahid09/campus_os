import Link from "next/link";
import { can, displayPkPhone, formatMoney } from "@campusos/core";
import { getFeeCalls, getRiskList } from "@campusos/db/app";
import { Badge, Card, PageTitle } from "@/components/ui";
import { ActionForm, inputCls, Submit } from "@/components/form";
import { requireApp } from "@/lib/auth";
import { logFeeCallAction, logRiskFollowupAction } from "../actions";

const OUTCOME: Record<string, string> = { will_return: "Will come back", fee_plan_agreed: "Fee plan agreed", leaving: "Leaving", no_answer: "No answer" };

export default async function Calls() {
  const { ctx, run } = await requireApp("attendance.mark.any");
  const { risk, fees } = await run(async (tx, c) => ({ risk: await getRiskList(tx, c.schoolId), fees: await getFeeCalls(tx, c.schoolId) }));
  const weekOut = new Date(ctx.today.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <PageTitle role="Calls" title={`${risk.filter((r) => r.band === "high").length + fees.length} calls to make`} sub="Families the system thinks need a personal call. A call from the principal keeps students and recovers fees that reminders could not." />

      <Card title={`Fees: reminders did not work (${fees.length})`} sub="Two WhatsApp reminders went out and the fee is still unpaid, or the family has no WhatsApp.">
        <ul className="divide-y divide-line" data-testid="fee-calls">
          {fees.map((f) => (
            <li key={f.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>
                  <Link href={`/app/families/${f.family_id}`} className="font-semibold text-brand hover:underline">{f.guardian ?? "Family"}</Link>{" "}
                  <span className="text-muted">{f.children}</span>{" "}
                  {f.phone ? <a href={`tel:${f.phone}`} className="tabular text-brand underline">{displayPkPhone(f.phone)}</a> : <Badge tone="warn">no phone</Badge>}
                </span>
                <span className="font-semibold tabular text-danger">{formatMoney(Number(f.balance))} · {f.months} month{f.months === 1 ? "" : "s"}</span>
              </div>
              {can(ctx.role, "messages.send") && (
                <ActionForm action={logFeeCallAction} className="mt-2 flex flex-wrap items-end gap-2 text-sm">
                  <input type="hidden" name="reminderEventId" value={f.id} />
                  <select name="outcome" className="rounded-lg border border-line px-2 py-1.5" aria-label="Call result">
                    <option value="promised">Promised to pay on</option>
                    <option value="no_answer">No answer</option>
                    <option value="refused">Refused / dispute</option>
                  </select>
                  <input type="date" name="promisedOn" defaultValue={weekOut} className="rounded-lg border border-line px-2 py-1.5" aria-label="Promised date" />
                  <input name="amount" placeholder="Rs (optional)" inputMode="numeric" className="w-28 rounded-lg border border-line px-2 py-1.5" />
                  <Submit variant="ghost">Save call</Submit>
                </ActionForm>
              )}
            </li>
          ))}
          {!fees.length && <li className="py-2 text-sm text-muted">No fee calls needed right now.</li>}
        </ul>
      </Card>

      <Card title={`Students who may leave (${risk.length})`} sub="From last night's check. Reasons come from attendance and fee records; nothing is guessed.">
        <ul className="divide-y divide-line" data-testid="risk-list">
          {risk.map((r) => (
            <li key={r.student_id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span>
                  <Link href={`/app/students/${r.student_id}`} className="font-semibold text-brand hover:underline">{r.name}</Link>{" "}
                  <span className="text-muted">{r.class_name} {r.section} · {r.guardian}</span>{" "}
                  {r.phone && <a href={`tel:${r.phone}`} className="tabular text-brand underline">{displayPkPhone(r.phone)}</a>}
                </span>
                <Badge tone={r.band === "high" ? "danger" : "warn"}>{r.band} · {r.score}</Badge>
              </div>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted">{r.reasons.map((x, i) => <li key={i}>{x.text}</li>)}</ul>
              {r.last_outcome && <p className="mt-1 text-xs text-muted">Last call {r.last_call?.slice(0, 10)}: {OUTCOME[r.last_outcome] ?? r.last_outcome}</p>}
              <ActionForm action={logRiskFollowupAction} className="mt-2 flex flex-wrap gap-2 text-sm">
                <input type="hidden" name="studentId" value={r.student_id} />
                <select name="outcome" className="rounded-lg border border-line px-2 py-1.5" aria-label="Call result">
                  {Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input name="notes" placeholder="Note (optional)" className={`${inputCls} mt-0 w-48`} />
                <Submit variant="ghost">Save call</Submit>
              </ActionForm>
            </li>
          ))}
          {!risk.length && <li className="py-2 text-sm text-muted">Nobody flagged. The check runs every night; it needs a couple of weeks of attendance to spot drops.</li>}
        </ul>
      </Card>
    </div>
  );
}
