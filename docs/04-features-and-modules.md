# 04: Features & Modules

Legend. **Tags:** `MONEY` `TIME` `EFFORT` `DECISION`. **Phase:** `P0` demo · `P1` MVP · `P2` · `P3` · `P4` later/maybe.
Every feature here must keep its tag. Adding a feature means adding a row here first.

## Module map

```
            ┌───────────────────────── Insights & AI ─────────────────────────┐
            │ Morning Brief · Dropout Early Warning · Ask CampusOS · ROI meter │
            └──────────────────────────────────────────────────────────────────┘
 ┌────────┐ ┌──────────┐ ┌────────────┐ ┌────────┐ ┌──────────┐ ┌─────────┐ ┌─────────┐
 │ Core   │ │ Fees &   │ │ Attendance │ │ Comms  │ │ Exams &  │ │ Staff & │ │ Timetbl │
 │ School │ │ Recovery │ │ (students, │ │(WA/SMS)│ │ Results  │ │ Payroll │ │ & Cover │
 │ Data   │ │          │ │  staff)    │ │        │ │   (P2)   │ │  (P3)   │ │ (P1/P3) │
 └────────┘ └──────────┘ └────────────┘ └────────┘ └──────────┘ └─────────┘ └─────────┘
            ┌──────────── Platform: auth, roles, audit, import, billing, settings ────────────┐
```

---

## M1. Core School Data
| Feature | Purpose | Tags | Phase |
|---|---|---|---|
| School setup wizard (classes, sections, fee heads, academic year) | Live in a day | `TIME` | P1 |
| **Smart Excel/CSV import** with AI column mapping and error fix-ups | No re-typing of existing records | `EFFORT` `TIME` | P0/P1 |
| Students, guardians, **families** (siblings grouped) | One balance and one message per family | `EFFORT` `MONEY` | P1 |
| Staff records | Base for attendance, cover, payroll | `EFFORT` | P1 |
| Promotion to next year in bulk | Avoid re-entering every year | `TIME` | P1 |
| Admissions inquiry → enrolment pipeline | Fewer lost admissions | `MONEY` | P3 |

