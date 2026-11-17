# CampusOS: Agent Guide

CampusOS is an AI-powered **school efficiency and automation platform** built by Witnex Labs.
It is NOT a traditional School Management System. Its job is to **save schools money, save staff time,
remove paperwork, and help owners decide better**, and to prove it with numbers.

Status: **planning complete, no code yet.** The docs in `docs/` are the source of truth. Build from them.

## Read these first (in order)

1. [docs/01-product-vision.md](docs/01-product-vision.md): what we are building and why
2. [docs/04-features-and-modules.md](docs/04-features-and-modules.md): every feature, its purpose tag, and its phase
3. [docs/13-roadmap-and-phases.md](docs/13-roadmap-and-phases.md): what to build now vs later
4. [docs/07-system-architecture.md](docs/07-system-architecture.md): stack and structure
5. [docs/17-decisions-and-open-questions.md](docs/17-decisions-and-open-questions.md): decisions made, assumptions to confirm

Full index: [docs/00-index.md](docs/00-index.md)

## Product rules (non-negotiable)

1. **Every feature has a purpose tag**: `MONEY` (saves/recovers money), `TIME` (saves hours),
   `EFFORT` (removes manual work/paper), or `DECISION` (better decisions). No tag, no feature.
   If you want to add something not in `docs/04`, update the doc first and say which tag it earns.
2. **The owner is the buyer.** Every screen an owner sees should answer "what did this save or earn me?"
3. **WhatsApp-first for parents and owners.** Parents should never need to install an app. Owners get
   value without logging in (Morning Brief).
4. **AI never decides money or marks on its own.** AI reads, drafts, flags and suggests; a human approves
   anything that changes a fee balance, a payment, a grade or a salary.
5. **AI never computes numbers.** All figures (collections, balances, attendance %) come from SQL.
   AI only turns computed facts into words, or reads documents into structured data.
6. **Honesty:** savings shown to schools are either measured (from their own data) or clearly labelled
   "estimate". Demo data is labelled as demo. No fake testimonials or client names.
7. **Avoid over-engineering.** Modular monolith, one database, one worker. No microservices,
   no Kubernetes, no Redis until measured need.
8. **Works on cheap Android phones and bad internet.** Teacher screens must work offline and sync later.

## Tech stack (decided; see docs/07)

- Next.js 16 (App Router) + TypeScript + Tailwind v4 (same stack as the Witnex Labs site)
- PostgreSQL 16 + Drizzle ORM; every tenant table has `school_id`; Postgres RLS as a second guard
- pg-boss (Postgres-backed job queue) + a separate Node worker for scheduled/background jobs
- S3-compatible object storage (Cloudflare R2) for receipt/register/answer-sheet images
- WhatsApp Business Cloud API (primary channel), SMS as fallback
- AI: free-tier Gemini during development (D18, `packages/ai`, key/model fallback); Claude API via `@anthropic-ai/sdk` planned (docs/10). Use a paid tier before real school data.
- WhatsApp: `WHATSAPP_MODE=simulated` until the Business API is connected (D18)
- PWA for teacher and parent screens

## Planned repo layout

```
apps/web/            Next.js app: UI + API route handlers (/api/v1/*) + webhooks
apps/worker/         Node worker: jobs, schedules (Morning Brief, reminders, risk scoring)
packages/db/         Drizzle schema, migrations, seed + demo data
packages/core/       Domain logic per module (fees, attendance, ...): pure TS, tested
packages/ai/         Claude prompts, schemas, AI job runners, cost tracking
packages/messaging/  WhatsApp/SMS adapters, templates
docs/                These planning docs
```

## Conventions

- Money stored as integer minor units (`amount_minor BIGINT`) + `currency` on the school. Never floats.
- All timestamps `timestamptz` in UTC; display in the school's timezone.
- Soft delete (`deleted_at`) for people and financial records; financial records are never hard-deleted.
- Every write to money, marks, attendance or salary goes to `audit_logs`.
- Domain logic lives in `packages/core`, not in route handlers or React components.
- Tests are required for fee calculation, reminder scheduling, payment matching and risk scoring.

## Working agreement with the founder

- Ask when information is missing; do not invent school data, prices or client names.
- Log answered decisions at the bottom of `docs/17-decisions-and-open-questions.md`.
- Market assumptions (currency, payment rails, language) are marked `ASSUMPTION` in the docs. Check docs/17
  before treating them as final.
