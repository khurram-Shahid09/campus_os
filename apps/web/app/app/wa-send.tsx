"use client";

import { useState, useTransition } from "react";
import { whatsappLink } from "@campusos/core";
import { markSentAction } from "./actions";

/**
 * Opens WhatsApp on this phone with the message typed in, and records it as really sent (a fee reminder sent
 * this way earns "recovered" credit; a simulated one does not). Used until the Business API sends by itself.
 */
export function WaSend({ messageId, phone, text, compact = false, label = "Send on WhatsApp", allowSkip = false }: {
  messageId: string; phone: string; text: string; compact?: boolean; label?: string; allowSkip?: boolean;
}) {
  const [state, setState] = useState<"idle" | "sent" | "skipped">("idle");
  const [pending, start] = useTransition();
  if (state !== "idle") return <span className="text-xs text-muted">{state === "sent" ? "Sent from your phone ✓" : "Skipped"}</span>;
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
        {label}
      </a>
      {allowSkip && (
        <button onClick={() => start(async () => { const r = await markSentAction(messageId, true); if (!r.error) setState("skipped"); })} className="text-xs text-muted underline">
          Skip
        </button>
      )}
    </span>
  );
}
