"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildImportPreview, formatMoney, isStaffRole, periodLabel, toMinor, type ColumnMap } from "@campusos/core";
import * as cmd from "@campusos/db/app";
import { action } from "@/lib/auth";
import type { FormState } from "@/components/form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const uuid = (f: FormData, k: string) => {
  const v = str(f, k);
  if (!UUID.test(v)) throw new cmd.AppError("Something is missing in the form. Reload the page and try again.");
  return v;
};
/** "2,500" rupees -> minor units; null when blank */
function rupees(v: string): number | null {
  const c = v.replace(/[,\s]/g, "");
  if (!c) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(c)) throw new cmd.AppError(`"${v}" is not a valid amount.`);
  return toMinor(Number(c));
}
function done(r: { error?: string }, ok: string, ...paths: string[]): FormState {
  if (r.error) return { error: r.error };
  for (const p of paths) revalidatePath(p);
  revalidatePath("/app", "layout");
  return { ok };
}

// ---------- setup ----------
export async function saveSettingsAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await action("school.setup", (tx, ctx) => cmd.updateSchoolSettings(tx, ctx, { name: str(f, "name"), city: str(f, "city"), dueDay: Number(str(f, "dueDay")) }));
  return done(r, "Saved.", "/app/setup");
}

export async function addClassAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await action("school.setup", (tx, ctx) => cmd.addClass(tx, ctx, { name: str(f, "name"), sections: str(f, "sections").split(/[,\s]+/) }));
  return done(r, `${str(f, "name")} added.`, "/app/setup");
}

export async function addSectionAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await action("school.setup", (tx, ctx) => cmd.addSection(tx, ctx, { classId: uuid(f, "classId"), name: str(f, "name") }));
  return done(r, "Section added.", "/app/setup");
}

export async function addFeeHeadAction(_: FormState, f: FormData): Promise<FormState> {
  const freq = str(f, "frequency");
  if (!["monthly", "term", "annual", "one_time"].includes(freq)) return { error: "Choose how often this fee is charged." };
  const r = await action("school.setup", (tx, ctx) => cmd.addFeeHead(tx, ctx, { name: str(f, "name"), frequency: freq as "monthly" }));
  return done(r, "Fee added.", "/app/setup");
}

/** Inputs named fee:<classId>:<headId> hold rupee amounts. Saves only fields that changed. */
export async function saveClassFeesAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await action("school.setup", async (tx, ctx) => {
    let n = 0;
    for (const [k, v] of f.entries()) {
      const m = /^fee:([0-9a-f-]{36}):([0-9a-f-]{36})$/i.exec(k);
      if (!m) continue;
      const before = str(f, `was:${m[1]}:${m[2]}`);
      if (String(v).trim() === before) continue;
      const amountMinor = rupees(String(v)) ?? 0;
      await cmd.setClassFee(tx, ctx, { classId: m[1]!, feeHeadId: m[2]!, amountMinor });
      n++;
    }
    return n;
  });
  return done(r, r.result ? `Saved ${r.result} fee${r.result === 1 ? "" : "s"}.` : "No changes.", "/app/setup");
}

// ---------- team & staff ----------
export async function inviteAction(_: FormState, f: FormData): Promise<FormState> {
  const role = str(f, "role");
  if (!isStaffRole(role)) return { error: "Choose a role." };
  const r = await action("team.manage", (tx, ctx) => cmd.inviteMember(tx, ctx, { name: str(f, "name"), phone: str(f, "phone"), role, designation: str(f, "designation") }));
  return done(r, `${str(f, "name")} can now log in with ${str(f, "phone")}.`, "/app/setup", "/app/staff");
}

export async function removeMemberAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await action("team.manage", (tx, ctx) => cmd.removeMember(tx, ctx, { userId: uuid(f, "userId"), role: str(f, "role") }));
  return done(r, "Access removed.", "/app/setup");
}

