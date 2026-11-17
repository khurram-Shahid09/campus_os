import { displayPkPhone, ROLE_LABEL, STAFF_ROLES } from "@campusos/core";
import { getClassesSetup, getFeeHeads, getTeam } from "@campusos/db/app";
import { Card, PageTitle } from "@/components/ui";
import { ActionForm, Field, inputCls, Submit } from "@/components/form";
import { requireApp } from "@/lib/auth";
import { addClassAction, addFeeHeadAction, addSectionAction, inviteAction, removeMemberAction, saveClassFeesAction, saveSettingsAction } from "../actions";

const FREQ: Record<string, string> = { monthly: "Every month", term: "Per term", annual: "Once a year", one_time: "One time" };

export default async function Setup() {
  const { ctx, session, run } = await requireApp("school.setup");
  const { classes, heads, team } = await run(async (tx, c) => ({
    classes: await getClassesSetup(tx, c),
    heads: await getFeeHeads(tx, c),
    team: await getTeam(tx, c),
  }));
  const rs = (minor?: number) => (minor === undefined ? "" : String(Math.round(minor / 100)));

  return (
    <div className="space-y-5">
      <PageTitle role="Setup" title="School setup" sub="Classes, fees and who can log in." />

      <Card title="School">
        <ActionForm action={saveSettingsAction} resetOnOk={false} className="grid gap-3 sm:grid-cols-4">
          <Field label="School name"><input name="name" defaultValue={ctx.schoolName} required className={inputCls} /></Field>
          <Field label="City"><input name="city" defaultValue={ctx.settings.city ?? ""} className={inputCls} /></Field>
          <Field label="Fee due day" hint="Day of the month fees are due"><input name="dueDay" type="number" min={1} max={28} defaultValue={ctx.settings.dueDay ?? 10} className={inputCls} /></Field>
          <div className="flex items-end"><Submit>Save</Submit></div>
        </ActionForm>
      </Card>

      <Card title="Classes and sections" sub="Uploading your register creates these for you. Add any that are missing.">
        <ul className="divide-y divide-line text-sm">
          {classes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <span className="font-semibold">{c.name}</span>{" "}
                <span className="text-muted">
                  {c.sections.map((x) => `${x.name} (${x.students})`).join(" · ") || "no sections"}
                </span>
              </div>
              <ActionForm action={addSectionAction} className="flex gap-2">
                <input type="hidden" name="classId" value={c.id} />
                <input name="name" placeholder="New section" className="w-28 rounded-lg border border-line px-2 py-1 text-sm" required />
                <Submit variant="ghost">Add</Submit>
              </ActionForm>
            </li>
          ))}
          {!classes.length && <li className="py-2 text-muted">No classes yet.</li>}
        </ul>
        <ActionForm action={addClassAction} className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-4" testId="add-class">
          <Field label="Class name"><input name="name" placeholder="Class 6 / Nursery" required className={inputCls} /></Field>
          <Field label="Sections" hint="e.g. A, B"><input name="sections" defaultValue="A" className={inputCls} /></Field>
          <div className="flex items-end"><Submit>Add class</Submit></div>
        </ActionForm>
      </Card>

      <Card title="Fees" sub="Monthly fees are billed every month. Other fees are added only when you choose them in the invoice run." >
        <div id="fees" />
        {classes.length > 0 && heads.length > 0 ? (
          <ActionForm action={saveClassFeesAction} resetOnOk={false} testId="fee-grid">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-1 pr-3">Class</th>
                    {heads.map((h) => <th key={h.id} className="px-2 py-1">{h.name}<br /><span className="font-normal">{FREQ[h.frequency] ?? h.frequency} · Rs</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => (
                    <tr key={c.id} className="border-t border-line">
                      <td className="py-1.5 pr-3 font-medium">{c.name}<input type="hidden" name={`name:${c.id}`} value={c.name} /></td>
                      {heads.map((h) => (
                        <td key={h.id} className="px-2 py-1.5">
                          <input type="hidden" name={`was:${c.id}:${h.id}`} value={rs(c.fees[h.id])} />
                          <input name={`fee:${c.id}:${h.id}`} defaultValue={rs(c.fees[h.id])} inputMode="numeric" placeholder="0"
                            className="w-24 rounded-lg border border-line px-2 py-1 text-right tabular" aria-label={`${h.name} for ${c.name}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3"><Submit testId="save-fees">Save fees</Submit></div>
          </ActionForm>
        ) : (
          <p className="text-sm text-muted">Add classes first.</p>
        )}
        <ActionForm action={addFeeHeadAction} className="mt-4 grid gap-3 border-t border-line pt-3 sm:grid-cols-4">
          <Field label="New fee type"><input name="name" placeholder="Exam fee / Annual charges" required className={inputCls} /></Field>
          <Field label="Charged">
            <select name="frequency" className={inputCls} defaultValue="term">
              {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <div className="flex items-end"><Submit variant="ghost">Add fee type</Submit></div>
        </ActionForm>
      </Card>

      <Card title="Team logins" sub="Each person logs in with their own phone number. Teachers see only attendance for their class.">
        <div id="team" />
        <ul className="divide-y divide-line text-sm" data-testid="team">
          {team.map((m) => (
            <li key={`${m.userId}-${m.role}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <span className="font-semibold">{m.name || "(name not set)"}</span>{" "}
                <span className="text-muted">· {ROLE_LABEL[m.role as keyof typeof ROLE_LABEL] ?? m.role} · <span className="tabular">{displayPkPhone(m.phone)}</span>
                  {m.lastLoginAt ? "" : " · not logged in yet"}</span>
              </div>
              {m.userId !== session.user.id && (
                <ActionForm action={removeMemberAction}>
                  <input type="hidden" name="userId" value={m.userId} />
                  <input type="hidden" name="role" value={m.role} />
                  <Submit variant="ghost" confirm={`Remove ${m.name}'s access?`}>Remove</Submit>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
        <ActionForm action={inviteAction} className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-5" testId="invite">
          <Field label="Name"><input name="name" required className={inputCls} /></Field>
          <Field label="Mobile number"><input name="phone" inputMode="tel" placeholder="0300 1234567" required className={inputCls} /></Field>
          <Field label="Role">
            <select name="role" className={inputCls} defaultValue="teacher">
              {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </Field>
          <Field label="Designation" hint="optional"><input name="designation" placeholder="Class teacher" className={inputCls} /></Field>
          <div className="flex items-end"><Submit>Give access</Submit></div>
        </ActionForm>
        <p className="mt-2 text-xs text-muted">After adding a teacher, choose their class on the Staff page.</p>
      </Card>
    </div>
  );
}
