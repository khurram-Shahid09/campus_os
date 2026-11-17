# 13: Roadmap & Development Phases

Durations assume 1–2 developers working with AI coding assistance. Each phase has **exit criteria**; do not
start the next phase's features until they are met.

## Phase 0: Sales Demo (3–4 weeks)
Goal: a demo an owner can't say no to. See [15-demo-plan](15-demo-plan.md).

Build:
- Monorepo skeleton, DB schema for core + fees + attendance, seed **demo school** (realistic synthetic data,
  clearly labelled as demo).
- **School Health Report**: upload a school's Excel fee register/attendance → import mapping → instant report
  (outstanding, aging, collection rate, chronic absentees, estimated leakage, estimated hours on follow-up).
- **Morning Brief** generated from the demo school (and from uploaded data), delivered to a real WhatsApp number.
- Owner dashboard (read-only) on demo data.
- Receipt-reading demo: send a receipt photo on WhatsApp → see it read and matched live.

Exit: 5 owner demos done; ≥ 2 schools agree to a pilot.

## Phase 1: MVP / Pilot (8–10 weeks)
Build (P1 rows in [04](04-features-and-modules.md)):
1. Auth (OTP), roles, tenancy + RLS, audit log, settings.
2. Onboarding + smart import, families, promotions, exports.
3. Fee Autopilot: structures, adjustments, invoices, late fees, cash entry, receipt queue, reminder ladder,
   promises, defaulter & concession reports, recovered counter.
4. Attendance: tap + offline, absence alerts, missing sweep, staff attendance, leave, monthly reports;
   register-photo mode if time allows.
5. Communication: notices, templates (2 languages), SMS fallback, keyword self-service, delivery tracking.
6. Insights: Morning Brief, owner + principal dashboards, rules-based risk score + follow-ups, ROI meter, monthly report.
7. Timetable entry + cover suggestions.
8. Our subscription billing (manual invoicing acceptable for pilots).

Suggested order (2-week sprints):
- S1: platform + core data + import
- S2: fees (structures, invoices, payments, receipts)
- S3: reminders + receipt AI + defaulter reports
- S4: attendance (teacher PWA, offline, alerts) + staff attendance
- S5: Morning Brief + dashboards + risk + ROI + notices + cover

Exit (after 6–8 weeks of pilot use): overdue balance measurably down at ≥ 1 pilot school; teachers submitting
attendance ≥ 90% of school days; owner opens brief ≥ 5 days/week; no P0 bugs open.

## Phase 2: Academics & Intelligence (6–8 weeks)
Exams & results (datesheet, AI paper drafting, marks grid + photo reading, AI marking assist, report cards,
remarks), homework/diary, Ask CampusOS, AI parent replies, payment gateway, collection forecast, capacity &
revenue gap, anomaly alerts, refined risk score with marks signal.

Exit: one full exam term run end-to-end at pilot schools with digital report cards.

## Phase 3: Staff, Chains & Scale (6–8 weeks)
Payroll (attendance-linked, advances, payslips), auto-timetable generation, multi-campus, admissions pipeline,
per-school WhatsApp numbers via embedded signup, Sheets/accounting exports, read replica.

## Phase 4: Later / only if it earns a tag
Biometric device import, student practice quizzes, transport notifications, parent-teacher meeting scheduler,
regional language expansion. Each needs a written purpose and a pilot request before building.

## Definition of done (every feature)
- Matches its requirement IDs in [05](05-requirements.md); purpose tag still true.
- Unit tests for domain logic; tenant-isolation test for new endpoints.
- Audit log for money/marks/attendance/salary changes.
- Works at 360px width and offline where required.
- ROI event emitted if the feature saves time or money (`roi_events`).
- Docs updated if behaviour differs from the plan.
