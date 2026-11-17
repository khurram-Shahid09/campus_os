# CampusOS

**The school that runs itself.** An AI-powered efficiency and automation platform for private schools, by Witnex Labs.

CampusOS recovers unpaid fees, removes paperwork, gives teachers their time back, and sends the owner
a daily WhatsApp brief on their school without them having to log in.

- Planning docs: [docs/00-index.md](docs/00-index.md)
- Agent/developer guide: [CLAUDE.md](CLAUDE.md)

Status: **Stage 1 of the working system is built** (real schools can sign up and run fees and attendance).
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
# working app: http://localhost:3000/login     sales demo: http://localhost:3000/demo
```

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

Not connected yet (Stage 2–3): WhatsApp/SMS sending (login codes show on screen only with `OTP_DEV_SHOW=1`;
parent messages wait in the outbox and are sent with one tap from a staff phone), the background worker (scheduled
reminders, Morning Brief, risk scores), AI receipt reading, voice notes, opening the app with no internet at all
(a register already open keeps working offline). Hosting/backups are Stage 4.

## Tests

```sh
pnpm test                                   # logic tests (core) + database tests (db, needs Docker DB)
pnpm --filter @campusos/demo-video e2e      # browser test: owner, clerk and teacher logins end to end (app on :3000)
```

- `packages/core`: fee ageing, payment allocation and reversal, invoice run, register import, phones, roles,
  fee rule check, reminder attribution, risk score, savings, Morning Brief, templates.
- `packages/db`: tenant isolation with RLS (a school cannot read, write or update another school's rows),
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
packages/core       pure domain logic + tests
packages/db         Drizzle schema, migrations (incl. RLS), app/ (auth, commands, queries, tests), demo seed
tools/demo-video    Playwright: role videos (record) and the end-to-end browser test (e2e)
```
