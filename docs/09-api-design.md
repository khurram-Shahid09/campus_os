# 09: API Design

## Conventions
- REST over HTTPS, JSON. Base path `/api/v1`. Implemented as Next.js route handlers.
- Auth: session cookie (web/PWA). The active school comes from the session (`active_school_id`), never from
  the URL alone; switching school is an explicit call.
- Validation with zod; the same schemas are shared with the UI (`packages/core/*/schemas.ts`).
- Errors: `{ "error": { "code": "FEE_INVOICE_NOT_FOUND", "message": "...", "details": {...} } }` with proper HTTP status.
- Pagination: cursor-based `?cursor=&limit=` → `{ data: [...], next_cursor }`.
- Money in API: `{ "amount_minor": 450000, "currency": "PKR" }`, never floats.
- Idempotency: POSTs that create money or attendance records accept `Idempotency-Key` header (stored 24h).
- Every endpoint declares required permission (see [11](11-security-and-privacy.md#role-permissions)).

## Auth
| Method | Path | Purpose |
|---|---|---|
| POST | /auth/otp/request | `{phone}` → sends OTP via WhatsApp (SMS fallback); rate limited |
| POST | /auth/otp/verify | `{phone, code}` → session cookie; returns memberships |
| POST | /auth/switch-school | `{school_id}` (must have membership) |
| POST | /auth/logout | |
| GET | /me | user, active school, role, permissions |

## School setup & core data
| Method | Path | Purpose |
|---|---|---|
| GET/PATCH | /school | school profile + settings |
| GET/POST | /academic-years, /classes, /sections, /subjects | structure CRUD |
| GET/POST/PATCH | /students, /students/:id | list (filters: section, status, q), create, update |
| POST | /students/:id/withdraw | `{date, reason}` |
| GET/POST/PATCH | /families, /families/:id | includes guardians + students |
| GET/POST/PATCH | /staff, /staff/:id | |
| POST | /imports | upload file → returns import id |
| GET | /imports/:id | status, AI-proposed mapping, validation errors |
| POST | /imports/:id/confirm | `{mapping, fixes}` → commits |
| POST | /promotions | bulk promote with exceptions |
| GET | /exports/:kind | Excel export (students, fees, attendance, all) |

## Fees
| Method | Path | Purpose |
|---|---|---|
| GET/POST | /fee-heads, /fee-structures | |
| GET/POST/DELETE | /students/:id/adjustments | concessions (approval limits enforced) |
| GET | /invoices | filters: status, period, family, class, overdue_days |
| POST | /invoices/generate | `{period}` manual trigger (idempotent) |
| POST | /invoices/:id/void | `{reason}` (owner/accountant, audited) |
| GET | /families/:id/ledger | invoices + payments timeline, balance |
| POST | /payments | `{family_id, amount_minor, method, reference, paid_on}` → allocations + receipt |
| POST | /payments/:id/reverse | `{reason}` |
| GET | /payment-proofs?status=pending | Receipt Queue |
| POST | /payment-proofs/:id/approve | `{family_id?, amount_minor?}` (corrections allowed) → creates payment |
| POST | /payment-proofs/:id/reject | `{reason}` → guardian notified |
| GET/PUT | /reminder-policy | ladder steps |
| POST | /families/:id/promise | `{promised_on, amount_minor}` |
| GET | /reports/defaulters | aging buckets, sortable |
| GET | /reports/concessions | by month/approver |
| GET | /reports/collections | daily/monthly series |

## Attendance
| Method | Path | Purpose |
|---|---|---|
| GET | /teacher/today | teacher's sections, timetable, pending tasks (cached for offline) |
| PUT | /sections/:id/attendance/:date | `{records:[{student_id,status,note}], method, client_uuid}`, upsert |
| POST | /sections/:id/attendance/:date/photo | upload register image → AI proposal |
| GET | /attendance/summary?date= | per-section submitted/missing, % present |
| PUT | /staff-attendance/:date | bulk mark (principal/admin) |
| POST | /staff/check-in | self check-in `{lat?, lng?}` |
| GET/POST | /leave-requests ; POST /leave-requests/:id/decide | |
| GET | /cover/suggestions?date= | uncovered slots + ranked candidates |
| POST | /cover/assign | `{assignments:[{slot_id, cover_staff_id}]}` → notifies |

## Communication
| Method | Path | Purpose |
|---|---|---|
| POST | /notices | `{title, body, audience, languages, ai_draft?}` |
| POST | /notices/draft | AI drafts notice in configured languages from a short instruction |
| GET | /notices/:id/stats | delivered/read/failed lists |
| GET | /messages | log with filters (category, status) |

## Insights
| Method | Path | Purpose |
|---|---|---|
| GET | /dashboard/owner | KPIs: collections, outstanding aging, attendance, staff, at-risk, ROI |
| GET | /dashboard/principal | operations view |
| GET | /risk?band=high | at-risk students with reasons |
| POST | /risk/:student_id/followups | log action/outcome |
| GET | /roi?month= | money recovered, hours saved, prints avoided (+ method notes) |
| GET | /briefs?date= ; POST /briefs/preview | view/preview Morning Brief |
| POST | /ask (P2) | `{question}` → answer + the data used |

## Webhooks (public, signature-verified)
| Method | Path | Purpose |
|---|---|---|
| GET/POST | /webhooks/whatsapp | Meta verification + inbound messages + status callbacks |
| POST | /webhooks/sms | inbound/status (provider-specific) |
| POST | /webhooks/payments/:provider | (P2) payment confirmations |

Inbound WhatsApp handling: verify signature → store `inbound_messages` → resolve guardian/staff by phone →
enqueue `comms.handle_inbound` → respond 200 fast. Never do AI work inside the webhook request.

## Internal (support console)
`/internal/*`: create school, impersonate (audited, time-limited, owner notified), view job failures, usage per school.
Restricted to `support` role + IP allowlist.
