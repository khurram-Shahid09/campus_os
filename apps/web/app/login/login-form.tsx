"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestCodeAction, verifyCodeAction } from "./actions";

export function LoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [e164, setE164] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      setError(null);
      const r = await requestCodeAction(phone);
      if (r.error) return setError(r.error);
      setE164(r.phone!);
      setDevCode(r.devCode);
    });
  const verify = () =>
    start(async () => {
      setError(null);
      const r = await verifyCodeAction(e164!, code);
      if (r.error) return setError(r.error);
      router.replace(r.next ?? "/app");
      router.refresh();
    });

  return (
    <div className="mt-6 space-y-3">
      {!e164 ? (
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="space-y-3">
          <label className="block text-sm font-medium">
            Mobile number
            <input
              data-testid="login-phone" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="0300 1234567" className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-3 text-lg tabular"
            />
          </label>
          <button data-testid="login-send" disabled={pending} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">
            {pending ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="space-y-3">
          <p className="text-sm text-muted">
            Code sent to <span className="font-medium text-ink tabular">{e164}</span>.{" "}
            <button type="button" className="text-brand underline" onClick={() => { setE164(null); setCode(""); }}>Change</button>
          </p>
          {devCode && (
            <p data-testid="dev-code" className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-warn">
              Test mode (WhatsApp not connected yet): your code is <b className="tabular">{devCode}</b>
            </p>
          )}
          <label className="block text-sm font-medium">
            6-digit code
            <input
              data-testid="login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-3 text-center text-2xl tracking-[0.4em] tabular"
            />
          </label>
          <button data-testid="login-verify" disabled={pending || code.length !== 6} className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">
            {pending ? "Checking…" : "Log in"}
          </button>
          <button type="button" onClick={send} disabled={pending} className="w-full text-sm text-brand">Send a new code</button>
        </form>
      )}
      {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
