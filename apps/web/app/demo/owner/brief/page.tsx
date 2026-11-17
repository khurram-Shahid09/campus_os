import { morningBrief } from "@campusos/core";
import { getAttendanceOn, getCollections, getRiskCounts, getSavingsFacts } from "@campusos/db/queries";
import { getCallList, getConcessionRequests, getOverdueOver, getSectionsToday, getStaffToday } from "@campusos/db/roles";
import { PageTitle, SavesNote } from "@/components/ui";
import { demoCtx } from "@/lib/ctx";
import { VoiceNote } from "../../parent/[familyId]/voice-note";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function MorningBriefPage() {
  const { db, ctx, demo } = await demoCtx("owner");
  const yesterday = new Date(ctx.asOf.getTime() - 86_400_000);
  const monthStart = new Date(Date.UTC(ctx.asOf.getUTCFullYear(), ctx.asOf.getUTCMonth(), 1));
  const [yest, month, facts, overdue, attendance, sections, staff, risky, riskCounts, approvals] = await Promise.all([
    getCollections(db, ctx.schoolId, yesterday, yesterday),
    getCollections(db, ctx.schoolId, monthStart, ctx.asOf),
    getSavingsFacts(db, ctx.schoolId, monthStart, new Date(ctx.asOf.getTime() + 86_399_999)),
    getOverdueOver(db, ctx.schoolId, ctx.asOf, 60),
    getAttendanceOn(db, ctx.schoolId, ctx.asOf),
    getSectionsToday(db, ctx.schoolId, ctx.asOf),
    getStaffToday(db, ctx.schoolId, ctx.asOf),
    getCallList(db, ctx.schoolId, 3),
    getRiskCounts(db, ctx.schoolId),
    getConcessionRequests(db, ctx.schoolId),
  ]);

  const brief = morningBrief({
    school: demo.school.name.replace(/\s*\(DEMO\)/, ""),
    dateLabel: dateFmt.format(ctx.asOf),
    collectedYesterdayMinor: yest.totalMinor,
    paymentsYesterday: yest.count,
    collectedMonthMinor: month.totalMinor,
    recoveredMonthMinor: facts.recoveredMinor,
    overdue60Minor: overdue.totalMinor,
    overdue60Families: overdue.families,
    attendancePct: attendance.total ? Math.round((attendance.present * 100) / attendance.total) : null,
    classesUnmarked: sections.filter((s) => !s.marked).length,
    staffAbsent: staff.filter((s) => s.status === "absent").length,
    staffLate: staff.filter((s) => s.status === "late").length,
    atRiskNames: risky.map((r) => r.name),
    atRiskTotal: riskCounts.high,
    pendingApprovals: approvals.length,
  });

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageTitle role="Owner" title="Morning Brief" sub="Arrives on WhatsApp at 7:30 every morning. No login needed." />
      <SavesNote>the owner knows the school&apos;s money and problems before 8 a.m. without calling anyone.</SavesNote>
      <div className="overflow-hidden rounded-[2rem] border-8 border-ink bg-[#efeae2] shadow-xl">
        <div className="bg-[#075e54] px-4 py-3 text-white">
          <p className="font-semibold">CampusOS</p>
          <p className="text-[11px] text-white/75">WhatsApp · to owner</p>
        </div>
        <div className="space-y-2 p-3">
          <div className="max-w-[92%] whitespace-pre-line rounded-lg bg-white px-3 py-2 text-sm leading-relaxed shadow-sm" data-testid="brief-text">
            {brief.en}
            <p className="mt-1 text-right text-[10px] text-muted">7:30</p>
          </div>
          <div className="max-w-[92%] rounded-lg bg-white px-3 py-2 shadow-sm">
            <p className="text-[10px] font-semibold uppercase text-brand">Voice version (Urdu)</p>
            <VoiceNote ur={brief.ur} en="Same brief, spoken in Urdu." />
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">Every number is calculated from the school&apos;s records. AI may reword it later, never change it.</p>
    </div>
  );
}
