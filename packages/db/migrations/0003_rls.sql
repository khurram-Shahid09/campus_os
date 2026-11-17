-- Row-level security: second guard for tenant isolation (the first is school_id in every query).
-- The working app runs each request inside a transaction that does
--   SET LOCAL ROLE campusos_app; SELECT set_config('app.school_id', '<uuid>', true);
-- so campusos_app can only see and write rows of that school. Migrations, the demo seed and the demo
-- screens use the owner role, which is not subject to these policies.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'campusos_app') THEN
    CREATE ROLE campusos_app NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT campusos_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO campusos_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO campusos_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO campusos_app;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_logs','academic_years','classes','sections','families','guardians','students','enrollments','staff',
    'fee_heads','fee_structures','student_fee_adjustments','invoices','invoice_lines','payments','payment_allocations',
    'reminder_events','promises_to_pay','attendance_sessions','attendance_records','staff_attendance','messages',
    'payment_proofs','risk_followups','risk_scores','daily_briefs','roi_events','school_counters'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO campusos_app
         USING (school_id = nullif(current_setting(''app.school_id'', true), '''')::uuid)
         WITH CHECK (school_id = nullif(current_setting(''app.school_id'', true), '''')::uuid)', t);
  END LOOP;
END $$;
