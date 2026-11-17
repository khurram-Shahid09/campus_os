import { daysBetween, formatMoney } from "@campusos/core";
import { getAttendanceOn, getTopDefaulters } from "@campusos/db/queries";
import { getCallList, getSectionsToday, getStaffToday } from "@campusos/db/roles";
import { Badge, Card, PageTitle, SavesNote, Stat } from "@/components/ui";
import { demoCtx } from "@/lib/ctx";
import { logFollowupAction } from "../actions";

export const dynamic = "force-dynamic";

const OUTCOME_LABEL: Record<string, string> = {
  will_return: "Will return",
  fee_plan_agreed: "Fee plan agreed",
  leaving: "Leaving",
  no_answer: "No answer",
};

export default async function PrincipalHome() {
  const { db, ctx } = await demoCtx("principal");
  const [sections, staff, callList, attendance, feeCalls] = await Promise.all([
    getSectionsToday(db, ctx.schoolId, ctx.asOf),
    getStaffToday(db, ctx.schoolId, ctx.asOf),
    getCallList(db, ctx.schoolId),
    getAttendanceOn(db, ctx.schoolId, ctx.asOf),
    getTopDefaulters(db, ctx.schoolId, ctx.asOf, 5),
  ]);
  const unmarked = sections.filter((s) => !s.marked);
  const absentStaff = staff.filter((s) => s.status === "absent");
  const lateStaff = staff.filter((s) => s.status === "late");
  const pct = attendance.total ? Math.round((attendance.present * 100) / attendance.total) : 0;

  return (
    <div className="space-y-5">
      <PageTitle role="Principal" title="Today at a glance" sub="Everything that needs you, on one screen." />
      <SavesNote>no walking class to class to collect registers, no hunting for who is absent, no guessing which families are about to leave.</SavesNote>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Student attendance" value={`${pct}%`} sub={`${attendance.sessions} of ${sections.length} classes marked`} />
        <Stat label="Classes not marked" value={String(unmarked.length)} tone={unmarked.length ? "danger" : "brand"} sub="teachers auto-reminded at 9:00" />
        <Stat label="Staff absent" value={String(absentStaff.length)} sub="cover needed" />
        <Stat label="Staff late" value={String(lateStaff.length)} sub={`${lateStaff.reduce((a, s) => a + s.minutesLate, 0)} min total`} />
      </div>

      <Card title="Students you may lose: call these families" sub="Attendance falling + fees unpaid. One call now can keep a year of fees.">
        <ul className="space-y-3">
          {callList.map((c) => (
            <li key={c.studentId} data-testid="call-item" className="rounded-xl border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {c.name} <span className="text-xs font-normal text-muted">· {c.classLabel}</span>
                  </p>
                  <p className="text-xs text-muted">{c.reasons.join(" · ")}</p>
                </div>
                <Badge tone="danger">risk {c.score}</Badge>
              </div>
              {c.followup ? (
                <p className="mt-2 text-sm font-semibold text-brand" data-testid="followup-done">✓ Called: {OUTCOME_LABEL[c.followup] ?? c.followup}</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(["will_return", "fee_plan_agreed", "no_answer", "leaving"] as const).map((o) => (
                    <form key={o} action={logFollowupAction}>
                      <input type="hidden" name="studentId" value={c.studentId} />
                      <input type="hidden" name="outcome" value={o} />
                      <button data-testid={`outcome-${o}`} className="rounded-full border border-line px-3 py-1 text-xs font-medium hover:border-brand hover:text-brand">
                        {OUTCOME_LABEL[o]}
                      </button>
                    </form>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Classes not marked yet">
          {unmarked.length === 0 ? (
            <p className="text-sm text-brand">All classes marked ✓</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {unmarked.map((s) => (
                <li key={s.id} className="flex justify-between py-2">
                  <span>{s.label}</span>
                  <span className="text-muted">{s.teacher}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Staff not on time today">
          <ul className="divide-y divide-line text-sm">
            {staff.map((s) => (
              <li key={s.id} className="flex justify-between gap-2 py-2">
                <span className="truncate">
                  {s.name} <span className="text-xs text-muted">· {s.designation}</span>
                </span>
                <span className={s.status === "absent" ? "font-semibold text-danger" : "text-warn"}>
                  {s.status === "absent" ? "Absent" : `${s.minutesLate} min late`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Fee cases for you" sub="Automatic reminders (voice note → message → call) did not work. These need the principal.">
        <ul className="divide-y divide-line text-sm">
          {feeCalls.map((d) => (
            <li key={d.familyId} className="flex justify-between gap-3 py-2">
              <span className="min-w-0 truncate">
                {d.family} <span className="text-xs text-muted">· {d.months} months · {daysBetween(d.oldestDue, ctx.asOf)} days</span>
              </span>
              <span className="tabular font-semibold text-danger">{formatMoney(d.balanceMinor)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
