# CampusOS

**The school that runs itself.** An AI-powered efficiency and automation platform for private schools, by Witnex Labs.

CampusOS recovers unpaid fees, removes paperwork, gives teachers their time back, and sends the owner
a daily WhatsApp brief on their school without them having to log in.

- Planning docs: [docs/00-index.md](docs/00-index.md)
- Agent/developer guide: [CLAUDE.md](CLAUDE.md)

Status: **Stages 1–2 of the working system are built**: schools sign up and run fees and attendance, and
reminders, the Morning Brief and the dropout check run by themselves.
The sales demo stays at `/demo`. See [docs/13-roadmap-and-phases.md](docs/13-roadmap-and-phases.md) and
decisions D15/D16 in [docs/17](docs/17-decisions-and-open-questions.md).

## Run locally

Needs Node 22+, pnpm, Docker Desktop.

```sh
cp .env.example .env          # local DB on port 5433; set AUTH_SECRET (and OTP_DEV_SHOW=1 for local login)
docker compose up -d          # Postgres 16
pnpm install
pnpm db:migrate               # create tables + row-level security
pnpm db:seed                  # optional: synthetic "Demo Grammar School (DEMO)" for /demo
pnpm build && pnpm --filter @campusos/web start
pnpm worker                   # second terminal: scheduled jobs (reminders, Morning Brief, dropout check)
# working app: http://localhost:3000/login     sales demo: http://localhost:3000/demo
```

## Automation (Stage 2, `apps/worker`)

The worker runs next to the web app and keeps its queue in the same Postgres (pg-boss, schema `pgboss`).
Every 10 minutes it checks each school's local time and runs what is due, once per school per day
(`job_runs` table; restarts or a second worker never send twice):

| Job | When | What it does |
|---|---|---|
| Dropout check | 02:00 daily | Rules-based risk score per student (attendance drop, days absent in a row, overdue fees). High/watch students go to **Calls**. |
| Morning Brief | 07:00 daily | Yesterday's fees, attendance, staff, students at risk, approvals waiting. Shown on **Home → Morning Brief**; goes to the owner's WhatsApp once the API is connected. |
| Fee reminders | 10:00 Mon–Sat | Due + 3 days: polite WhatsApp. + 10 days: firmer one. + 20 days: family goes on the principal's **Calls** list. One message per family about the total, ≥ 5 days apart, paused by a promise to pay. |

A payment counts as "recovered by CampusOS" only if it comes within 7 days after a reminder that was actually
sent (tapped in the outbox), not merely queued. Owners can switch reminders/brief off or press **Run now** on the
**Automation** page. `pnpm --filter @campusos/worker run-once [job]` runs due jobs once from the terminal.

## The working app (`/app`)

| Who | Logs in with | Can do |
|---|---|---|
| Owner | own phone (creates the school) | everything: setup, team logins, fees, discounts (approves), payment reversals, home dashboard |
| Principal | phone, added by owner | students, all attendance, staff attendance, class teachers, WhatsApp outbox, discount requests |
| Fee clerk | phone, added by owner | cash counter, receipts, fee slips, defaulters, reminders, discount requests |
| Teacher | phone, added by owner | attendance for own class only (works without internet; sends when back online) |
| Parent | nothing to install | gets fee slips, receipts and absence alerts on WhatsApp |