export async function addStaffAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await action("staff.edit", (tx, ctx) => cmd.addStaff(tx, ctx, { name: str(f, "name"), phone: str(f, "phone"), designation: str(f, "designation") }));
  return done(r, "Staff member added.", "/app/staff");
}

export async function assignTeacherAction(_: FormState, f: FormData): Promise<FormState> {
  const staffId = str(f, "staffId");
  const r = await action("staff.edit", (tx, ctx) => cmd.assignClassTeacher(tx, ctx, { sectionId: uuid(f, "sectionId"), staffId: UUID.test(staffId) ? staffId : null }));
  return done(r, "Class teacher saved.", "/app/staff", "/app/setup");
}

export async function staffAttendanceAction(_: FormState, f: FormData): Promise<FormState> {
  const status = str(f, "status") as "present" | "absent" | "late" | "leave";
  if (!["present", "absent", "late", "leave"].includes(status)) return { error: "Choose a status." };
  const r = await action("staff.edit", (tx, ctx) => cmd.markStaffAttendance(tx, ctx, { staffId: uuid(f, "staffId"), status, minutesLate: Number(str(f, "minutesLate") || 0) }));
  return done(r, "Saved.", "/app/staff");
}

// ---------- students ----------
export async function addStudentAction(_: FormState, f: FormData): Promise<FormState> {
  const g = str(f, "gender");
  const r = await action("students.edit", (tx, ctx) =>
    cmd.addStudent(tx, ctx, {
      name: str(f, "name"), gender: g === "M" || g === "F" ? g : null, sectionId: uuid(f, "sectionId"), admissionNo: str(f, "admissionNo") || null,
      guardianName: str(f, "guardianName"), phone: str(f, "phone") || null, tuitionFeeMinor: rupees(str(f, "tuitionFee")),
    }),
  );
  if (r.error) return { error: r.error };
  revalidatePath("/app/students");
  redirect(`/app/students/${r.result!.studentId}?added=${r.result!.joinedExistingFamily ? "sibling" : "1"}`);
}

export async function updateStudentAction(_: FormState, f: FormData): Promise<FormState> {
  const g = str(f, "gender");
  const r = await action("students.edit", (tx, ctx) =>
    cmd.updateStudent(tx, ctx, {
      studentId: uuid(f, "studentId"), name: str(f, "name"), gender: g === "M" || g === "F" ? g : null, sectionId: uuid(f, "sectionId"),
      tuitionFeeMinor: rupees(str(f, "tuitionFee")),
    }),
  );
  return done(r, "Saved.", `/app/students/${str(f, "studentId")}`);
}

export async function withdrawStudentAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await action("students.edit", (tx, ctx) => cmd.withdrawStudent(tx, ctx, { studentId: uuid(f, "studentId"), reason: str(f, "reason") }));
  return done(r, "Student withdrawn. They will not be billed from next month.", `/app/students/${str(f, "studentId")}`);
}

export async function updateGuardianAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await action("students.edit", (tx, ctx) =>
    cmd.updateGuardian(tx, ctx, { guardianId: uuid(f, "guardianId"), name: str(f, "name"), phone: str(f, "phone"), prefersVoice: f.get("prefersVoice") === "on" }),
  );
  return done(r, "Saved.", `/app/families/${str(f, "familyId")}`);
}

export async function requestDiscountAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await action("fees.discount.request", (tx, ctx) =>
    cmd.requestDiscount(tx, ctx, { studentId: uuid(f, "studentId"), percent: Number(str(f, "percent")), reason: str(f, "reason"), validFrom: new Date(`${str(f, "validFrom")}-01T00:00:00Z`) }),
  );
  return done(r, r.result?.status === "approved" ? "Discount approved." : "Sent to the owner for approval.", `/app/students/${str(f, "studentId")}`);
}

