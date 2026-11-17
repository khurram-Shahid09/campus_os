import { notFound } from "next/navigation";
import { getSectionRoster, getSectionsToday } from "@campusos/db/roles";
import { demoCtx } from "@/lib/ctx";
import { TapAttendance } from "./tap-attendance";

export const dynamic = "force-dynamic";

export default async function MarkSection({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(sectionId)) notFound();
  const { db, ctx } = await demoCtx("teacher");
  const sections = await getSectionsToday(db, ctx.schoolId, ctx.asOf);
  const section = sections.find((s) => s.id === sectionId);
  if (!section) notFound();
  const roster = await getSectionRoster(db, ctx.schoolId, sectionId);
  return (
    <TapAttendance
      sectionId={sectionId}
      label={section.label}
      teacher={section.teacher ?? ""}
      students={roster.map((r) => ({ id: r.id, name: r.name }))}
    />
  );
}
