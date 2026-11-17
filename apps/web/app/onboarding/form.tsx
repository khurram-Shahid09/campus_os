"use client";

import { useActionState } from "react";
import { createSchoolAction } from "../login/actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function OnboardingForm() {
  const [state, act, pending] = useActionState(createSchoolAction, null);
  const input = "mt-1 w-full rounded-xl border border-line bg-white px-3 py-2.5";
  return (
    <form action={act} className="mt-6 space-y-4">
      <label className="block text-sm font-medium">Your name<input name="ownerName" required className={input} data-testid="owner-name" /></label>
      <label className="block text-sm font-medium">School name<input name="schoolName" required minLength={3} className={input} data-testid="school-name" /></label>
      <label className="block text-sm font-medium">City<input name="city" className={input} /></label>
      <label className="block text-sm font-medium">
        School year starts in
        <select name="startMonth" defaultValue={4} className={input}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </label>
      {state?.error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button disabled={pending} data-testid="create-school" className="w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-60">
        {pending ? "Creating…" : "Create school"}
      </button>
    </form>
  );
}
