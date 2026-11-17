import Link from "next/link";

const ROLES = [
  {
    href: "/demo/owner",
    role: "Owner",
    who: "Buys CampusOS",
    does: "Sees money recovered vs. what CampusOS costs, unpaid fees, students at risk, staff punctuality. Approves discounts.",
    saves: "Money: recovered fees and stopped discounts. Decisions: no need to call the school to know what's happening.",
  },
  {
    href: "/demo/principal",
    role: "Principal",
    who: "Runs the day",
    does: "One call list: students about to leave, classes not marked, teachers late or absent.",
    saves: "Time: no walking around with registers. Money: a call that keeps a student keeps a year of fees.",
  },
  {
    href: "/demo/clerk",
    role: "Fee clerk",
    who: "Collects fees",
    does: "Cash counter in seconds, payment screenshots matched for one-tap approval, picture fee slips.",
    saves: "Time: no receipt books, no matching screenshots to bank statements. Money: reused screenshots caught.",
  },
  {
    href: "/demo/teacher",
    role: "Teacher",
    who: "Marks attendance",
    does: "Everyone is present by default; tap only the absent children. Parents are told automatically.",
    saves: "Time: about 30 seconds instead of a 5–10 minute roll call, no monthly register totals.",
  },
  {
    href: "/demo/parent",
    role: "Parent",
    who: "No app, no login",
    does: "Gets Urdu voice notes on WhatsApp: fee slip, reminders, absence alerts, receipts. Can ask for balance or send a payment screenshot.",
    saves: "Effort: works for parents who can't read. School stops printing slips and notices.",
  },
];

export default function DemoHome() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">Demo Grammar School · synthetic data</p>
      <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">One school, five people, one system.</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Pick a role. What one person does shows up for the others: a teacher marks a child absent, the parent hears a voice note, the
        principal sees the pattern, the owner sees the result.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {ROLES.map((r) => (
          <Link key={r.href} href={r.href} className="group rounded-2xl border border-line bg-white p-5 transition hover:border-brand">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold group-hover:text-brand">{r.role}</h2>
              <span className="text-xs text-muted">{r.who}</span>
            </div>
            <p className="mt-2 text-sm">{r.does}</p>
            <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-xs text-ink">{r.saves}</p>
          </Link>
        ))}
      </div>
      <p className="mt-8 text-xs text-muted">
        Demo limits: no login (role switcher instead), WhatsApp messages are simulated on screen, and payment screenshot reading uses
        pre-filled demo values until the AI key is connected.
      </p>
    </div>
  );
}
