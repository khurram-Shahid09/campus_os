# 03: Users & Personas

## Roles at a glance

| Role | Main goal | Main channel | Uses it |
|------|-----------|--------------|---------|
| Owner | Profit, control, growth | WhatsApp brief + mobile dashboard | Daily, 2 minutes |
| Principal | Smooth daily operations, discipline, results | Web dashboard (desktop/tablet) | Several times a day |
| Accountant / Admin officer | Collect fees, keep records right | Web dashboard (desktop) | All day |
| Teacher | Teach; less paperwork | Mobile PWA (Android) | 2–5 minutes a day |
| Parent / Guardian | Know child is safe, pay easily, see progress | WhatsApp (+ link-based web pages) | On notification |
| Student | See homework, results | Web portal (Phase 2) | Occasionally |
| CampusOS Support (internal) | Onboard and support schools | Internal admin console | As needed |

A user can hold several roles (e.g., owner who is also principal). Roles are per school (membership).

## Personas

### Owner: "Tariq", owns a 600-student school
- Visits the school a few times a week; runs another business too.
- Pain: never sure how much fee is pending; hears about problems late; suspects money leaks.
- Wants: one daily summary, a defaulter list, proof that the staff are doing their jobs, and a sense of growth.
- Won't: learn complex software or type much.
- **Wins with CampusOS:** Morning Brief, money-recovered counter, concession report, at-risk students list,
  "Ask CampusOS" questions on WhatsApp (Phase 2).

### Principal: "Ms. Ayesha"
- Runs the day: staff, discipline, parent meetings, exams.
- Pain: finding substitute teachers, compiling results, parents calling the office, monthly attendance reports.
- **Wins:** absent-teacher cover suggestions, at-risk follow-up list, auto notices, results compiled automatically.

### Accountant: "Imran"
- Issues challans, records payments, chases defaulters, prepares reports for the owner.
- Pain: matching screenshots to students, calling parents, sibling and concession maths, month-end reports.
- **Wins:** Fee Autopilot does the chasing; receipt matching queue; reports generate themselves.
- Risk: may feel threatened. Position CampusOS as removing the boring part of the job, not the job.

### Teacher: "Sana", teaches Grade 4
- Has a cheap Android phone, patchy mobile data.
- Pain: attendance registers, marking, report-card entry, writing the diary.
- **Wins:** 30-second attendance (works offline), AI-drafted papers and homework, photo-based marking (Phase 2).
- Must never take longer than paper did, or teachers will refuse to use it.

### Parent: "Mr. Akram", two children in the school
- Uses WhatsApp daily; doesn't install school apps; may prefer Urdu (ASSUMPTION, see docs/17).
- Pain: queues to pay fees, lost paper notices, learns about absences late.
- **Wins:** absence alert same morning, one family balance for both children, pay by link, digital report card,
  ask "what's my balance?" on WhatsApp.

### Student (Phase 2)
- Sees homework, timetable, results; can practise with AI-generated quizzes (Phase 4, only if it earns a tag).

## Permissions summary

Detailed matrix in [11-security-and-privacy](11-security-and-privacy.md#role-permissions).

- **Owner:** everything in their school(s), including financial reports and settings.
- **Principal:** academics, attendance, staff, notices; fee view (configurable); no salary view unless granted.
- **Accountant:** fees, payments, concessions (within limits), reports; no academic editing.
- **Teacher:** only their own classes/subjects: attendance, homework, marks.
- **Parent:** only their own children's data, via verified phone number.
- **Student:** only their own data.
