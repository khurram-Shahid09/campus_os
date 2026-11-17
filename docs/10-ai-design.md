# 10: AI Design

## Principles
1. **AI reads, drafts, explains, and flags. Humans approve.** No AI output changes money, marks, attendance or
   salary without a human confirmation step.
2. **Numbers come from SQL, never from the model.** The model receives computed facts and writes words. Any
   generated text is validated: every number in it must exist in the facts payload, otherwise fall back to a template.
3. **Structured outputs everywhere.** Every AI call returns JSON validated against a zod schema
   (`output_config.format` / strict tools). Invalid output → retry once → fallback/human queue.
4. **Confidence routing.** Extractions carry confidence; low confidence always goes to a human queue.
5. **Tenant isolation.** Prompts include only the current school's data, minimized to what the task needs.
   No student names are sent where IDs suffice (e.g., risk scoring explanation uses signals, not names).
6. **Every call is logged** in `ai_jobs` with tokens, cost, latency, and the record it relates to.
7. **Graceful degradation.** If the AI API is down, the product still works: queues wait, briefs use templates,
   receipts go to manual review.

## Model & settings

Default model: **`claude-opus-5-5`** (Claude Opus 5.5) via `@anthropic-ai/sdk` (TypeScript).
- Thinking is adaptive and always on for this model; control depth with `output_config.effort`
  (default is `medium`, so set it explicitly per task).
- Forced `tool_choice` (`any`/`tool`) is not supported on this model: use structured outputs
  (`output_config.format`) for JSON, or `tool_choice: auto` + `strict: true` tools.
- Check `stop_reason` before reading content (handle `refusal` and `max_tokens`); enable server-side
  fallbacks (`fallbacks: "default"` with the `server-side-fallback-2026-07-01` beta) for resilience.
- Prompt caching on the stable system prompt + schema for high-volume tasks.
- Overnight bulk work (risk explanations, monthly reports) via the **Message Batches API** (50% cost).

| Task | Effort | Mode | Human step |
|---|---|---|---|
| Receipt extraction (vision) | `low` | sync job, structured output | Accountant approves in Receipt Queue |
| Register photo → absent list (vision) | `low` | sync job, structured output | Teacher confirms |
| Import column mapping | `low` | sync, structured output | Admin confirms mapping |
| Morning Brief writing | `low` | scheduled, structured output (text + used_fact_keys) | Number validation (auto) |
| Notice drafting (multi-language) | `low` | sync | Principal edits/sends |
| Risk explanation text | `low` | nightly batch | Principal reads; acts |
| Question paper drafting (P2) | `medium` | async, streaming | Teacher edits |
| Answer-sheet marking assist (P2) | `medium` | async | Teacher reviews each item flagged / signs off |
| Report-card remarks (P2) | `low` | batch | Teacher edits |
| Ask CampusOS (P2) | `medium` | tool use over read-only query tools | Shows data used |

> Cost tier decision (open, see docs/17): high-volume extraction tasks could later move to a cheaper model
> such as `claude-haiku-5-5` **if** an eval shows equal accuracy. That is a founder decision backed by an eval, not a default.

## 1. Receipt reading & payment matching
**Input:** image of bank/wallet receipt from WhatsApp + sender phone.
**Output schema:** `{ is_payment_receipt: bool, amount: number|null, currency: string|null, paid_at: string|null,
reference: string|null, bank_or_wallet: string|null, sender_name: string|null, receiver_account_hint: string|null,
confidence: { amount, date, reference: 0..1 }, notes: string }`
**Matching (deterministic, in core, not AI):** candidate families = guardian phone match (strong) + open balance ≈ amount
(±1%) + name similarity; score → `suggested_family_id`, `match_score`.
**Fraud checks:** perceptual hash duplicate, same reference used before, receipt date far from submission, receiver
account not the school's configured account(s).
**Auto-approve:** never in MVP. (Later, optionally: auto-approve when gateway-confirmed or bank-statement-matched.)

