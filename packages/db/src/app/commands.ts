/**
 * Write commands for the working app. Every function takes a transaction from `withSchool` (row-level
 * security on) and an AppCtx resolved from the login session. Permission checks happen here, not only in
 * the UI. Money, attendance and fee changes write audit_logs. Payments are never edited or deleted:
 * mistakes get a reversal entry.
 */
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  absenceAlertText,
  allocatePayment,
  buildInvoiceRun,
  can,
  classOrder,
  feeSlipText,
  formatMoney,
  invoiceStatusFor,
  isRecoveredByReminder,
  normalizePkPhone,
  paymentCodeFor,
  periodBounds,
  receiptText,
  reverseAllocations,
  type Action,
  type Bilingual,
  type ImportPreview,
  type StaffRole,
} from "@campusos/core";
import type { Tx } from "../index";
import { newMessageStatus } from "./messaging";
import * as s from "../schema/index";

export interface AppCtx {
  schoolId: string;
  schoolName: string;
  userId: string;
  role: StaffRole;
  /** today in the school's timezone (UTC midnight) */
  today: Date;
  settings: { tuitionHeadId?: string; dueDay?: number; city?: string };
}

export class AppError extends Error {}

export function assertCan(ctx: AppCtx, action: Action) {
  if (!can(ctx.role, action)) throw new AppError("You don't have permission to do this.");
}

async function audit(tx: Tx, ctx: AppCtx, action: string, entity: string, entityId: string | null, before: unknown, after: unknown) {
  await tx.insert(s.auditLogs).values({
    schoolId: ctx.schoolId, actorUserId: ctx.userId, action, entity, entityId,
    before: before ?? null, after: { ...(after as object), _role: ctx.role },
  });
}

async function nextCounter(tx: Tx, ctx: AppCtx, key: string): Promise<number> {
  const [row] = await tx.execute<{ value: number }>(sql`
    insert into ${s.schoolCounters} (school_id, key, value) values (${ctx.schoolId}, ${key}, 1)
    on conflict (school_id, key) do update set value = ${s.schoolCounters.value} + 1
    returning value
  `);
  return Number(row!.value);
}

async function currentYear(tx: Tx, ctx: AppCtx) {
  const [y] = await tx.select().from(s.academicYears).where(and(eq(s.academicYears.schoolId, ctx.schoolId), eq(s.academicYears.isCurrent, true))).limit(1);
  if (!y) throw new AppError("No current academic year. Finish school setup first.");
  return y;
}

/**
 * Queue a WhatsApp message to a family's primary guardian. Until the WhatsApp API is connected, messages wait
 * in the outbox and staff send them with one tap (wa.me link) from their own phone.
 */
export async function queueToFamily(
  tx: Tx,
  ctx: Pick<AppCtx, "schoolId">,
  familyId: string,
  m: { category: string; templateKey: string; body: Bilingual; payload?: unknown },
) {
  const [g] = await tx
    .select({ id: s.guardians.id, phone: s.guardians.phoneE164, optIn: s.guardians.whatsappOptIn, prefersVoice: s.guardians.prefersVoice })
    .from(s.families)
    .innerJoin(s.guardians, eq(s.guardians.id, s.families.primaryGuardianId))
    .where(and(eq(s.families.schoolId, ctx.schoolId), eq(s.families.id, familyId)));
  if (!g || !g.phone || !g.optIn) return null;
  const [row] = await tx
    .insert(s.messages)
    .values({
      schoolId: ctx.schoolId, familyId, guardianId: g.id, toPhone: g.phone, channel: "whatsapp",
      format: "text", category: m.category, templateKey: m.templateKey, body: m.body, payload: m.payload ?? null,
      status: newMessageStatus(), sentAt: newMessageStatus() === "simulated" ? new Date() : null,
    })
    .returning({ id: s.messages.id });
  return row!.id;
}

// ======================= setup =======================

export async function addClass(tx: Tx, ctx: AppCtx, input: { name: string; sections: string[] }) {
  assertCan(ctx, "school.setup");
  const name = input.name.trim();
  if (!name) throw new AppError("Class name is required.");
  const year = await currentYear(tx, ctx);
  const [dupe] = await tx.select({ id: s.classes.id }).from(s.classes).where(and(eq(s.classes.schoolId, ctx.schoolId), sql`lower(${s.classes.name}) = lower(${name})`));
  if (dupe) throw new AppError(`${name} already exists.`);
  const [cls] = await tx.insert(s.classes).values({ schoolId: ctx.schoolId, name, level: classOrder(name) }).returning();
  const secs = [...new Set(input.sections.map((x) => x.trim().toUpperCase()).filter(Boolean))];
  for (const sec of secs.length ? secs : ["A"]) {
    await tx.insert(s.sections).values({ schoolId: ctx.schoolId, classId: cls!.id, academicYearId: year.id, name: sec });
  }
  return { classId: cls!.id };
}

export async function addSection(tx: Tx, ctx: AppCtx, input: { classId: string; name: string }) {
  assertCan(ctx, "school.setup");
  const year = await currentYear(tx, ctx);
  const name = input.name.trim().toUpperCase();
  if (!name) throw new AppError("Section name is required.");
  const [dupe] = await tx.select({ id: s.sections.id }).from(s.sections).where(and(eq(s.sections.classId, input.classId), eq(s.sections.academicYearId, year.id), eq(s.sections.name, name)));
  if (dupe) throw new AppError(`Section ${name} already exists.`);
  await tx.insert(s.sections).values({ schoolId: ctx.schoolId, classId: input.classId, academicYearId: year.id, name });
}

export async function addFeeHead(tx: Tx, ctx: AppCtx, input: { name: string; frequency: "monthly" | "term" | "annual" | "one_time" }) {
  assertCan(ctx, "school.setup");
  if (!input.name.trim()) throw new AppError("Fee name is required.");
  const [h] = await tx.insert(s.feeHeads).values({ schoolId: ctx.schoolId, name: input.name.trim(), frequency: input.frequency }).returning();
  await audit(tx, ctx, "create", "fee_heads", h!.id, null, input);
  return h!;
}

