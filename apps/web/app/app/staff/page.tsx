import { displayPkPhone } from "@campusos/core";
import { getClassesSetup, getStaffList } from "@campusos/db/app";
import { Badge, Card, PageTitle } from "@/components/ui";
import { ActionForm, Field, inputCls, Submit } from "@/components/form";
import { requireApp } from "@/lib/auth";
import { addStaffAction, assignTeacherAction, staffAttendanceAction } from "../actions";

export default async function Staff() {
  const { run } = await requireApp("staff.edit");
  const { staff, classes } = await run(async (tx, c) => ({ staff: await getStaffList(tx, c), classes: await getClassesSetup(tx, c) }));
  const marked = staff.filter((x) => x.todayStatus).length;
  return (
    <div className="space-y-5">
      <PageTitle role="Staff" title={`${staff.length} staff`} sub={`Today: ${marked} of ${staff.length} marked. Late minutes are kept for the monthly report.`} />

      <Card title="Staff attendance today">
        <ul className="divide-y divide-line">
          {staff.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="text-sm">
                <span className="font-semibold">{x.name}</span> <span className="text-muted">· {x.designation}{x.phone ? ` · ${displayPkPhone(x.phone)}` : ""}</span>{" "}
                {x.todayStatus && <Badge tone={x.todayStatus === "present" ? "brand" : x.todayStatus === "late" ? "warn" : "danger"}>{x.todayStatus}{x.todayStatus === "late" ? ` ${x.minutesLate}m` : ""}</Badge>}
              </div>
              <div className="flex flex-wrap gap-1">
                {(["present", "absent", "leave"] as const).map((st) => (
                  <ActionForm key={st} action={staffAttendanceAction}>
                    <input type="hidden" name="staffId" value={x.id} />
                    <input type="hidden" name="status" value={st} />
                    <Submit variant={x.todayStatus === st ? "primary" : "ghost"}>{st[0]!.toUpperCase() + st.slice(1)}</Submit>
                  </ActionForm>
                ))}
                <ActionForm action={staffAttendanceAction} className="flex gap-1">
                  <input type="hidden" name="staffId" value={x.id} />
                  <input type="hidden" name="status" value="late" />
                  <input name="minutesLate" type="number" min={1} max={240} placeholder="min" className="w-16 rounded-lg border border-line px-2 text-sm" required />
                  <Submit variant={x.todayStatus === "late" ? "primary" : "ghost"}>Late</Submit>
                </ActionForm>
              </div>
            </li>
          ))}
          {!staff.length && <li className="py-3 text-sm text-muted">No staff yet. Staff you give a login in Setup appear here too.</li>}
        </ul>
      </Card>

      <Card title="Class teachers" sub="The class teacher marks attendance for that class on their phone.">
        <ul className="divide-y divide-line">
          {classes.flatMap((c) => c.sections.map((sec) => (
            <li key={sec.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="font-medium">{c.name} {sec.name} <span className="text-muted">({sec.students})</span></span>
              <ActionForm action={assignTeacherAction} resetOnOk={false} className="flex gap-2">
                <input type="hidden" name="sectionId" value={sec.id} />
                <select name="staffId" defaultValue={sec.classTeacherStaffId ?? ""} className="rounded-lg border border-line px-2 py-1 text-sm" aria-label={`Class teacher for ${c.name} ${sec.name}`}>
                  <option value="">— none —</option>
                  {staff.map((x) => <option key={x.id} value={x.id}>{x.name}{x.userId ? "" : " (no login)"}</option>)}
                </select>
                <Submit variant="ghost">Save</Submit>
              </ActionForm>
            </li>
          )))}
        </ul>
      </Card>

      <Card title="Add staff without a login" sub="For staff who don't use a phone (e.g. peon, guard). To give someone a login, use Setup → Team logins.">
        <ActionForm action={addStaffAction} className="grid gap-3 sm:grid-cols-4">
          <Field label="Name"><input name="name" required className={inputCls} /></Field>
          <Field label="Designation"><input name="designation" placeholder="Teacher / Peon / Driver" className={inputCls} /></Field>
          <Field label="Phone"><input name="phone" inputMode="tel" className={inputCls} /></Field>
          <div className="flex items-end"><Submit>Add</Submit></div>
        </ActionForm>
      </Card>
    </div>
  );
}
