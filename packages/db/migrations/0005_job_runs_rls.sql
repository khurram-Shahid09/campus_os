-- job_runs is tenant data: same row-level security as the other school tables (see 0003_rls.sql).
GRANT SELECT, INSERT, UPDATE, DELETE ON job_runs TO campusos_app;
--> statement-breakpoint
ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation ON job_runs;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON job_runs TO campusos_app
  USING (school_id = nullif(current_setting('app.school_id', true), '')::uuid)
  WITH CHECK (school_id = nullif(current_setting('app.school_id', true), '')::uuid);
