CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Karachi' NOT NULL,
	"currency" text DEFAULT 'PKR' NOT NULL,
	"locale_default" text DEFAULT 'en' NOT NULL,
	"parent_language" text DEFAULT 'ur' NOT NULL,
	"logo_url" text,
	"plan" text DEFAULT 'trial' NOT NULL,
	"status" text DEFAULT 'trial' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schools_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"preferred_language" text DEFAULT 'ur' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE "academic_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"capacity_default" integer
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"roll_no" integer,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"primary_guardian_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"relation" text NOT NULL,
	"phone_e164" text NOT NULL,
	"whatsapp_opt_in" boolean DEFAULT true NOT NULL,
	"sms_ok" boolean DEFAULT true NOT NULL,
	"prefers_voice" boolean DEFAULT false NOT NULL,
	"preferred_language" text DEFAULT 'ur' NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"class_teacher_staff_id" uuid,
	"capacity" integer,
	"campus_id" uuid
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"phone_e164" text,
	"designation" text NOT NULL,
	"employment_type" text DEFAULT 'full_time' NOT NULL,
	"joined_on" date,
	"left_on" date,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"admission_no" text NOT NULL,
	"name" text NOT NULL,
	"gender" text,
	"dob" date,
	"photo_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"admitted_on" date,
	"withdrawn_on" date,
	"withdrawal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "fee_heads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"frequency" text NOT NULL,
	"is_refundable" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"academic_year_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"fee_head_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"student_id" uuid,
	"fee_head_id" uuid,
	"description" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"discount_minor" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"student_id" uuid,
	"period" text NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"total_minor" bigint NOT NULL,
	"paid_minor" bigint DEFAULT 0 NOT NULL,
	"balance_minor" bigint NOT NULL,
	"late_fee_minor" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"source" text DEFAULT 'auto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"paid_on" date NOT NULL,
	"received_by_user_id" uuid,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"attributed_to_campusos" boolean DEFAULT false NOT NULL,
	"attributed_reminder_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promises_to_pay" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"promised_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_via" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "reminder_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"step_no" integer NOT NULL,
	"channel" text NOT NULL,
	"message_id" uuid,
	"sent_at" timestamp with time zone NOT NULL,
	"outcome" text DEFAULT 'sent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_fee_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"fee_head_id" uuid,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'approved' NOT NULL,
	"requested_value" integer,
	"approved_by_user_id" uuid,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"date" date NOT NULL,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone NOT NULL,
	"method" text DEFAULT 'tap' NOT NULL,
	"client_uuid" uuid,
	"duration_seconds" integer
);
--> statement-breakpoint
CREATE TABLE "daily_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"recipient_user_id" uuid,
	"date" date NOT NULL,
	"facts" jsonb NOT NULL,
	"text" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"to_phone" text NOT NULL,
	"guardian_id" uuid,
	"channel" text NOT NULL,
	"format" text DEFAULT 'text' NOT NULL,
	"category" text NOT NULL,
	"template_key" text,
	"payload" jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"cost_minor" bigint DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"computed_on" date NOT NULL,
	"score" integer NOT NULL,
	"band" text NOT NULL,
	"reasons" jsonb NOT NULL,
	"model_version" text DEFAULT 'rules-v1' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roi_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"value_minor" bigint DEFAULT 0 NOT NULL,
	"ref_table" text,
	"ref_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL,
	"check_in_at" timestamp with time zone,
	"minutes_late" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_school_user_role" ON "memberships" USING btree ("school_id","user_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_student_year" ON "enrollments" USING btree ("student_id","academic_year_id");--> statement-breakpoint
CREATE INDEX "guardians_school_phone" ON "guardians" USING btree ("school_id","phone_e164");--> statement-breakpoint
CREATE UNIQUE INDEX "students_school_admission" ON "students" USING btree ("school_id","admission_no");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_structures_year_class_head" ON "fee_structures" USING btree ("academic_year_id","class_id","fee_head_id");--> statement-breakpoint
CREATE INDEX "invoices_school_status_due" ON "invoices" USING btree ("school_id","status","due_date");--> statement-breakpoint
CREATE INDEX "invoices_school_family" ON "invoices" USING btree ("school_id","family_id");--> statement-breakpoint
CREATE INDEX "payments_school_paid_on" ON "payments" USING btree ("school_id","paid_on");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_events_invoice_step" ON "reminder_events" USING btree ("invoice_id","step_no");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_session_student" ON "attendance_records" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE INDEX "attendance_records_school_student" ON "attendance_records" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_sessions_section_date" ON "attendance_sessions" USING btree ("section_id","date");--> statement-breakpoint
CREATE INDEX "messages_school_created" ON "messages" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_scores_student_day" ON "risk_scores" USING btree ("student_id","computed_on");--> statement-breakpoint
CREATE INDEX "roi_events_school_kind_time" ON "roi_events" USING btree ("school_id","kind","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_attendance_staff_date" ON "staff_attendance" USING btree ("staff_id","date");