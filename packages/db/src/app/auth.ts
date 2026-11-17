/**
 * Phone OTP login and sessions (docs/11): 6-digit code, 5-minute expiry, 5 attempts, rate-limited per phone.
 * Only hashes of codes and session tokens are stored. These tables are not tenant-scoped.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { isStaffRole, normalizePkPhone, type StaffRole } from "@campusos/core";
import type { Db } from "../index";
import * as s from "../schema/index";

const OTP_TTL_MS = 5 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 5;
export const SESSION_TTL_MS = 30 * 24 * 3600_000;

function pepper() {
  const p = process.env.AUTH_SECRET;
  if (!p || p.length < 16) throw new Error("AUTH_SECRET is not set (at least 16 characters). See .env.example.");
  return p;
}
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const codeHash = (phone: string, code: string) => sha256(`${pepper()}:${phone}:${code}`);

export class AuthError extends Error {}

/** Creates a challenge and returns the code for the delivery channel. Never log the code in production. */
export async function requestOtp(db: Db, rawPhone: string, ip: string | null, channel: string) {
  const phone = normalizePkPhone(rawPhone);
  if (!phone) throw new AuthError("Enter a Pakistani mobile number, e.g. 0300 1234567.");
  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.otpChallenges)
    .where(and(eq(s.otpChallenges.phoneE164, phone), gt(s.otpChallenges.createdAt, new Date(Date.now() - 3600_000))));
  if ((recent?.n ?? 0) >= OTP_MAX_PER_HOUR) throw new AuthError("Too many codes requested. Try again in an hour.");
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(s.otpChallenges).values({
    phoneE164: phone, codeHash: codeHash(phone, code), channel, expiresAt: new Date(Date.now() + OTP_TTL_MS), ip,
  });
  return { phone, code };
}

/** Checks the code; on success returns the user (created if new) and a fresh session token. */
export async function verifyOtp(db: Db, rawPhone: string, code: string, deviceInfo: string | null) {
  const phone = normalizePkPhone(rawPhone);
  if (!phone || !/^\d{6}$/.test(code)) throw new AuthError("Enter the 6-digit code.");
  return db.transaction(async (tx) => {
    const [ch] = await tx
      .select()
      .from(s.otpChallenges)
      .where(and(eq(s.otpChallenges.phoneE164, phone), isNull(s.otpChallenges.consumedAt)))
      .orderBy(desc(s.otpChallenges.createdAt))
      .limit(1)
      .for("update");
    if (!ch || ch.expiresAt.getTime() < Date.now()) throw new AuthError("Code expired. Ask for a new one.");
    if (ch.attempts >= OTP_MAX_ATTEMPTS) throw new AuthError("Too many wrong tries. Ask for a new code.");
    const ok = timingSafeEqual(Buffer.from(ch.codeHash), Buffer.from(codeHash(phone, code)));
    if (!ok) {
      await tx.update(s.otpChallenges).set({ attempts: ch.attempts + 1 }).where(eq(s.otpChallenges.id, ch.id));
      throw new AuthError(`Wrong code. ${OTP_MAX_ATTEMPTS - ch.attempts - 1} tries left.`);
    }
    await tx.update(s.otpChallenges).set({ consumedAt: new Date() }).where(eq(s.otpChallenges.id, ch.id));

    let [user] = await tx.select().from(s.users).where(eq(s.users.phoneE164, phone));
    if (!user) [user] = await tx.insert(s.users).values({ phoneE164: phone, name: "" }).returning();
    await tx.update(s.users).set({ lastLoginAt: new Date() }).where(eq(s.users.id, user!.id));

    const ms = await tx
      .select({ schoolId: s.memberships.schoolId })
      .from(s.memberships)
      .where(and(eq(s.memberships.userId, user!.id), eq(s.memberships.status, "active")));
    const token = randomBytes(32).toString("base64url");
    await tx.insert(s.sessions).values({
      tokenHash: sha256(token), userId: user!.id, activeSchoolId: ms.length === 1 ? ms[0]!.schoolId : null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS), deviceInfo: deviceInfo?.slice(0, 200) ?? null,
    });
    return { token, userId: user!.id, isNew: !user!.name };
  });
}

export interface SessionInfo {
  sessionId: string;
  user: { id: string; name: string; phone: string };
  school: { id: string; name: string; timezone: string; currency: string; settings: Record<string, unknown> } | null;
  role: StaffRole | null;
  memberships: { schoolId: string; schoolName: string; role: StaffRole }[];
}

