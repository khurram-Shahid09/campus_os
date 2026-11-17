import Link from "next/link";

export function Card({ title, sub, children, className = "" }: { title?: string; sub?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-white p-4 sm:p-5 ${className}`}>
      {title && <h2 className="font-semibold">{title}</h2>}
      {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      <div className={title || sub ? "mt-3" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" | "brand" }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`tabular mt-0.5 text-lg font-semibold sm:text-xl ${tone === "danger" ? "text-danger" : tone === "brand" ? "text-brand" : ""}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

export function Badge({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "brand" | "warn" | "danger" }) {
  const cls = {
    muted: "bg-paper text-muted",
    brand: "bg-brand-soft text-brand",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
  }[tone];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cls}`}>{children}</span>;
}

export function SavesNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm text-ink">
      <span className="font-semibold text-brand">What this saves: </span>
      {children}
    </div>
  );
}

export function PageTitle({ role, title, sub, right }: { role: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">{role}</p>
        <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
        {sub && <p className="text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "ghost" }) {
  return (
    <Link
      href={href}
      className={
        variant === "primary"
          ? "inline-flex items-center rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand/90"
          : "inline-flex items-center rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-semibold hover:bg-paper"
      }
    >
      {children}
    </Link>
  );
}
