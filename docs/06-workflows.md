# 06: Workflows

Each workflow shows the trigger, the steps (who/what), and what is saved compared with today.

## 1. School onboarding (target: live in one day)

1. CampusOS support (or owner) creates school: name, timezone, currency, academic year.
2. Owner uploads existing Excel files (students, guardians, fee register).
3. AI proposes column mapping ("Father Cell #" → `guardian.phone`); user confirms.
4. Validation report: invalid phones, duplicate students, missing classes. One-click suggested fixes.
5. System suggests families (same guardian phone); admin confirms in bulk.
6. Fee structures set per class; opening balances imported as arrears invoices.
7. Teachers invited by WhatsApp link → OTP login → see their sections.
8. Parents receive a welcome WhatsApp (opt-in confirmation + "reply BALANCE anytime").
9. First Morning Brief goes out the next morning.

**Saves:** weeks of manual data entry with conventional systems.

## 2. Monthly fee cycle (Fee Autopilot)

```
Day 1     Worker generates invoices → family-level challan → WhatsApp to guardian (with pay link/account details)
Due-3     Friendly reminder (only unpaid)
Due date  ─────────────
Due+3     Reminder #2 + late fee notice (if rule enabled)
Due+10    Firm reminder; family appears on accountant's follow-up list
Due+20    Principal call list (with family context: siblings, history, risk score)
Due+30    Owner list in Morning Brief; optional promise-to-pay / installment offer
```

**Payment arrives:**
- *Cash at counter:* accountant enters family + amount (keyboard-first, < 15 s) → allocation oldest-first →
  digital receipt to WhatsApp → reminders stop.
- *Bank/wallet transfer:* parent sends receipt photo on WhatsApp → AI extracts fields → system finds the
  likely family (sender phone, amount, reference) → item lands in **Receipt Queue** → accountant taps
  Approve / Fix / Reject → receipt sent → reminders stop.
- *Gateway (P2):* webhook confirms automatically.

**Promise-to-pay:** parent replies "I'll pay on the 15th" (button) → reminders pause until then → resume if
not paid.

**Saves:** most of the accountant's chasing calls, manual reconciliation, printed challans and receipt books.

## 3. Owner Morning Brief

1. 06:30 (school timezone): worker computes facts with SQL for each school (yesterday's collections, MTD vs
   last month, outstanding by aging, top overdue families, attendance yesterday, staff absent today (so far),
   uncovered periods, new at-risk students, money recovered this month).
2. Facts JSON → Claude writes a short brief in the owner's language using **only** those facts
   (numbers are inserted from the JSON, then validated: any number in the text not in the facts → fallback template).
3. 07:30: sent via WhatsApp template to owner (principal gets an operations variant).
4. Brief ends with 2–3 quick-reply buttons: "Defaulters list", "At-risk students", "Open dashboard".

Example:
> **Good morning. City School, Tue 17 Nov**
> Collected yesterday: **Rs 182,000** (41 families). This month: Rs 1.9M of 2.6M (73%, last month at this point 64%).
> Overdue 30+ days: **Rs 410,000** from 52 families. CampusOS recovered **Rs 236,000** of overdue fees this month.
> Staff: 2 absent (Ms. Hina, Mr. Bilal); cover assigned for 5 of 6 periods.
> ⚠ 3 students newly at risk of leaving (attendance + fee delays). Tap to see.

**Saves:** owner's time asking for reports; surfaces problems the same day.

## 4. Daily student attendance

1. 08:00 teacher opens PWA → section list → all marked present → taps absentees (≈ 30 s).
   Alternative: photographs paper register → AI proposes absent list → teacher confirms.
2. Submit (offline-queued if no network).
3. Within 15 min: WhatsApp alert to each absent student's guardian ("Ahmed was marked absent today. Reply 1 if
   you know, 2 to talk to the school").
4. 09:00: principal sees sections not submitted; teacher gets a nudge.
5. Nightly: attendance feeds the risk score and monthly reports.

## 5. Staff absence and cover

1. Teacher sends leave request (PWA or WhatsApp) or is marked absent at check-in time.
2. System reads the timetable, finds the absent teacher's periods, and ranks free teachers (free that period,
   fewest covers this month, same subject preferred).
3. Principal sees "6 periods need cover" with suggestions → one tap "Assign all".
4. Cover teachers receive WhatsApp notice with period, section, room.
5. Leave and absence data flow into payroll (P3).

## 6. Dropout Early Warning

1. Nightly job computes a 0–100 risk score per student from signals (see [10-ai-design](10-ai-design.md#4-dropout-early-warning)):
   attendance drop vs own baseline, consecutive absences, fee overdue age, broken promises, marks decline (P2),
   sibling withdrawal, guardian replies flagged negative.
2. Students crossing threshold → "At-risk" list with top 3 reasons in plain language.
3. Principal gets the list; logs action (called parent / meeting / no answer) and outcome.
4. Outcomes tracked: retained vs withdrew → "students kept" metric and calibration of the score.

## 7. Notices and circulars

1. Principal writes notice (or asks AI: "School closed Friday for rain, exams moved to Monday": AI drafts
   English + local-language versions).
2. Choose audience (all / class / families with dues / custom).
3. Send → WhatsApp (SMS fallback) → delivery/read report; "not delivered" list for the office to call.

## 8. Exam cycle (Phase 2)

1. Principal creates exam term, subjects, max marks, datesheet → parents notified.
2. Teacher asks AI to draft paper: chapters, question types, difficulty mix → edits → exports print-ready PDF.
3. After exam: marks entered on mobile grid, or teacher photographs marked sheets/award list → AI reads →
   teacher confirms. MCQ/short answers can be AI-marked against a key; teacher reviews each low-confidence item.
4. System computes totals, grades, positions; AI drafts remarks; teacher edits.
5. Principal approves → report cards sent digitally to parents; print only on request.

## 9. Payroll (Phase 3)

1. On payroll day, the worker drafts the run: base + allowances − (unpaid leave, late policy, advance
   installments) using attendance and leave data.
2. Accountant reviews exceptions; owner approves.
3. Payslips sent on WhatsApp; bank transfer file exported.

## 10. Parent self-service (WhatsApp)

| Parent sends | System replies (from their own family data only) |
|---|---|
| BALANCE | Outstanding per child + total + pay details |
| ATTENDANCE | This month's attendance per child |
| RECEIPT + photo | "Received, we'll confirm shortly" → Receipt Queue |
| REPORT (P2) | Latest report card link |
| Anything else | P1: menu + "Office will reply"; P2: AI answer from own data or route to office |

Phone number must match a verified guardian; otherwise reply "This number is not registered."
