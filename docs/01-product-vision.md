# 01: Product Vision

## One line

**CampusOS makes a school run itself:** fees get collected, attendance gets taken, parents get informed,
and the owner gets a morning report, with almost no manual work.

## The problem in one paragraph

A typical private school runs on registers, receipt books, Excel sheets and phone calls. The accountant
spends days chasing unpaid fees. Teachers lose hours to attendance, marking, and report cards. Parents get
printed notices that never reach home. The owner has no real picture of the school until month-end, by which
time money has leaked and students have already left. Traditional "School Management Systems" digitize
these same forms. They add data entry instead of removing it, so staff resist them and owners see no return.

## What makes CampusOS different

| Traditional SMS | CampusOS |
|-----------------|----------|
| Digital forms for the same manual work | Automates the work itself |
| Owner must log in to see anything | Owner gets a WhatsApp brief every morning |
| Records what happened | Warns what is about to happen (defaulters, dropouts, uncovered classes) |
| Parents need an app (they don't install it) | Parents use WhatsApp they already have |
| Sold on features | Sold on money recovered and hours saved |
| Data entry by staff | Photos, taps, and AI reading do the entry |

## Who it is for

**Primary customer:** single-campus private schools with **200–1,500 students**, where the owner makes the
buying decision personally, fee collection is a constant struggle, and the staff are small and over-stretched.
(Later: school chains with several campuses.)

**Buyer:** the owner. **Champion:** the principal or accountant who feels the daily pain.
**Daily users:** teachers, accountant, principal. **Recipients:** parents (and students later).

## The three numbers we sell

Every feature must move at least one of these, and CampusOS shows them to the owner continuously:

1. **Money recovered:** fees collected through CampusOS reminders and payment links that were overdue.
2. **Hours saved:** staff time removed (attendance, fee follow-up, report cards, notices), measured per task.
3. **Students kept:** at-risk students flagged and followed up who stayed enrolled.

A fourth supporting number: **paper and print cost saved** (notices, challans, report cards sent digitally).

## Purpose tags

Every feature in this product carries one or more tags. Features with no tag don't get built.

- `MONEY`: recovers or saves money
- `TIME`: saves hours for staff or teachers
- `EFFORT`: removes manual work or paperwork
- `DECISION`: gives owners/principals information to decide better and earlier

## Product principles

1. **Automate, don't digitize.** If a feature just moves a paper form to a screen, rethink it.
2. **Zero-typing input.** Photos, taps, voice and imports over keyboards.
3. **Value without login.** Owners and parents get value through WhatsApp; the dashboard is for depth.
4. **AI assists, humans approve.** AI never changes money, marks or salaries without a human tap.
5. **Prove the value.** The system tracks and reports its own ROI to the school.
6. **Cheap to run.** Runs well on low-end Android phones, poor internet, and a small server.
7. **Start in a day.** A school can import its Excel sheets and be live in under one day.

## Signature ("wow") features

1. **Morning Brief:** a daily WhatsApp message to the owner: yesterday's collections, outstanding fees,
   staff absences, uncovered classes, at-risk students. See [06-workflows](06-workflows.md#3-owner-morning-brief).
2. **Fee Autopilot:** automatic reminders in escalating steps, payment links, and AI reading of payment receipt
   photos matched to the right family.
3. **Dropout Early Warning:** attendance, fee and marks signals combined to flag students likely to leave.
4. **30-Second Attendance:** tap-through or photo-of-register attendance with instant parent alerts.
5. **Exam Autopilot (Phase 2):** AI-drafted papers, photo-based marking, auto report cards sent digitally.
6. **School Health Report (sales demo):** upload last year's fee and attendance data; see in minutes how much
   money the school is losing and why. See [15-demo-plan](15-demo-plan.md).

## Success metrics

| Metric | Target (first 6 months at a school) |
|--------|-------------------------------------|
| Overdue fee balance | ↓ 30% or more |
| Time to collect a month's fees | ↓ 40% |
| Accountant hours on fee follow-up | ↓ 60% |
| Teacher time on attendance | < 1 minute per class per day |
| Owner reads Morning Brief | ≥ 5 days/week |
| Printed notices/challans | ↓ 70% |
| School renews after year 1 | ≥ 85% |

These targets are internal goals, not promises to schools. Anything shown to a school is measured from their
own data or labelled as an estimate.

## What CampusOS is NOT (for now)

Not an LMS or online-class platform, not a library/hostel/transport system, not a biometric hardware vendor,
not a chat app. These may integrate later only if they earn a purpose tag. See [04-features-and-modules](04-features-and-modules.md#explicitly-out-of-scope).
