CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"code_hash" text NOT NULL,
	"channel" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_counters" (
	"school_id" uuid NOT NULL,
	"key" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "school_counters_school_id_key_pk" PRIMARY KEY("school_id","key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"active_school_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"device_info" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "tuition_fee_minor" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "receipt_no" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reversal_of" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "note" text;--> statement-breakpoint
CREATE INDEX "otp_challenges_phone_created" ON "otp_challenges" USING btree ("phone_e164","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_one_per_family_period" ON "invoices" USING btree ("school_id","family_id","period") WHERE status <> 'void';--> statement-breakpoint
CREATE UNIQUE INDEX "payments_school_receipt_no" ON "payments" USING btree ("school_id","receipt_no");