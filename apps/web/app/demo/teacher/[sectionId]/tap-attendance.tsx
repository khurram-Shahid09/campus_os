"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { submitAttendanceAction } from "../../actions";

interface Student {
  id: string;
  name: string;
}

export function TapAttendance({ sectionId, label, teacher, students }: { sectionId: string; label: string; teacher: string; students: Student[] }) {
  const [absent, setAbsent] = useState<Set<string>>(new Set());
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<{ total: number; absent: number; alerts: number; seconds: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const started = useRef(Date.now());

  useEffect(() => {
    if (result) return;
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [result]);

  const toggle = (id: string) =>
    setAbsent((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submit = () =>
    start(async () => {
      setError(null);
      const took = (Date.now() - started.current) / 1000;
      try {
        const r = await submitAttendanceAction({ sectionId, absentStudentIds: [...absent], durationSeconds: took });
        setResult({ total: r.total, absent: r.absent, alerts: r.alerts, seconds: Math.round(took) });
      } catch {
        setError("Could not save. In the real app this stays on the phone and syncs when internet is back.");
      }
    });

  if (result) {
    return (
      <div className="mx-auto max-w-md space-y-4" data-testid="attendance-done">
        <div className="rounded-2xl bg-brand p-6 text-center text-white">
          <p className="text-5xl">✓</p>
          <p className="mt-2 text-xl font-semibold">{label} done in {result.seconds} seconds</p>
          <p className="mt-1 text-white/85">
            {result.total - result.absent} present · {result.absent} absent
          </p>
        </div>
        <div className="rounded-xl border border-line bg-white p-4 text-sm">
          <p className="font-semibold">What happened automatically</p>
          <ul className="mt-2 space-y-1.5 text-muted">
            <li>🔊 {result.alerts} parent{result.alerts === 1 ? "" : "s"} got an Urdu voice note on WhatsApp</li>
            <li>📊 Monthly attendance register updated, no totalling at month end</li>
            <li>⚠️ Repeated absences feed the principal&apos;s &quot;students you may lose&quot; list</li>
          </ul>
        </div>
        <Link href="/demo/teacher" className="block rounded-xl border border-line bg-white p-3 text-center font-semibold">
          Back to classes
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md pb-24">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">Teacher · {teacher}</p>
          <h1 className="text-xl font-semibold">{label}</h1>
          <p className="text-sm text-muted">Everyone is present. Tap only who is absent.</p>
        </div>
        <div className="text-right">
          <p className="tabular text-2xl font-bold text-brand" data-testid="timer">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </p>
          <p className="text-[11px] text-muted">timer</p>
        </div>
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-2">
        {students.map((s, i) => {
          const isAbsent = absent.has(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => toggle(s.id)}
                data-testid="student"
                aria-pressed={isAbsent}
                className={`flex w-full items-center gap-2 rounded-xl border p-3 text-left text-sm transition active:scale-[0.98] ${
                  isAbsent ? "border-danger bg-danger-soft" : "border-line bg-white"
                }`}
              >
                <span className={`tabular grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${isAbsent ? "bg-danger text-white" : "bg-brand-soft text-brand"}`}>
                  {isAbsent ? "A" : i + 1}
                </span>
                <span className="truncate">{s.name}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white p-3">
        <div className="mx-auto max-w-md">
          {error && <p className="mb-2 text-sm text-danger">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            data-testid="submit-attendance"
            className="w-full rounded-xl bg-brand py-3.5 text-base font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : `Submit · ${students.length - absent.size} present, ${absent.size} absent`}
          </button>
        </div>
      </div>
    </div>
  );
}
