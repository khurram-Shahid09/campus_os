import { displayPkPhone, type Bilingual } from "@campusos/core";
import { getOutbox } from "@campusos/db/app";
import { Badge, Card, PageTitle } from "@/components/ui";
import { requireApp } from "@/lib/auth";
import { WaSend } from "../wa-send";

const CAT: Record<string, string> = { fee: "Fee", receipt: "Receipt", attendance: "Absent", notice: "Notice", system: "Message" };

export default async function Outbox() {
  const { run } = await requireApp("messages.send");
  const msgs = await run((tx, c) => getOutbox(tx, c, 200));
  return (
    <div className="space-y-4">
      <PageTitle
        role="WhatsApp"
        title={`${msgs.length} message${msgs.length === 1 ? "" : "s"} ready to send`}
        sub="Fee slips, receipts and absence alerts wait here. Tap Send: WhatsApp opens with the message already typed (Urdu and English). Once the WhatsApp Business number is connected, these go out by themselves."
      />
      <Card>
        <ul className="divide-y divide-line" data-testid="outbox">
          {msgs.map((m) => {
            const b = m.body as Bilingual | null;
            const text = b ? `${b.ur}\n\n${b.en}` : "";
            return (
              <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <Badge tone={m.category === "attendance" ? "warn" : m.category === "receipt" ? "brand" : "muted"}>{CAT[m.category] ?? m.category}</Badge>{" "}
                    <span className="font-semibold">{m.guardian}</span> <span className="text-muted tabular">{displayPkPhone(m.toPhone)}</span>
                  </p>
                  {b && <p className="mt-1 text-sm" dir="rtl" lang="ur">{b.ur}</p>}
                  {b && <p className="text-xs text-muted">{b.en}</p>}
                </div>
                <WaSend messageId={m.id} phone={m.toPhone} text={text} compact />
              </li>
            );
          })}
          {!msgs.length && <li className="py-6 text-center text-sm text-muted">All sent.</li>}
        </ul>
      </Card>
    </div>
  );
}
