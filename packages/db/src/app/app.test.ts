/**
 * Integration tests against the real Postgres (DATABASE_URL). Creates two throwaway schools, checks tenant
 * isolation with RLS, and runs the fee flow end to end: import -> invoice run -> payment -> reversal.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { buildImportPreview, guessColumns } from "@campusos/core";
import { createDb } from "../index";
import * as s from "../schema/index";
import {
  AppError, commitImport, createSchool, getDefaulters, getFamily, listStudents, recordPayment, requestOtp, reversePayment,
  runInvoices, submitAttendance, verifyOtp, getSession, withSchool, getRoster, getSectionsWithStatus, type AppCtx,
} from "./index";

process.env.AUTH_SECRET ??= "test-secret-at-least-16-chars";
const db = createDb();
const today = new Date("2026-11-18T00:00:00Z");
const created: string[] = [];
const phones = ["+923009990001", "+923009990002"];

async function makeSchool(name: string, phone: string): Promise<AppCtx> {
  const { code } = await requestOtp(db, phone, null, "dev");
  const { userId } = await verifyOtp(db, phone, code, "test");
  const { schoolId } = await createSchool(db, { userId, ownerName: "Test Owner", schoolName: name, city: "Lahore", yearStartsOn: new Date("2026-04-01T00:00:00Z") });
  created.push(schoolId);
  const [sc] = await db.select().from(s.schools).where(eq(s.schools.id, schoolId));
  return { schoolId, schoolName: name, userId, role: "owner", today, settings: sc!.settings as AppCtx["settings"] };
}

let a: AppCtx;
let b: AppCtx;

beforeAll(async () => {
  await cleanup();
  a = await makeSchool("Test School A", phones[0]!);
  b = await makeSchool("Test School B", phones[1]!);
  const rows = [
    ["GR No", "Student Name", "Father Name", "Class", "Section", "Mobile", "Monthly Fee"],
    ["1", "Ali", "Imran", "Class 1", "A", "0300-1110001", "3000"],
    ["2", "Sana", "Imran", "Class 3", "A", "0300-1110001", "3500"],
    ["3", "Omar", "Khalid", "Class 1", "A", "0300-1110002", "3000"],
    ["4", "Hira", "Asif", "Class 1", "B", "0300-1110003", "2500"],
  ];
  await withSchool(db, a.schoolId, (tx) => commitImport(tx, a, buildImportPreview(rows, guessColumns(rows[0]!))));
});

async function cleanup() {
  const users = await db.select({ id: s.users.id }).from(s.users).where(inArray(s.users.phoneE164, phones));
  const ids = users.map((u) => u.id);
  if (ids.length) {
    const ms = await db.select({ schoolId: s.memberships.schoolId }).from(s.memberships).where(inArray(s.memberships.userId, ids));
    created.push(...ms.map((m) => m.schoolId));
  }
  const schoolIds = [...new Set(created)];
  if (schoolIds.length) {
    for (const t of Object.values(s)) {
      if (t && typeof t === "object" && "schoolId" in t && (t as unknown) !== s.schools) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.delete(t as any).where(inArray((t as any).schoolId, schoolIds));
      }
    }
    await db.delete(s.schools).where(inArray(s.schools.id, schoolIds));
  }
  if (ids.length) {
    await db.delete(s.sessions).where(inArray(s.sessions.userId, ids));
    await db.delete(s.users).where(inArray(s.users.id, ids));
  }
  await db.delete(s.otpChallenges).where(inArray(s.otpChallenges.phoneE164, phones));
  created.length = 0;
}

afterAll(async () => {
  await cleanup();
  await db.$client.end();
});

describe("tenant isolation (RLS)", () => {
  it("school B cannot read school A rows, even without a school_id filter", async () => {
    const seenByB = await withSchool(db, b.schoolId, (tx) => tx.select().from(s.students));
    expect(seenByB).toHaveLength(0);
    const seenByA = await withSchool(db, a.schoolId, (tx) => tx.select().from(s.students));
    expect(seenByA).toHaveLength(4);
  });

  it("school B cannot write a row into school A", async () => {
    const err = await withSchool(db, b.schoolId, (tx) => tx.insert(s.families).values({ schoolId: a.schoolId, displayName: "intruder" })).catch((e) => e);
    expect(String((err as { cause?: Error }).cause?.message ?? err)).toMatch(/row-level security/);
  });

  it("school B cannot update school A rows", async () => {
    const n = await withSchool(db, b.schoolId, (tx) => tx.execute(sql`update students set name = 'hacked' returning id`));
    expect(n.length).toBe(0);
  });
});

describe("login", () => {
  it("rejects a wrong code and accepts the right one once", async () => {
    const { code } = await requestOtp(db, "0300-9990001", "127.0.0.1", "dev");
    const wrong = code === "000000" ? "111111" : "000000";
    await expect(verifyOtp(db, phones[0]!, wrong, null)).rejects.toThrow(/Wrong code/);
    const { token } = await verifyOtp(db, phones[0]!, code, null);
    await expect(verifyOtp(db, phones[0]!, code, null)).rejects.toThrow();
    const sess = await getSession(db, token);
    expect(sess?.school?.id).toBe(a.schoolId);
    expect(sess?.role).toBe("owner");
  });
});

describe("fee flow", () => {
  it("import grouped siblings and set class fees from the register", async () => {
    const list = await withSchool(db, a.schoolId, (tx) => listStudents(tx, a, {}));
    const imran = list.filter((x) => x.guardianName === "Imran");
    expect(imran).toHaveLength(2);
    expect(imran[0]!.familyId).toBe(imran[1]!.familyId);
  });

  it("runs invoices once per family, using each student's own fee when it differs", async () => {
    const r1 = await withSchool(db, a.schoolId, (tx) => runInvoices(tx, a, { period: "2026-11", extraHeadIds: [], dueDate: new Date("2026-11-10T00:00:00Z") }));
    expect(r1.created).toBe(3);
    // Imran 3000 + 3500, Khalid 3000, Asif 2500 (own fee, class fee is 3000)
    expect(r1.totalMinor).toBe(1_200_000);
    const r2 = await withSchool(db, a.schoolId, (tx) => runInvoices(tx, a, { period: "2026-11", extraHeadIds: [], dueDate: new Date("2026-11-10T00:00:00Z") }));
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBe(3);
    const outbox = await withSchool(db, a.schoolId, (tx) => tx.select().from(s.messages).where(eq(s.messages.templateKey, "fee_slip")));
    expect(outbox).toHaveLength(3);
  });

  it("records a payment with a receipt number, then reverses it exactly", async () => {
    const def = await withSchool(db, a.schoolId, (tx) => getDefaulters(tx, a));
    const imran = def.find((d) => d.guardian === "Imran")!;
    expect(imran.balanceMinor).toBe(650_000);
    const p = await withSchool(db, a.schoolId, (tx) => recordPayment(tx, a, { familyId: imran.familyId, amountMinor: 400_000, method: "cash" }));
    expect(p.receiptNo).toBe(1);
    expect(p.remainingMinor).toBe(250_000);
    let fam = await withSchool(db, a.schoolId, (tx) => getFamily(tx, a, imran.familyId));
    expect(fam!.balanceMinor).toBe(250_000);

    await expect(withSchool(db, a.schoolId, (tx) => reversePayment(tx, { ...a, role: "accountant" }, { paymentId: p.paymentId, reason: "wrong family" }))).rejects.toThrow(AppError);
    const rev = await withSchool(db, a.schoolId, (tx) => reversePayment(tx, a, { paymentId: p.paymentId, reason: "wrong family" }));
    expect(rev.receiptNo).toBe(2);
    fam = await withSchool(db, a.schoolId, (tx) => getFamily(tx, a, imran.familyId));
    expect(fam!.balanceMinor).toBe(650_000);
    await expect(withSchool(db, a.schoolId, (tx) => reversePayment(tx, a, { paymentId: p.paymentId, reason: "again" }))).rejects.toThrow(/already/);
    const logs = await withSchool(db, a.schoolId, (tx) => tx.select().from(s.auditLogs).where(eq(s.auditLogs.entity, "payments")));
    expect(logs.map((l) => l.action).sort()).toEqual(["create", "reverse"]);
  });

  it("school B cannot take a payment against school A's family", async () => {
    const def = await withSchool(db, a.schoolId, (tx) => getDefaulters(tx, a));
    await expect(withSchool(db, b.schoolId, (tx) => recordPayment(tx, b, { familyId: def[0]!.familyId, amountMinor: 100, method: "cash" }))).rejects.toThrow(/not found/);
  });
});

describe("attendance", () => {
  it("saves once per offline submission and queues alerts only for newly absent children", async () => {
    const secs = await withSchool(db, a.schoolId, (tx) => getSectionsWithStatus(tx, a, today, "all"));
    const sec = secs.find((x) => x.className === "Class 1" && x.name === "A")!;
    const roster = await withSchool(db, a.schoolId, (tx) => getRoster(tx, a, sec.id, today));
    const ali = roster!.students.find((x) => x.name === "Ali")!;
    const input = { sectionId: sec.id, date: today, absentIds: [ali.id], lateIds: [], clientUuid: crypto.randomUUID(), durationSeconds: 14 };
    const r1 = await withSchool(db, a.schoolId, (tx) => submitAttendance(tx, a, input));
    expect(r1).toMatchObject({ total: 2, absent: 1, alerts: 1, duplicate: false });
    const r2 = await withSchool(db, a.schoolId, (tx) => submitAttendance(tx, a, input));
    expect(r2.duplicate).toBe(true);
    const r3 = await withSchool(db, a.schoolId, (tx) => submitAttendance(tx, a, { ...input, clientUuid: crypto.randomUUID() }));
    expect(r3.alerts).toBe(0); // Ali was already absent: no second message
    const teacher = { ...a, role: "teacher" as const };
    await expect(withSchool(db, a.schoolId, (tx) => submitAttendance(tx, teacher, { ...input, clientUuid: crypto.randomUUID() }))).rejects.toThrow(/own class/);
  });
});
