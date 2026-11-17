import { bigint, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, schoolId } from "./_shared";

export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    id: id(),
    schoolId: schoolId(),
    sectionId: uuid("section_id").notNull(),
    date: date("date", { mode: "date" }).notNull(),
    submittedByUserId: uuid("submitted_by_user_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    method: text("method").notNull().default("tap"), // tap|photo|import
    clientUuid: uuid("client_uuid"),
    durationSeconds: integer("duration_seconds"),
  },
  (t) => [uniqueIndex("attendance_sessions_section_date").on(t.sectionId, t.date)],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: id(),
    schoolId: schoolId(),
    sessionId: uuid("session_id").notNull(),
    studentId: uuid("student_id").notNull(),
    status: text("status").notNull(), // present|absent|late|leave
    note: text("note"),
  },
  (t) => [
    uniqueIndex("attendance_records_session_student").on(t.sessionId, t.studentId),
    index("attendance_records_school_student").on(t.schoolId, t.studentId),
  ],
);

export const staffAttendance = pgTable(
  "staff_attendance",
  {
    id: id(),
    schoolId: schoolId(),
    staffId: uuid("staff_id").notNull(),
    date: date("date", { mode: "date" }).notNull(),
    status: text("status").notNull(), // present|absent|late|leave|half_day
    checkInAt: timestamp("check_in_at", { withTimezone: true }),
    minutesLate: integer("minutes_late").notNull().default(0),
  },
  (t) => [uniqueIndex("staff_attendance_staff_date").on(t.staffId, t.date)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    schoolId: schoolId(),
    toPhone: text("to_phone").notNull(),
    guardianId: uuid("guardian_id"),
    familyId: uuid("family_id"),
    /** out = school to parent, in = parent to school */
    direction: text("direction").notNull().default("out"),
    /** { ur, en } for text/voice; voice notes are spoken from `ur`. */
    body: jsonb("body"),
    channel: text("channel").notNull(), // whatsapp|sms|ivr
    format: text("format").notNull().default("text"), // text|voice|image
    category: text("category").notNull(), // fee|attendance|notice|brief|receipt|otp|system
    templateKey: text("template_key"),
    payload: jsonb("payload"),
    status: text("status").notNull().default("queued"),
    costMinor: bigint("cost_minor", { mode: "number" }).notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_school_created").on(t.schoolId, t.createdAt),
    index("messages_school_family").on(t.schoolId, t.familyId, t.createdAt),
  ],
);

/** Payment screenshots sent by parents. AI (later) fills `extracted`; a human always approves. */
export const paymentProofs = pgTable(
  "payment_proofs",
  {
    id: id(),
    schoolId: schoolId(),
    familyId: uuid("family_id"),
    guardianId: uuid("guardian_id"),
    imageKey: text("image_key").notNull(),
    imageHash: text("image_hash"),
    /** { amountMinor, date, reference, bank, senderName, confidence, source: "demo"|"ai" } */
    extracted: jsonb("extracted").notNull(),
    suggestedFamilyId: uuid("suggested_family_id"),
    status: text("status").notNull().default("pending"), // pending|approved|rejected|duplicate
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    paymentId: uuid("payment_id"),
    createdAt: createdAt(),
  },
  (t) => [index("payment_proofs_school_status").on(t.schoolId, t.status)],
);

export const riskFollowups = pgTable("risk_followups", {
  id: id(),
  schoolId: schoolId(),
  studentId: uuid("student_id").notNull(),
  action: text("action").notNull(), // called|meeting|fee_plan
  outcome: text("outcome").notNull(), // will_return|fee_plan_agreed|leaving|no_answer
  notes: text("notes"),
  byRole: text("by_role"),
  createdAt: createdAt(),
});

export const riskScores = pgTable(
  "risk_scores",
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid("student_id").notNull(),
    computedOn: date("computed_on", { mode: "date" }).notNull(),
    score: integer("score").notNull(),
    band: text("band").notNull(),
    reasons: jsonb("reasons").notNull(),
    modelVersion: text("model_version").notNull().default("rules-v1"),
  },
  (t) => [uniqueIndex("risk_scores_student_day").on(t.studentId, t.computedOn)],
);

export const dailyBriefs = pgTable("daily_briefs", {
  id: id(),
  schoolId: schoolId(),
  recipientUserId: uuid("recipient_user_id"),
  date: date("date", { mode: "date" }).notNull(),
  facts: jsonb("facts").notNull(),
  text: text("text"),
  status: text("status").notNull().default("draft"),
  createdAt: createdAt(),
});

/**
 * Savings engine source of truth. kind:
 * fee_recovered | concession_controlled | student_kept | reminder_automated | attendance_taken | page_digital
 */
export const roiEvents = pgTable(
  "roi_events",
  {
    id: id(),
    schoolId: schoolId(),
    kind: text("kind").notNull(),
    quantity: integer("quantity").notNull().default(1),
    valueMinor: bigint("value_minor", { mode: "number" }).notNull().default(0),
    refTable: text("ref_table"),
    refId: uuid("ref_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("roi_events_school_kind_time").on(t.schoolId, t.kind, t.occurredAt)],
);

/** One row per school, job and local day: makes scheduled jobs run once, and shows the owner what ran. */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: id(),
    schoolId: schoolId(),
    job: text("job").notNull(), // risk_scores|morning_brief|fee_reminders
    runOn: date("run_on", { mode: "date" }).notNull(),
    status: text("status").notNull().default("running"), // running|done|failed|skipped
    result: jsonb("result"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("job_runs_school_job_day").on(t.schoolId, t.job, t.runOn)],
);