/** Resolves a cookie token to user + active school + role. Rolls the expiry forward once a day. */
export async function getSession(db: Db, token: string | undefined | null): Promise<SessionInfo | null> {
  if (!token || token.length < 20) return null;
  const [row] = await db
    .select({ session: s.sessions, user: s.users })
    .from(s.sessions)
    .innerJoin(s.users, eq(s.users.id, s.sessions.userId))
    .where(and(eq(s.sessions.tokenHash, sha256(token)), isNull(s.sessions.revokedAt), gt(s.sessions.expiresAt, new Date())));
  if (!row) return null;
  const ms = await db
    .select({ schoolId: s.memberships.schoolId, role: s.memberships.role, schoolName: s.schools.name })
    .from(s.memberships)
    .innerJoin(s.schools, eq(s.schools.id, s.memberships.schoolId))
    .where(and(eq(s.memberships.userId, row.user.id), eq(s.memberships.status, "active"), eq(s.schools.isDemo, false)));
  const memberships = ms.filter((m) => isStaffRole(m.role)) as SessionInfo["memberships"];
  const active = memberships.find((m) => m.schoolId === row.session.activeSchoolId) ?? (memberships.length === 1 ? memberships[0] : undefined);
  let school: SessionInfo["school"] = null;
  if (active) {
    const [sc] = await db.select().from(s.schools).where(eq(s.schools.id, active.schoolId));
    if (sc) school = { id: sc.id, name: sc.name, timezone: sc.timezone, currency: sc.currency, settings: (sc.settings ?? {}) as Record<string, unknown> };
  }
  if (Date.now() - row.session.lastSeenAt.getTime() > 24 * 3600_000) {
    await db.update(s.sessions).set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_TTL_MS) }).where(eq(s.sessions.id, row.session.id));
  }
  return {
    sessionId: row.session.id,
    user: { id: row.user.id, name: row.user.name, phone: row.user.phoneE164 },
    school,
    role: active?.role ?? null,
    memberships,
  };
}

export async function revokeSession(db: Db, token: string) {
  await db.update(s.sessions).set({ revokedAt: new Date() }).where(eq(s.sessions.tokenHash, sha256(token)));
}

export async function switchSchool(db: Db, sessionId: string, userId: string, schoolId: string) {
  const [m] = await db.select().from(s.memberships).where(and(eq(s.memberships.userId, userId), eq(s.memberships.schoolId, schoolId), eq(s.memberships.status, "active")));
  if (!m) throw new AuthError("You are not a member of that school.");
  await db.update(s.sessions).set({ activeSchoolId: schoolId }).where(eq(s.sessions.id, sessionId));
}

/** New school + owner membership + current academic year + a default monthly tuition head. */
export async function createSchool(
  db: Db,
  input: { userId: string; ownerName: string; schoolName: string; city: string; yearStartsOn: Date },
) {
  const name = input.schoolName.trim();
  if (name.length < 3) throw new AuthError("School name is too short.");
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "school";
  return db.transaction(async (tx) => {
    const slug = `${base}-${randomBytes(3).toString("hex")}`;
    const [school] = await tx.insert(s.schools).values({ name, slug, settings: { city: input.city.trim() } }).returning();
    const sid = school!.id;
    await tx.update(s.users).set({ name: input.ownerName.trim() }).where(eq(s.users.id, input.userId));
    await tx.insert(s.memberships).values({ schoolId: sid, userId: input.userId, role: "owner" });
    const y = input.yearStartsOn;
    const ends = new Date(Date.UTC(y.getUTCFullYear() + 1, y.getUTCMonth(), y.getUTCDate() - 1));
    await tx.insert(s.academicYears).values({
      schoolId: sid, name: `${y.getUTCFullYear()}-${String((y.getUTCFullYear() + 1) % 100).padStart(2, "0")}`,
      startsOn: y, endsOn: ends, isCurrent: true,
    });
    const [head] = await tx.insert(s.feeHeads).values({ schoolId: sid, name: "Tuition fee", frequency: "monthly" }).returning();
    await tx.update(s.schools).set({ settings: { city: input.city.trim(), tuitionHeadId: head!.id, dueDay: 10 } }).where(eq(s.schools.id, sid));
    await tx.insert(s.auditLogs).values({ schoolId: sid, actorUserId: input.userId, action: "create", entity: "schools", entityId: sid, after: { name } });
    return { schoolId: sid };
  });
}