export async function decideDiscountAction(_: FormState, f: FormData): Promise<FormState> {
  const approve = str(f, "decision") === "approve";
  const r = await action("fees.discount.approve", (tx, ctx) => cmd.decideDiscount(tx, ctx, { adjustmentId: uuid(f, "adjustmentId"), approve }));
  return done(r, approve ? "Approved." : "Rejected. The full fee stays.", "/app", "/app/fees");
}

// ---------- import ----------
type Cell = string | number | boolean | null;
function cleanRows(rows: unknown): Cell[][] {
  if (!Array.isArray(rows) || rows.length > 5001) throw new cmd.AppError("The file is empty or has more than 5,000 rows.");
  return rows.map((r) => (Array.isArray(r) ? r.slice(0, 60).map((c) => (c === null || ["string", "number", "boolean"].includes(typeof c) ? (c as Cell) : String(c))) : []));
}

export async function commitImportAction(rows: unknown, map: ColumnMap): Promise<{ error?: string; ok?: string }> {
  const r = await action("students.import", (tx, ctx) => {
    const preview = buildImportPreview(cleanRows(rows), map);
    if (preview.issues.some((i) => i.level === "error")) throw new cmd.AppError("Fix the errors in the file first (shown in red).");
    return cmd.commitImport(tx, ctx, preview);
  });
  if (r.error) return { error: r.error };
  revalidatePath("/app", "layout");
  const x = r.result!;
  return { ok: `Imported ${x.students} students in ${x.familiesCreated} new families${x.classesCreated ? `, created ${x.classesCreated} classes` : ""}${x.skipped ? `. Skipped ${x.skipped} already in CampusOS` : ""}.` };
}

// ---------- fees ----------
export async function runInvoicesAction(_: FormState, f: FormData): Promise<FormState> {
  const period = str(f, "period");
  const dueDate = new Date(`${str(f, "dueDate")}T00:00:00Z`);
  if (!/^\d{4}-\d{2}$/.test(period) || Number.isNaN(dueDate.getTime())) return { error: "Choose the month and due date." };
  const extraHeadIds = f.getAll("extraHeadIds").map(String).filter((x) => UUID.test(x));
  const r = await action("fees.run", (tx, ctx) => cmd.runInvoices(tx, ctx, { period, dueDate, extraHeadIds }));
  if (r.error) return { error: r.error };
  const x = r.result!;
  const warn = x.studentsWithoutFee.length ? ` ${x.studentsWithoutFee.length} students have no fee set for their class and were not billed: ${x.studentsWithoutFee.slice(0, 5).join(", ")}${x.studentsWithoutFee.length > 5 ? "…" : ""}.` : "";
  return done(
    {},
    x.created
      ? `${periodLabel(period)}: ${x.created} fee slips made, total ${formatMoney(x.totalMinor)}.${x.skipped ? ` ${x.skipped} families already had a slip.` : ""}${warn}`
      : `No new slips. ${x.skipped} families already have a ${periodLabel(period)} slip.${warn}`,
    "/app/fees",
  );
}

export async function recordPaymentAction(input: { familyId: string; amount: string; method: string; reference?: string }): Promise<{ error?: string; paymentId?: string }> {
  if (!UUID.test(input.familyId)) return { error: "Choose a family first." };
  if (!["cash", "bank", "wallet", "cheque"].includes(input.method)) return { error: "Choose how it was paid." };
  let amountMinor: number | null;
  try {
    amountMinor = rupees(input.amount);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (!amountMinor) return { error: "Enter the amount received." };
  const r = await action("fees.collect", (tx, ctx) =>
    cmd.recordPayment(tx, ctx, { familyId: input.familyId, amountMinor: amountMinor!, method: input.method as "cash", reference: input.reference }),
  );
  if (r.error) return { error: r.error };
  revalidatePath("/app", "layout");
  return { paymentId: r.result!.paymentId };
}

export async function reversePaymentAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await action("fees.reverse", (tx, ctx) => cmd.reversePayment(tx, ctx, { paymentId: uuid(f, "paymentId"), reason: str(f, "reason") }));
  return done(r, "Payment reversed. The balance is back on the family's account.", `/app/receipts/${str(f, "paymentId")}`);
}

