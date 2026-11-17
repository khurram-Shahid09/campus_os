import { sql } from "drizzle-orm";
import { bigint, boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, schoolId } from "./_shared";

const money = (name: string) => bigint(name, { mode: "number" });

export const feeHeads = pgTable("fee_heads", {
  id: id(),
  schoolId: schoolId(),
  name: text("name").notNull(),
  frequency: text("frequency").notNull(), // monthly|term|annual|one_time
  isRefundable: boolean("is_refundable").notNull().default(false),
});

export const feeStructures = pgTable(
  "fee_structures",
  {
    id: id(),
    schoolId: schoolId(),
    academicYearId: uuid("academic_year_id").notNull(),
    classId: uuid("class_id").notNull(),
    feeHeadId: uuid("fee_head_id").notNull(),
    amountMinor: money("amount_minor").notNull(),
  },
  (t) => [uniqueIndex("fee_structures_year_class_head").on(t.academicYearId, t.classId, t.feeHeadId)],
);

export const studentFeeAdjustments = pgTable("student_fee_adjustments", {
  id: id(),
  schoolId: schoolId(),
  studentId: uuid("student_id").notNull(),
  feeHeadId: uuid("fee_head_id"),
  kind: text("kind").notNull(), // percent|fixed
  value: integer("value").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("approved"), // requested|approved|rejected
  requestedValue: integer("requested_value"),
  approvedByUserId: uuid("approved_by_user_id"),
  validFrom: date("valid_from", { mode: "date" }).notNull(),
  validTo: date("valid_to", { mode: "date" }),
  createdAt: createdAt(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    schoolId: schoolId(),
    familyId: uuid("family_id").notNull(),
    studentId: uuid("student_id"),
    period: text("period").notNull(),
    issueDate: date("issue_date", { mode: "date" }).notNull(),
    dueDate: date("due_date", { mode: "date" }).notNull(),
    totalMinor: money("total_minor").notNull(),
    paidMinor: money("paid_minor").notNull().default(0),
    balanceMinor: money("balance_minor").notNull(),
    lateFeeMinor: money("late_fee_minor").notNull().default(0),
    status: text("status").notNull().default("open"), // open|partially_paid|paid|void
    source: text("source").notNull().default("auto"),
    createdAt: createdAt(),
  },
  (t) => [
    index("invoices_school_status_due").on(t.schoolId, t.status, t.dueDate),
    index("invoices_school_family").on(t.schoolId, t.familyId),
    uniqueIndex("invoices_one_per_family_period").on(t.schoolId, t.familyId, t.period).where(sql`status <> 'void'`),
  ],
);

export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  schoolId: schoolId(),
  invoiceId: uuid("invoice_id").notNull(),
  studentId: uuid("student_id"),
  feeHeadId: uuid("fee_head_id"),
  description: text("description").notNull(),
  amountMinor: money("amount_minor").notNull(),
  discountMinor: money("discount_minor").notNull().default(0),
});

export const payments = pgTable(
  "payments",
  {
    id: id(),
    schoolId: schoolId(),
    familyId: uuid("family_id").notNull(),
    amountMinor: money("amount_minor").notNull(),
    method: text("method").notNull(), // cash|bank|wallet|cheque|gateway
    reference: text("reference"),
    paidOn: date("paid_on", { mode: "date" }).notNull(),
    receivedByUserId: uuid("received_by_user_id"),
    status: text("status").notNull().default("confirmed"),
    attributedToCampusos: boolean("attributed_to_campusos").notNull().default(false),
    attributedReminderEventId: uuid("attributed_reminder_event_id"),
    /** Running receipt number per school (printed on the receipt). Reversals get their own number. */
    receiptNo: integer("receipt_no"),
    /** Set on a reversal entry: the payment it cancels. Payments are never edited or deleted. */
    reversalOf: uuid("reversal_of"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_school_paid_on").on(t.schoolId, t.paidOn),
    uniqueIndex("payments_school_receipt_no").on(t.schoolId, t.receiptNo),
  ],
);

export const paymentAllocations = pgTable("payment_allocations", {
  id: id(),
  schoolId: schoolId(),
  paymentId: uuid("payment_id").notNull(),
  invoiceId: uuid("invoice_id").notNull(),
  amountMinor: money("amount_minor").notNull(),
});

export const reminderEvents = pgTable(
  "reminder_events",
  {
    id: id(),
    schoolId: schoolId(),
    invoiceId: uuid("invoice_id").notNull(),
    familyId: uuid("family_id").notNull(),
    stepNo: integer("step_no").notNull(),
    channel: text("channel").notNull(), // whatsapp_voice|whatsapp_text|sms|ivr_call|principal_call
    messageId: uuid("message_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    outcome: text("outcome").notNull().default("sent"),
  },
  (t) => [uniqueIndex("reminder_events_invoice_step").on(t.invoiceId, t.stepNo)],
);

export const promisesToPay = pgTable("promises_to_pay", {
  id: id(),
  schoolId: schoolId(),
  familyId: uuid("family_id").notNull(),
  promisedOn: date("promised_on", { mode: "date" }).notNull(),
  amountMinor: money("amount_minor").notNull(),
  createdVia: text("created_via").notNull(),
  status: text("status").notNull().default("open"),
  meta: jsonb("meta"),
});
