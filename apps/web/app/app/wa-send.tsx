"use client";

import { useState, useTransition } from "react";
import { whatsappLink } from "@campusos/core";
import { markSentAction } from "./actions";

/**
 * Opens WhatsApp on this phone with the message typed in, and marks it sent in CampusOS.
 * Used until the WhatsApp Business API sends messages automatically (Stage 3).
 */
export function WaSend({ messageId, phone, text, compact = false }: { messageId: string; phone: string; text: string; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "sent" | "skipped">("idle");
  const [pending, start] = useTransition();
  if (state !== "idle") return <span className="text-sm text-muted">{state === "sent" ? "Sent ✓" : "Skipped"}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <a
        href={whatsappLink(phone, text)}
        target="_blank"
        rel="noreferrer"
        data-testid="wa-send"
        onClick={() => start(async () => { const r = await markSentAction(messageId); if (!r.error) setState("sent"); })}
        className={`inline-flex items-center rounded-lg bg-[#25D366] font-semibold text-white ${compact ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm"} ${pending ? "opacity-60" : ""}`}
      >
        Send on WhatsApp
      </a>
      {compact && (
        <button onClick={() => start(async () => { const r = await markSentAction(messageId, true); if (!r.error) setState("skipped"); })} className="text-xs text-muted underline">
          Skip
        </button>
      )}
    </span>
  );
}
