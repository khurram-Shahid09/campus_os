import { bigint, boolean, date, index, integer, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, deletedAt, id, schoolId } from "./_shared";

export const academicYears = pgTable("academic_years", {
  id: id(),
  schoolId: schoolId(),
  name: text("name").notNull(),
  startsOn: date("starts_on", { mode: "date" }).notNull(),
  endsOn: date("ends_on", { mode: "date" }).notNull(),
  isCurrent: boolean("is_current").notNull().default(false),
});

export const classes = pgTable("classes", {
  id: id(),
  schoolId: schoolId(),
  name: text("name").notNull(),
  level: integer("level").notNull(),
  capacityDefault: integer("capacity_default"),
});

export const sections = pgTable("sections", {
  id: id(),
  schoolId: schoolId(),
  classId: uuid("class_id").notNull(),
  academicYearId: uuid("academic_year_id").notNull(),
  name: text("name").notNull(),
  classTeacherStaffId: uuid("class_teacher_staff_id"),
  capacity: integer("capacity"),
  campusId: uuid("campus_id"),
});

export const families = pgTable("families", {
  id: id(),
  schoolId: schoolId(),
  displayName: text("display_name").notNull(),
  primaryGuardianId: uuid("primary_guardian_id"),
  notes: text("notes"),
  createdAt: createdAt(),
  deletedAt: deletedAt(),
});

export const guardians = pgTable(
  "guardians",
  {
    id: id(),
    schoolId: schoolId(),
    familyId: uuid("family_id").notNull(),
    userId: uuid("user_id"),
    name: text("name").notNull(),
    relation: text("relation").notNull(),
    phoneE164: text("phone_e164").notNull(),
    whatsappOptIn: boolean("whatsapp_opt_in").notNull().default(true),
    smsOk: boolean("sms_ok").notNull().default(true),
    /** Parent prefers voice over text (e.g. cannot read). */
    prefersVoice: boolean("prefers_voice").notNull().default(false),
    preferredLanguage: text("preferred_language").notNull().default("ur"),
    deletedAt: deletedAt(),
  },
  (t) => [index("guardians_school_phone").on(t.schoolId, t.phoneE164)],
);

export const students = pgTable(
  "students",
  {
    id: id(),
    schoolId: schoolId(),
    familyId: uuid("family_id").notNull(),
    admissionNo: text("admission_no").notNull(),
    name: text("name").notNull(),
    gender: text("gender"),
    dob: date("dob", { mode: "date" }),
    photoUrl: text("photo_url"),
    status: text("status").notNull().default("active"), // active|withdrawn|graduated|alumni
    admittedOn: date("admitted_on", { mode: "date" }),
    withdrawnOn: date("withdrawn_on", { mode: "date" }),
    withdrawalReason: text("withdrawal_reason"),
    /** Student-specific monthly tuition when it differs from the class fee (common in PK schools). */
    tuitionFeeMinor: bigint("tuition_fee_minor", { mode: "number" }),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex("students_school_admission").on(t.schoolId, t.admissionNo)],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: id(),
    schoolId: schoolId(),
    studentId: uuid("student_id").notNull(),
    sectionId: uuid("section_id").notNull(),
    academicYearId: uuid("academic_year_id").notNull(),
    rollNo: integer("roll_no"),
    status: text("status").notNull().default("active"),
  },
  (t) => [uniqueIndex("enrollments_student_year").on(t.studentId, t.academicYearId)],
);

export const staff = pgTable("staff", {
  id: id(),
  schoolId: schoolId(),
  userId: uuid("user_id"),
  name: text("name").notNull(),
  phoneE164: text("phone_e164"),
  designation: text("designation").notNull(),
  employmentType: text("employment_type").notNull().default("full_time"),
  joinedOn: date("joined_on", { mode: "date" }),
  leftOn: date("left_on", { mode: "date" }),
  deletedAt: deletedAt(),
});
