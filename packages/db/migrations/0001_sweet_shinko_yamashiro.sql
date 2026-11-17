CREATE TABLE "payment_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"family_id" uuid,
	"guardian_id" uuid,
	"image_key" text NOT NULL,
	"image_hash" text,
	"extracted" jsonb NOT NULL,
	"suggested_family_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"notes" text,
	"by_role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "family_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "direction" text DEFAULT 'out' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "body" jsonb;--> statement-breakpoint
CREATE INDEX "payment_proofs_school_status" ON "payment_proofs" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "messages_school_family" ON "messages" USING btree ("school_id","family_id","created_at");