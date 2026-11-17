import Link from "next/link";
import { can, displayPkPhone, formatMoney } from "@campusos/core";
import { getClassesSetup, listStudents } from "@campusos/db/app";
import { ButtonLink, Card, PageTitle } from "@/components/ui";
import { requireApp } from "@/lib/auth";

export default async function Students({ searchParams }: { searchParams: Promise<{ q?: string; section?: string; status?: string }> }) {
  const { ctx, run } = await requireApp("students.view");
  const sp = await searchParams;
  const status = sp.status === "withdrawn" ? "withdrawn" : "active";
  const { classes, students } = await run(async (tx, c) => ({
    classes: await getClassesSetup(tx, c),
    students: await listStudents(tx, c, { q: sp.q, sectionId: sp.section || undefined, status, limit: 300 }),
  }));
  const showMoney = can(ctx.role, "fees.view");
  return (
    <div className="space-y-4">
      <PageTitle
        role="Students"
        title={`${students.length}${students.length === 300 ? "+" : ""} ${status === "active" ? "students" : "withdrawn"}`}
        right={can(ctx.role, "students.edit") ? (
          <div className="flex gap-2">
            <ButtonLink href="/app/students/import" variant="ghost">Upload Excel</ButtonLink>
            <ButtonLink href="/app/students/new">Add student</ButtonLink>
          </div>
        ) : undefined}
      />
      <form className="flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Name, father, GR no. or phone" className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm" data-testid="student-search" />
        <select name="section" defaultValue={sp.section ?? ""} className="rounded-lg border border-line bg-white px-2 py-2 text-sm">
          <option value="">All classes</option>
          {classes.flatMap((c) => c.sections.map((x) => <option key={x.id} value={x.id}>{c.name} {x.name}</option>))}
        </select>
        <select name="status" defaultValue={status} className="rounded-lg border border-line bg-white px-2 py-2 text-sm">
          <option value="active">Active</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
        <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">Search</button>
      </form>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 pr-2">GR</th><th className="pr-2">Name</th><th className="pr-2">Class</th><th className="pr-2">Father / guardian</th><th className="pr-2">Phone</th>
                {showMoney && <th className="text-right">Family owes</th>}
              </tr>
            </thead>
            <tbody>
              {students.map((x) => (
                <tr key={x.id} className="border-t border-line">
                  <td className="py-1.5 pr-2 tabular text-muted">{x.admissionNo}</td>
                  <td className="pr-2"><Link href={`/app/students/${x.id}`} className="font-medium text-brand hover:underline">{x.name}</Link></td>
                  <td className="pr-2 whitespace-nowrap">{x.className ? `${x.className} ${x.section}` : "—"}</td>
                  <td className="pr-2">{x.guardianName}</td>
                  <td className="pr-2 whitespace-nowrap tabular">{x.phone ? displayPkPhone(x.phone) : <span className="text-warn">missing</span>}</td>
                  {showMoney && <td className={`text-right tabular ${x.balanceMinor > 0 ? "text-danger" : "text-muted"}`}>{x.balanceMinor > 0 ? formatMoney(x.balanceMinor) : "—"}</td>}
                </tr>
              ))}
              {!students.length && (
                <tr><td colSpan={6} className="py-6 text-center text-muted">No students found. <Link href="/app/students/import" className="text-brand underline">Upload your register</Link>.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
