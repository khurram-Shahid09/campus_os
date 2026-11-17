"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

export type FormState = { error?: string; ok?: string } | null;

export const inputCls = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";

/** A form posting to a server action `(prev, formData) => { error } | { ok }`; shows the message and resets on success. */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnOk = true,
  testId,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  resetOnOk?: boolean;
  testId?: string;
}) {
  const [state, act] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form ref={ref} action={act} className={className} data-testid={testId}>
      {children}
      {state?.error && <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state?.ok && <p role="status" className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">{state.ok}</p>}
    </form>
  );
}

export function Submit({ children, variant = "primary", testId, confirm }: { children: React.ReactNode; variant?: "primary" | "ghost" | "danger"; testId?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  const cls = {
    primary: "bg-brand text-white hover:bg-brand/90",
    ghost: "border border-line bg-white hover:bg-paper",
    danger: "bg-danger text-white hover:bg-danger/90",
  }[variant];
  return (
    <button
      type="submit"
      data-testid={testId}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={`inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-semibold disabled:opacity-60 ${cls}`}
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
      {hint && <span className="mt-0.5 block text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}
