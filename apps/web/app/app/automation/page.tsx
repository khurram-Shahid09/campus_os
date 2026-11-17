import Link from "next/link";
import { can, formatMoney } from "@campusos/core";
import { getJobRuns, getRecoveredThisMonth } from "@campusos/db/app";
import { Badge, Card, PageTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/form";
import { requireApp } from "@/lib/auth";
import { runJobNowAction, setAutomationAction } from "../actions";

const JOB_INFO: Record<string, { name: string; when: string; what: string }> = {
  risk_scores: { name: "Dropout check", when: "Every night, 2:00", what: "Scores every student on attendance drop, days absent in a row and unpaid fees. Students on watch go to the principal's call list." },
  morning_brief: { name: "Morning Brief", when: "Every day, 7:00", what: "Yesterday's fees, attendance, staff, students who may leave and decisions waiting. Shown under Home → Morning Brief now; sent to the owner on WhatsApp once the Business number is connected." },
  fee_reminders: { name: "Fee reminders", when: "Mon–Sat, 10:00", what: "3 days after the due date a polite WhatsApp, 10 days a firmer one, 20 days the principal calls. One message per family, at least 5 days apart, paused while a promise to pay is open." },
};

function describe(job: string, r: Record<string, number> | null) {
  if (!r) return "";
  if (job === "risk_scores") return `${r.scored} students checked: ${r.high} high, ${r.watch} watch`;
  if (job === "morning_brief") return `Brief ready for ${r.owners} owner${r.owners === 1 ? "" : "s"}`;
  if (job === "fee_reminders") return `${r.messages} WhatsApp reminders, ${r.calls} families added to the call list`;
  return JSON.stringify(r);
}

export default async function Automation() {
  const { ctx, run } = await requireApp("attendance.mark.any");
  const { runs, recovered } = await run(async (tx, c) => ({
    runs: await getJobRuns(tx, c.schoolId, 14),
    recovered: await getRecoveredThisMonth(tx, c.schoolId, c.today),
  }));
  const auto = (ctx.settings as { automation?: { reminders?: boolean; brief?: boolean } }).automation ?? {};
  const owner = can(ctx.role, "school.setup");

  return (
    <div className="space-y-5">
      <PageTitle role="Automation" title="What CampusOS does by itself" sub="These run every day without anyone pressing a button. Times are your school's local time." />

      <Card title="Money recovered by reminders this month" sub="Counted only when a family pays within 7 days after a reminder that was actually sent. We would rather under-claim.">
        <p className="text-3xl font-semibold tabular text-brand" data-testid="recovered">{formatMoney(recovered.recoveredMinor)}</p>
        <p className="text-sm text-muted">{recovered.payments} payment{recovered.payments === 1 ? "" : "s"}</p>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {Object.entries(JOB_INFO).map(([job, info]) => {
          const last = runs.find((r) => r.job === job);
          return (
            <Card key={job} title={info.name} sub={info.when}>
              <p className="text-sm">{info.what}</p>
              <p className="mt-2 text-xs text-muted">
                Last run: {last ? `${last.runOn.toISOString().slice(0, 10)} · ${last.status === "done" ? describe(job, last.result as Record<string, number>) : last.status}` : "not yet"}
              </p>
              {owner && (
                <ActionForm action={runJobNowAction} className="mt-3">
                  <input type="hidden" name="job" value={job} />
                  <Submit variant="ghost" testId={`run-${job}`}>Run now</Submit>
                </ActionForm>
              )}
            </Card>
          );
        })}
      </div>

      {owner && (
        <Card title="Switch on or off">
          <ActionForm action={setAutomationAction} resetOnOk={false} className="flex flex-wrap items-center gap-5 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="reminders" defaultChecked={auto.reminders !== false} /> Fee reminders to parents</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="brief" defaultChecked={auto.brief !== false} /> Morning Brief to me</label>
            <Submit>Save</Submit>
          </ActionForm>
          <p className="mt-2 text-xs text-muted">
            Until the WhatsApp Business number is connected, messages wait in the <Link href="/app/outbox" className="text-brand underline">WhatsApp outbox</Link> for one-tap sending.
          </p>
        </Card>
      )}

      <Card title="Last 14 days">
        <ul className="divide-y divide-line text-sm" data-testid="job-runs">
          {runs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span><span className="tabular text-muted">{r.runOn.toISOString().slice(0, 10)}</span> · {JOB_INFO[r.job]?.name ?? r.job}</span>
              <span className="text-right">
                {r.status === "done" ? describe(r.job, r.result as Record<string, number>) : <Badge tone={r.status === "failed" ? "danger" : "warn"}>{r.status}</Badge>}
                {r.status === "failed" && r.error && <span className="block text-xs text-danger">{r.error}</span>}
              </span>
            </li>
          ))}
          {!runs.length && <li className="py-2 text-muted">Nothing has run yet. The worker must be running (see README).</li>}
        </ul>
      </Card>
    </div>
  );
}