export async function setClassFee(tx: Tx, ctx: AppCtx, input: { classId: string; feeHeadId: string; amountMinor: number }) {
  assertCan(ctx, "school.setup");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) throw new AppError("Enter a valid amount.");
  const year = await currentYear(tx, ctx);
  const [prev] = await tx.select().from(s.feeStructures).where(and(eq(s.feeStructures.academicYearId, year.id), eq(s.feeStructures.classId, input.classId), eq(s.feeStructures.feeHeadId, input.feeHeadId)));
  if (prev) await tx.update(s.feeStructures).set({ amountMinor: input.amountMinor }).where(eq(s.feeStructures.id, prev.id));
  else await tx.insert(s.feeStructures).values({ schoolId: ctx.schoolId, academicYearId: year.id, classId: input.classId, feeHeadId: input.feeHeadId, amountMinor: input.amountMinor });
  await audit(tx, ctx, prev ? "update" : "create", "fee_structures", prev?.id ?? null, prev ? { amountMinor: prev.amountMinor } : null, input);
}

export async function updateSchoolSettings(tx: Tx, ctx: AppCtx, input: { dueDay: number; name: string; city: string }) {
  assertCan(ctx, "school.setup");
  if (!(input.dueDay >= 1 && input.dueDay <= 28)) throw new AppError("Due day must be between 1 and 28.");
  // schools is not tenant-scoped by RLS, so the id filter is the guard here
  await tx.update(s.schools).set({ name: input.name.trim(), settings: { ...ctx.settings, dueDay: input.dueDay, city: input.city.trim() } }).where(eq(s.schools.id, ctx.schoolId));
}

// ======================= team & staff =======================

export async function inviteMember(tx: Tx, ctx: AppCtx, input: { name: string; phone: string; role: StaffRole; designation?: string }) {
  assertCan(ctx, "team.manage");
  const phone = normalizePkPhone(input.phone);
  if (!phone) throw new AppError("Enter a valid mobile number.");
  if (!input.name.trim()) throw new AppError("Name is required.");
  let [user] = await tx.select().from(s.users).where(eq(s.users.phoneE164, phone));
  if (!user) [user] = await tx.insert(s.users).values({ phoneE164: phone, name: input.name.trim() }).returning();
  const [existing] = await tx.select().from(s.memberships).where(and(eq(s.memberships.schoolId, ctx.schoolId), eq(s.memberships.userId, user!.id), eq(s.memberships.role, input.role)));
  if (existing) {
    if (existing.status === "active") throw new AppError("This person already has that role.");
    await tx.update(s.memberships).set({ status: "active" }).where(eq(s.memberships.id, existing.id));
  } else {
    await tx.insert(s.memberships).values({ schoolId: ctx.schoolId, userId: user!.id, role: input.role });
  }
  // every staff login also has a staff record (attendance, class teacher)
  const [st] = await tx.select().from(s.staff).where(and(eq(s.staff.schoolId, ctx.schoolId), eq(s.staff.userId, user!.id)));
  if (!st) {
    await tx.insert(s.staff).values({
      schoolId: ctx.schoolId, userId: user!.id, name: input.name.trim(), phoneE164: phone,
      designation: input.designation?.trim() || (input.role === "accountant" ? "Fee clerk" : input.role[0]!.toUpperCase() + input.role.slice(1)),
      joinedOn: ctx.today,
    });
  }
  await audit(tx, ctx, "invite", "memberships", user!.id, null, { phone, role: input.role });
}

export async function removeMember(tx: Tx, ctx: AppCtx, input: { userId: string; role: string }) {
  assertCan(ctx, "team.manage");
  if (input.userId === ctx.userId && input.role === "owner") throw new AppError("You can't remove your own owner access.");
  await tx.update(s.memberships).set({ status: "removed" }).where(and(eq(s.memberships.schoolId, ctx.schoolId), eq(s.memberships.userId, input.userId), eq(s.memberships.role, input.role)));
  await audit(tx, ctx, "remove", "memberships", input.userId, null, { role: input.role });
}

export async function addStaff(tx: Tx, ctx: AppCtx, input: { name: string; phone?: string; designation: string }) {
  assertCan(ctx, "staff.edit");
  if (!input.name.trim()) throw new AppError("Name is required.");
  const [st] = await tx.insert(s.staff).values({
    schoolId: ctx.schoolId, name: input.name.trim(), phoneE164: normalizePkPhone(input.phone) ?? null,
    designation: input.designation.trim() || "Teacher", joinedOn: ctx.today,
  }).returning();
  return st!;
}

export async function assignClassTeacher(tx: Tx, ctx: AppCtx, input: { sectionId: string; staffId: string | null }) {
  assertCan(ctx, "staff.edit");
  await tx.update(s.sections).set({ classTeacherStaffId: input.staffId }).where(and(eq(s.sections.schoolId, ctx.schoolId), eq(s.sections.id, input.sectionId)));
}

export async function markStaffAttendance(tx: Tx, ctx: AppCtx, input: { staffId: string; status: "present" | "absent" | "late" | "leave"; minutesLate?: number }) {
  assertCan(ctx, "staff.edit");
  const minutesLate = input.status === "late" ? Math.max(0, Math.round(input.minutesLate ?? 0)) : 0;
  await tx.insert(s.staffAttendance)
    .values({ schoolId: ctx.schoolId, staffId: input.staffId, date: ctx.today, status: input.status, minutesLate })
    .onConflictDoUpdate({ target: [s.staffAttendance.staffId, s.staffAttendance.date], set: { status: input.status, minutesLate } });
  await audit(tx, ctx, "mark", "staff_attendance", input.staffId, null, { date: ctx.today.toISOString().slice(0, 10), ...input, minutesLate });
}

// ======================= students & families =======================

