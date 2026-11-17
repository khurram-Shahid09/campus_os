import Link from "next/link";
import { can, displayPkPhone, type Bilingual } from "@campusos/core";
import { getMessageLog, getMessageStats, triggerLabel, whatsappMode } from "@campusos/db/app";
import { Badge, Card, PageTitle } from "@/components/ui";
import { requireApp } from "@/lib/auth";
import { WaSend } from "../wa-send";

const STATUS: Record<string, { label: string; tone: "brand" | "warn" | "muted" | "danger" }> = {
  simulated: { label: "Sent automatically · simulated", tone: "brand" },
  sent_manual: { label: "Sent from staff phone", tone: "brand" },
  delivered: { label: "Delivered (demo history)", tone: "brand" },
  outbox: { label: "Waiting for staff to send", tone: "warn" },
  pending_api: { label: "Waiting for WhatsApp API", tone: "warn" },
  skipped: { label: "Skipped", tone: "muted" },
  received: { label: "Received", tone: "muted" },
};

export default async function WhatsApp() {
  const { ctx, run } = await requireApp("messages.send");
  const since = new Date(Date.now() - 7 * 86_400_000);
  const { log, stats } = await run(async (tx, c) => ({
    log: await getMessageLog(tx, c, { includeOwnerBrief: can(c.role, "dashboard.owner"), limit: 200 }),
    stats: await getMessageStats(tx, c, since),
  }));
  const mode = whatsappMode();
  const total = stats.reduce((a, x) => a + x.n, 0);

  return (
    <div className="space-y-4">
      <PageTitle role="WhatsApp" title={`${total} message${total === 1 ? "" : "s"} triggered automatically this week`}
        sub="Every fee slip, payment, absence and late fee sends a WhatsApp to the parent by itself, in Urdu and English. Nobody has to type or remember."
        right={<Link href="/app/notices" className="rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white" data-testid="new-notice">Send a notice</Link>} />

      {mode === "simulated" && (
        <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn" data-testid="wa-simulated">
          <b>Simulated sending.</b> CampusOS creates and logs every message exactly as it will go out, but they are not delivered yet: the
          school&apos;s WhatsApp Business number is not connected. Once it is, these go out automatically with no change in how you work.
          Need one to reach a parent today? Use <i>Send from my phone</i>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.slice(0, 8).map((x) => (
          <div key={x.template_key ?? "x"} className="rounded-xl border border-line bg-white p-3">
            <p className="text-xs text-muted">{triggerLabel(x.template_key)}</p>
            <p className="text-xl font-semibold tabular">{x.n}</p>
          </div>
        ))}
      </div>

      <Card title="Message log" sub="Newest first. What started each message is shown on the left.">
        <ul className="divide-y divide-line" data-testid="message-log">
          {log.map((m) => {
            const b = m.body as Bilingual | null;
            const st = STATUS[m.status] ?? { label: m.status, tone: "muted" as const };
            const canSend = m.direction === "out" && ["simulated", "outbox", "pending_api"].includes(m.status) && m.category !== "brief";
            return (
              <li key={m.id} className="grid gap-2 py-3 sm:grid-cols-[170px_1fr_auto]">
                <div className="text-xs">
                  <p className="font-semibold text-ink">{triggerLabel(m.templateKey)}</p>
                  <p className="text-muted">{m.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <div className="min-w-0 text-sm">
                  <p>
                    <span className="font-semibold">{m.guardian ?? (m.category === "brief" ? "Owner" : "")}</span>{" "}
                    <span className="text-muted tabular">{displayPkPhone(m.toPhone)}</span>{" "}
                    {m.familyId && <Link href={`/app/families/${m.familyId}`} className="text-xs text-brand underline">account</Link>}
                  </p>
                  {b && <p className="mt-1" dir="rtl" lang="ur">{b.ur}</p>}
                  {b && <p className="whitespace-pre-line text-xs text-muted">{b.en}</p>}
                </div>
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <Badge tone={st.tone}>{st.label}</Badge>
                  {canSend && b && <WaSend messageId={m.id} phone={m.toPhone} text={`${b.ur}\n\n${b.en}`} compact label="Send from my phone" />}
                </div>
              </li>
            );
          })}
          {!log.length && <li className="py-6 text-center text-sm text-muted">No messages yet. They start when you make fee slips, take payments or mark attendance.</li>}
        </ul>
      </Card>
      {ctx.role === "owner" && <p className="text-xs text-muted">Owners also see their own Morning Brief here. Staff don&apos;t.</p>}
    </div>
  );
}
