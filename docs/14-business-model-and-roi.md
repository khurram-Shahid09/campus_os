# 14: Business Model & ROI

> All prices and figures here are **planning assumptions** (marked ASSUMPTION) until validated with pilot
> schools. Currency shown as PKR because the launch market is assumed to be Pakistan (see docs/17).
> Replace with real market data before publishing any of it.

## Pricing model: per active student per month

Schools think in "per student" terms (that's how they charge fees), so our price maps to their revenue.

| Plan | Includes | Price (ASSUMPTION) |
|---|---|---|
| **Essentials** | Fee Autopilot, attendance, notices, Morning Brief, dashboards, risk alerts, ROI meter | Rs 30 / student / month |
| **Pro** (P2) | + Exams & report cards, AI paper drafting/marking, Ask CampusOS, payment gateway | Rs 50 / student / month |
| **Chain** (P3) | + Payroll, multi-campus, consolidated owner view | Custom |

- Minimum monthly fee: Rs 6,000 (ASSUMPTION) so very small schools remain profitable.
- Annual prepay: 2 months free.
- WhatsApp message costs: bundled allowance per student; overage passed through at cost + small margin.
- Setup/import: free (it's our sales advantage: "live in a day").
- **Pilot offer:** first 2 months free, then pay only if overdue fees went down (performance guarantee). This
  removes buyer risk and fits the "prove it" positioning.

## Unit economics (per 500-student school, ASSUMPTION)

| Item | Monthly |
|---|---|
| Revenue (Essentials) | Rs 15,000 |
| WhatsApp messages (≈ 6 per family/month, business-initiated) | measure in pilot; target ≤ 10% of revenue |
| AI (receipts, brief, register photos, risk text) | measure in pilot; target ≤ 3% of revenue |
| Hosting share | small (< 3% at 50+ schools) |
| Support (onboarding amortized) | ~10% |
| **Target gross margin** | ≥ 70% |

NFR-08 caps infra + AI + messaging at 15% of price.

## ROI the school sees (how we calculate it)

CampusOS shows ROI from the school's own data in the ROI meter. The method is transparent and shown on the screen:

1. **Money recovered** = payments on overdue invoices made within 7 days after a CampusOS reminder (FR-FEE-13).
   Measured, not estimated.
2. **Hours saved** = count of automated tasks × time constants the school can edit. Defaults (ASSUMPTION):
   - fee follow-up call avoided: 4 min
   - receipt matched automatically: 3 min
   - attendance taken digitally vs paper + monthly totalling: 4 min per section per day
   - notice sent digitally vs printing/distribution: 30 min per notice
   - report card auto-generated (P2): 10 min per student per term
3. **Paper/print saved** = digital challans/notices/report cards × school's per-page cost (editable).
4. **Students kept** = at-risk students who received a logged follow-up and remain enrolled 60 days later
   (shown as an indicator, not a claim of causation).

### Example (illustrative, not a promise)
School: 500 students, average fee Rs 4,000/month → monthly billing Rs 2,000,000.
If 20% is overdue at any time (Rs 400,000) and CampusOS reminders bring in an extra 25% of that per month,
that's **Rs 100,000/month recovered** against a Rs 15,000 subscription: ~6.7× return, before counting hours saved.
Keeping **one** student who would have left is worth Rs 48,000/year, more than 3 months of subscription.

The sales pitch uses the school's own numbers from the Health Report, never this example as fact.

## Go-to-market
1. **Demo-led direct sales** to owners: Health Report on their own data in the first meeting.
2. **Pilot → case study** (with written permission) → referrals. Owners know other owners.
3. **School associations / networks** for group demos.
4. **Referral reward:** one free month per referred school that goes live.

## Competitive position
Traditional SMS vendors sell modules and charge setup fees; free/cheap apps lack automation and support.
CampusOS sells outcomes (recovered money, saved hours) with a performance-backed pilot. Moat: the WhatsApp-native
automation and the school's accumulated history (risk calibration, collection patterns), plus the habit of the daily brief.
