import { notFound } from "next/navigation";
import {
  AGING_BUCKETS,
  ageBalances,
  daysBetween,
  formatMoney,
  summarizeSavings,
  type AgingBucket,
  type RiskReason,
  type SavingsLine,
} from "@campusos/core";
import {
  getActiveStudentCount,
  getAttendanceOn,
  getCollections,
  getHighRiskStudents,
  getOpenBalances,
  getRiskCounts,
  getSavingsFacts,
  getSchoolBySlug,
  getStaffLateness,
  getTopDefaulters,
} from "@campusos/db/queries";
import { getConcessionRequests } from "@campusos/db/roles";
import { ButtonLink, PageTitle } from "@/components/ui";
import { getDb } from "@/lib/db";
import { decideConcessionAction } from "../actions";

export const dynamic = "force-dynamic";

const DEMO_SLUG = "demo-grammar-school";

const AGING_LABEL: Record<AgingBucket, string> = {
  not_due: "Not due yet",
  d0_30: "1–30 days late",
  d31_60: "31–60 days",
  d61_90: "61–90 days",
  d90_plus: "90+ days",
};

const SAVING_LABEL: Record<SavingsLine["key"], string> = {
  recovered: "Fees recovered by reminders",
  concessions: "Discounts stopped at approval",
  students_kept: "Students kept",
  staff_hours: "Office time saved on fee calls",
  teacher_hours: "Teacher time saved on roll call",
  printing: "Printing saved",
};

const hours = (min: number) => `${Math.round(min / 60)} hrs`;
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function savingValue(l: SavingsLine) {
  if (l.valueMinor !== undefined) return formatMoney(l.valueMinor);
  if (l.minutes !== undefined) return hours(l.minutes);
  return String(l.count ?? 0);
}