## 2. Register photo attendance
Teacher photographs the register page. Model receives image + ordered student list (roll no + first name) and the
target date column. Returns `{ date_column_found: bool, marks: [{roll_no, status, confidence}] }`. UI shows the proposed
absent list highlighted; teacher taps to confirm. Low confidence rows are highlighted for check.

## 3. Morning Brief
**Facts payload** (computed in SQL): `{school_name, date, collections_yesterday, families_paid_yesterday, mtd_collected,
mtd_billed, mtd_pct, last_month_same_day_pct, overdue_30_plus, overdue_families, recovered_mtd, staff_absent:[names],
cover_assigned, cover_needed, new_at_risk_count, notable:[...] }`.
**Prompt rules:** ≤ 8 lines; owner's language; lead with money; mention only facts present; no advice beyond the
"notable" items; end with no question.
**Output:** `{ text, used_fact_keys: [] }` → validator checks every numeral in `text` maps to a fact → send.
Fallback: deterministic template with the same facts.

## 4. Dropout Early Warning
**Score is rules-based and explainable** (MVP), computed in `packages/core/insights/risk.ts`:

| Signal | Example weight |
|---|---|
| Attendance last 14 days vs own 60-day baseline drop ≥ 15 pts | 25 |
| ≥ 3 consecutive unexplained absences | 15 |
| Oldest unpaid invoice > 45 days | 20 |
| Broken promise-to-pay in last 60 days | 10 |
| Sibling withdrew this year | 15 |
| Marks decline ≥ 15% vs last exam (P2) | 10 |
| Guardian negative reply / complaint flag | 5 |

Bands: 0–39 low, 40–64 watch, 65+ high. Weights are config, calibrated per school over time using
outcomes in `risk_followups` and withdrawals. AI is only used to phrase reasons for the principal in plain language
(batched nightly). P2+: consider a learned model only when ≥ 1 year of outcome data exists across schools.

## 5. Smart import mapping
Model receives column headers + 20 sample rows (phones masked to last 4 digits) and the target field list; returns
`{ mappings: [{source_column, target_field, confidence, transform: "split_name"|"normalize_phone"|...}], unmapped: [] }`.
Transforms are executed by deterministic code, never by the model.

## 6. Question paper drafting (P2)
Inputs: class, subject, chapters/topics (from syllabus uploaded by school or teacher-provided text), question type
mix, marks, difficulty. Output: structured paper JSON (sections, questions, marks, answer key) → rendered to PDF.
Teacher edits before use. Store drafts; never auto-publish to students.

## 7. Answer marking assist (P2)
Objective/short answers only in first release. Inputs: answer key + scanned sheet images. Output per question:
`{student_answer_text, suggested_marks, confidence, reason}`. Teacher reviews all below-threshold items and signs off
the sheet. Long/essay answers remain human-marked (AI may suggest, clearly labelled).

## 8. Ask CampusOS (P2)
Tool use with **read-only, school-scoped, parameterized query tools** (e.g., `get_collections(period)`,
`get_defaulters(min_days, class)`, `get_attendance(section, range)`, `get_risk_list(band)`). No raw SQL from the model.
Answers cite which tool results were used; numbers are taken from tool results only. Owner/principal roles only.

## Evals (before launch of each AI feature)
- Receipt extraction: ≥ 200 real (consented, anonymized) receipts across banks/wallets; target amount accuracy ≥ 98%,
  reference ≥ 95%; measure false-match rate after matching.
- Register reading: ≥ 50 register photos; absent-list precision/recall ≥ 97% on clear photos.
- Brief: 100% numeric validation pass on 500 generated facts payloads.
Eval sets live in `packages/ai/evals/` and run in CI on prompt or model changes.

## Cost control
- Per-school monthly AI budget with alerting at 80%; hard cap degrades to manual flows (never blocks core features).
- Image downscaling before upload (long edge ≤ 1600px), JPEG quality tuned.
- Prompt caching for system prompts/schemas; batches for nightly jobs.
- Track `cost per active student per month` in `billing.usage_snapshot`; target in NFR-08.
