"use client";

import { useState } from "react";

/**
 * Voice-note bubble. In production this is an audio file generated from `ur` (text-to-speech) and sent on WhatsApp.
 * In the demo, the browser speaks it if an Urdu voice is installed; the transcript is always shown.
 */
export function VoiceNote({ ur, en, ivr = false }: { ur: string; en: string; ivr?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [showText, setShowText] = useState(false);

  const play = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return setShowText(true);
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(ur);
    u.lang = "ur-PK";
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith("ur"));
    if (voice) u.voice = voice;
    else setShowText(true);
    u.onend = () => setPlaying(false);
    setPlaying(true);
    synth.speak(u);
  };

  const bars = [3, 6, 9, 5, 8, 12, 7, 4, 10, 6, 9, 5, 7, 11, 6, 4, 8, 5, 9, 6];
  return (
    <div className="w-60" data-testid="voice-note">
      {ivr && <p className="mb-1 text-[11px] font-semibold text-warn">📞 Automated call</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={play}
          aria-label="Play voice note"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[#00a884] text-white"
        >
          {playing ? "■" : "▶"}
        </button>
        <div className="flex h-8 flex-1 items-center gap-[2px]" aria-hidden>
          {bars.map((h, i) => (
            <span key={i} className={`w-[3px] rounded ${playing ? "animate-pulse bg-[#00a884]" : "bg-muted/50"}`} style={{ height: `${h * 2}px` }} />
          ))}
        </div>
        <span className="text-[11px] text-muted">0:{String(Math.min(59, Math.ceil(ur.length / 9))).padStart(2, "0")}</span>
      </div>
      <button type="button" onClick={() => setShowText((v) => !v)} className="mt-1 text-[11px] text-brand underline">
        {showText ? "hide words" : "show words"}
      </button>
      {showText && (
        <div className="mt-1 rounded bg-paper p-2">
          <p dir="rtl" lang="ur" className="leading-loose">{ur}</p>
          <p className="text-xs text-muted">{en}</p>
        </div>
      )}
    </div>
  );
}
