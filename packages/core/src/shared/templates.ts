import { formatMoney, type Minor } from "./money";

/**
 * Parent-facing message text. Urdu is the primary (spoken as a voice note for parents who can't read);
 * English is shown alongside for staff and for demos. Numbers are always passed in from SQL, never invented.
 */
export interface Bilingual {
  ur: string;
  en: string;
}

const rs = (m: Minor) => formatMoney(m).replace("Rs ", "");
const URDU_MONTHS = ["جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون", "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthOf(period: string) {
  const m = Number(period.split("-")[1]) - 1;
  return { ur: URDU_MONTHS[m] ?? period, en: EN_MONTHS[m] ?? period };
}

export function feeReminderText(p: { child: string; period: string; amountMinor: Minor; school: string; step: number }): Bilingual {
  const m = monthOf(p.period);
  const firm = p.step >= 2;
  return {
    ur: firm
      ? `السلام علیکم۔ ${p.child} کی ${m.ur} کی فیس ${rs(p.amountMinor)} روپے ابھی تک باقی ہے۔ براہ کرم جلد ادا کریں یا اسکول سے بات کریں۔ ${p.school}`
      : `السلام علیکم۔ ${p.child} کی ${m.ur} کی فیس ${rs(p.amountMinor)} روپے باقی ہے۔ براہ کرم ادا کر دیں۔ شکریہ۔ ${p.school}`,
    en: firm
      ? `${p.child}'s ${m.en} fee of Rs ${rs(p.amountMinor)} is still unpaid. Please pay soon or talk to the school. ${p.school}`
      : `${p.child}'s ${m.en} fee of Rs ${rs(p.amountMinor)} is due. Please pay. Thank you. ${p.school}`,
  };
}

export function absenceAlertText(p: { child: string; gender: "M" | "F" | null; school: string }): Bilingual {
  const came = p.gender === "F" ? "نہیں آئی" : "نہیں آیا";
  return {
    ur: `السلام علیکم۔ ${p.child} آج اسکول ${came}۔ اگر طبیعت خراب ہے تو اسکول کو بتا دیں۔ ${p.school}`,
    en: `${p.child} did not come to school today. If they are unwell, please tell the school. ${p.school}`,
  };
}

export function receiptText(p: { amountMinor: Minor; balanceMinor: Minor; school: string }): Bilingual {
  const rest = p.balanceMinor > 0 ? ` باقی رقم ${rs(p.balanceMinor)} روپے۔` : " کوئی رقم باقی نہیں۔";
  const restEn = p.balanceMinor > 0 ? ` Remaining: Rs ${rs(p.balanceMinor)}.` : " Nothing remaining.";
  return {
    ur: `${rs(p.amountMinor)} روپے وصول ہو گئے۔ شکریہ۔${rest} ${p.school}`,
    en: `Rs ${rs(p.amountMinor)} received. Thank you.${restEn} ${p.school}`,
  };
}

export function balanceReplyText(p: { balanceMinor: Minor; months: number }): Bilingual {
  if (p.balanceMinor <= 0) return { ur: "آپ کی کوئی فیس باقی نہیں۔ شکریہ۔", en: "You have no fees due. Thank you." };
  return {
    ur: `آپ کی کل باقی فیس ${rs(p.balanceMinor)} روپے ہے (${p.months} مہینے)۔`,
    en: `Your total fee due is Rs ${rs(p.balanceMinor)} (${p.months} month${p.months > 1 ? "s" : ""}).`,
  };
}

export function feeSlipText(p: { period: string; amountMinor: Minor; dueDay: number; code: string }): Bilingual {
  const m = monthOf(p.period);
  return {
    ur: `${m.ur} کی فیس: ${rs(p.amountMinor)} روپے۔ آخری تاریخ ${p.dueDay} ${m.ur}۔ ادائیگی کوڈ: ${p.code}`,
    en: `${m.en} fee: Rs ${rs(p.amountMinor)}. Due ${p.dueDay} ${m.en}. Payment code: ${p.code}`,
  };
}

/** Deterministic 1Bill-style payment code from an invoice id (demo; real codes come from the bank). */
export function paymentCodeFor(invoiceId: string): string {
  const digits = invoiceId.replace(/[^0-9]/g, "").padEnd(12, "7").slice(0, 12);
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
}

/** Family-level fee reminder: one message about everything the family owes. Step 2+ is firmer. */
export function familyReminderText(p: { totalMinor: Minor; months: number; school: string; step: number }): Bilingual {
  const firm = p.step >= 2;
  const monthsUr = p.months > 1 ? ` (${p.months} مہینے)` : "";
  const monthsEn = p.months > 1 ? ` (${p.months} months)` : "";
  return {
    ur: firm
      ? `السلام علیکم۔ ${p.school} کی فیس ${rs(p.totalMinor)} روپے${monthsUr} ابھی تک باقی ہے۔ براہ کرم جلد ادا کریں یا اسکول سے بات کریں۔`
      : `السلام علیکم۔ ${p.school} کی فیس ${rs(p.totalMinor)} روپے${monthsUr} باقی ہے۔ براہ کرم ادا کر دیں۔ شکریہ۔`,
    en: firm
      ? `Assalam-o-Alaikum. ${p.school} fee of Rs ${rs(p.totalMinor)}${monthsEn} is still unpaid. Please pay soon or talk to the school.`
      : `Assalam-o-Alaikum. ${p.school} fee of Rs ${rs(p.totalMinor)}${monthsEn} is due. Please pay. Thank you.`,
  };
}
