# 12: Integrations

All external services sit behind adapters in `packages/messaging` / `packages/core/payments` so providers can be
swapped per market without touching domain logic.

## WhatsApp Business Cloud API (primary channel)
- One WhatsApp Business number per school is ideal (messages come "from" the school). MVP fallback: a shared
  CampusOS number with school name in every template. Decision open (docs/17).
- **Templates** (pre-approved by Meta) for business-initiated messages: fee_invoice, fee_reminder_1/2/3, receipt,
  absence_alert, notice_generic, morning_brief, otp, welcome_optin, cover_assignment, payslip (P3).
- **Service conversations**: replies to parent-initiated messages within 24h (keywords, receipt uploads).
- Interactive buttons for: "I've paid (send receipt)", "Promise to pay", "Talk to office", brief quick replies.
- Inbound: text, images (receipts), button replies → `/webhooks/whatsapp`.
- Status callbacks update `messages.status`. Costs per conversation category recorded in `messages.cost_minor`.
- Embedded signup flow for schools to connect their own number (P1-late / P2).

## SMS (fallback)
- Adapter interface: `send(to, text)`, `status webhook`. Local aggregator chosen per market (ASSUMPTION).
- Used for: numbers without WhatsApp, OTP fallback, critical alerts when WhatsApp fails.

## Payments
- **MVP:** no gateway dependency. Reminders include the school's bank account / wallet details and a payment
  reference (family code). Confirmation via receipt photo + AI + accountant approval.
- **P2:** payment links via a local gateway (ASSUMPTION: e.g. mobile wallets and instant bank payment rails in
  the launch market) with webhook confirmation and automatic allocation.
- **Later:** bank statement import (CSV/MT940) for automatic matching of transfers.

## Object storage
Cloudflare R2 (S3-compatible). Buckets: `uploads` (receipts, registers, answer sheets; lifecycle delete after
retention), `documents` (report cards, challans, monthly reports), `exports` (auto-expire 7 days).

## AI
Anthropic Claude API: see [10-ai-design](10-ai-design.md). API key server-side only (worker + server routes).

## Email (minimal)
Transactional email only for owner monthly report copy and support. Provider adapter (e.g., Resend/SES).

## Optional / later
- Biometric attendance devices (P4): import punches via device export or vendor API, only if the school owns devices.
- Google Sheets export sync (P3) for owners who live in spreadsheets.
- Accounting export (P3) to the school's accountant format.