export default async function OwnerDashboard() {
  const db = getDb();
  const school = await getSchoolBySlug(db, DEMO_SLUG);
  if (!school) notFound();

  const settings = school.settings as { demoAsOf?: string; campusosLiveOn?: string; pricePerStudentMinor?: number };
  const asOf = settings.demoAsOf ? new Date(`${settings.demoAsOf}T00:00:00Z`) : new Date(new Date().toISOString().slice(0, 10));
  const yesterday = new Date(asOf.getTime() - 86_400_000);
  const monthStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const monthEnd = new Date(asOf.getTime() + 86_399_999);
  const liveOn = settings.campusosLiveOn ? new Date(`${settings.campusosLiveOn}T00:00:00Z`) : monthStart;

  const approvals = await getConcessionRequests(db, school.id);
  const [students, openRows, collectedYesterday, collectedMonth, monthFacts, sinceFacts, defaulters, attendance, risky, riskCounts, staffLate] =
    await Promise.all([
      getActiveStudentCount(db, school.id),
      getOpenBalances(db, school.id),
      getCollections(db, school.id, yesterday, yesterday),
      getCollections(db, school.id, monthStart, asOf),
      getSavingsFacts(db, school.id, monthStart, monthEnd),
      getSavingsFacts(db, school.id, liveOn, monthEnd),
      getTopDefaulters(db, school.id, asOf),
      getAttendanceOn(db, school.id, asOf),
      getHighRiskStudents(db, school.id),
      getRiskCounts(db, school.id),
      getStaffLateness(db, school.id, monthStart, asOf),
    ]);

  const subscriptionMinor = students * (settings.pricePerStudentMinor ?? 3000);
  const monthsLive = Math.max(1, Math.round(daysBetween(liveOn, asOf) / 30));
  const month = summarizeSavings(monthFacts, subscriptionMinor);
  const since = summarizeSavings(sinceFacts, subscriptionMinor * monthsLive);

  const aging = ageBalances(openRows, asOf);
  const overdueTotal = AGING_BUCKETS.filter((b) => b !== "not_due").reduce((a, b) => a + aging[b], 0);
  const maxBucket = Math.max(1, ...AGING_BUCKETS.map((b) => aging[b]));
  const attendancePct = attendance.total ? Math.round((attendance.present * 100) / attendance.total) : null;

  return (
    <main>
      <PageTitle
        role="Owner"
        title={school.name}
        sub={`As of ${dayFmt.format(asOf)}`}
        right={<ButtonLink href="/demo/owner/brief">📱 Today&apos;s Morning Brief</ButtonLink>}
      />

      {approvals.length > 0 && (
        <section className="mt-5 rounded-2xl border border-warn/40 bg-warn-soft p-4" data-testid="approvals">
          <h2 className="font-semibold">Needs your decision</h2>
          <p className="text-sm text-muted">Discounts can&apos;t be given silently any more. Each one waits for you.</p>
          <ul className="mt-3 space-y-2">
            {approvals.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm">
                <div>
                  <p className="font-semibold">
                    {a.requestedPct}% discount for {a.child}
                  </p>
                  <p className="text-xs text-muted">
                    “{a.reason}” · costs {formatMoney(Math.round((a.monthlyFeeMinor * a.requestedPct) / 100))}/month
                  </p>
                </div>
                <div className="flex gap-2">
                  <form action={decideConcessionAction}>
                    <input type="hidden" name="adjustmentId" value={a.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <button data-testid="reject-discount" className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white">
                      Reject
                    </button>
                  </form>
                  <form action={decideConcessionAction}>
                    <input type="hidden" name="adjustmentId" value={a.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <button className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold">Approve</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Savings hero */}
      <section className="mt-5 rounded-2xl bg-brand p-5 text-white shadow-sm">
        <p className="text-sm text-white/80">CampusOS earned you this month (measured)</p>
        <p className="tabular mt-1 text-4xl font-bold">{formatMoney(month.measuredMoneyMinor)}</p>
        <p className="mt-2 text-sm text-white/90">
          CampusOS cost: {formatMoney(month.subscriptionMinor)} ·{" "}
          {month.multiple !== null && month.multiple >= 1 ? (
            <strong>{month.multiple}× what you paid</strong>
          ) : (
            <span>not yet covering its cost</span>
          )}
        </p>
        <p className="mt-3 border-t border-white/20 pt-3 text-sm text-white/85">
          Since CampusOS started ({dayFmt.format(liveOn)}): <strong className="tabular">{formatMoney(since.measuredMoneyMinor)}</strong>{" "}
          measured, against {formatMoney(since.subscriptionMinor)} in fees
        </p>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {month.lines.map((l) => (
          <div key={l.key} className="rounded-xl border border-line bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-muted">{SAVING_LABEL[l.key]}</p>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                  l.kind === "measured" ? "bg-brand-soft text-brand" : "bg-paper text-muted"
                }`}
              >
                {l.kind}
              </span>
            </div>
            <p className="tabular mt-1 text-2xl font-semibold">{savingValue(l)}</p>
            {l.assumption && <p className="mt-1 text-xs text-muted">Assumes {l.assumption}</p>}
          </div>
        ))}
      </section>

      {/* Today */}
      <section className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Fees in yesterday" value={formatMoney(collectedYesterday.totalMinor)} sub={`${collectedYesterday.count} payments`} />
        <Stat label="Attendance today" value={attendancePct === null ? "–" : `${attendancePct}%`} sub={`${attendance.sessions} classes marked`} />
        <Stat label="Staff late today" value={String(staffLate.todayLate)} sub="of 48 staff" />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Outstanding */}
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">Unpaid fees</h2>
          <p className="tabular mt-1 text-3xl font-bold text-danger">{formatMoney(overdueTotal)}</p>
          <p className="text-sm text-muted">overdue · collected this month so far {formatMoney(collectedMonth.totalMinor)}</p>
          <ul className="mt-4 space-y-2">
            {AGING_BUCKETS.map((b) => (
              <li key={b} className="text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">{AGING_LABEL[b]}</span>
                  <span className="tabular font-medium">{formatMoney(aging[b])}</span>
                </div>
                <div className="mt-1 h-2 rounded bg-paper">
                  <div
                    className={`h-2 rounded ${b === "not_due" ? "bg-line" : b === "d0_30" ? "bg-warn/60" : "bg-danger/70"}`}
                    style={{ width: `${(aging[b] * 100) / maxBucket}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Who owes most */}
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">Who owes the most</h2>
          <p className="text-sm text-muted">Reminders are going out automatically. These may need a call.</p>
          <ul className="mt-3 divide-y divide-line">
            {defaulters.map((d) => (
              <li key={d.familyId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.family}</p>
                  <p className="text-xs text-muted">
                    {d.months} month{d.months > 1 ? "s" : ""} · oldest {daysBetween(d.oldestDue, asOf)} days late
                    {d.prefersVoice && " · gets voice notes"}
                  </p>
                </div>
                <span className="tabular shrink-0 font-semibold">{formatMoney(d.balanceMinor)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Dropout watch */}
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">Students you may lose</h2>
          <p className="text-sm text-muted">
            <span className="font-semibold text-danger">{riskCounts.high} high risk</span> · {riskCounts.watch} to watch. A call this
            week can keep them.
          </p>
          <ul className="mt-3 space-y-3">
            {risky.map((r) => (
              <li key={r.studentId} className="rounded-lg bg-danger-soft/60 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{r.name}</span>
                  <span className="tabular text-xs font-bold text-danger">risk {r.score}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{(r.reasons as RiskReason[]).map((x) => x.text).join(" · ")}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Staff */}
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-semibold">Staff punctuality this month</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Stat label="Late arrivals" value={String(staffLate.lateDays)} sub={`${staffLate.staffLate} staff`} />
            <Stat label="Minutes late" value={String(staffLate.lateMinutes)} sub="total" />
            <Stat label="Absences" value={String(staffLate.absentDays)} sub="staff-days" />
          </div>
          <p className="mt-3 text-xs text-muted">Deductions follow your school policy and are approved by you, never automatic.</p>
        </section>
      </div>

      <footer className="mt-10 text-center text-xs text-muted">
        {school.isDemo ? "Synthetic demo school. No real students, parents or payments. " : ""}
        Measured figures come from the school&apos;s own records. Estimates show their assumption and can be edited.
      </footer>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-0.5 text-lg font-semibold sm:text-xl">{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}
