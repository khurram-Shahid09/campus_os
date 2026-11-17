# 17: Decisions & Open Questions

## Decisions made

| # | Decision | Date | Notes |
|---|---|---|---|
| D1 | Product name: **CampusOS** (by Witnex Labs) | 2026-11-17 | Founder chose it |
| D2 | Positioning: efficiency & automation platform, not a traditional SMS; sold on money recovered / hours saved / students kept | 2026-11-17 | |
| D3 | Signature features: Morning Brief, Fee Autopilot (reminders + receipt AI), Dropout Early Warning, 30-second attendance; Health Report as sales demo | 2026-11-17 | |
| D4 | WhatsApp-first for parents and owners; no parent app install | 2026-11-17 | |
| D5 | AI never decides money/marks/salary; AI never computes numbers | 2026-11-17 | |
| D6 | Stack: Next.js 16 + TypeScript + Tailwind v4, PostgreSQL + Drizzle, pg-boss worker, R2 storage, Claude API (`claude-opus-5-5`) | 2026-11-17 | Matches Witnex site skills |
| D7 | Modular monolith, shared-schema multi-tenancy with RLS | 2026-11-17 | |
| D8 | Project folder: `D:\CampusOS` (standalone), docs in `D:\CampusOS\docs` | 2026-11-17 | |
| D9 | Build order: Phase 0 demo → Phase 1 MVP pilot → P2 academics → P3 payroll/chains | 2026-11-17 | |

## Assumptions to confirm (marked ASSUMPTION in docs)

| # | Assumption | Affects | Status |
|---|---|---|---|
| A1 | Launch market is **Pakistan** (PKR, bank transfer + mobile wallets, Urdu as second language) | Pricing, payments, templates, language, data law | **Confirm** |
| A2 | Target: single-campus private schools, 200–1,500 students | Features, pricing | Confirm |
| A3 | Pricing Rs 30 / Rs 50 per student per month; min Rs 6,000 | Business model | Validate in pilot |
| A4 | Pilot offer: 2 months free, pay only if overdue fees decrease | Sales | Confirm |
| A5 | Time-saved constants for ROI meter (docs/14) | ROI meter | Validate by timing real staff |
| A6 | Image retention 12 months | Privacy | Confirm with legal guidance |

## Open questions

| # | Question | Needed by |
|---|---|---|
| Q1 | Which payment gateway / wallets for P2 auto-confirmation in the launch market? | Phase 2 |
| Q2 | One WhatsApp number per school vs a shared CampusOS number for MVP? (Per-school is better for trust; shared is faster to launch.) | Phase 1 start |
| Q3 | SMS aggregator choice | Phase 1 |
| Q4 | Hosting region / data residency requirements | Phase 0 |
| Q5 | Do we have 1–2 friendly schools for the Phase 0 demo and pilot? | Phase 0 |
| Q6 | Should high-volume AI extraction use a cheaper model (e.g. `claude-haiku-5-5`) after an accuracy eval? Founder decision. | Phase 1 cost review |
| Q7 | Branding: logo/colours for CampusOS; domain name availability | Phase 0 |
| Q8 | Is a student-facing portal needed in P2, or can it wait for P3? | Phase 2 planning |

## Answered decisions log
(Append new answers here: date, question #, answer.)

| Date | Ref | Answer |
|---|---|---|
| 2026-11-17 | A1 | Founder confirmed: launch market is **Pakistan** (local private schools). |
| 2026-11-17 | D10 | Parents may be illiterate: voice-first parent comms (Urdu voice notes, IVR call, voice replies) and picture-style fee slips. Parents never need to read or type. |
| 2026-11-17 | D11 | Core promise: the app **proves savings** (money, time, effort) every month via the savings engine (`roi_events`); measured vs estimate always labelled. |
| 2026-11-17 | D12 | Added Pakistan-specific features: fee rule check (5% yearly cap, advance summer fees), payment code on slips (1Bill/Raast), staff late-arrival deductions (P1), summer cash plan (P2). |
| 2026-11-17 | D14 | Demo app covers 5 roles (owner, principal, fee clerk, teacher, parent-as-WhatsApp) on one shared demo database, plus ~1-minute portrait video per role recorded with Playwright. Demo has no login and simulates WhatsApp; to be replaced by OTP auth and the real WhatsApp API in Phase 1. |
| 2026-11-17 | D13 | Start building the **Phase 0 demo** now: demo school seed, Excel import + Health Report, owner dashboard + savings screen, Morning Brief, one voice-note reminder, receipt reading. |
| 2026-11-18 | D15 | Founder: build a **working system**, not only a demo. Stage 1 built: phone OTP login, sessions, Postgres RLS (`campusos_app` role via `withSchool`), school sign-up, Excel/CSV register import, classes/fees setup, team logins by role, monthly invoice run, cash counter with numbered receipts and owner-only reversals, printable slips, discounts with owner approval, teacher attendance with offline queue, staff attendance, owner home, WhatsApp outbox. `/demo` stays as the sales tool. |
| 2026-11-18 | D16 | Until WhatsApp delivery is connected: login codes are shown on screen only when `OTP_DEV_SHOW=1` (never in production), and parent messages wait in an outbox that staff send with a wa.me link. Sessions last 30 days (rolling) for all roles for now; docs/11's 12-hour owner/accountant option is not built yet. |
| 2026-11-18 | D17 | Stage 2 built: worker (pg-boss in the same Postgres) with once-per-school-per-day jobs: dropout check 02:00, Morning Brief 07:00, fee reminders 10:00 Mon–Sat (+3 d WhatsApp, +10 d firmer, +20 d principal call; one message per family, ≥ 5 days apart, paused by promises). Reminder credit only for reminders actually sent. Owner's brief is not put in the staff outbox (status `pending_api` until WhatsApp API). |
| 2026-11-18 | D18 | Founder: use **free Gemini API** keys for AI during development (Claude later); WhatsApp sending is **simulated** in the app (messages created, logged and labelled "sent automatically · simulated"), with optional real sending from a staff phone. **Privacy caution:** Gemini's free tier lets Google use submitted content to improve its products and may involve human review. Payment screenshots contain parents' names and account digits, so switch to a paid tier (or Claude) before real school data. Only really-sent reminders earn "recovered" credit. |

Research notes (2026-11-17, from news/vendor/academic sources, not measured data): competitors price at roughly
Rs 15–55/student/month or Rs 1,500–7,000/month flat; low-fee school fees roughly Rs 300–2,500/month; owners
report 20–25% dropouts; teacher turnover is high. Validate with owner interviews.
