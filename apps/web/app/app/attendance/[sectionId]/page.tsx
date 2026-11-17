import Link from "next/link";
import { notFound } from "next/navigation";
import { getRoster, markableSectionIds } from "@campusos/db/app";
import { requireApp } from "@/lib/auth";
import { Register } from "./register";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SectionAttendance({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = await params;
  if (!UUID.test(sectionId)) notFound();
  const { ctx, run } = await requireApp("attendance.mark");
  const data = await run(async (tx, c) => {
    const allowed = await markableSectionIds(tx, c);
    if (allowed !== "all" && !allowed.includes(sectionId)) return null;
    return getRoster(tx, c, sectionId, c.today);
  });
  if (!data) notFound();
  const status = Object.fromEntries(data.records.map((r) => [r.studentId, r.status]));
  return (
    <div className="mx-auto max-w-lg">
      <Link href="/app/attendance" className="text-sm text-muted">← All classes</Link>
      <Register
        sectionId={sectionId}
        title={`${data.section.className} ${data.section.name}`}
        date={ctx.today.toISOString().slice(0, 10)}
        students={data.students.map((s) => ({ id: s.id, name: s.name, gender: s.gender, no: s.rollNo ?? null }))}
        initial={data.session ? { absent: Object.keys(status).filter((k) => status[k] === "absent"), late: Object.keys(status).filter((k) => status[k] === "late") } : null}
      />
    </div>
  );
}
