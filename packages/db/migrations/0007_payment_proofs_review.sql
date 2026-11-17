ALTER TABLE "payment_proofs" ADD COLUMN "reference_norm" text;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "image_mime" text;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "source" text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "uploaded_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "review_note" text;--> statement-breakpoint
CREATE INDEX "payment_proofs_school_hash" ON "payment_proofs" USING btree ("school_id","image_hash");--> statement-breakpoint
CREATE INDEX "payment_proofs_school_ref" ON "payment_proofs" USING btree ("school_id","reference_norm");