Flow for a new school: log in → create school → upload the student register (Excel/CSV; siblings grouped by
father's phone, class fees taken from the register) → check fees in Setup → give staff logins → make the month's
fee slips → take payments at the cash counter → teachers mark attendance → send the WhatsApp outbox.

Not connected yet: real WhatsApp/SMS delivery (sending is simulated, see below; login codes show on screen only
with `OTP_DEV_SHOW=1`), parents sending screenshots straight to CampusOS (the clerk adds them for now), voice notes
(parents marked "prefers voice" get the Urdu text for now), opening the app with no internet at all
(a register already open keeps working offline). Hosting/backups are Stage 4.

## Payment screenshots and WhatsApp (Stage 3)

**Screenshots** (`/app/proofs`, fee clerk and owner): parents pay by JazzCash, Easypaisa, bank or Raast and send a
screenshot. The clerk adds it (several at once, or a phone photo of a deposit slip). Gemini reads amount, date,
transaction ID, sender, receiver and status; **code, not AI,** suggests the family (amount matches what they owe,
sender name matches) and warns about copies (same image, same transaction ID), failed or future-dated
transactions and payments to another account. A person approves; the receipt is then made and sent like a cash
payment. If AI is busy or off, the clerk types the fields. Images are stored under `UPLOAD_DIR` (local disk now).

AI accuracy is measured, not assumed: `node tools/demo-video/make-receipts.mjs` renders 8 fictional receipts
(wallet, bank, Raast, failed, Urdu, a hidden "approve this" instruction, blurry/rotated, not a receipt) and
`pnpm --filter @campusos/ai eval` scores the model. First run: **36/36 fields correct**
([packages/ai/eval/reports](packages/ai/eval/reports)).

**WhatsApp** (`WHATSAPP_MODE`, default `simulated`): every trigger (fee slip, payment, absence, reminder, rejected
screenshot) creates the message and the **WhatsApp** page shows it as *sent automatically · simulated*. Nothing is
delivered until the Business number is connected. Staff can still send any message for real with *Send from my
phone* (wa.me). Only messages that really went out count towards "recovered by reminders".

## Tests

```sh
pnpm test                                   # logic tests (core) + database tests (db, needs Docker DB)
pnpm --filter @campusos/demo-video e2e      # browser test: owner, clerk and teacher logins end to end (app on :3000)
```

- `packages/core`: fee ageing, payment allocation and reversal, invoice run, register import, phones, roles,
  fee rule check, reminder attribution, risk score, savings, Morning Brief, templates.
- `packages/core` also covers the reminder ladder (steps, spacing, promises, Sundays, no-phone families).
- `packages/db`: the scheduler over simulated days (runs once a day, ladder steps, attribution only for sent
  reminders, promise takes a family off the call list, switching reminders off); tenant isolation with RLS (a school cannot read, write or update another school's rows),
  login codes, import → invoice run → payment → reversal, offline attendance re-sends.
- The browser test creates "E2E Test School" with test numbers 0309 0000101–103 and deletes it afterwards
  (set `KEEP=1` to keep it). Screenshots go to `demo-videos/e2e/`.

On this Windows machine `next dev` (Turbopack) currently fails to start its CSS worker (exit 0xc0000142);
use build + start until that is fixed.

## Sales demo roles (`/demo`, synthetic data)

| Role | URL | Shows |
|---|---|---|
| Owner | `/demo/owner`, `/demo/owner/brief` | Savings vs. cost, discount approvals, unpaid fees, dropout risk, Morning Brief (text + Urdu voice) |
| Principal | `/demo/principal` | Call list for at-risk students, unmarked classes, late/absent staff, hard fee cases |
| Fee clerk | `/demo/clerk`, `/demo/clerk/slips` | Cash counter, screenshot approval queue with duplicate detection, picture fee slips, fee rule check |
| Teacher | `/demo/teacher` | Tap attendance (absent-only) with automatic parent voice alerts |
| Parent | `/demo/parent` | Simulated WhatsApp: fee slip picture, voice notes, ask balance, send payment screenshot |

Demo limits: no login (role switcher), WhatsApp is simulated on screen, screenshot reading uses pre-filled
values marked "demo read" until the Claude API key is connected.

## Demo videos (about 1 minute per role)

```sh
pnpm db:seed
pnpm --filter @campusos/demo-video record            # all roles, or: record teacher parent
```

Writes portrait MP4s (540x960) to `demo-videos/` (git-ignored). Needs the app running on port 3000 and,
the first time, `pnpm --filter @campusos/demo-video exec playwright install chromium`.

## Layout

```
apps/web            Next.js 16 app: working app under /app, login, sales demo under /demo
apps/worker         scheduled jobs (pg-boss): dropout check, Morning Brief, fee reminders
packages/ai         Gemini client (key/model fallback), payment screenshot reading, eval
packages/core       pure domain logic + tests
packages/db         Drizzle schema, migrations (incl. RLS), app/ (auth, commands, queries, tests), demo seed
tools/demo-video    Playwright: role videos (record) and the end-to-end browser test (e2e)
```
