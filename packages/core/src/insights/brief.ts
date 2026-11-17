import { formatMoney, type Minor } from "../shared/money";

/** Facts for the owner's Morning Brief. Every number is computed in SQL before it gets here. */
export interface BriefFacts {
  school: string;
  dateLabel: string;
  collectedYesterdayMinor: Minor;
  paymentsYesterday: number;
  collectedMonthMinor: Minor;
  recoveredMonthMinor: Minor;
  overdue60Minor: Minor;
  overdue60Families: number;
  attendancePct: number | null;
  classesUnmarked: number;
  staffAbsent: number;
  staffLate: number;
  atRiskNames: string[];
  atRiskTotal: number;
  pendingApprovals: number;
}

/**
 * Template version of the brief (deterministic). The AI version (docs/10) only rewrites these same facts
 * into friendlier words; it never adds or changes a number.
 */
export function morningBrief(f: BriefFacts): { en: string; ur: string } {
  const en: string[] = [`Good morning. ${f.school}, ${f.dateLabel}:`];
  en.push(`💰 Fees yesterday: ${formatMoney(f.collectedYesterdayMinor)} (${f.paymentsYesterday} payments). This month: ${formatMoney(f.collectedMonthMinor)}.`);
  if (f.recoveredMonthMinor > 0) en.push(`✅ Recovered by CampusOS reminders this month: ${formatMoney(f.recoveredMonthMinor)}.`);
  if (f.overdue60Minor > 0) en.push(`⚠️ Unpaid over 60 days: ${formatMoney(f.overdue60Minor)} from ${f.overdue60Families} families.`);
  if (f.attendancePct !== null) {
    en.push(`🧒 Attendance: ${f.attendancePct}%${f.classesUnmarked ? `, ${f.classesUnmarked} classes not marked yet` : ""}.`);
  }
  if (f.staffAbsent || f.staffLate) en.push(`👩‍🏫 Staff: ${f.staffAbsent} absent, ${f.staffLate} late.`);
  if (f.atRiskTotal > 0) {
    const names = f.atRiskNames.slice(0, 3).join(", ");
    const more = f.atRiskTotal > 3 ? ` and ${f.atRiskTotal - 3} more` : "";
    en.push(`🚩 May leave: ${names}${more}. Principal has the call list.`);
  }
  if (f.pendingApprovals > 0) en.push(`📝 ${f.pendingApprovals} discount request${f.pendingApprovals > 1 ? "s" : ""} need your OK.`);

  const rs = (m: Minor) => formatMoney(m).replace("Rs ", "");
  const ur: string[] = [`صبح بخیر۔ ${f.school}۔`];
  ur.push(`کل ${rs(f.collectedYesterdayMinor)} روپے فیس آئی۔ اس مہینے اب تک ${rs(f.collectedMonthMinor)} روپے۔`);
  if (f.recoveredMonthMinor > 0) ur.push(`کیمپس او ایس کی یاد دہانی سے اس مہینے ${rs(f.recoveredMonthMinor)} روپے وصول ہوئے۔`);
  if (f.overdue60Minor > 0) ur.push(`ساٹھ دن سے زیادہ پرانی فیس ${rs(f.overdue60Minor)} روپے، ${f.overdue60Families} خاندان۔`);
  if (f.attendancePct !== null) ur.push(`حاضری ${f.attendancePct} فیصد۔`);
  if (f.atRiskTotal > 0) ur.push(`${f.atRiskTotal} بچے اسکول چھوڑ سکتے ہیں، پرنسپل کے پاس فہرست ہے۔`);
  if (f.pendingApprovals > 0) ur.push(`${f.pendingApprovals} رعایت کی درخواستیں آپ کی منظوری کی منتظر ہیں۔`);
  return { en: en.join("\n"), ur: ur.join(" ") };
}
