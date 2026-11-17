# 07: System Architecture

## Goals that shape the design
Affordable to run, simple to maintain by a small team, works on low-end phones and weak internet, and safe
multi-tenancy. **Modular monolith first.** Split only when a measured bottleneck demands it.

## High-level diagram

```
  Parents / Owners            Teachers / Staff / Principal / Owner
   (WhatsApp, SMS)              (PWA on phone, web on desktop)
        │                                   │
        ▼                                   ▼
 ┌──────────────┐  webhooks   ┌───────────────────────────────────────┐
 │ WhatsApp     │────────────▶│  apps/web  (Next.js 16, App Router)   │
 │ Cloud API    │◀────────────│  • UI (RSC + client islands, PWA)     │
 │ SMS provider │   send API  │  • /api/v1/* route handlers (REST)    │
 └──────────────┘             │  • /webhooks/* (WhatsApp, payments)   │
 ┌──────────────┐             │  • Auth (OTP sessions), RBAC          │
 │ Payment      │────────────▶│  • enqueues jobs                      │
 │ gateway (P2) │             └──────────────┬────────────────────────┘
 └──────────────┘                            │ packages/core (domain logic)
                                             ▼
                       ┌──────────────────────────────────────────┐
                       │ PostgreSQL 16 (managed)                  │
                       │ • all data, school_id on every row, RLS  │
                       │ • pg-boss job queue tables               │
                       └──────────────┬───────────────────────────┘
                                      │
                       ┌──────────────▼───────────────────────────┐
                       │ apps/worker (Node, long-running)         │
                       │ • cron: invoices, reminders, brief, risk │
                       │ • AI jobs (Claude API), message sending  │
                       └──────┬─────────────────┬─────────────────┘
                              ▼                 ▼
                     ┌──────────────┐   ┌──────────────────┐
                     │ Claude API   │   │ Object storage   │
                     │ (Anthropic)  │   │ (R2/S3): images, │
                     └──────────────┘   │ PDFs, exports    │
                                        └──────────────────┘
```

## Stack decisions

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language across web, worker, shared packages |
| Web/API | Next.js 16 App Router, route handlers for REST | Same as Witnex site; SSR for fast first paint on slow phones |
| Styling | Tailwind v4 + small component set (shadcn-style) | Fast, consistent, small bundle |
| DB | PostgreSQL 16, managed (Neon / Supabase / RDS; choose by region latency) | Reliable, RLS, JSON, cheap |
| ORM | Drizzle | Typed SQL, light runtime, good migrations |
| Jobs | pg-boss | Queue + cron in Postgres; no Redis to run |
| Storage | Cloudflare R2 (S3 API) | Cheap egress; signed URLs |
| Messaging | WhatsApp Business Cloud API; SMS provider adapter | Parents' real channel |
| AI | Claude API via `@anthropic-ai/sdk` | Vision + structured outputs + tool use |
| Auth | Phone OTP (WhatsApp/SMS) + session cookies; optional password for staff desktops | Parents/teachers don't manage passwords |
| Offline | PWA service worker + IndexedDB outbox | Attendance/cash entry offline |
| PDFs | Server-side HTML → PDF (headless Chromium in worker) | Report cards, challans, monthly report |
| Observability | Sentry (errors) + structured JSON logs + pg-boss dashboard | Small-team friendly |
| Hosting | Phase 0–1: Vercel (web) + one small VM/container for worker, or one VM (Docker Compose) for both | Lowest cost and ops |

## Code structure (monorepo, pnpm workspaces)

```
apps/
  web/                 Next.js: app/(owner)|(principal)|(accounts)|(teacher)|(parent)  + api/v1 + webhooks
  worker/              job handlers, schedules, AI runners
packages/
  db/                  drizzle schema, migrations, RLS policies, seed, demo dataset
  core/                domain modules: school, fees, attendance, comms, insights, timetable, exams, payroll
                       (pure functions + repository interfaces; unit-tested)
  ai/                  prompts, output schemas (zod), Claude client, cost/usage logging
  messaging/           whatsapp.ts, sms.ts, templates/, rate limiting, quiet hours
  ui/                  shared components
docs/
```

**Rule:** route handlers and job handlers are thin. They authenticate, validate (zod) and call `packages/core`.

## Multi-tenancy

- Shared database, shared schema. Every tenant table has `school_id uuid not null`.
- Every request resolves `{user_id, school_id, role}` from the session; repositories require `school_id`.
- Postgres RLS policies on all tenant tables using `current_setting('app.school_id')`, set per transaction:
  a second guard if app code forgets a filter.
- `campus_id` nullable on relevant tables from day 1 so multi-campus (P3) needs no migration rewrite.

## Background jobs (worker)

| Job | Schedule | Notes |
|---|---|---|
| `fees.generate_invoices` | daily 02:00 school TZ (acts on configured day) | idempotent per (school, period) |
| `fees.apply_late_fees` | daily 02:30 | idempotent per invoice/day |
| `fees.reminder_ladder` | hourly within allowed hours | respects quiet hours, stops on payment/promise |
| `fees.process_receipt` | on inbound image | AI extract → match → queue |
| `attendance.absence_alerts` | on submit + cut-off sweep | dedupe per student/day |
| `attendance.missing_sweep` | 09:00 | nudge teachers, inform principal |
| `insights.risk_scores` | nightly 01:00 | writes `risk_scores` snapshot |
| `insights.morning_brief` | 06:30 compute, 07:30 send | per school; retry; fallback template |
| `insights.monthly_report` | 1st of month | PDF + WhatsApp |
| `comms.send_message` | on demand | rate-limited per provider; status webhooks update log |
| `billing.usage_snapshot` | nightly | students active, messages, AI cost per school |

All jobs are **idempotent** (keyed by natural keys) and retried with backoff; failures alert support.

## Offline design (teacher PWA)
- Today's sections and student lists cached in IndexedDB at login and refreshed daily.
- Attendance submissions written to an outbox with a client UUID; synced when online; server upserts by
  `(school_id, section_id, date)` and records the client UUID for dedupe.

## Scaling path (only when measured)
1. Read replica for dashboards/reports.
2. Move worker AI and messaging jobs to separate worker instances (same code, different queues).
3. Partition `attendance_records` and `messages` by month.
4. Region-specific deployments if data residency is required.

## Environments
`local` (Docker Postgres, WhatsApp sandbox, AI with demo key) → `staging` (demo schools, used for sales demos)
→ `production`. Secrets via host environment variables; never committed.
