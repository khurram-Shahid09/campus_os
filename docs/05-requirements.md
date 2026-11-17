# 05: Requirements

IDs are stable; reference them in code comments, tests and PRs (e.g. `FR-FEE-04`).
Priority: **M** = must (MVP), **S** = should (MVP if time), **L** = later phase.

## Functional requirements

### Onboarding & core data (CORE)
| ID | Requirement | Pri |
|---|---|---|
| FR-CORE-01 | A school can be created with name, timezone, currency, academic year, classes, sections. | M |
| FR-CORE-02 | Import students/guardians/fees from Excel/CSV; AI proposes column mapping; user confirms; errors listed row-by-row with suggested fixes. | M |
| FR-CORE-03 | Students with the same guardian phone are suggested as one **family**; user confirms. | M |
| FR-CORE-04 | Each student belongs to one section per academic year (enrolment). | M |
| FR-CORE-05 | Bulk promotion to next academic year, with exceptions (repeat, leave). | M |
| FR-CORE-06 | Withdrawal records reason (fees, relocation, dissatisfaction, other) for analytics. | M |
| FR-CORE-07 | Full data export to Excel at any time by owner. | M |

### Fees (FEE)
| ID | Requirement | Pri |
|---|---|---|
| FR-FEE-01 | Define fee heads (tuition, admission, exam, transport...) and amounts per class. | M |
| FR-FEE-02 | Per-student adjustments: concession (% or fixed), sibling discount rule, scholarship, with approver and reason. | M |
| FR-FEE-03 | Monthly (or per-term) invoices generate automatically on a configured day; family-level view combines siblings. | M |
| FR-FEE-04 | Optional late-fee rule (fixed or per day, capped), applied by the worker after due date. | M |
| FR-FEE-05 | Record payments: cash, bank transfer, mobile wallet, cheque; partial payments allowed; allocation oldest-first by default. | M |
| FR-FEE-06 | Digital receipt sent to the guardian on WhatsApp for every payment. | M |
| FR-FEE-07 | Parents can submit a receipt photo via WhatsApp; AI extracts amount/date/reference/bank; system proposes a matching family; accountant approves/rejects. | M |
| FR-FEE-08 | Detect duplicate receipts (same reference or near-identical image hash) and flag. | M |
| FR-FEE-09 | Reminder ladder configurable per school (default: D-3 friendly, D+3 reminder, D+10 firm, D+20 principal call list, D+30 owner list). | M |
| FR-FEE-10 | Reminders stop automatically when paid or when a promise-to-pay is recorded (resume if broken). | M |
| FR-FEE-11 | Defaulter list with aging buckets, filters by class, amount, family. | M |
| FR-FEE-12 | Concession register report: total concessions per month, by approver. | M |
| FR-FEE-13 | Payments attributed as "recovered by CampusOS" when paid within 7 days after a CampusOS reminder on an overdue invoice. | M |
| FR-FEE-14 | Installment plan for a family's arrears with scheduled reminders. | S |
| FR-FEE-15 | Payment gateway webhook auto-confirms payments. | L |
| FR-FEE-16 | Invoices and payments are never hard-deleted; corrections via reversal entries. | M |

### Attendance (ATT)
| ID | Requirement | Pri |
|---|---|---|
| FR-ATT-01 | Teacher marks section attendance: everyone present by default, tap to mark absent/late/leave. | M |
| FR-ATT-02 | Works offline; queued and synced; conflicts resolved last-write-wins with audit. | M |
| FR-ATT-03 | Photo-of-register mode: AI reads the day's column; teacher confirms the absent list. | S |
| FR-ATT-04 | Parent of absent student receives a WhatsApp alert within 15 minutes of submission (configurable cut-off time). | M |
| FR-ATT-05 | Principal sees which sections have not submitted by a cut-off time; teacher gets a nudge. | M |
| FR-ATT-06 | Staff attendance: self check-in (with optional geofence) or marked by principal/admin. | M |
| FR-ATT-07 | Staff leave requests with approval. | M |
| FR-ATT-08 | Monthly student and staff attendance reports auto-generated. | M |

