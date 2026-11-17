import { can, periodOf } from "@campusos/core";
import { Card, PageTitle } from "@/components/ui";
import { requireApp } from "@/lib/auth";

export default async function Reports() {
  const { ctx } = await requireApp("students.view");
  const month = periodOf(ctx.today);
  const first = `${month}-01`;
  const today = ctx.today.toISOString().slice(0, 10);
  const btn = "rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white";
  const input = "rounded-lg border border-line px-2 py-1.5 text-sm";
  return (
    <div className="space-y-4">
      <PageTitle role="Reports" title="Download reports" sub="Files open in Excel (Urdu names included). Every number comes straight from the records." />
      <div className="grid gap-4 md:grid-cols-2">
        {can(ctx.role, "fees.view") && (
          <Card title="Who owes fees" sub="Every family with overdue fees, oldest and largest first, with phone numbers.">
            <a href="/app/reports/defaulters" className={btn} data-testid="report-defaulters">Download</a>
          </Card>
        )}
        {can(ctx.role, "fees.view") && (
          <Card title="Payments (day book)" sub="Every receipt with method, reference and who received it. Reversals included.">
            <form action="/app/reports/payments" className="flex flex-wrap items-end gap-2">
              <input type="date" name="from" defaultValue={first} className={input} aria-label="From" />
              <input type="date" name="to" defaultValue={today} className={input} aria-label="To" />
              <button className={btn}>Download</button>
            </form>
          </Card>
        )}
        {can(ctx.role, "attendance.view") && (
          <Card title="Student attendance for a month" sub="Present, late, absent and % per student, by class.">
            <form action="/app/reports/attendance" className="flex flex-wrap items-end gap-2">
              <input type="month" name="month" defaultValue={month} className={input} aria-label="Month" />
              <button className={btn}>Download</button>
            </form>
          </Card>
        )}
        {can(ctx.role, "staff.edit") && (
          <Card title="Staff attendance and late minutes" sub="For the salary sheet: days late, total minutes late, absences and leave.">
            <form action="/app/reports/staff" className="flex flex-wrap items-end gap-2">
              <input type="month" name="month" defaultValue={month} className={input} aria-label="Month" />
              <button className={btn}>Download</button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
