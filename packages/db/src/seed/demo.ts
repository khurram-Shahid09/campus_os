/**
 * Seeds "Demo Grammar School": fully synthetic data, clearly labelled as demo (schools.is_demo = true).
 * No real school, person or phone number. Re-running replaces the demo school.
 *
 * Story the data tells (docs/15): school runs on paper until CAMPUSOS_LIVE, then CampusOS reminders,
 * tap attendance and digital slips start. Every saving shown comes from roi_events written here
 * the same way the real features will write them.
 */
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import {
  absenceAlertText,
  daysBetween,
  demoReceiptImageKey,
  feeReminderText,
  feeSlipText,
  isRecoveredByReminder,
  paymentCodeFor,
  receiptText,
  scoreRisk,
  todayIn,
} from "@campusos/core";
import { createDb } from "../index";
import { runDueJobs } from "../app/automation";
import * as s from "../schema/index";

const DEMO_SLUG = "demo-grammar-school";
/**
 * The demo always ends "today" (Pakistan time), so the working app shows it as live data. Override with
 * DEMO_AS_OF=YYYY-MM-DD. Sunday is the weekly holiday, so a Sunday moves back to Saturday.
 */
const AS_OF = (() => {
  const d = process.env.DEMO_AS_OF ? new Date(`${process.env.DEMO_AS_OF}T00:00:00Z`) : todayIn("Asia/Karachi");
  return d.getUTCDay() === 0 ? new Date(d.getTime() - 86_400_000) : d;
})();
/** CampusOS "went live" on the 1st, two months before this month: history before that is the paper era. */
const CAMPUSOS_LIVE = new Date(Date.UTC(AS_OF.getUTCFullYear(), AS_OF.getUTCMonth() - 2, 1));
const MONTHS = 14; // 13 months of history + this month
const FIRST_PERIOD = (() => {
  const d = new Date(Date.UTC(AS_OF.getUTCFullYear(), AS_OF.getUTCMonth() - (MONTHS - 1), 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
})();
/** academic year starts in April */
const YEAR_START = new Date(Date.UTC(AS_OF.getUTCMonth() >= 3 ? AS_OF.getUTCFullYear() : AS_OF.getUTCFullYear() - 1, 3, 1));
const DEMO_PHONES = { owner: "+923000000001", principal: "+923000000002", accountant: "+923000000003", teacher: "+923000000004" } as const;
const TARGET_STUDENTS = 620;
const PRICE_PER_STUDENT_MINOR = 3000; // Rs 30 (docs/17 A3, ASSUMPTION)

// ---------- deterministic random ----------
let seed = 20261117;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const chance = (p: number) => rand() < p;

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const periodKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

// ---------- synthetic names ----------
const SURNAMES = ["Akram", "Butt", "Malik", "Qureshi", "Sheikh", "Chaudhry", "Raza", "Hussain", "Khan", "Siddiqui", "Mirza", "Abbasi", "Javed", "Iqbal", "Nawaz", "Rana", "Saleem", "Tariq", "Yousaf", "Zafar"] as const;
const BOYS = ["Ahmed", "Ali", "Hamza", "Usman", "Bilal", "Hassan", "Zain", "Saad", "Abdullah", "Ibrahim", "Faizan", "Arham", "Rayyan", "Taha", "Hadi"] as const;
const GIRLS = ["Ayesha", "Fatima", "Zainab", "Hira", "Maryam", "Aleena", "Iqra", "Noor", "Eman", "Hafsa", "Sana", "Anaya", "Mahnoor", "Areeba", "Laiba"] as const;
const FATHERS = ["Muhammad Akram", "Tariq Mehmood", "Imran Ali", "Shahid Iqbal", "Kashif Raza", "Asif Javed", "Naveed Anwar", "Farhan Saleem", "Waqas Ahmed", "Zubair Khan"] as const;

let phoneSeq = 0;
/** Fake numbers in a clearly synthetic block; never real subscribers. */
const fakePhone = () => `+9230000${String(10000 + phoneSeq++).padStart(5, "0")}`;

type Profile = "good" | "late" | "defaulter" | "leaving" | "at_risk";

async function main() {
  const db = createDb();

  // ---------- reset ----------
  const existing = await db.select({ id: s.schools.id }).from(s.schools).where(eq(s.schools.slug, DEMO_SLUG));
  if (existing.length) {
    const sid = existing[0]!.id;
    const tenantTables = [
      s.paymentProofs, s.riskFollowups, s.roiEvents, s.dailyBriefs, s.riskScores, s.messages, s.staffAttendance, s.attendanceRecords,
      s.attendanceSessions, s.promisesToPay, s.reminderEvents, s.paymentAllocations, s.payments, s.invoiceLines,
      s.invoices, s.studentFeeAdjustments, s.feeStructures, s.feeHeads, s.staff, s.enrollments, s.students,
      s.guardians, s.families, s.sections, s.classes, s.academicYears, s.auditLogs, s.memberships,
    ] as const;
    for (const t of tenantTables) await db.delete(t).where(eq(t.schoolId, sid));
    await db.delete(s.schools).where(eq(s.schools.id, sid));
    await db.delete(s.jobRuns).where(eq(s.jobRuns.schoolId, sid));
    await db.delete(s.schoolCounters).where(eq(s.schoolCounters.schoolId, sid));
    const demoUsers = await db.select({ id: s.users.id }).from(s.users).where(inArray(s.users.phoneE164, Object.values(DEMO_PHONES)));
    if (demoUsers.length) await db.delete(s.sessions).where(inArray(s.sessions.userId, demoUsers.map((u) => u.id)));
    await db.delete(s.users).where(inArray(s.users.phoneE164, Object.values(DEMO_PHONES)));
  }

  // ---------- school + leaders ----------
  const schoolId = randomUUID();
  await db.insert(s.schools).values({
    id: schoolId,
    name: "Demo Grammar School (DEMO)",
    slug: DEMO_SLUG,
    isDemo: true,
    status: "trial",
    settings: {
      campusosLiveOn: iso(CAMPUSOS_LIVE),
      demoAsOf: iso(AS_OF),
      city: "Lahore",
      dueDay: 10,
      pricePerStudentMinor: PRICE_PER_STUDENT_MINOR,
      quietHours: { start: "21:00", end: "08:00" },
      briefTime: "07:30",
    },
  });
  // demo logins, one per role (fake numbers; the working app offers them as one-click demo logins)
  const userIds = { owner: randomUUID(), principal: randomUUID(), accountant: randomUUID(), teacher: randomUUID() };
  await db.insert(s.users).values([
    { id: userIds.owner, phoneE164: DEMO_PHONES.owner, name: "Demo Owner" },
    { id: userIds.principal, phoneE164: DEMO_PHONES.principal, name: "Demo Principal" },
    { id: userIds.accountant, phoneE164: DEMO_PHONES.accountant, name: "Demo Fee Clerk" },
    { id: userIds.teacher, phoneE164: DEMO_PHONES.teacher, name: "Ms. Demo Teacher" },
  ]);
  await db.insert(s.memberships).values(
    (Object.keys(userIds) as (keyof typeof userIds)[]).map((role) => ({ schoolId, userId: userIds[role], role })),
  );

  const yearId = randomUUID();
  await db.insert(s.academicYears).values({ id: yearId, schoolId, name: `${YEAR_START.getUTCFullYear()}-${String((YEAR_START.getUTCFullYear() + 1) % 100).padStart(2, "0")}`,
    startsOn: YEAR_START, endsOn: new Date(Date.UTC(YEAR_START.getUTCFullYear() + 1, 2, 31)), isCurrent: true });

  // ---------- classes + sections + fees ----------
  const classNames = ["Nursery", "Prep", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"];
  const tuitionHeadId = randomUUID();
  await db.insert(s.feeHeads).values({ id: tuitionHeadId, schoolId, name: "Tuition", frequency: "monthly" });
  await db.update(s.schools).set({ settings: sql`${s.schools.settings} || ${JSON.stringify({ tuitionHeadId })}::jsonb` }).where(eq(s.schools.id, schoolId));

  const sectionRows: { id: string; classId: string; level: number; feeMinor: number }[] = [];
  for (const [i, name] of classNames.entries()) {
    const classId = randomUUID();
    const feeMinor = (2000 + i * 250) * 100;
    await db.insert(s.classes).values({ id: classId, schoolId, name, level: i, capacityDefault: 40 });
    await db.insert(s.feeStructures).values({ schoolId, academicYearId: yearId, classId, feeHeadId: tuitionHeadId, amountMinor: feeMinor });
    for (const sec of ["A", "B"]) {
      const id = randomUUID();
      await db.insert(s.sections).values({ id, schoolId, classId, academicYearId: yearId, name: sec, capacity: 40 });
      sectionRows.push({ id, classId, level: i, feeMinor });
    }
  }

  // ---------- staff ----------
  const staffRows = Array.from({ length: 48 }, (_, i) => ({
    id: randomUUID(),
    schoolId,
    name: `${i < 30 ? "Ms." : "Mr."} ${pick(GIRLS)} ${pick(SURNAMES)}`,
    phoneE164: fakePhone(),
    designation: i < 36 ? "Teacher" : pick(["Clerk", "Peon", "Guard", "Accountant", "Coordinator"]),
    joinedOn: utc(int(2015, 2025), int(1, 12), 1),
  }));
  await db.insert(s.staff).values(staffRows);
  for (const [i, sec] of sectionRows.entries()) {
    await db.update(s.sections).set({ classTeacherStaffId: staffRows[i]!.id }).where(eq(s.sections.id, sec.id));
  }
  // the demo teacher login is class teacher of the last section, which is left unmarked today
  const teacherStaff = staffRows[sectionRows.length - 1]!;
  await db.update(s.staff).set({ userId: userIds.teacher, name: "Ms. Demo Teacher" }).where(eq(s.staff.id, teacherStaff.id));

  // ---------- families + students ----------
  interface Kid { id: string; name: string; gender: "M" | "F"; sectionIdx: number; feeMinor: number; discountPct: number; withdrawnOn: Date | null; profile: Profile }
  interface Fam { id: string; guardianId: string; phone: string; prefersVoice: boolean; profile: Profile; kids: Kid[] }
  const SCHOOL_SHORT = "Demo Grammar School";
  const messageRows: (typeof s.messages.$inferInsert)[] = [];
  const fams: Fam[] = [];
  const guardianRows: (typeof s.guardians.$inferInsert)[] = [];
  const studentRows: (typeof s.students.$inferInsert)[] = [];
  const enrollmentRows: (typeof s.enrollments.$inferInsert)[] = [];
  const adjustmentRows: (typeof s.studentFeeAdjustments.$inferInsert)[] = [];
  let admission = 1000;
  let studentCount = 0;
  let leavingLeft = 17;
  let atRiskLeft = 14;

  while (studentCount < TARGET_STUDENTS) {
    const famId = randomUUID();
    const guardianId = randomUUID();
    const surname = pick(SURNAMES);
    const r = rand();
    let profile: Profile = r < 0.68 ? "good" : r < 0.88 ? "late" : "defaulter";
    if (leavingLeft > 0 && chance(0.06)) { profile = "leaving"; leavingLeft--; }
    else if (atRiskLeft > 0 && chance(0.05)) { profile = "at_risk"; atRiskLeft--; }
    const staffChild = chance(0.03);
    const phone = fakePhone();
    const prefersVoice = chance(0.45);
    guardianRows.push({
      id: guardianId, schoolId, familyId: famId, name: `${pick(FATHERS)} ${surname}`, relation: "father",
      phoneE164: phone, prefersVoice, preferredLanguage: "ur",
    });
    const kidsCount = Math.min(TARGET_STUDENTS - studentCount, pick([1, 1, 1, 2, 2, 3] as const));
    const fam: Fam = { id: famId, guardianId, phone, prefersVoice, profile, kids: [] };
    for (let k = 0; k < kidsCount; k++) {
      const id = randomUUID();
      const sectionIdx = int(0, sectionRows.length - 1);
      const sec = sectionRows[sectionIdx]!;
      const girl = chance(0.5);
      const discountPct = staffChild ? 50 : k > 0 ? 10 : chance(0.04) ? 25 : 0;
      const withdrawnOn = profile === "leaving" && k === 0 ? addDays(CAMPUSOS_LIVE, 14 + int(0, 50)) : null;
      const kidName = `${girl ? pick(GIRLS) : pick(BOYS)} ${surname}`;
      studentRows.push({
        id, schoolId, familyId: famId, admissionNo: `DGS-${admission++}`, name: kidName,
        gender: girl ? "F" : "M", status: withdrawnOn ? "withdrawn" : "active", admittedOn: utc(int(2019, 2025), 4, 1),
        withdrawnOn, withdrawalReason: withdrawnOn ? "Left without notice" : null,
      });
      enrollmentRows.push({ schoolId, studentId: id, sectionId: sec.id, academicYearId: yearId, rollNo: k + 1 });
      if (discountPct > 0) {
        adjustmentRows.push({
          schoolId, studentId: id, feeHeadId: tuitionHeadId, kind: "percent", value: discountPct,
          reason: staffChild ? "Staff child" : k > 0 ? "Sibling discount" : "Special case", status: "approved",
          validFrom: utc(2025, 4, 1),
        });
      }
      fam.kids.push({ id, name: kidName, gender: girl ? "F" : "M", sectionIdx, feeMinor: sec.feeMinor, discountPct, withdrawnOn, profile });
      studentCount++;
    }
    fams.push(fam);
  }

  // Concession requests rejected/reduced after go-live: the "concessions controlled" saving.
  const roiRows: (typeof s.roiEvents.$inferInsert)[] = [];
  const goodKids = fams.filter((f) => f.profile === "good").flatMap((f) => f.kids).slice(0, 9);
  for (const kid of goodKids) {
    const requested = pick([30, 40, 50]);
    const approved = pick([0, 10]);
    const at = addDays(CAMPUSOS_LIVE, int(5, 70));
    const adjId = randomUUID();
    adjustmentRows.push({
      id: adjId, schoolId, studentId: kid.id, feeHeadId: tuitionHeadId, kind: "percent", value: approved,
      requestedValue: requested, reason: "Verbal request, sent for owner approval", status: approved ? "approved" : "rejected",
      validFrom: at,
    });
    const savedPerMonth = Math.round((kid.feeMinor * (requested - approved)) / 100);
    roiRows.push({ schoolId, kind: "concession_controlled", valueMinor: savedPerMonth, refTable: "student_fee_adjustments", refId: adjId, occurredAt: at });
  }

  // Discount requests still waiting for the owner (Owner demo approves/rejects these).
  for (const kid of fams.filter((f) => f.profile === "good").flatMap((f) => f.kids).slice(20, 23)) {
    adjustmentRows.push({
      schoolId, studentId: kid.id, feeHeadId: tuitionHeadId, kind: "percent", value: 0, requestedValue: pick([30, 50]),
      reason: pick(["Father lost job, asked at gate", "Relative of a staff member", "Promised at admission"]),
      status: "requested", validFrom: AS_OF,
    });
  }

  await insertChunks(db, s.families, fams.map((f) => ({ id: f.id, schoolId, displayName: `${guardianRows.find((g) => g.id === f.guardianId)!.name.split(" ").pop()} family`, primaryGuardianId: f.guardianId })));
  await insertChunks(db, s.guardians, guardianRows);
  await insertChunks(db, s.students, studentRows);
  await insertChunks(db, s.enrollments, enrollmentRows);
  await insertChunks(db, s.studentFeeAdjustments, adjustmentRows);

  // ---------- invoices, payments, reminders ----------
  const invoiceRows: (typeof s.invoices.$inferInsert)[] = [];
  const lineRows: (typeof s.invoiceLines.$inferInsert)[] = [];
  const paymentRows: (typeof s.payments.$inferInsert)[] = [];
  const allocRows: (typeof s.paymentAllocations.$inferInsert)[] = [];
  const reminderRows: (typeof s.reminderEvents.$inferInsert)[] = [];
  /** family -> overdue info for risk scoring */
  const famDebt = new Map<string, { oldestDue: Date | null; unpaidMonths: number }>();

  for (let i = 0; i < MONTHS; i++) {
    const y = FIRST_PERIOD.y + Math.floor((FIRST_PERIOD.m - 1 + i) / 12);
    const m = ((FIRST_PERIOD.m - 1 + i) % 12) + 1;
    const issue = utc(y, m, 1);
    const due = utc(y, m, 10);
    const live = issue >= CAMPUSOS_LIVE;

    for (const fam of fams) {
      const kids = fam.kids.filter((k) => !k.withdrawnOn || k.withdrawnOn > issue);
      if (!kids.length) continue;
      const invoiceId = randomUUID();
      let total = 0;
      for (const k of kids) {
        const discount = Math.round((k.feeMinor * k.discountPct) / 100);
        total += k.feeMinor - discount;
        lineRows.push({ schoolId, invoiceId, studentId: k.id, feeHeadId: tuitionHeadId, description: `Tuition ${periodKey(y, m)}`, amountMinor: k.feeMinor, discountMinor: discount });
      }

      // When would this family pay, if at all?
      let payDelay: number | null; // days after due date
      switch (fam.profile) {
        case "good": payDelay = chance(0.9) ? int(-9, 0) : int(5, 25); break;
        case "late": payDelay = live ? int(4, 14) : int(15, 50); break;
        case "defaulter": payDelay = live ? (chance(0.55) ? int(5, 20) : null) : chance(0.35) ? int(30, 80) : null; break;
        case "leaving": payDelay = issue >= new Date(Date.UTC(CAMPUSOS_LIVE.getUTCFullYear(), CAMPUSOS_LIVE.getUTCMonth() - 2, 1)) ? null : int(10, 40); break;
        case "at_risk": payDelay = issue >= CAMPUSOS_LIVE ? null : int(0, 20); break;
      }
      const paidOn = payDelay === null ? null : addDays(due, payDelay);
      const paidInTime = paidOn !== null && paidOn <= AS_OF;
      const partial = fam.profile === "defaulter" && paidInTime && chance(0.3);
      const paid = paidInTime ? (partial ? Math.round(total / 2 / 100) * 100 : total) : 0;

      // Reminder ladder (only after go-live): voice note +3, text +10, IVR call +20, stop once paid.
      let lastReminder: { id: string; at: Date } | null = null;
      if (live) {
        const ladder = [
          { step: 1, offset: 3, channel: "whatsapp_voice" },
          { step: 2, offset: 10, channel: "whatsapp_text" },
          { step: 3, offset: 20, channel: "ivr_call" },
        ];
        for (const r of ladder) {
          const at = addDays(due, r.offset);
          if (at > AS_OF) break;
          if (paidOn && paidOn < at && !partial) break;
          const id = randomUUID();
          const messageId = randomUUID();
          const voice = r.channel !== "whatsapp_text" || fam.prefersVoice;
          messageRows.push({
            id: messageId, schoolId, familyId: fam.id, guardianId: fam.guardianId, toPhone: fam.phone,
            channel: r.channel === "ivr_call" ? "ivr" : "whatsapp", format: voice ? "voice" : "text", category: "fee",
            templateKey: `fee_reminder_${r.step}`, status: "delivered", sentAt: new Date(at.getTime() + 5 * 3600_000),
            body: feeReminderText({ child: kids[0]!.name, period: periodKey(y, m), amountMinor: total, school: SCHOOL_SHORT, step: r.step }),
            createdAt: new Date(at.getTime() + 5 * 3600_000),
          });
          reminderRows.push({ id, schoolId, invoiceId, familyId: fam.id, stepNo: r.step, channel: r.channel, messageId, sentAt: at });
          roiRows.push({ schoolId, kind: "reminder_automated", refTable: "reminder_events", refId: id, occurredAt: at });
          if (!paidOn || at <= paidOn) lastReminder = { id, at };
        }
      }

      const balance = total - paid;
      invoiceRows.push({
        id: invoiceId, schoolId, familyId: fam.id, period: periodKey(y, m), issueDate: issue, dueDate: due,
        totalMinor: total, paidMinor: paid, balanceMinor: balance,
        status: balance === 0 ? "paid" : paid > 0 ? "partially_paid" : "open",
      });
      if (live) {
        roiRows.push({ schoolId, kind: "page_digital", quantity: 1, refTable: "invoices", refId: invoiceId, occurredAt: issue });
        const code = paymentCodeFor(invoiceId);
        const sent = new Date(issue.getTime() + 4 * 3600_000);
        messageRows.push({
          schoolId, familyId: fam.id, guardianId: fam.guardianId, toPhone: fam.phone, channel: "whatsapp", format: "image",
          category: "fee", templateKey: "fee_slip", status: "read", sentAt: sent, createdAt: sent,
          body: feeSlipText({ period: periodKey(y, m), amountMinor: total, dueDay: 10, code }),
          payload: { invoiceId, code, period: periodKey(y, m), amountMinor: total, children: kids.map((k) => k.name) },
        });
      }

      if (paid > 0 && paidOn) {
        const paymentId = randomUUID();
        const attributed = lastReminder !== null && isRecoveredByReminder(paidOn, lastReminder.at);
        paymentRows.push({
          id: paymentId, schoolId, familyId: fam.id, amountMinor: paid, method: pick(["cash", "cash", "wallet", "bank"]),
          paidOn, attributedToCampusos: attributed, attributedReminderEventId: attributed ? lastReminder!.id : null,
        });
        allocRows.push({ schoolId, paymentId, invoiceId, amountMinor: paid });
        if (paidOn >= CAMPUSOS_LIVE) {
          const at = new Date(paidOn.getTime() + 7 * 3600_000);
          messageRows.push({
            schoolId, familyId: fam.id, guardianId: fam.guardianId, toPhone: fam.phone, channel: "whatsapp",
            format: fam.prefersVoice ? "voice" : "text", category: "receipt", templateKey: "receipt", status: "delivered",
            sentAt: at, createdAt: at, body: receiptText({ amountMinor: paid, balanceMinor: total - paid, school: SCHOOL_SHORT }),
          });
        }
        if (attributed) roiRows.push({ schoolId, kind: "fee_recovered", valueMinor: paid, refTable: "payments", refId: paymentId, occurredAt: paidOn });
      }
      if (balance > 0 && due < AS_OF) {
        const d = famDebt.get(fam.id) ?? { oldestDue: null, unpaidMonths: 0 };
        d.unpaidMonths++;
        if (!d.oldestDue || due < d.oldestDue) d.oldestDue = due;
        famDebt.set(fam.id, d);
      }
    }
  }
  await insertChunks(db, s.invoices, invoiceRows);
  await insertChunks(db, s.invoiceLines, lineRows);
  // running receipt numbers, oldest first, as the cash counter gives them
  paymentRows.sort((a, b) => +a.paidOn! - +b.paidOn!).forEach((p, i) => (p.receiptNo = i + 1));
  await insertChunks(db, s.payments, paymentRows);
  await db.insert(s.schoolCounters).values({ schoolId, key: "receipt_no", value: paymentRows.length });
  await insertChunks(db, s.paymentAllocations, allocRows);
  await insertChunks(db, s.reminderEvents, reminderRows);

  // ---------- payment screenshots waiting for the clerk ----------
  // Extraction is pre-filled and labelled source:"demo" (live AI reading comes with the API key).
  const proofRows: (typeof s.paymentProofs.$inferInsert)[] = [];
  const owing = fams.filter((f) => f.profile === "late" && famDebt.has(f.id)).slice(0, 3);
  const banks = ["Mobile wallet", "Bank transfer (IBFT)", "Mobile wallet"];
  for (const [i, fam] of owing.entries()) {
    const inv = invoiceRows.filter((r) => r.familyId === fam.id && (r.balanceMinor ?? 0) > 0).sort((a, b) => +a.dueDate! - +b.dueDate!)[0]!;
    const at = new Date(AS_OF.getTime() + (3 + i) * 3600_000);
    const guardian = guardianRows.find((g) => g.id === fam.guardianId)!;
    // The third screenshot is a reused one: identical to a proof approved 3 weeks ago.
    const reused = i === 2;
    // same shape as a real AI reading, but labelled source "demo" (pre-filled, not read by a model)
    const base = {
      source: "demo", method: i === 1 ? "bank_transfer" : "mobile_wallet", provider: banks[i]!, bank: banks[i]!, senderName: guardian.name,
      receiverName: "Demo Grammar School", status: "successful", isPaymentReceipt: true,
    };
    const extracted = reused
      ? { ...base, amountMinor: 250_000, date: iso(addDays(AS_OF, -21)), reference: "TRX48229329", referenceNorm: "48229329", confidence: 0.95 }
      : { ...base, amountMinor: inv.balanceMinor!, date: iso(AS_OF), reference: `TRX${String(48213907 + i * 7711)}`, referenceNorm: String(48213907 + i * 7711), confidence: 0.94 - i * 0.03 };
    const imageKey = demoReceiptImageKey({ amountMinor: extracted.amountMinor, reference: extracted.reference, kind: extracted.bank, date: extracted.date });
    proofRows.push({
      schoolId, familyId: fam.id, guardianId: fam.guardianId, imageKey, imageHash: reused ? "demo-hash-reused" : `demo-hash-${i}`,
      suggestedFamilyId: fam.id, status: "pending", createdAt: at, extracted, referenceNorm: extracted.referenceNorm, imageMime: "image/svg+xml",
    });
    messageRows.push({
      schoolId, familyId: fam.id, guardianId: fam.guardianId, toPhone: fam.phone, direction: "in", channel: "whatsapp",
      format: "image", category: "receipt", status: "received", sentAt: at, createdAt: at, payload: { imageKey },
    });
    if (reused) {
      proofRows.push({
        schoolId, familyId: owing[0]?.id, imageKey, imageHash: "demo-hash-reused", status: "approved",
        reviewedAt: addDays(AS_OF, -21), createdAt: addDays(AS_OF, -21), extracted, referenceNorm: extracted.referenceNorm, imageMime: "image/svg+xml",
      });
    }
  }
  await insertChunks(db, s.paymentProofs, proofRows);

  // ---------- student attendance: last ~70 weekdays ----------
  const days: Date[] = [];
  for (let d = addDays(AS_OF, -100); d <= AS_OF; d = addDays(d, 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0) days.push(d); // Monday-Saturday
  }
  const kidsBySection = new Map<number, Kid[]>();
  for (const k of fams.flatMap((f) => f.kids)) {
    const list = kidsBySection.get(k.sectionIdx) ?? [];
    list.push(k);
    kidsBySection.set(k.sectionIdx, list);
  }
  const sessionRows: (typeof s.attendanceSessions.$inferInsert)[] = [];
  const recordRows: (typeof s.attendanceRecords.$inferInsert)[] = [];
  const stats = new Map<string, { recent: number[]; base: number[]; streak: number }>();

  const famOfKid = new Map(fams.flatMap((f) => f.kids.map((k) => [k.id, f] as const)));
  for (const day of days) {
    const live = day >= CAMPUSOS_LIVE;
    for (const [idx, sec] of sectionRows.entries()) {
      // Today: the last 6 sections have not marked attendance yet (Teacher demo marks one live).
      if (day.getTime() === AS_OF.getTime() && idx >= sectionRows.length - 6) continue;
      const sessionId = randomUUID();
      const durationSeconds = live ? int(35, 95) : null;
      sessionRows.push({
        id: sessionId, schoolId, sectionId: sec.id, date: day, submittedAt: addDays(day, 0),
        method: live ? "tap" : "import", durationSeconds,
      });
      if (live) roiRows.push({ schoolId, kind: "attendance_taken", refTable: "attendance_sessions", refId: sessionId, occurredAt: day });
      for (const k of kidsBySection.get(idx) ?? []) {
        if (k.withdrawnOn && day >= k.withdrawnOn) continue;
        let pPresent = 0.94;
        if (k.profile === "leaving" && k.withdrawnOn && daysBetween(day, k.withdrawnOn) <= 21) pPresent = 0.45;
        if (k.profile === "at_risk" && daysBetween(day, AS_OF) <= 18) pPresent = 0.5;
        if (k.profile === "at_risk" && daysBetween(day, AS_OF) <= 6) pPresent = 0.1;
        const status = chance(pPresent) ? (chance(0.04) ? "late" : "present") : "absent";
        recordRows.push({ schoolId, sessionId, studentId: k.id, status });
        if (status === "absent" && live && daysBetween(day, AS_OF) <= 14) {
          const f = famOfKid.get(k.id)!;
          const at = new Date(day.getTime() + 4.5 * 3600_000); // ~09:30 PKT
          messageRows.push({
            schoolId, familyId: f.id, guardianId: f.guardianId, toPhone: f.phone, channel: "whatsapp", format: "voice",
            category: "attendance", templateKey: "absence_alert", status: "delivered", sentAt: at, createdAt: at,
            body: absenceAlertText({ child: k.name, gender: k.gender, school: SCHOOL_SHORT }),
          });
        }
        const st = stats.get(k.id) ?? { recent: [], base: [], streak: 0 };
        const present = status !== "absent" ? 1 : 0;
        const ago = daysBetween(day, AS_OF);
        if (ago < 20) st.recent.push(present); else st.base.push(present);
        st.streak = present ? 0 : st.streak + 1;
        stats.set(k.id, st);
      }
    }
  }
  await insertChunks(db, s.attendanceSessions, sessionRows);
  await insertChunks(db, s.attendanceRecords, recordRows);

  // ---------- staff attendance: last 30 weekdays ----------
  const staffAttRows = days.slice(-30).flatMap((day) =>
    staffRows.map((st) => {
      const r = rand();
      const status = r < 0.04 ? "absent" : r < 0.13 ? "late" : "present";
      const minutesLate = status === "late" ? int(5, 45) : 0;
      return {
        schoolId, staffId: st.id, date: day, status, minutesLate,
        checkInAt: status === "absent" ? null : new Date(day.getTime() + (3 * 60 + minutesLate) * 60_000), // 08:00 PKT = 03:00 UTC
      };
    }),
  );
  await insertChunks(db, s.staffAttendance, staffAttRows);

  // ---------- risk scores (rules, as the nightly job will) ----------
  const pct = (a: number[]) => (a.length ? (a.reduce((x, y) => x + y, 0) * 100) / a.length : null);
  const riskRows: (typeof s.riskScores.$inferInsert)[] = [];
  for (const fam of fams) {
    const debt = famDebt.get(fam.id);
    for (const k of fam.kids) {
      if (k.withdrawnOn) continue;
      const st = stats.get(k.id);
      const result = scoreRisk({
        attendancePct14: st ? pct(st.recent) : null,
        attendancePctBaseline: st ? pct(st.base) : null,
        consecutiveAbsences: st?.streak ?? 0,
        oldestOverdueDays: debt?.oldestDue ? daysBetween(debt.oldestDue, AS_OF) : 0,
        unpaidMonths: debt?.unpaidMonths ?? 0,
      });
      riskRows.push({ schoolId, studentId: k.id, computedOn: AS_OF, score: result.score, band: result.band, reasons: result.reasons });
    }
  }
  await insertChunks(db, s.riskScores, riskRows);

  // ---------- past principal calls (dropout follow-ups) since CampusOS went live ----------
  const followRows: (typeof s.riskFollowups.$inferInsert)[] = [];
  const callKids = fams.filter((f) => f.profile === "late").flatMap((f) => f.kids.filter((k) => !k.withdrawnOn)).slice(0, 7);
  const outcomes = ["will_return", "will_return", "fee_plan_agreed", "will_return", "fee_plan_agreed", "no_answer", "will_return"] as const;
  for (const [i, k] of callKids.entries()) {
    const at = new Date(addDays(AS_OF, -(6 + i * 5)).getTime() + 6 * 3600_000);
    if (at < CAMPUSOS_LIVE) continue;
    followRows.push({ schoolId, studentId: k.id, action: "called", outcome: outcomes[i]!, byRole: "principal", createdAt: at });
    if (outcomes[i] === "will_return" || outcomes[i] === "fee_plan_agreed") {
      roiRows.push({ schoolId, kind: "student_kept", refTable: "students", refId: k.id, occurredAt: at });
    }
  }
  await insertChunks(db, s.riskFollowups, followRows);
  await insertChunks(db, s.roiEvents, roiRows);
  await insertChunks(db, s.messages, messageRows);

  // ---------- automation history (last 14 days, from the seeded data) + today's real jobs ----------
  const high = riskRows.filter((r) => r.band === "high").length;
  const watch = riskRows.filter((r) => r.band === "watch").length;
  const remindersByDay = new Map<string, { messages: number; calls: number }>();
  for (const r of reminderRows) {
    const k = iso(r.sentAt as Date);
    const v = remindersByDay.get(k) ?? { messages: 0, calls: 0 };
    if (r.channel === "ivr_call" || r.channel === "principal_call") v.calls++;
    else v.messages++;
    remindersByDay.set(k, v);
  }
  const runRows: (typeof s.jobRuns.$inferInsert)[] = [];
  for (let n = 14; n >= 1; n--) {
    const day = addDays(AS_OF, -n);
    if (day.getUTCDay() === 0) continue;
    const at = (h: number) => new Date(day.getTime() + (h - 5) * 3600_000); // local hour -> UTC
    runRows.push({ schoolId, job: "risk_scores", runOn: day, status: "done", result: { scored: riskRows.length, high, watch }, startedAt: at(2), finishedAt: at(2) });
    runRows.push({ schoolId, job: "morning_brief", runOn: day, status: "done", result: { owners: 1 }, startedAt: at(7), finishedAt: at(7) });
    runRows.push({ schoolId, job: "fee_reminders", runOn: day, status: "done", result: { ...(remindersByDay.get(iso(day)) ?? { messages: 0, calls: 0 }), families: 0 }, startedAt: at(10), finishedAt: at(10) });
  }
  await insertChunks(db, s.jobRuns, runRows);
  // today: the real jobs run on the seeded data (risk scores, then the Morning Brief built from them)
  const now = new Date(AS_OF.getTime() + 4 * 3600_000); // 09:00 Karachi
  for (const only of ["risk_scores", "morning_brief"] as const) {
    const rep = await runDueJobs(db, { now, schoolId, only, includeDemo: true });
    if (rep[0]?.status !== "done") console.warn(`demo ${only}:`, rep[0]?.error ?? "did not run");
  }

  const recovered = roiRows.filter((r) => r.kind === "fee_recovered").reduce((a, r) => a + (r.valueMinor ?? 0), 0);
  console.log(`Demo school seeded: ${studentCount} students, ${fams.length} families, ${invoiceRows.length} invoices, ` +
    `${paymentRows.length} payments, ${reminderRows.length} reminders, ${recordRows.length} attendance records, ` +
    `${riskRows.filter((r) => r.band === "high").length} high-risk students. Recovered by reminders: Rs ${Math.round(recovered / 100)}.`);
  process.exit(0);
}

async function insertChunks<T extends Parameters<ReturnType<typeof createDb>["insert"]>[0]>(
  db: ReturnType<typeof createDb>,
  table: T,
  rows: T["$inferInsert"][],
  size = 1000,
) {
  for (let i = 0; i < rows.length; i += size) {
    await db.insert(table).values(rows.slice(i, i + size) as never);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
