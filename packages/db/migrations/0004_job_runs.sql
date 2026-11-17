CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"job" text NOT NULL,
	"run_on" date NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"result" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_school_job_day" ON "job_runs" USING btree ("school_id","job","run_on");