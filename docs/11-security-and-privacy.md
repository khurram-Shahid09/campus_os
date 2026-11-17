# 11: Security & Privacy

CampusOS holds children's data and school money records. Security failures here end the business, so these
are build requirements, not nice-to-haves.

## Authentication
- **Phone OTP** (6 digits, 5-minute expiry, max 5 attempts, rate-limited per phone and IP), delivered via WhatsApp
  authentication template with SMS fallback. Codes stored hashed.
- Sessions: httpOnly, Secure, SameSite=Lax cookies; 30-day rolling for parents/teachers, 12-hour for
  owner/accountant on shared desktops (configurable); revoke all sessions on demand.
- Optional 2nd factor for owner/accountant (OTP on each new device).
- Support impersonation: time-limited, reason required, audited, school owner notified.

## Authorization
- RBAC by membership role + optional permission overrides; checked in `packages/core` (not just UI).
- Row scope: teachers limited to assigned sections/subjects; parents to their family; students to self.
- Tenant isolation: app-level `school_id` scoping **and** Postgres RLS. Automated test suite tries cross-tenant
  access on every endpoint.

## Role permissions

| Capability | Owner | Principal | Accountant | Teacher | Parent | Student |
|---|---|---|---|---|---|---|
| School settings, users | ✅ | view | – | – | – | – |
| Fee structures, concessions | ✅ | view (config.) | ✅ within limit | – | – | – |
| Record/approve payments | ✅ | – | ✅ | – | – | – |
| Void invoice / reverse payment | ✅ | – | ✅ (audited, owner notified) | – | – | – |
| Financial reports | ✅ | config. | ✅ | – | own family | – |
| Student records | ✅ | ✅ | view | own sections | own children | self |
| Attendance | view | ✅ | view | own sections | own children | self |
| Staff attendance, leave, cover | ✅ | ✅ | view | own | – | – |
| Marks & results (P2) | view | approve | – | own subjects | own children (published) | self (published) |
| Payroll (P3) | approve | config. | prepare | own payslip | – | – |
| Notices | ✅ | ✅ | fee notices | own sections (P2) | receive | receive |
| Exports | ✅ | config. | fees only | – | – | – |
| Risk list | ✅ | ✅ | – | own sections (config.) | – | – |

## Data protection
- TLS everywhere; HSTS. Database and object storage encrypted at rest (provider-managed keys).
- Object storage private; access only via short-lived signed URLs (≤ 10 min).
- Phone numbers and student names in logs are masked. No secrets in logs.
- Secrets in environment variables / provider secret store; rotated on staff changes.
- Backups encrypted; point-in-time recovery; monthly restore test.
- Dependency scanning and lockfile pinning in CI.

## Financial integrity
- Invoices/payments never hard-deleted; corrections via void/reversal with reason.
- Every money change in `audit_logs` (before/after). Audit table is append-only for the app DB role.
- Concession approval limits per role; above-limit requests require owner approval.
- Daily cash summary per accountant; owner sees "cash recorded vs deposited" (P2 anomaly check).

## Privacy (children's data)
- Collect the minimum: no national ID numbers unless the school requires them; DOB optional.
- Parent consent captured at WhatsApp opt-in; privacy notice link in welcome message.
- AI: send only what the task needs; mask phones; no data used to train models (API default; confirm provider terms
  at launch). Images retained 12 months by default (configurable), then deleted.
- Data subject requests: export or delete a family's data (financial records retained as legally required, anonymized).
- Follow local data protection law of each launch market (ASSUMPTION: confirm applicable law; see docs/17).
- Student photos optional and never sent in bulk messages.

## Messaging safety
- Quiet hours, frequency caps per guardian per day, opt-out handling, WhatsApp template compliance.
- Fee reminders use respectful, non-shaming language; never reveal a family's dues to anyone else
  (no group messages with names).

## Application security checklist (per release)
- zod validation on every input; parameterized queries only (Drizzle).
- CSRF protection on cookie-authenticated mutations; webhook signature verification.
- Upload limits (type, size), image re-encoding to strip EXIF/metadata.
- Rate limits on auth, inbound webhooks, exports, AI endpoints.
- Security headers (CSP, frame-ancestors none, referrer policy).
- Error tracking without PII.
