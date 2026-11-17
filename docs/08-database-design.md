# 08: Database Design

PostgreSQL 16. Conventions:
- PK `id uuid` (v7, time-ordered). Every tenant table: `school_id uuid not null` + RLS.
- `created_at`, `updated_at` `timestamptz`; `deleted_at` for soft delete where noted.
- Money: `*_minor bigint` (paisa/cents). Currency lives on `schools.currency`.
- Enums as Postgres enums or `text` + check constraint (prefer text+check for easy evolution).
- Indexes listed are the minimum; add based on query plans.

## Entity overview

```
schools ─┬─ campuses (P3)
         ├─ memberships ── users
         ├─ academic_years ── terms
         ├─ classes ── sections ── timetable_slots ── subjects
         ├─ families ── guardians (via family_guardians)
         │      └─ students ── enrollments(section, year)
         ├─ fee_heads ── fee_structures(class, year)
         │      student_fee_adjustments (concessions)
         ├─ invoices ── invoice_lines
         │      payments ── payment_allocations ── invoices
         │      payment_proofs (receipt photos + AI extraction)
         │      reminder_policies ── reminder_events
         │      promises_to_pay
         ├─ attendance_sessions ── attendance_records
         ├─ staff ── staff_attendance, leave_requests, cover_assignments
         ├─ messages, message_templates, inbound_messages
         ├─ risk_scores, risk_followups
         ├─ daily_briefs, roi_events
         ├─ ai_jobs (usage/cost), imports
         ├─ exams ... (P2)      payroll ... (P3)
         └─ audit_logs
```

## Platform & identity

**schools**: id, name, slug, timezone, currency (ISO 4217), locale_default, parent_language, logo_url,
plan, status (`trial|active|suspended`), settings jsonb (quiet hours, reminder defaults, brief time), created_at.

**campuses** (P3): id, school_id, name, address. (Nullable `campus_id` on sections, staff, invoices.)

**users**: id, phone_e164 (unique), name, email (nullable), preferred_language, last_login_at.
Users are global; access is via memberships.

**memberships**: id, school_id, user_id, role (`owner|principal|accountant|teacher|staff|parent|student|support`),
permissions jsonb (overrides), status. Unique (school_id, user_id, role).

**otp_challenges**: id, phone_e164, code_hash, channel, expires_at, attempts. (Not tenant-scoped.)

**sessions**: id, user_id, active_school_id, expires_at, device_info.

## Academic structure

**academic_years**: id, school_id, name ("2026-27"), starts_on, ends_on, is_current.
**terms**: id, school_id, academic_year_id, name, starts_on, ends_on.
**classes**: id, school_id, name ("Grade 4"), level int, capacity_default.
**sections**: id, school_id, class_id, academic_year_id, name ("A"), class_teacher_staff_id, capacity, campus_id.
**subjects**: id, school_id, name, code.
**section_subjects**: section_id, subject_id, teacher_staff_id.
**timetable_slots**: id, school_id, section_id, weekday (1–7), period_no, starts_at time, ends_at time,
subject_id, teacher_staff_id. Unique (section_id, weekday, period_no).

## People

**families**: id, school_id, display_name ("Akram family"), primary_guardian_id, notes, deleted_at.
**guardians**: id, school_id, user_id (nullable until they log in), name, relation, phone_e164, whatsapp_opt_in bool,
sms_ok bool, preferred_language, deleted_at. Index (school_id, phone_e164).
**family_guardians**: family_id, guardian_id, is_primary.
**students**: id, school_id, family_id, admission_no, name, gender, dob, photo_url, status
(`active|withdrawn|graduated|alumni`), admitted_on, withdrawn_on, withdrawal_reason, deleted_at.
Unique (school_id, admission_no).
**enrollments**: id, school_id, student_id, section_id, academic_year_id, roll_no, status. Unique (student_id, academic_year_id).
**staff**: id, school_id, user_id, name, phone_e164, designation, employment_type, joined_on, left_on,
salary_profile_id (P3), deleted_at.

## Fees

**fee_heads**: id, school_id, name, frequency (`monthly|term|annual|one_time`), is_refundable.
**fee_structures**: id, school_id, academic_year_id, class_id, fee_head_id, amount_minor. Unique (year, class, head).
**student_fee_adjustments**: id, school_id, student_id, fee_head_id (nullable = all), kind (`percent|fixed`),
value, reason, approved_by_user_id, valid_from, valid_to.
**invoices**: id, school_id, family_id, student_id (nullable when family-level), period ("2026-11"),
issue_date, due_date, total_minor, paid_minor, balance_minor (generated or maintained), status
(`open|partially_paid|paid|void`), late_fee_minor, source (`auto|manual|opening_balance`), voided_reason.
Index (school_id, status, due_date), (school_id, family_id).
**invoice_lines**: id, invoice_id, school_id, student_id, fee_head_id, description, amount_minor, discount_minor.
**payments**: id, school_id, family_id, amount_minor, method (`cash|bank|wallet|cheque|gateway`), reference,
paid_on, received_by_user_id, proof_id (nullable), status (`confirmed|reversed`), reversal_of_payment_id,
attributed_to_campusos bool, attributed_reminder_event_id.
**payment_allocations**: id, school_id, payment_id, invoice_id, amount_minor.
**payment_proofs**: id, school_id, inbound_message_id, guardian_id, image_key, image_phash, extracted jsonb
(amount, date, reference, bank, sender_name, confidence), suggested_family_id, match_score, status
(`pending|approved|rejected|duplicate`), reviewed_by_user_id, reviewed_at, payment_id.
Index (school_id, status), (school_id, image_phash).
**reminder_policies**: id, school_id, name, steps jsonb (`[{offset_days, template_key, channel, audience}]`), active.
**reminder_events**: id, school_id, invoice_id, family_id, step_no, message_id, sent_at, outcome
(`sent|skipped_paid|skipped_promise|failed`). Unique (invoice_id, step_no).
**promises_to_pay**: id, school_id, family_id, promised_on, amount_minor, created_via, status (`open|kept|broken`).