### Communication (COM)
| ID | Requirement | Pri |
|---|---|---|
| FR-COM-01 | Send notices to all / class / section / filtered families (e.g., with dues) via WhatsApp templates; SMS fallback. | M |
| FR-COM-02 | All outbound messages logged with status (queued, sent, delivered, read, failed) and cost. | M |
| FR-COM-03 | Parent keywords on WhatsApp: BALANCE, ATTENDANCE, RECEIPT, HELP (in English + local language). | M |
| FR-COM-04 | Parent free-text questions answered by AI from that parent's own data only; unknowns routed to office. | L |
| FR-COM-05 | Quiet hours: no automated messages to parents outside configured hours. | M |
| FR-COM-06 | Parent opt-out per category (except safety/absence alerts if school policy requires). | M |

### Insights (INS)
| ID | Requirement | Pri |
|---|---|---|
| FR-INS-01 | Morning Brief sent to owner (and optionally principal) at a configured time, built from SQL-computed facts. | M |
| FR-INS-02 | Owner dashboard: collections today/month, outstanding by aging, attendance today, staff present, at-risk students, ROI meter. | M |
| FR-INS-03 | Dropout risk score per student, updated nightly, with top reasons; principal follow-up log (called, outcome). | M |
| FR-INS-04 | ROI meter: money recovered, staff hours saved (per-task time constants × counts), messages instead of prints. | M |
| FR-INS-05 | Monthly owner report generated on the 1st. | M |
| FR-INS-06 | Ask CampusOS: natural-language questions answered via read-only, school-scoped query tools. | L |

### Timetable & cover (TT)
| ID | Requirement | Pri |
|---|---|---|
| FR-TT-01 | Enter weekly timetable per section (period, subject, teacher). | M |
| FR-TT-02 | When a teacher is marked absent, suggest cover teachers who are free that period, balancing load; principal confirms; cover teacher notified. | M |

### Exams (EXM), Payroll (PAY): Phase 2/3
Detailed requirements are written at the start of each phase, using [04](04-features-and-modules.md) rows as the scope.
Minimums already fixed: marks/grades never published without teacher + principal confirmation;
payroll runs require owner approval; payslips are immutable once approved.

## Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-01 | Performance | Teacher attendance screen interactive in < 2s on a low-end Android over 3G; dashboards < 3s. |
| NFR-02 | Offline | Attendance and cash entry tolerate offline use and sync later. |
| NFR-03 | Availability | 99.5% monthly for web/API; scheduled jobs retried; missed Morning Brief re-sent within 1 hour. |
| NFR-04 | Scale (initial) | 200 schools × 1,000 students on a single app server + managed Postgres. |
| NFR-05 | Tenancy | Every tenant row has `school_id`; app-level scoping + Postgres RLS. A cross-tenant read is a P0 bug. |
| NFR-06 | Security | See [11](11-security-and-privacy.md): OTP auth, RBAC, encryption at rest and in transit, audit logs. |
| NFR-07 | Privacy | Children's data minimized; images of receipts/registers retained per policy (default 12 months). |
| NFR-08 | Cost | Infra + AI + messaging cost per student per month stays below 15% of the price charged. |
| NFR-09 | Localization | UI in English first; parent messages in English + one local language (ASSUMPTION: Urdu, RTL-safe). |
| NFR-10 | Accessibility | Large tap targets (≥ 44px), readable at 360px width, works with system font scaling. |
| NFR-11 | Maintainability | Modular monolith; domain logic in `packages/core` with unit tests; migrations versioned. |
| NFR-12 | Observability | Structured logs, error tracking, job dashboards, per-school AI and message cost tracking. |
| NFR-13 | Backups | Daily full + point-in-time recovery (7 days min); restore tested monthly. |
| NFR-14 | Data portability | Complete Excel export; school owns its data. |