async function nextAdmissionNo(tx: Tx, ctx: AppCtx): Promise<string> {
  const [row] = await tx.execute<{ n: number | null }>(sql`
    select max(admission_no::bigint)::int as n from ${s.students} where school_id = ${ctx.schoolId} and admission_no ~ '^[0-9]{1,9}$'
  `);
  return String((row?.n ?? 0) + 1);
}

/** Finds the family by guardian phone (so a new sibling joins the same fee account) or creates one. */
async function familyForGuardian(tx: Tx, ctx: AppCtx, input: { guardianName: string; phoneE164: string | null; relation?: string }) {
  if (input.phoneE164) {
    const [g] = await tx.select({ familyId: s.guardians.familyId }).from(s.guardians)
      .where(and(eq(s.guardians.schoolId, ctx.schoolId), eq(s.guardians.phoneE164, input.phoneE164), isNull(s.guardians.deletedAt))).limit(1);
    if (g) return { familyId: g.familyId, created: false };
  }
  const [fam] = await tx.insert(s.families).values({ schoolId: ctx.schoolId, displayName: input.guardianName }).returning();
  const [g] = await tx.insert(s.guardians).values({
    schoolId: ctx.schoolId, familyId: fam!.id, name: input.guardianName, relation: input.relation ?? "father",
    phoneE164: input.phoneE164 ?? "", whatsappOptIn: Boolean(input.phoneE164),
  }).returning();
  await tx.update(s.families).set({ primaryGuardianId: g!.id }).where(eq(s.families.id, fam!.id));
  return { familyId: fam!.id, created: true };
}

export interface StudentInput {
  name: string;
  gender: "M" | "F" | null;
  sectionId: string;
  admissionNo?: string | null;
  guardianName: string;
  phone?: string | null;
  tuitionFeeMinor?: number | null;
  admittedOn?: Date | null;
}

export async function addStudent(tx: Tx, ctx: AppCtx, input: StudentInput) {
  assertCan(ctx, "students.edit");
  if (!input.name.trim()) throw new AppError("Student name is required.");
  if (!input.guardianName.trim()) throw new AppError("Father / guardian name is required.");
  const phone = input.phone ? normalizePkPhone(input.phone) : null;
  if (input.phone && !phone) throw new AppError("Phone is not a valid Pakistani mobile number.");
  const year = await currentYear(tx, ctx);
  const [sec] = await tx.select().from(s.sections).where(and(eq(s.sections.schoolId, ctx.schoolId), eq(s.sections.id, input.sectionId)));
  if (!sec) throw new AppError("Choose a class and section.");
  const admissionNo = input.admissionNo?.trim() || (await nextAdmissionNo(tx, ctx));
  const [dupe] = await tx.select({ id: s.students.id }).from(s.students).where(and(eq(s.students.schoolId, ctx.schoolId), eq(s.students.admissionNo, admissionNo)));
  if (dupe) throw new AppError(`Admission no. ${admissionNo} is already used.`);
  const fam = await familyForGuardian(tx, ctx, { guardianName: input.guardianName.trim(), phoneE164: phone });
  const [stu] = await tx.insert(s.students).values({
    schoolId: ctx.schoolId, familyId: fam.familyId, admissionNo, name: input.name.trim(), gender: input.gender,
    admittedOn: input.admittedOn ?? ctx.today, tuitionFeeMinor: input.tuitionFeeMinor ?? null,
  }).returning();
  await tx.insert(s.enrollments).values({ schoolId: ctx.schoolId, studentId: stu!.id, sectionId: sec.id, academicYearId: year.id });
  await audit(tx, ctx, "create", "students", stu!.id, null, { name: stu!.name, admissionNo, sectionId: sec.id, familyId: fam.familyId, joinedExistingFamily: !fam.created });
  return { studentId: stu!.id, familyId: fam.familyId, joinedExistingFamily: !fam.created };
}

export async function updateStudent(
  tx: Tx,
  ctx: AppCtx,
  input: { studentId: string; name: string; gender: "M" | "F" | null; sectionId: string; tuitionFeeMinor: number | null },
) {
  assertCan(ctx, "students.edit");
  const [before] = await tx.select().from(s.students).where(and(eq(s.students.schoolId, ctx.schoolId), eq(s.students.id, input.studentId)));
  if (!before) throw new AppError("Student not found.");
  if (input.tuitionFeeMinor !== null && (!Number.isSafeInteger(input.tuitionFeeMinor) || input.tuitionFeeMinor < 0)) throw new AppError("Enter a valid fee.");
  await tx.update(s.students).set({ name: input.name.trim() || before.name, gender: input.gender, tuitionFeeMinor: input.tuitionFeeMinor }).where(eq(s.students.id, before.id));
  const year = await currentYear(tx, ctx);
  await tx.update(s.enrollments).set({ sectionId: input.sectionId }).where(and(eq(s.enrollments.studentId, before.id), eq(s.enrollments.academicYearId, year.id)));
  await audit(tx, ctx, "update", "students", before.id, { name: before.name, tuitionFeeMinor: before.tuitionFeeMinor }, input);
}

export async function withdrawStudent(tx: Tx, ctx: AppCtx, input: { studentId: string; reason: string }) {
  assertCan(ctx, "students.edit");
  const [before] = await tx.select().from(s.students).where(and(eq(s.students.schoolId, ctx.schoolId), eq(s.students.id, input.studentId)));
  if (!before || before.status !== "active") throw new AppError("Student not found or already withdrawn.");
  await tx.update(s.students).set({ status: "withdrawn", withdrawnOn: ctx.today, withdrawalReason: input.reason.trim() || null }).where(eq(s.students.id, before.id));
  await audit(tx, ctx, "withdraw", "students", before.id, { status: "active" }, { status: "withdrawn", reason: input.reason });
}

