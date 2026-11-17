import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, schoolId, updatedAt } from "./_shared";

export const schools = pgTable("schools", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("Asia/Karachi"),
  currency: text("currency").notNull().default("PKR"),
  localeDefault: text("locale_default").notNull().default("en"),
  parentLanguage: text("parent_language").notNull().default("ur"),
  logoUrl: text("logo_url"),
  plan: text("plan").notNull().default("trial"),
  status: text("status").notNull().default("trial"),
  isDemo: boolean("is_demo").notNull().default(false),
  settings: jsonb("settings").notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = pgTable("users", {
  id: id(),
  phoneE164: text("phone_e164").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  preferredLanguage: text("preferred_language").notNull().default("ur"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    schoolId: schoolId(),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull(), // owner|principal|accountant|teacher|staff|parent|support
    permissions: jsonb("permissions").notNull().default({}),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_school_user_role").on(t.schoolId, t.userId, t.role)],
);

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  schoolId: schoolId(),
  actorUserId: uuid("actor_user_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: uuid("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: createdAt(),
});

/** One-time login codes. Not tenant-scoped (login happens before a school is chosen). */
export const otpChallenges = pgTable("otp_challenges", {
  id: id(),
  phoneE164: text("phone_e164").notNull(),
  codeHash: text("code_hash").notNull(),
  channel: text("channel").notNull(), // whatsapp|sms|dev
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  ip: text("ip"),
  createdAt: createdAt(),
}, (t) => [index("otp_challenges_phone_created").on(t.phoneE164, t.createdAt)]);

/** Login sessions. Only a SHA-256 of the cookie token is stored. */
export const sessions = pgTable("sessions", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").notNull(),
  activeSchoolId: uuid("active_school_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  deviceInfo: text("device_info"),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Per-school running numbers (receipt no., admission no.). Incremented with UPDATE ... RETURNING. */
export const schoolCounters = pgTable("school_counters", {
  schoolId: schoolId(),
  key: text("key").notNull(),
  value: integer("value").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.schoolId, t.key] })]);
