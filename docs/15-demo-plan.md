# 15: Demo Plan: "School Health Report"

The demo is designed so the owner's reaction is *"I'm losing this much and didn't know"* within 10 minutes.
We don't open with a feature tour. We open with **their** money.

## Demo flow (20 minutes)

### 1. The hook (2 min)
"Send me last year's fee register and attendance sheet (Excel or even photos). In 10 minutes I'll show you how much
money your school is owed and which students you're about to lose."

### 2. Health Report on their data (8 min)
Upload → AI maps columns → report renders:
- **Total outstanding** and **aging** (0–30 / 31–60 / 61–90 / 90+), top 20 overdue families.
- **Collection rate** by month and by class; "your best and worst months".
- **Concessions** total (if data exists).
- **Chronic absentees** and students whose attendance dropped then left (if withdrawal data exists): "11 of 17
  students who left last year showed warning signs first".
- **Estimated staff hours** spent on fee follow-up and attendance totalling (labelled estimate, editable assumptions).
- **Estimated recovery** with CampusOS (labelled estimate, using conservative recovery %).
Downloadable as PDF; the owner keeps it. It becomes the business case.

If the owner can't share data, run the same report on the **demo school** (clearly labelled "Demo data").

### 3. Live wow moments (6 min)
- **Morning Brief:** the owner's own phone receives tomorrow's brief (generated from their uploaded data).
- **Receipt magic:** presenter sends a payment screenshot to the CampusOS WhatsApp number → within seconds the
  dashboard shows it read, matched to a family, ready to approve.
- **30-second attendance:** hand the owner a phone; they take attendance for a 35-student class.
- **Absence alert:** the owner's phone gets the parent message.

### 4. Close (4 min)
- Show ROI meter on demo school: "This is what you'll see every month."
- Offer: 2-month pilot, free; we import everything in a day; you pay only if overdue fees go down.

## Demo data set (`packages/db/demo`)
- "Demo Grammar School": 620 students, 18 sections, 48 staff, 14 months history.
- Realistic patterns: seasonal late payments, sibling families, 9% concession share, a few chronic absentees,
  17 withdrawals with preceding signals, 3 suspicious duplicate receipts.
- Synthetic names; every screen shows a **DEMO** badge.

## Demo requirements (Phase 0 build list)
| Item | Notes |
|---|---|
| Upload + AI mapping for messy Excel/CSV (and photos of registers: stretch) | Robust to merged cells, Urdu headers |
| Health Report page + PDF | Mobile + desktop; numbers from SQL; assumptions editable |
| Morning Brief generation + WhatsApp send to any verified number | Use sandbox/test number in Phase 0 |
| Receipt WhatsApp flow end-to-end | AI extract + match against demo families |
| Teacher attendance screen + absence alert | Demo school only |
| Owner dashboard + ROI meter / savings screen | Demo school |
| One Urdu voice-note fee reminder (played in the meeting / sent to owner's phone) | Shows parents who can't read are reached |
| Picture-style fee slip | Child photo, big amount, payment code |
| Data handling | Uploaded prospect data stored in an isolated demo tenant, deleted after 14 days unless they sign up; tell them this |

## Honesty rules for demos
- Estimates always labelled "estimate" with the assumption visible.
- Never show another school's real data. Demo school is synthetic and labelled.
- Don't promise recovery percentages; show the method and the pilot guarantee instead.