export async function updateGuardian(tx: Tx, ctx: AppCtx, input: { guardianId: string; name: string; phone: string; prefersVoice: boolean }) {
  assertCan(ctx, "students.edit");
  const phone = normalizePkPhone(input.phone);
  if (input.phone && !phone) throw new AppError("Phone is not a valid Pakistani mobile number.");
  await tx.update(s.guardians)
    .set({ name: input.name.trim(), phoneE164: phone ?? "", whatsappOptIn: Boolean(phone), prefersVoice: input.prefersVoice })
    .where(and(eq(s.guardians.schoolId, ctx.schoolId), eq(s.guardians.id, input.guardianId)));
  await audit(tx, ctx, "update", "guardians", input.guardianId, null, { name: input.name, phone });
}

/**
 * Save an import preview: creates missing classes/sections, families (siblings by phone), students and
 * enrolments. If a class has no tuition fee yet, it is set to the most common imported fee for that class;
 * students paying a different amount keep it as their own fee.
 */
export async function commitImport(tx: Tx, ctx: AppCtx, preview: ImportPreview) {
  assertCan(ctx, "students.import");
  if (!preview.studentCount) throw new AppError("Nothing to import.");
  const year = await currentYear(tx, ctx);
  const tuitionHeadId = ctx.settings.tuitionHeadId;

  const classes = await tx.select().from(s.classes).where(eq(s.classes.schoolId, ctx.schoolId));
  const sections = await tx.select().from(s.sections).where(and(eq(s.sections.schoolId, ctx.schoolId), eq(s.sections.academicYearId, year.id)));
  const classId = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]));
  const sectionId = new Map(sections.map((x) => [`${x.classId}:${x.name}`, x.id]));
  let classesCreated = 0;

  for (const c of preview.classes) {
    let cid = classId.get(c.className.toLowerCase());
    if (!cid) {
      const [row] = await tx.insert(s.classes).values({ schoolId: ctx.schoolId, name: c.className, level: classOrder(c.className) }).returning();
      cid = row!.id;
      classId.set(c.className.toLowerCase(), cid);
      classesCreated++;
    }
    for (const sec of c.sections) {
      if (sectionId.has(`${cid}:${sec}`)) continue;
      const [row] = await tx.insert(s.sections).values({ schoolId: ctx.schoolId, classId: cid, academicYearId: year.id, name: sec }).returning();
      sectionId.set(`${cid}:${sec}`, row!.id);
    }
  }

  // class fee = most common imported fee, only where the class has none yet
  const classFee = new Map<string, number>();
  if (tuitionHeadId) {
    const existing = await tx.select().from(s.feeStructures).where(and(eq(s.feeStructures.academicYearId, year.id), eq(s.feeStructures.feeHeadId, tuitionHeadId)));
    for (const e of existing) classFee.set(e.classId, e.amountMinor);
    const counts = new Map<string, Map<number, number>>();
    for (const f of preview.families)
      for (const st of f.students) {
        if (st.monthlyFeeMinor === null) continue;
        const cid = classId.get(st.className.toLowerCase())!;
        const m = counts.get(cid) ?? new Map<number, number>();
        m.set(st.monthlyFeeMinor, (m.get(st.monthlyFeeMinor) ?? 0) + 1);
        counts.set(cid, m);
      }
    for (const [cid, m] of counts) {
      if (classFee.has(cid)) continue;
      const mode = [...m.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0];
      await tx.insert(s.feeStructures).values({ schoolId: ctx.schoolId, academicYearId: year.id, classId: cid, feeHeadId: tuitionHeadId, amountMinor: mode });
      classFee.set(cid, mode);
    }
  }

  const usedNos = new Set((await tx.select({ n: s.students.admissionNo }).from(s.students).where(eq(s.students.schoolId, ctx.schoolId))).map((r) => r.n));
  let nextNo = Number(await nextAdmissionNo(tx, ctx));
  let students = 0;
  let familiesCreated = 0;
  let skipped = 0;
  for (const f of preview.families) {
    let familyId: string | null = null;
    for (const st of f.students) {
      let admissionNo = st.admissionNo;
      if (admissionNo && usedNos.has(admissionNo)) {
        skipped++;
        continue; // already imported (re-running an import does not duplicate students)
      }
      if (!admissionNo) {
        while (usedNos.has(String(nextNo))) nextNo++;
        admissionNo = String(nextNo++);
      }
      usedNos.add(admissionNo);
      if (!familyId) {
        const fam = await familyForGuardian(tx, ctx, { guardianName: f.guardianName, phoneE164: f.phoneE164 });
        familyId = fam.familyId;
        if (fam.created) familiesCreated++;
      }
      const cid = classId.get(st.className.toLowerCase())!;
      const fee = st.monthlyFeeMinor !== null && st.monthlyFeeMinor !== classFee.get(cid) ? st.monthlyFeeMinor : null;
      const [row] = await tx.insert(s.students).values({
        schoolId: ctx.schoolId, familyId, admissionNo, name: st.name, gender: st.gender,
        admittedOn: st.admittedOn, tuitionFeeMinor: fee,
      }).returning({ id: s.students.id });
      await tx.insert(s.enrollments).values({ schoolId: ctx.schoolId, studentId: row!.id, sectionId: sectionId.get(`${cid}:${st.section}`)!, academicYearId: year.id });
      students++;
    }
  }
  await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "page_digital", quantity: students, refTable: "students", occurredAt: new Date() });
  await audit(tx, ctx, "import", "students", null, null, { students, familiesCreated, classesCreated, skipped });
  return { students, familiesCreated, classesCreated, skipped };
}

// ======================= fees =======================