export async function queueReminderAction(_: FormState, f: FormData): Promise<FormState> {
  const r = await action("messages.send", (tx, ctx) => cmd.queueFeeReminder(tx, ctx, { familyId: uuid(f, "familyId") }));
  return done(r, "Reminder added to the WhatsApp outbox.", "/app/fees", "/app/outbox");
}

export async function queueRemindersBulkAction(_: FormState, f: FormData): Promise<FormState> {
  const ids = f.getAll("familyId").map(String).filter((x) => UUID.test(x)).slice(0, 300);
  if (!ids.length) return { error: "Tick at least one family." };
  const r = await action("messages.send", async (tx, ctx) => {
    let n = 0;
    for (const familyId of ids) {
      try {
        await cmd.queueFeeReminder(tx, ctx, { familyId });
        n++;
      } catch (e) {
        if (!(e instanceof cmd.AppError)) throw e; // families with no phone are skipped
      }
    }
    return n;
  });
  return done(r, `${r.result ?? 0} reminders added to the WhatsApp outbox.`, "/app/fees", "/app/outbox");
}

// ---------- outbox ----------
export async function markSentAction(messageId: string, skipped = false): Promise<{ error?: string }> {
  if (!UUID.test(messageId)) return { error: "Bad message." };
  const r = await action("messages.send", (tx, ctx) => cmd.markMessageSent(tx, ctx, { messageId, skipped }));
  if (!r.error) revalidatePath("/app", "layout");
  return { error: r.error };
}

// ---------- attendance (called by the offline queue) ----------
export interface AttendancePayload {
  sectionId: string;
  date: string;
  absentIds: string[];
  lateIds: string[];
  clientUuid: string;
  durationSeconds: number;
}

export async function syncAttendanceAction(p: AttendancePayload): Promise<{ error?: string; absent?: number; alerts?: number; duplicate?: boolean }> {
  if (!UUID.test(p.sectionId) || !UUID.test(p.clientUuid) || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) return { error: "Bad attendance data." };
  const r = await action("attendance.mark", (tx, ctx) =>
    cmd.submitAttendance(tx, ctx, {
      sectionId: p.sectionId, date: new Date(`${p.date}T00:00:00Z`), clientUuid: p.clientUuid, durationSeconds: Number(p.durationSeconds) || 0,
      absentIds: (p.absentIds ?? []).filter((x) => UUID.test(x)), lateIds: (p.lateIds ?? []).filter((x) => UUID.test(x)),
    }),
  );
  if (r.error) return { error: r.error };
  revalidatePath("/app/attendance");
  return { absent: r.result!.absent, alerts: r.result!.alerts, duplicate: r.result!.duplicate };
}

// ---------- cash counter lookups ----------
export async function searchFamiliesAppAction(q: string) {
  const r = await action("fees.collect", (tx, ctx) => cmd.searchFamilies(tx, ctx, String(q).slice(0, 60)));
  return r.result ?? [];
}

export async function familyDueAction(familyId: string) {
  if (!UUID.test(familyId)) return null;
  const r = await action("fees.collect", async (tx, ctx) => {
    const f = await cmd.getFamily(tx, ctx, familyId);
    if (!f) return null;
    const open = await cmd.getOpenInvoicesForFamily(tx, ctx, familyId);
    return {
      familyId, guardian: f.primary?.name ?? f.family.displayName, phone: f.primary?.phoneE164 ?? "",
      children: f.children.filter((c) => c.status === "active").map((c) => `${c.name} (${c.className ?? ""} ${c.section ?? ""})`),
      open: open.map((i) => ({ period: i.period, balanceMinor: i.balanceMinor })),
      balanceMinor: f.balanceMinor,
    };
  });
  return r.result ?? null;
}