## M2. Fees & Recovery ("Fee Autopilot")
| Feature | Purpose | Tags | Phase |
|---|---|---|---|
| Fee structures per class + per-student plans (concessions, sibling discount) | Correct bills without manual maths | `EFFORT` `MONEY` | P1 |
| Automatic monthly invoice (digital challan) generation | No printing or writing challans | `EFFORT` `MONEY` | P1 |
| Late fee rules (optional, per school) | Encourage on-time payment | `MONEY` | P1 |
| **Escalating reminder ladder** (polite → firm → principal call list) | Recovery without staff chasing | `MONEY` `TIME` | P1 |
| Payment links / account details in every reminder | Pay in one tap | `MONEY` | P1 |
| **Receipt photo reading + auto-match** (AI) | No manual reconciliation | `TIME` `MONEY` | P1 |
| Duplicate/suspicious receipt detection | Stop fake/reused screenshots | `MONEY` | P1 |
| Cash counter entry (fast, keyboard-first) + digital receipt on WhatsApp | No receipt books | `EFFORT` | P1 |
| Installment plans / promise-to-pay with auto follow-up | Recover from struggling families | `MONEY` | P1 |
| Live defaulter list (aging buckets 0–30/31–60/61–90/90+) | Know exactly who owes what | `DECISION` | P1 |
| Concession register + approval limits | Stop silent discounts | `MONEY` `DECISION` | P1 |
| **"Recovered by CampusOS" counter** | Prove ROI | `DECISION` | P1 |
| **Picture-style fee slip** (child photo, big amount, payment code; digital + printable) | Parents who can't read still know what to pay | `EFFORT` `MONEY` | P0/P1 |
| Payment code on every slip (1Bill/PSID or Raast QR where the school's bank supports it) | Pay at any wallet shop/agent | `MONEY` `TIME` | P1 |
| **Fee rule check** (warn on yearly increase > 5%, advance summer-fee vouchers, extra charges on slip) | Avoid regulator fines and parent complaints | `MONEY` `DECISION` | P1 |
| Summer cash plan (forecast June–July shortfall, suggest legal installments) | Pay salaries in vacation months | `DECISION` | P2 |
| Collection forecast for the month | Plan cash flow | `DECISION` | P2 |
| Online payment gateway integration (auto-confirm) | Zero reconciliation | `MONEY` `TIME` | P2 |

## M3. Attendance
| Feature | Purpose | Tags | Phase |
|---|---|---|---|
| **30-second tap attendance** (all present by default, tap absentees) | Save teacher time | `TIME` | P1 |
| Offline mode with sync | Works on bad internet | `EFFORT` | P1 |
| **Photo-of-register attendance** (AI reads marks) | For teachers who keep paper | `EFFORT` | P1 |
| Instant absence alert to parent (WhatsApp) | Safety + accountability | `TIME` `DECISION` | P1 |
| Chronic absence detection (feeds risk score) | Early intervention | `DECISION` `MONEY` | P1 |
| Staff check-in (phone tap w/ location check or principal marks) | Know who's in by 8am | `DECISION` | P1 |
| Leave requests (staff) on WhatsApp/web | No paper forms | `EFFORT` | P1 |
| Staff late-arrival report with deduction per school policy (human approves) | Replaces owner's Excel deductions | `MONEY` `TIME` | P1 |
| Monthly attendance reports auto-built | No register totalling | `TIME` | P1 |
| Biometric/RFID device integration | Only if school already owns devices | `EFFORT` | P4 |

## M4. Communication
| Feature | Purpose | Tags | Phase |
|---|---|---|---|
| WhatsApp notices/circulars to whole school, class, or families with dues | Replace printed notices | `MONEY` `EFFORT` | P1 |
| Templates in English + local language (ASSUMPTION: Urdu) | Parents actually read it | `EFFORT` | P1 |
| SMS fallback for numbers without WhatsApp | Reach everyone | `EFFORT` | P1 |
| **WhatsApp outbox with one-tap send** (wa.me link from staff phone) until the Business API is connected | Messages go out from day one with no API approval | `EFFORT` | P1 (interim) |
| Delivery/read tracking per message | Know who didn't get it | `DECISION` | P1 |
| **Parent self-service on WhatsApp** ("balance", "attendance", "report") | Fewer office calls | `TIME` | P1 (keywords) / P2 (AI free-text) |
| Message cost meter per school | Control spend | `MONEY` | P1 |
| **Voice-note messages** (fee reminders, absence alerts, notices as Urdu audio on WhatsApp) | Reaches parents who can't read | `MONEY` `EFFORT` | P0 (one reminder) / P1 |
| Automated phone call (IVR: "press 1 if paid, 2 to talk to school") | Reaches parents without WhatsApp | `MONEY` `TIME` | P1 |
| Parent voice replies transcribed for the office (AI transcribes; staff decides) | Illiterate parents can answer | `TIME` | P1 |
| Punjabi / Pashto / Sindhi voice | Regional reach | `EFFORT` | P2 |
| Voice option for Morning Brief | Owners who prefer listening | `DECISION` | P1 |

## M5. Insights & AI
| Feature | Purpose | Tags | Phase |
|---|---|---|---|
| **Morning Brief** to owner (and principal variant) | Value without login | `DECISION` | P0/P1 |
| Owner dashboard (mobile-first) | Depth when needed | `DECISION` | P1 |
| **Dropout Early Warning** (rules score + AI explanation) | Keep students = keep revenue | `MONEY` `DECISION` | P1 (rules) / P2 (refined) |
| **ROI meter** (money recovered, hours saved, paper saved) | Prove value monthly | `DECISION` | P0/P1 |
| **Savings engine** (every feature emits `roi_events`; see table below) | One source for all savings shown | `DECISION` | P0/P1 |
| Monthly owner report (PDF/WhatsApp) | Board-level summary | `DECISION` | P1 |
| **Ask CampusOS** (owner asks questions in plain language on WhatsApp/web) | Answers without reports | `DECISION` `TIME` | P2 |
| Capacity & revenue gap per section | Fill empty seats | `MONEY` `DECISION` | P2 |
| Anomaly alerts (sudden collection drop, unusual concessions, cash not deposited) | Catch leakage | `MONEY` | P2 |

## M6. Exams & Results ("Exam Autopilot")
| Feature | Purpose | Tags | Phase |
|---|---|---|---|
| Exam schedule + datesheet sent to parents | No printed datesheets | `EFFORT` | P2 |
| **AI question paper drafting** from syllabus/chapters, by difficulty | Hours saved per paper | `TIME` | P2 |
| Marks entry by grid (mobile) + **photo-of-mark-sheet reading** | No double entry | `TIME` `EFFORT` | P2 |
| **AI-assisted answer-sheet marking** (MCQ/short answers; teacher confirms) | Days saved per term | `TIME` | P2 |
| Auto results, grades, positions, report cards (digital, print on demand) | No compilation errors | `TIME` `MONEY` | P2 |
| AI-written remarks drafts per student (teacher edits) | Saves remark writing | `TIME` | P2 |
| Result analytics per class/subject/teacher | Find weak spots | `DECISION` | P2 |
| Homework/diary posting to parents | Replaces paper diary | `EFFORT` | P2 |

## M7. Staff & Payroll
| Feature | Purpose | Tags | Phase |
|---|---|---|---|
| Salary structures, allowances, deductions | Correct pay | `EFFORT` | P3 |
| Attendance/leave-linked payroll run | No Excel errors | `TIME` `MONEY` | P3 |
| Advances/loans with auto-recovery | Track money owed by staff | `MONEY` | P3 |
| Payslips on WhatsApp | No printing | `EFFORT` | P3 |
| Staff cost vs revenue per class | Right-size staffing | `DECISION` | P3 |

## M8. Timetable & Cover
| Feature | Purpose | Tags | Phase |
|---|---|---|---|
| Timetable entry (simple grid) | Needed for cover suggestions | `EFFORT` | P1 |
| **Absent-teacher cover suggestions** (free teachers, fair rotation) | Principal stops searching | `TIME` | P1 |
| Auto-generate timetable with constraints | Days saved yearly | `TIME` | P3 |

## M9. Platform
| Feature | Purpose | Tags | Phase |
|---|---|---|---|
| Phone-OTP login, roles, per-school membership | Secure, no passwords for parents | `EFFORT` | P1 |
| Audit log on money/marks/attendance/salary | Trust, stop fraud | `MONEY` `DECISION` | P1 |
| School subscription billing (our own) | Revenue | n/a (business) | P1 |
| Multi-campus (one owner, many campuses) | Chains | `DECISION` | P3 |
| Data export (Excel) anytime | No lock-in → trust | `DECISION` | P1 |

---

## Savings engine: what we measure
Every saving shown to an owner comes from `roi_events`, computed in SQL. Estimates are labelled "estimate"
and show their assumption, which the school can edit.

| Saving | How it is computed | Kind |
|---|---|---|
| Money recovered | Payments received within N days (default 7) after a CampusOS reminder | Measured |
| Concessions controlled | Concessions rejected or reduced at approval | Measured |
| Students kept | At-risk-flagged students still enrolled and paying 60 days later | Measured |
| Staff hours saved | Automated reminders × minutes per manual call (school sets, default 3) | Estimate |
| Teacher time saved | In-app attendance sessions × (old roll-call minutes − actual minutes) | Estimate |
| Printing saved | Digital slips/notices × school's own per-page print cost | Estimate |
| Net gain | Measured money recovered − CampusOS subscription | Measured |

## Parents who can't read (design rule)
Parents never have to read or type. Every parent message has a voice version; fee slips are visual
(photo, big numbers, payment code); replies can be voice notes. School staff (clerk, teacher, owner) are the
real users and do the digital work.

## MVP (P1) scope summary
Core data + import · Fee Autopilot (without gateway auto-confirm) · Attendance (students + staff) ·
WhatsApp comms with keyword self-service · Morning Brief · Dropout Early Warning (rules) · ROI meter ·
Timetable entry + cover suggestions · Platform basics.

## Explicitly out of scope
LMS / video classes · library · hostel · transport/GPS · canteen/inventory · biometric hardware (P4 integration
only) · custom chat app · social feed · gamification · student AI tutor (P4, only if it earns a tag) ·
accounting/general ledger beyond fees (export to the school's accountant instead).