/** Generates one invoice per family for `period`. Safe to run again: families already billed are skipped. */
export async function runInvoices(tx: Tx, ctx: AppCtx, input: { period: string; extraHeadIds: string[]; dueDate: Date }) {
  assertCan(ctx, "fees.run");
  const { first } = periodBounds(input.period);
  if (input.dueDate.getTime() < first.getTime()) throw new AppError("Due date must be in the billing month or later.");
  // one run at a time per school
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`invoice-run:${ctx.schoolId}`}))`);
  const year = await currentYear(tx, ctx);
  const students = await tx
    .select({ id: s.students.id, familyId: s.students.familyId, name: s.students.name, classId: s.sections.classId, tuitionFeeMinor: s.students.tuitionFeeMinor })
    .from(s.students)
    .innerJoin(s.enrollments, and(eq(s.enrollments.studentId, s.students.id), eq(s.enrollments.academicYearId, year.id)))
    .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
    .where(and(eq(s.students.schoolId, ctx.schoolId), eq(s.students.status, "active"), isNull(s.students.deletedAt)));
  const heads = await tx.select().from(s.feeHeads).where(eq(s.feeHeads.schoolId, ctx.schoolId));
  const structures = await tx.select().from(s.feeStructures).where(and(eq(s.feeStructures.schoolId, ctx.schoolId), eq(s.feeStructures.academicYearId, year.id)));
  const adjustments = await tx.select().from(s.studentFeeAdjustments).where(and(eq(s.studentFeeAdjustments.schoolId, ctx.schoolId), eq(s.studentFeeAdjustments.status, "approved")));
  const billed = await tx.select({ familyId: s.invoices.familyId }).from(s.invoices)
    .where(and(eq(s.invoices.schoolId, ctx.schoolId), eq(s.invoices.period, input.period), ne(s.invoices.status, "void")));

  // a student's own tuition replaces the class tuition: give each such student a private "class"
  const tuitionHeadId = ctx.settings.tuitionHeadId;
  const runStructures = structures.map((x) => ({ classId: x.classId, feeHeadId: x.feeHeadId, amountMinor: x.amountMinor }));
  const runStudents = students.map((st) => {
    if (!tuitionHeadId || st.tuitionFeeMinor === null) return st;
    const own = `student:${st.id}`;
    for (const x of structures.filter((y) => y.classId === st.classId && y.feeHeadId !== tuitionHeadId)) runStructures.push({ classId: own, feeHeadId: x.feeHeadId, amountMinor: x.amountMinor });
    runStructures.push({ classId: own, feeHeadId: tuitionHeadId, amountMinor: st.tuitionFeeMinor });
    return { ...st, classId: own };
  });

  const result = buildInvoiceRun({
    period: input.period,
    students: runStudents,
    heads: heads.map((h) => ({ id: h.id, name: h.name, frequency: h.frequency })),
    structures: runStructures,
    adjustments: adjustments.map((a) => ({
      studentId: a.studentId, feeHeadId: a.feeHeadId, kind: a.kind === "fixed" ? "fixed" : "percent", value: a.value, validFrom: a.validFrom, validTo: a.validTo,
    })),
    extraHeadIds: input.extraHeadIds,
    alreadyBilledFamilyIds: billed.map((b) => b.familyId),
  });

  let totalMinor = 0;
  for (const inv of result.invoices) {
    const [row] = await tx.insert(s.invoices).values({
      schoolId: ctx.schoolId, familyId: inv.familyId, period: input.period, issueDate: ctx.today, dueDate: input.dueDate,
      totalMinor: inv.totalMinor, balanceMinor: inv.totalMinor, status: inv.totalMinor === 0 ? "paid" : "open", source: "auto",
    }).returning({ id: s.invoices.id });
    await tx.insert(s.invoiceLines).values(inv.lines.map((l) => ({ schoolId: ctx.schoolId, invoiceId: row!.id, ...l })));
    totalMinor += inv.totalMinor;
    if (inv.totalMinor > 0) {
      await queueToFamily(tx, ctx, inv.familyId, {
        category: "fee", templateKey: "fee_slip",
        body: feeSlipText({ period: input.period, amountMinor: inv.totalMinor, dueDay: input.dueDate.getUTCDate(), code: paymentCodeFor(row!.id) }),
        payload: { invoiceId: row!.id },
      });
    }
  }
  if (result.invoices.length) {
    await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "page_digital", quantity: result.invoices.length, refTable: "invoices", occurredAt: new Date() });
  }
  await audit(tx, ctx, "run", "invoices", null, null, { period: input.period, created: result.invoices.length, totalMinor, skipped: result.skippedFamilyIds.length });
  return {
    created: result.invoices.length,
    totalMinor,
    skipped: result.skippedFamilyIds.length,
    studentsWithoutFee: result.studentsWithoutFee.map((x) => x.name),
  };
}

export async function recordPayment(
  tx: Tx,
  ctx: AppCtx,
  input: { familyId: string; amountMinor: number; method: "cash" | "bank" | "wallet" | "cheque"; reference?: string; note?: string },
) {
  assertCan(ctx, "fees.collect");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new AppError("Enter the amount received.");
  const [fam] = await tx.select({ id: s.families.id }).from(s.families).where(and(eq(s.families.schoolId, ctx.schoolId), eq(s.families.id, input.familyId)));
  if (!fam) throw new AppError("Family not found.");
  const open = await tx
    .select({ id: s.invoices.id, dueDate: s.invoices.dueDate, balanceMinor: s.invoices.balanceMinor, totalMinor: s.invoices.totalMinor, paidMinor: s.invoices.paidMinor })
    .from(s.invoices)
    .where(and(eq(s.invoices.schoolId, ctx.schoolId), eq(s.invoices.familyId, input.familyId), gt(s.invoices.balanceMinor, 0), ne(s.invoices.status, "void")))
    .for("update");
  const { allocations, advanceMinor } = allocatePayment(input.amountMinor, open);

  const [lastReminder] = await tx.select({ id: s.reminderEvents.id, sentAt: s.reminderEvents.sentAt }).from(s.reminderEvents)
    // only reminders that really went out count (queued-but-unsent or skipped ones are not credited)
    .where(and(eq(s.reminderEvents.schoolId, ctx.schoolId), eq(s.reminderEvents.familyId, input.familyId), eq(s.reminderEvents.outcome, "sent")))
    .orderBy(desc(s.reminderEvents.sentAt)).limit(1);
  const attributed = isRecoveredByReminder(ctx.today, lastReminder?.sentAt ?? null);
  const receiptNo = await nextCounter(tx, ctx, "receipt_no");

  const [payment] = await tx.insert(s.payments).values({
    schoolId: ctx.schoolId, familyId: input.familyId, amountMinor: input.amountMinor, method: input.method,
    reference: input.reference?.trim() || null, note: input.note?.trim() || null, paidOn: ctx.today, receivedByUserId: ctx.userId,
    attributedToCampusos: attributed, attributedReminderEventId: attributed ? lastReminder!.id : null, receiptNo,
  }).returning({ id: s.payments.id });

  for (const a of allocations) {
    const inv = open.find((o) => o.id === a.invoiceId)!;
    await tx.insert(s.paymentAllocations).values({ schoolId: ctx.schoolId, paymentId: payment!.id, invoiceId: a.invoiceId, amountMinor: a.amountMinor });
    await tx.update(s.invoices)
      .set({ balanceMinor: a.newBalanceMinor, paidMinor: inv.paidMinor + a.amountMinor, status: invoiceStatusFor(inv.totalMinor, a.newBalanceMinor) })
      .where(eq(s.invoices.id, a.invoiceId));
  }
  const remainingMinor = open.reduce((sum, o) => sum + o.balanceMinor, 0) - (input.amountMinor - advanceMinor);
  if (attributed) {
    await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "fee_recovered", valueMinor: input.amountMinor, refTable: "payments", refId: payment!.id, occurredAt: new Date() });
  }
  await queueToFamily(tx, ctx, input.familyId, {
    category: "receipt", templateKey: "receipt",
    body: receiptText({ amountMinor: input.amountMinor, balanceMinor: remainingMinor, school: ctx.schoolName }),
    payload: { paymentId: payment!.id, receiptNo },
  });
  await audit(tx, ctx, "create", "payments", payment!.id, null, { familyId: input.familyId, amountMinor: input.amountMinor, method: input.method, receiptNo, allocations, advanceMinor });
  return { paymentId: payment!.id, receiptNo, allocations, advanceMinor, remainingMinor };
}

/** Owner-only. Adds a negative reversal entry and restores the invoice balances the payment had cleared. */
export async function reversePayment(tx: Tx, ctx: AppCtx, input: { paymentId: string; reason: string }) {
  assertCan(ctx, "fees.reverse");
  if (input.reason.trim().length < 3) throw new AppError("Write why this payment is being reversed.");
  const [p] = await tx.select().from(s.payments).where(and(eq(s.payments.schoolId, ctx.schoolId), eq(s.payments.id, input.paymentId))).for("update");
  if (!p) throw new AppError("Payment not found.");
  if (p.status !== "confirmed" || p.reversalOf) throw new AppError("This payment is already reversed or is itself a reversal.");
  const allocs = await tx.select().from(s.paymentAllocations).where(eq(s.paymentAllocations.paymentId, p.id));
  const invs = allocs.length
    ? await tx.select().from(s.invoices).where(inArray(s.invoices.id, allocs.map((a) => a.invoiceId))).for("update")
    : [];
  const updates = reverseAllocations(allocs, invs);
  const receiptNo = await nextCounter(tx, ctx, "receipt_no");
  const [rev] = await tx.insert(s.payments).values({
    schoolId: ctx.schoolId, familyId: p.familyId, amountMinor: -p.amountMinor, method: p.method, paidOn: ctx.today,
    receivedByUserId: ctx.userId, status: "reversal", reversalOf: p.id, note: input.reason.trim(), receiptNo,
  }).returning({ id: s.payments.id });
  for (const a of allocs) {
    await tx.insert(s.paymentAllocations).values({ schoolId: ctx.schoolId, paymentId: rev!.id, invoiceId: a.invoiceId, amountMinor: -a.amountMinor });
  }
  for (const u of updates) {
    await tx.update(s.invoices).set({ paidMinor: u.paidMinor, balanceMinor: u.balanceMinor, status: u.status }).where(eq(s.invoices.id, u.invoiceId));
  }
  await tx.update(s.payments).set({ status: "reversed" }).where(eq(s.payments.id, p.id));
  if (p.attributedToCampusos) {
    await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "fee_recovered", valueMinor: -p.amountMinor, refTable: "payments", refId: rev!.id, occurredAt: new Date() });
  }
  await audit(tx, ctx, "reverse", "payments", p.id, { status: "confirmed" }, { status: "reversed", reversalId: rev!.id, reason: input.reason });
  return { reversalId: rev!.id, receiptNo };
}

export async function requestDiscount(
  tx: Tx,
  ctx: AppCtx,
  input: { studentId: string; percent: number; reason: string; validFrom: Date },
) {
  assertCan(ctx, "fees.discount.request");
  if (!(Number.isInteger(input.percent) && input.percent > 0 && input.percent <= 100)) throw new AppError("Discount must be 1–100%.");
  if (!input.reason.trim()) throw new AppError("Write the reason for the discount.");
  const approvedNow = can(ctx.role, "fees.discount.approve");
  const [adj] = await tx.insert(s.studentFeeAdjustments).values({
    schoolId: ctx.schoolId, studentId: input.studentId, feeHeadId: ctx.settings.tuitionHeadId ?? null, kind: "percent",
    value: approvedNow ? input.percent : 0, requestedValue: input.percent, reason: input.reason.trim(),
    status: approvedNow ? "approved" : "requested", approvedByUserId: approvedNow ? ctx.userId : null, validFrom: input.validFrom,
  }).returning();
  await audit(tx, ctx, approvedNow ? "approve" : "request", "student_fee_adjustments", adj!.id, null, input);
  return { status: adj!.status };
}

export async function decideDiscount(tx: Tx, ctx: AppCtx, input: { adjustmentId: string; approve: boolean }) {
  assertCan(ctx, "fees.discount.approve");
  const [adj] = await tx.select().from(s.studentFeeAdjustments).where(and(eq(s.studentFeeAdjustments.schoolId, ctx.schoolId), eq(s.studentFeeAdjustments.id, input.adjustmentId))).for("update");
  if (!adj || adj.status !== "requested") throw new AppError("Request not found or already decided.");
  const pct = adj.requestedValue ?? 0;
  await tx.update(s.studentFeeAdjustments)
    .set({ status: input.approve ? "approved" : "rejected", value: input.approve ? pct : 0, approvedByUserId: ctx.userId })
    .where(eq(s.studentFeeAdjustments.id, adj.id));
  if (!input.approve) {
    // money kept for the school: one month of the discount that was asked for (measured from the fee table)
    const [fee] = await tx.execute<{ amount: string | null }>(sql`
      select coalesce(st.tuition_fee_minor, fs.amount_minor)::bigint as amount
      from ${s.students} st
      join ${s.enrollments} e on e.student_id = st.id
      join ${s.academicYears} y on y.id = e.academic_year_id and y.is_current
      join ${s.sections} sec on sec.id = e.section_id
      left join ${s.feeStructures} fs on fs.class_id = sec.class_id and fs.academic_year_id = y.id and fs.fee_head_id = ${adj.feeHeadId}
      where st.id = ${adj.studentId} limit 1
    `);
    const savedMinor = Math.round((Number(fee?.amount ?? 0) * pct) / 100);
    if (savedMinor > 0) await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "concession_controlled", valueMinor: savedMinor, refTable: "student_fee_adjustments", refId: adj.id, occurredAt: new Date() });
  }
  await audit(tx, ctx, input.approve ? "approve" : "reject", "student_fee_adjustments", adj.id, { status: "requested" }, { pct });
}

// ======================= attendance =======================

/** Sections this user may mark: teachers only their own class; principal/owner any. */
export async function markableSectionIds(tx: Tx, ctx: AppCtx): Promise<string[] | "all"> {
  if (can(ctx.role, "attendance.mark.any")) return "all";
  const rows = await tx.select({ id: s.sections.id }).from(s.sections)
    .innerJoin(s.staff, eq(s.staff.id, s.sections.classTeacherStaffId))
    .where(and(eq(s.sections.schoolId, ctx.schoolId), eq(s.staff.userId, ctx.userId)));
  return rows.map((r) => r.id);
}

/**
 * Save a register. `clientUuid` makes offline re-sends safe: the same submission saved twice is applied once.
 * A later correction for the same day replaces the earlier register. Alerts go only to parents of children
 * newly marked absent.
 */
export async function submitAttendance(
  tx: Tx,
  ctx: AppCtx,
  input: { sectionId: string; date: Date; absentIds: string[]; lateIds: string[]; clientUuid: string; durationSeconds: number },
) {
  assertCan(ctx, "attendance.mark");
  const allowed = await markableSectionIds(tx, ctx);
  if (allowed !== "all" && !allowed.includes(input.sectionId)) throw new AppError("You can only mark your own class.");
  const ageDays = Math.round((ctx.today.getTime() - input.date.getTime()) / 86_400_000);
  if (ageDays < 0 || ageDays > 7) throw new AppError("Attendance can be saved for today or the last 7 days only.");

  const [dupe] = await tx.select({ id: s.attendanceSessions.id }).from(s.attendanceSessions)
    .where(and(eq(s.attendanceSessions.schoolId, ctx.schoolId), eq(s.attendanceSessions.clientUuid, input.clientUuid)));
  if (dupe) return { sessionId: dupe.id, duplicate: true, total: 0, absent: 0, alerts: 0 };

  const year = await currentYear(tx, ctx);
  const roster = await tx
    .select({ id: s.students.id, name: s.students.name, gender: s.students.gender, familyId: s.students.familyId })
    .from(s.enrollments)
    .innerJoin(s.students, eq(s.students.id, s.enrollments.studentId))
    .where(and(eq(s.enrollments.schoolId, ctx.schoolId), eq(s.enrollments.sectionId, input.sectionId), eq(s.enrollments.academicYearId, year.id), eq(s.students.status, "active")));
  if (!roster.length) throw new AppError("This class has no students yet.");
  const ids = new Set(roster.map((r) => r.id));
  const absent = new Set(input.absentIds.filter((id) => ids.has(id)));
  const late = new Set(input.lateIds.filter((id) => ids.has(id) && !absent.has(id)));

  const [existing] = await tx.select({ id: s.attendanceSessions.id }).from(s.attendanceSessions)
    .where(and(eq(s.attendanceSessions.schoolId, ctx.schoolId), eq(s.attendanceSessions.sectionId, input.sectionId), eq(s.attendanceSessions.date, input.date)));
  let previouslyAbsent = new Set<string>();
  let before: unknown = null;
  if (existing) {
    const prev = await tx.select().from(s.attendanceRecords).where(eq(s.attendanceRecords.sessionId, existing.id));
    previouslyAbsent = new Set(prev.filter((p) => p.status === "absent").map((p) => p.studentId));
    before = { absent: [...previouslyAbsent] };
    await tx.delete(s.attendanceRecords).where(eq(s.attendanceRecords.sessionId, existing.id));
    await tx.delete(s.attendanceSessions).where(eq(s.attendanceSessions.id, existing.id));
  }
  const [session] = await tx.insert(s.attendanceSessions).values({
    schoolId: ctx.schoolId, sectionId: input.sectionId, date: input.date, submittedByUserId: ctx.userId, submittedAt: new Date(),
    method: "tap", clientUuid: input.clientUuid, durationSeconds: Math.max(0, Math.min(3600, Math.round(input.durationSeconds))),
  }).returning({ id: s.attendanceSessions.id });
  await tx.insert(s.attendanceRecords).values(roster.map((r) => ({
    schoolId: ctx.schoolId, sessionId: session!.id, studentId: r.id, status: absent.has(r.id) ? "absent" : late.has(r.id) ? "late" : "present",
  })));

  let alerts = 0;
  if (ageDays === 0) {
    for (const r of roster.filter((x) => absent.has(x.id) && !previouslyAbsent.has(x.id))) {
      const id = await queueToFamily(tx, ctx, r.familyId, {
        category: "attendance", templateKey: "absence_alert",
        body: absenceAlertText({ child: r.name, gender: r.gender === "F" ? "F" : "M", school: ctx.schoolName }),
        payload: { studentId: r.id, date: input.date.toISOString().slice(0, 10) },
      });
      if (id) alerts++;
    }
  }
  if (!existing) await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "attendance_taken", refTable: "attendance_sessions", refId: session!.id, occurredAt: new Date() });
  await audit(tx, ctx, existing ? "update" : "create", "attendance_sessions", session!.id, before, {
    sectionId: input.sectionId, date: input.date.toISOString().slice(0, 10), absent: [...absent], late: [...late],
  });
  return { sessionId: session!.id, duplicate: false, total: roster.length, absent: absent.size, alerts };
}

// ======================= outbox =======================

export async function markMessageSent(tx: Tx, ctx: AppCtx, input: { messageId: string; skipped?: boolean }) {
  assertCan(ctx, "messages.send");
  await tx.update(s.messages)
    .set({ status: input.skipped ? "skipped" : "sent_manual", sentAt: new Date(), payload: sql`coalesce(${s.messages.payload}, '{}'::jsonb) || ${JSON.stringify({ sentBy: ctx.userId })}::jsonb` })
    .where(and(eq(s.messages.schoolId, ctx.schoolId), eq(s.messages.id, input.messageId), inArray(s.messages.status, ["outbox", "simulated", "pending_api"])));
  if (!input.skipped) await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "reminder_automated", refTable: "messages", refId: input.messageId, occurredAt: new Date() });
  // a scheduled fee reminder counts from when it was actually sent (payment attribution uses this time)
  await tx.update(s.reminderEvents)
    .set({ outcome: input.skipped ? "skipped" : "sent", sentAt: new Date() })
    .where(and(eq(s.reminderEvents.schoolId, ctx.schoolId), eq(s.reminderEvents.messageId, input.messageId), inArray(s.reminderEvents.outcome, ["queued", "simulated"])));
}

// ======================= follow-up calls =======================

/** Principal/owner logs the result of a call about a student who may leave. */
export async function logRiskFollowup(
  tx: Tx,
  ctx: AppCtx,
  input: { studentId: string; outcome: "will_return" | "fee_plan_agreed" | "leaving" | "no_answer"; notes?: string },
) {
  assertCan(ctx, "attendance.mark.any");
  const [st] = await tx.select({ id: s.students.id }).from(s.students).where(and(eq(s.students.schoolId, ctx.schoolId), eq(s.students.id, input.studentId)));
  if (!st) throw new AppError("Student not found.");
  await tx.insert(s.riskFollowups).values({ schoolId: ctx.schoolId, studentId: st.id, action: "called", outcome: input.outcome, notes: input.notes?.trim() || null, byRole: ctx.role });
  if (input.outcome === "will_return" || input.outcome === "fee_plan_agreed") {
    await tx.insert(s.roiEvents).values({ schoolId: ctx.schoolId, kind: "student_kept", refTable: "students", refId: st.id, occurredAt: new Date() });
  }
  await audit(tx, ctx, "followup", "students", st.id, null, input);
}

/** Result of a principal's fee call (reminder step 3). A promise to pay pauses reminders until that date. */
export async function logFeeCall(
  tx: Tx,
  ctx: AppCtx,
  input: { reminderEventId: string; outcome: "promised" | "no_answer" | "refused"; promisedOn?: Date | null; amountMinor?: number | null },
) {
  assertCan(ctx, "messages.send");
  const [ev] = await tx.select().from(s.reminderEvents).where(and(eq(s.reminderEvents.schoolId, ctx.schoolId), eq(s.reminderEvents.id, input.reminderEventId)));
  if (!ev || ev.channel !== "principal_call") throw new AppError("Call not found.");
  if (input.outcome === "promised") {
    if (!input.promisedOn || input.promisedOn.getTime() < ctx.today.getTime()) throw new AppError("Choose the date they promised to pay.");
    await tx.insert(s.promisesToPay).values({
      schoolId: ctx.schoolId, familyId: ev.familyId, promisedOn: input.promisedOn, amountMinor: input.amountMinor ?? 0, createdVia: "principal_call",
    });
  }
  await tx.update(s.reminderEvents).set({ outcome: input.outcome === "promised" ? "promised" : input.outcome, sentAt: new Date() }).where(eq(s.reminderEvents.id, ev.id));
  await audit(tx, ctx, "fee_call", "reminder_events", ev.id, { outcome: ev.outcome }, input);
}

/** Text for a reminder to one family about everything they owe (computed in SQL, worded by template). */
export async function queueFeeReminder(tx: Tx, ctx: AppCtx, input: { familyId: string }) {
  assertCan(ctx, "messages.send");
  const [due] = await tx.execute<{ total: string; months: number }>(sql`
    select coalesce(sum(balance_minor), 0)::bigint as total, count(*)::int as months from ${s.invoices}
    where school_id = ${ctx.schoolId} and family_id = ${input.familyId} and balance_minor > 0 and status <> 'void'
  `);
  const total = Number(due?.total ?? 0);
  if (total <= 0) throw new AppError("This family has nothing due.");
  const amount = formatMoney(total);
  const body: Bilingual = {
    ur: `السلام علیکم۔ ${ctx.schoolName} کی فیس ${amount} باقی ہے (${due!.months} مہینے)۔ براہ کرم جلد ادا کریں۔ شکریہ`,
    en: `Assalam-o-Alaikum. ${amount} fee is due at ${ctx.schoolName} (${due!.months} month${due!.months === 1 ? "" : "s"}). Please pay soon. Thank you.`,
  };
  const id = await queueToFamily(tx, ctx, input.familyId, { category: "fee", templateKey: "fee_reminder_manual", body });
  if (!id) throw new AppError("This family has no WhatsApp number.");
  return { messageId: id };
}
