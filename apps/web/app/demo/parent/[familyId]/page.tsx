import { notFound } from "next/navigation";
import { getFamilyChat, getFamilyHeader, getLatestSlip } from "@campusos/db/roles";
import { FeeSlip } from "@/components/fee-slip";
import { demoCtx } from "@/lib/ctx";
import { parentBalanceAction, parentScreenshotAction } from "../../actions";
import { VoiceNote } from "./voice-note";

export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });

const CATEGORY_LABEL: Record<string, string> = {
  fee: "Fee",
  attendance: "Attendance",
  receipt: "Receipt",
  system: "Reply",
};

export default async function ParentChat({ params }: { params: Promise<{ familyId: string }> }) {
  const { familyId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(familyId)) notFound();
  const { db, ctx, demo } = await demoCtx("parent");
  const header = await getFamilyHeader(db, ctx.schoolId, familyId);
  if (!header) notFound();
  const [chat, slip] = await Promise.all([getFamilyChat(db, ctx.schoolId, familyId, 30), getLatestSlip(db, ctx.schoolId, familyId)]);
  const children = slip?.lines.map((l) => l.child) ?? [];

  return (
    <div className="mx-auto max-w-md">
      <div className="overflow-hidden rounded-[2rem] border-8 border-ink bg-[#efeae2] shadow-xl">
        <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
          <span className="grid size-9 place-items-center rounded-full bg-white/20 text-sm font-bold">DG</span>
          <div className="min-w-0">
            <p className="truncate font-semibold">{demo.school.name.replace(/\s*\(DEMO\)/, "")}</p>
            <p className="text-[11px] text-white/75">WhatsApp · to {header.guardian}</p>
          </div>
        </div>

        <ol className="flex max-h-[62vh] flex-col gap-2 overflow-y-auto px-3 py-3" data-testid="chat">
          {chat.map((m) => {
            const mine = m.direction === "in";
            const body = m.body as { ur: string; en: string } | null;
            const payload = m.payload as { imageKey?: string; code?: string; period?: string; amountMinor?: number; children?: string[] } | null;
            return (
              <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm shadow-sm ${mine ? "bg-[#d9fdd3]" : "bg-white"}`}>
                  {!mine && <p className="text-[10px] font-semibold uppercase text-brand">{CATEGORY_LABEL[m.category] ?? m.category}</p>}
                  {m.templateKey === "fee_slip" && payload?.code && payload.period ? (
                    <div className="w-64">
                      <FeeSlip compact school={demo.school.name} period={payload.period} amountMinor={payload.amountMinor ?? 0} dueDay={10} code={payload.code} children={payload.children ?? children} />
                    </div>
                  ) : m.format === "image" && payload?.imageKey ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={payload.imageKey} alt="Payment screenshot" className="h-40 rounded" />
                  ) : m.format === "voice" && body ? (
                    <VoiceNote ur={body.ur} en={body.en} ivr={m.channel === "ivr"} />
                  ) : body ? (
                    <>
                      <p dir="rtl" lang="ur" className="leading-loose">{body.ur}</p>
                      <p className="text-xs text-muted">{body.en}</p>
                    </>
                  ) : null}
                  <p className="mt-0.5 text-right text-[10px] text-muted">{m.sentAt ? timeFmt.format(m.sentAt) : ""}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="flex gap-2 bg-[#f0f2f5] p-2">
          <form action={parentBalanceAction} className="flex-1">
            <input type="hidden" name="familyId" value={familyId} />
            <button data-testid="ask-balance" className="w-full rounded-full bg-white px-3 py-2 text-sm font-medium shadow-sm">
              🎤 &quot;Fee kitni hai?&quot;
            </button>
          </form>
          <form action={parentScreenshotAction} className="flex-1">
            <input type="hidden" name="familyId" value={familyId} />
            <button data-testid="send-screenshot" className="w-full rounded-full bg-white px-3 py-2 text-sm font-medium shadow-sm">
              📷 Send payment screenshot
            </button>
          </form>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted">Simulated WhatsApp. Real messages use the school&apos;s WhatsApp Business number.</p>
    </div>
  );
}
