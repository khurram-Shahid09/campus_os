"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncAttendanceAction, type AttendancePayload } from "../../actions";
import { enqueue, flushQueue } from "../../offline-queue";

type S = { id: string; name: string; gender: string | null; no: number | null };
type Mark = "present" | "absent" | "late";

/** Everyone starts present. Tap once = absent, twice = late, third = present. Saves offline if there is no internet. */
export function Register({ sectionId, title, date, students, initial }: {
  sectionId: string; title: string; date: string; students: S[]; initial: { absent: string[]; late: string[] } | null;
}) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, Mark>>(() => {
    const m: Record<string, Mark> = {};
    for (const s of students) m[s.id] = initial?.absent.includes(s.id) ? "absent" : initial?.late.includes(s.id) ? "late" : "present";
    return m;
  });
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "queued" | "error"; text?: string }>({ kind: "idle" });
  const started = useRef(Date.now());
  useEffect(() => { void flushQueue(); }, []);

  const tap = (id: string) => setMarks((m) => ({ ...m, [id]: m[id] === "present" ? "absent" : m[id] === "absent" ? "late" : "present" }));
  const absent = students.filter((s) => marks[s.id] === "absent");
  const late = students.filter((s) => marks[s.id] === "late");

  async function submit() {
    const payload: AttendancePayload = {
      sectionId, date, clientUuid: crypto.randomUUID(), durationSeconds: Math.round((Date.now() - started.current) / 1000),
      absentIds: absent.map((s) => s.id), lateIds: late.map((s) => s.id),
    };
    setState({ kind: "saving" });
    if (!navigator.onLine) {
      enqueue(payload);
      return setState({ kind: "queued" });
    }
    try {
      const r = await syncAttendanceAction(payload);
      if (r.error) return setState({ kind: "error", text: r.error });
      setState({ kind: "saved", text: `Saved. ${r.absent} absent${r.alerts ? `, ${r.alerts} parent message${r.alerts === 1 ? "" : "s"} ready in WhatsApp outbox` : ""}.` });
      router.refresh();
    } catch {
      enqueue(payload);
      setState({ kind: "queued" });
    }
  }

  return (
    <div className="mt-2">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="text-sm text-muted">Everyone is present. Tap a child who is absent (tap again for late).</p>
        </div>
        {initial && <span className="rounded bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">Already marked · editing</span>}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {students.map((s, i) => {
          const m = marks[s.id];
          return (
            <li key={s.id}>
              <button
                onClick={() => tap(s.id)}
                data-testid="student"
                aria-pressed={m !== "present"}
                className={`flex h-16 w-full flex-col items-start justify-center rounded-xl border px-3 text-left transition ${
                  m === "absent" ? "border-danger bg-danger text-white" : m === "late" ? "border-warn bg-warn-soft text-warn" : "border-line bg-white"
                }`}
              >
                <span className="text-xs opacity-70 tabular">{s.no ?? i + 1}</span>
                <span className="w-full truncate font-medium leading-tight">{s.name}</span>
                {m !== "present" && <span className="text-[11px] font-bold uppercase">{m}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 mt-4 border-t border-line bg-paper/95 py-3 backdrop-blur">
        <p className="mb-2 text-sm">
          <b className="tabular">{students.length - absent.length}</b> present · <b className="tabular text-danger">{absent.length}</b> absent{late.length ? ` · ${late.length} late` : ""}
        </p>
        <button onClick={submit} disabled={state.kind === "saving"} data-testid="submit-attendance"
          className="w-full rounded-xl bg-brand py-3.5 text-lg font-semibold text-white disabled:opacity-60">
          {state.kind === "saving" ? "Saving…" : initial ? "Save changes" : "Submit attendance"}
        </button>
        {state.kind === "saved" && <p data-testid="attendance-done" className="mt-2 rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">{state.text}</p>}
        {state.kind === "queued" && <p data-testid="attendance-queued" className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">No internet. Saved on this phone; it will be sent automatically when the internet is back.</p>}
        {state.kind === "error" && <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.text}</p>}
      </div>
    </div>
  );
}
