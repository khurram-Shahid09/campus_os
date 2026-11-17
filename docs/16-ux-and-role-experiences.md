# 16: UX & Role Experiences

## UX principles
1. **One main action per screen.** Teachers: "Take attendance". Accountant: "Next receipt".
2. **Defaults do the work.** Everyone present by default; amounts prefilled; ladder pre-configured.
3. **Thumb-first mobile** for teacher/owner/parent (360px baseline, 44px targets); **keyboard-first desktop**
   for accountant (search family → amount → Enter).
4. **Show the value.** Small "saved you X" moments (e.g., after approving receipts: "12 receipts matched, ~36 min saved").
5. **Bilingual-ready.** All strings externalized; RTL-safe layouts for local-language parent pages (ASSUMPTION: Urdu).
6. **Fast on slow networks.** Server-rendered pages, minimal JS, skeleton states, offline banners.

## Owner
**Channel:** WhatsApp Morning Brief (primary) + mobile dashboard.
- **Home:** today's collections, month progress bar (collected vs billed), overdue by aging, ROI meter card.
- **Money:** defaulters (top families, aging), concessions this month, collection trend.
- **People:** staff present/absent today, at-risk students (with follow-up status).
- **Reports:** monthly owner report, exports.
- **Ask (P2):** a question box ("How much did Grade 5 pay this month vs last?").

## Principal
**Channel:** web dashboard (tablet/desktop) + WhatsApp operations brief.
- **Today:** attendance submitted/missing by section, staff absent, periods needing cover (one-tap assign).
- **At-risk students:** reasons, call log, outcomes.
- **Notices:** compose (AI draft, two languages), audience picker, delivery report.
- **Academics (P2):** exams, marks progress per teacher, approve results.

## Accountant
**Channel:** desktop web.
- **Receipt Queue:** image left, AI-extracted fields + suggested family right; Approve (Enter) / Fix / Reject.
- **Cash counter:** search family by name/phone/admission no → shows balance → amount → Enter → receipt sent.
- **Families ledger:** timeline of invoices/payments, promises, reminders sent.
- **Follow-up list:** families at ladder step 3+, with notes and click-to-call.
- **Setup:** fee structures, concessions (with approval limit indicator), reminder ladder editor (preview each message).

## Teacher (PWA)
- **Home (Today):** my sections → big "Take attendance" button; timetable; cover duties today.
- **Attendance:** grid of names/photos, all green; tap to toggle absent/late; "Submit (32 present, 3 absent)".
  Camera icon for photo-of-register mode. Works offline with "will sync" badge.
- **Leave request:** dates + reason → submit.
- **P2:** homework post, marks entry grid, AI paper draft, report remarks.

## Parent (WhatsApp-first)
- Receives: invoice, reminders, receipts, absence alerts, notices, report cards (P2).
- Sends: keywords, receipt photos, button replies (promise to pay, talk to office).
- **Link pages** (no install, OTP-verified, mobile web): family balance & history, pay details/link, child attendance
  calendar, report cards (P2). Language toggle.

## Student (P2)
Simple web portal: timetable, homework, published results.

## Notification design rules
- Every message: school name first, one clear purpose, one action.
- Fee messages: polite, private, never shaming; always include how to pay and how to say "I've paid".
- Respect quiet hours and daily caps; batch non-urgent items into one message.

## Design system
Tailwind v4 tokens; neutral base + one brand accent; status colours (paid/overdue/at-risk) with text labels
(not colour alone); light and dark modes for staff web; icons + words on every primary button.
