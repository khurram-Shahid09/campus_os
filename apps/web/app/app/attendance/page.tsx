import Link from "next/link";
import { getSectionsWithStatus, markableSectionIds } from "@campusos/db/app";
import { Badge, Card, PageTitle } from "@/components/ui";
import { requireApp } from "@/lib/auth";

export default async function Attendance() {
  const { ctx, run } = await requireApp("attendance.mark");
  const sections = await run(async (tx, c) => getSectionsWithStatus(tx, c, c.today, await markableSectionIds(tx, c)));
  const left = sections.filter((x) => !x.markedAt).length;
  return (
    <div className="space-y-4">
      <PageTitle
        role="Attendance"
        title={left ? `${left} class${left === 1 ? "" : "es"} to mark` : sections.length ? "All classes marked" : "No class assigned"}
        sub={ctx.today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
      />
      {!sections.length && (
        <Card><p className="text-sm">{ctx.role === "teacher" ? "You are not class teacher of any class yet. Ask the principal to choose your class on the Staff page." : "Add classes in Setup first."}</p></Card>
      )}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((x) => (
          <li key={x.id}>
            <Link href={`/app/attendance/${x.id}`} data-testid="section-card"
              className={`block rounded-2xl border bg-white p-4 hover:shadow-sm ${x.markedAt ? "border-line" : "border-warn/40"}`}>
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold">{x.className} {x.name}</p>
                {x.markedAt ? <Badge tone="brand">Done</Badge> : <Badge tone="warn">Not marked</Badge>}
              </div>
              <p className="mt-1 text-sm text-muted">
                {x.students} students{x.teacher ? ` · ${x.teacher}` : ""}
                {x.markedAt ? ` · ${x.absent ?? 0} absent` : ""}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