## Attendance

**attendance_sessions**: id, school_id, section_id, date, submitted_by_user_id, submitted_at, method
(`tap|photo|import`), client_uuid, photo_key. Unique (section_id, date).
**attendance_records**: id, school_id, session_id, student_id, status (`present|absent|late|leave`),
note, parent_alert_message_id. Unique (session_id, student_id). Index (school_id, student_id, date via session).
**staff_attendance**: id, school_id, staff_id, date, status (`present|absent|late|leave|half_day`),
check_in_at, check_in_geo point (nullable), marked_by_user_id. Unique (staff_id, date).
**leave_requests**: id, school_id, staff_id, from_date, to_date, type, reason, status, decided_by_user_id.
**cover_assignments**: id, school_id, date, timetable_slot_id, absent_staff_id, cover_staff_id, status, assigned_by_user_id.

## Communication

**message_templates**: id, school_id (nullable = global), key, channel, language, body, provider_template_name, variables jsonb.
**messages**: id, school_id, to_phone, guardian_id/staff_id/user_id (nullable), channel (`whatsapp|sms`), category
(`fee|attendance|notice|brief|receipt|otp|system`), template_key, payload jsonb, status
(`queued|sent|delivered|read|failed`), provider_message_id, cost_minor, error, sent_at.
Index (school_id, created_at), (provider_message_id). Partition by month later.
**inbound_messages**: id, school_id (resolved from phone; nullable), from_phone, channel, type (`text|image|button`),
body, media_key, parsed_intent, handled_status, created_at.
**notices**: id, school_id, title, body_by_language jsonb, audience jsonb, created_by_user_id, sent_at, stats jsonb.

## Insights & AI

**risk_scores**: id, school_id, student_id, computed_on, score int (0–100), band (`low|watch|high`),
reasons jsonb (`[{signal, value, weight, text}]`), model_version. Unique (student_id, computed_on).
**risk_followups**: id, school_id, student_id, action, outcome, notes, by_user_id, created_at.
**daily_briefs**: id, school_id, recipient_user_id, date, facts jsonb, text, message_id, status, ai_job_id.
**roi_events**: id, school_id, kind (`fee_recovered|attendance_taken|receipt_auto_read|notice_sent|report_card_digital|cover_auto`),
quantity, value_minor (for money), minutes_saved (from configured constants), ref_table, ref_id, occurred_at.
**ai_jobs**: id, school_id, task (`receipt_extract|register_read|brief_write|import_map|risk_explain|paper_draft|...`),
model, input_tokens, output_tokens, cost_micro_usd, latency_ms, status, error, ref_table, ref_id, created_at.
**imports**: id, school_id, kind, file_key, mapping jsonb, row_count, error_count, status, created_by_user_id.

## Exams (P2): outline
exams (term, name), exam_subjects (exam, section, subject, max_marks, date), question_papers (draft json, pdf_key, ai_job_id),
marks (exam_subject, student, marks, status `draft|confirmed`), grade_scales, report_cards (student, exam, pdf_key, published_at),
homework (section, subject, date, text, attachments).

## Payroll (P3): outline
salary_profiles (base, allowances jsonb, deductions jsonb), payroll_runs (period, status `draft|approved|paid`, approved_by),
payslips (run, staff, gross, deductions jsonb, net, pdf_key), staff_advances (amount, installment, balance).

## Audit

**audit_logs**: id, school_id, actor_user_id, action (`create|update|delete|approve|reverse|login|export`),
entity, entity_id, before jsonb, after jsonb, ip, user_agent, created_at.
Written by `packages/core` on every change to invoices, payments, adjustments, attendance, marks, payroll, memberships.
Append-only (no update/delete grants for the app role).

## Key derived queries (owned by packages/core/insights)
- Outstanding by aging: `sum(balance_minor)` grouped by `now() - due_date` buckets where status in (open, partially_paid).
- Collection MTD vs same day last month.
- Attendance % per student, rolling 14 days vs prior 60-day baseline (risk signal).
- Recovered by CampusOS: `sum(payments.amount_minor) where attributed_to_campusos` this month.
