import Link from "next/link";
import { getSectionsToday } from "@campusos/db/roles";
import { PageTitle, SavesNote } from "@/components/ui";
import { demoCtx } from "@/lib/ctx";

export const dynamic = "force-dynamic";

export default async function TeacherHome() {
  const { db, ctx } = await demoCtx("teacher");
  const sections = await getSectionsToday(db, ctx.schoolId, ctx.asOf);
  const pending = sections.filter((s) => !s.marked);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageTitle role="Teacher" title="Today's attendance" sub={`${pending.length} of ${sections.length} classes not marked yet`} />
      <SavesNote>about 30 seconds per class instead of a 5–10 minute roll call. Works offline in the real app and syncs later.</SavesNote>
      <ul className="space-y-2">
        {sections.map((s) => (
          <li key={s.id}>
            <Link
              href={`/demo/teacher/${s.id}`}
              data-testid={s.marked ? undefined : "unmarked-section"}
              className={`flex items-center justify-between rounded-xl border p-4 ${s.marked ? "border-line bg-white" : "border-warn/40 bg-warn-soft"}`}
            >
              <div>
                <p className="font-semibold">{s.label}</p>
                <p className="text-xs text-muted">
                  {s.teacher ?? "No class teacher"} · {s.students} students
                </p>
              </div>
              <span className={`text-sm font-semibold ${s.marked ? "text-brand" : "text-warn"}`}>{s.marked ? "Done ✓" : "Mark now →"}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
