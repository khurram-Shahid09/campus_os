import Link from "next/link";
import { redirect } from "next/navigation";
import { ageBalances, can, formatMoney, periodLabel, periodOf } from "@campusos/core";
import { getActiveStudentCount, getAttendanceOn, getCollections, getOpenBalances, getSavingsFacts } from "@campusos/db/queries";
import { getBilledForPeriod, getDiscountRequests, getFeeCalls, getRecoveredThisMonth, getRiskList, getPaymentsOnDay, getRecentActivity, getSectionsWithStatus, getSetupProgress } from "@campusos/db/app";
import { Badge, ButtonLink, Card, PageTitle, Stat } from "@/components/ui";
import { requireApp } from "@/lib/auth";
import { DiscountDecision } from "./discount-decision";

export default async function Home({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { ctx, run } = await requireApp();
  if (ctx.role === "teacher") redirect("/app/attendance");
  const { denied } = await searchParams;
  const period = periodOf(ctx.today);
  const monthStart = new Date(Date.UTC(ctx.today.getUTCFullYear(), ctx.today.getUTCMonth(), 1));

  const data = await run(async (tx, c) => {
    const billed = await getBilledForPeriod(tx, c, period);
    return {
      progress: await getSetupProgress(tx, c),
      students: await getActiveStudentCount(tx, c.schoolId),
      billedMinor: billed.totalMinor,
      slips: billed.count,
      collectedMonth: await getCollections(tx, c.schoolId, monthStart, c.today),
      collectedToday: await getPaymentsOnDay(tx, c, c.today),
      aging: ageBalances(await getOpenBalances(tx, c.schoolId), c.today),
      attendance: await getAttendanceOn(tx, c.schoolId, c.today),
      sections: await getSectionsWithStatus(tx, c, c.today, "all"),
      requests: can(c.role, "fees.discount.approve") ? await getDiscountRequests(tx, c) : [],
      savings: await getSavingsFacts(tx, c.schoolId, monthStart, new Date()),
      activity: can(c.role, "dashboard.owner") ? await getRecentActivity(tx, c, 10) : [],
      recovered: await getRecoveredThisMonth(tx, c.schoolId, c.today),
      calls: can(c.role, "attendance.mark.any")
        ? (await getFeeCalls(tx, c.schoolId)).length + (await getRiskList(tx, c.schoolId)).filter((r) => r.band === "high").length
        : 0,
    };
  });

  const p = data.progress;
  const steps = [
    { done: p.students > 0, label: "Upload your student register (Excel) or add students", href: "/app/students/import" },
    { done: p.fees > 0, label: "Set the monthly fee for each class", href: "/app/setup#fees" },
    { done: p.team > 1, label: "Invite your fee clerk, principal and teachers", href: "/app/setup#team" },
    { done: p.invoices > 0, label: "Make this month's fee slips", href: "/app/fees" },
  ];
  const setupLeft = steps.filter((x) => !x.done).length;
  const outstanding = Object.values(data.aging).reduce((a, b) => a + b, 0);
  const overdue = outstanding - data.aging.not_due;
  const todayTotal = data.collectedToday.filter((x) => x.status !== "reversal").reduce((a, x) => a + x.amountMinor, 0);
  const marked = data.sections.filter((x) => x.markedAt).length;
  const showMoney = can(ctx.role, "fees.view");

  return (
    <div className="space-y-5">
      <PageTitle
        role="Today"
        title={ctx.today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
        right={
          <div className="flex gap-2">
            {data.calls > 0 && <ButtonLink href="/app/calls" variant="ghost">{data.calls} call{data.calls === 1 ? "" : "s"} to make</ButtonLink>}
            {can(ctx.role, "dashboard.owner") && <ButtonLink href="/app/brief">Morning Brief</ButtonLink>}
          </div>
        }
      />
      {denied && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">That page is not available for your role.</p>}

      {setupLeft > 0 && can(ctx.role, "school.setup") && (
        <Card title="Get your school running" sub={`${steps.length - setupLeft} of ${steps.length} done`}>
          <ol className="space-y-2" data-testid="setup-steps">
            {steps.map((x, i) => (
              <li key={x.label} className="flex items-center gap-3 text-sm">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${x.done ? "bg-brand text-white" : "bg-paper text-muted"}`}>{x.done ? "✓" : i + 1}</span>
                {x.done ? <span className="text-muted line-through">{x.label}</span> : <Link href={x.href} className="font-medium text-brand underline">{x.label}</Link>}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {data.requests.length > 0 && (
        <Card title="Needs your decision" sub="Discount requests. A discount is money the school gives up every month.">
          <ul className="divide-y divide-line">
            {data.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="text-sm">
                  <Link href={`/app/students/${r.studentId}`} className="font-semibold hover:underline">{r.student}</Link>: {r.percent}% off · <span className="text-muted">{r.reason}</span>
                </div>
                <DiscountDecision id={r.id} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {showMoney && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Collected today" value={formatMoney(todayTotal)} sub={`${data.collectedToday.filter((x) => x.status === "confirmed").length} receipts`} tone="brand" />
          <Stat label={`Collected in ${periodLabel(period).split(" ")[0]}`} value={formatMoney(data.collectedMonth.totalMinor)} sub={data.billedMinor ? `of ${formatMoney(data.billedMinor)} billed` : "no slips made yet"} />
          <Stat label="Overdue (all months)" value={formatMoney(overdue)} tone={overdue ? "danger" : undefined} sub="past due date" />
          <Stat label="Active students" value={String(data.students)} sub={`${p.phones} parents on WhatsApp`} />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Attendance today" sub={data.sections.length ? `${marked} of ${data.sections.length} classes marked` : "Add classes first"}>
          {data.attendance.total > 0 && (
            <p className="mb-3 text-sm">
              <b className="tabular">{data.attendance.present}</b> of {data.attendance.total} present ({Math.round((data.attendance.present / data.attendance.total) * 100)}%)
            </p>
          )}
          <ul className="flex flex-wrap gap-1.5">
            {data.sections.map((x) => (
              <li key={x.id}>
                <Badge tone={x.markedAt ? "brand" : "warn"}>{x.className} {x.name}{x.markedAt ? ` · ${x.absent ?? 0} absent` : " · not marked"}</Badge>
              </li>
            ))}
          </ul>
          {can(ctx.role, "attendance.mark.any") && <div className="mt-3"><ButtonLink href="/app/attendance" variant="ghost">Open attendance</ButtonLink></div>}
        </Card>

        {showMoney && (
          <Card title="Unpaid fees by age" sub="Older money is harder to recover. Chase the right side first.">
            <div className="grid grid-cols-5 gap-1 text-center text-xs">
              {(["not_due", "d0_30", "d31_60", "d61_90", "d90_plus"] as const).map((k) => (
                <div key={k} className={`rounded-lg p-2 ${k === "d90_plus" || k === "d61_90" ? "bg-danger-soft" : "bg-paper"}`}>
                  <p className="text-muted">{{ not_due: "Not due", d0_30: "1–30 d", d31_60: "31–60 d", d61_90: "61–90 d", d90_plus: "90+ d" }[k]}</p>
                  <p className="mt-1 font-semibold tabular">{formatMoney(data.aging[k]).replace("Rs ", "")}</p>
                </div>
              ))}
            </div>
            <div className="mt-3"><ButtonLink href="/app/fees#defaulters" variant="ghost">See who owes</ButtonLink></div>
          </Card>
        )}
      </div>

      {can(ctx.role, "dashboard.owner") && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="What CampusOS did this month" sub="Counted from your own records. Time and money estimates come after a few weeks of use.">
            <ul className="space-y-1.5 text-sm" data-testid="measured">
              <li><b className="tabular text-brand">{formatMoney(data.recovered.recoveredMinor)}</b> paid within 7 days of a CampusOS reminder ({data.recovered.payments} payments)</li>
              <li><b className="tabular">{data.savings.attendanceSessions}</b> class registers taken on phone instead of paper</li>
              <li><b className="tabular">{data.savings.digitalPages}</b> fee slips / records made without writing by hand</li>
              <li><b className="tabular">{data.savings.automatedReminders}</b> WhatsApp messages sent from the outbox</li>
              <li><b className="tabular">{formatMoney(data.savings.concessionsControlledMinor)}</b> kept by rejecting discount requests</li>
            </ul>
          </Card>
          <Card title="Recent activity" sub="Every change to money and attendance is recorded.">
            <ul className="space-y-1 text-sm">
              {data.activity.map((a) => (
                <li key={a.id} className="flex justify-between gap-3">
                  <span className="truncate"><span className="font-medium">{a.actor || "Someone"}</span> {a.action} {a.entity.replace(/_/g, " ")}</span>
                  <span className="shrink-0 text-xs text-muted">{a.createdAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" })}</span>
                </li>
              ))}
              {!data.activity.length && <li className="text-muted">Nothing yet.</li>}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
