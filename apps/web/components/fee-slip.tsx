import { formatMoney } from "@campusos/core";

const MONTHS_UR = ["جنوری", "فروری", "مارچ", "اپریل", "مئی", "جون", "جولائی", "اگست", "ستمبر", "اکتوبر", "نومبر", "دسمبر"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Picture-style fee slip, designed for parents who can't read: child's face (initials until photos are added),
 * one big number, a due date, and a payment code any wallet agent can type in.
 */
export function FeeSlip({
  school,
  period,
  amountMinor,
  arrearsMinor = 0,
  dueDay,
  code,
  children,
  compact = false,
}: {
  school: string;
  period: string;
  amountMinor: number;
  arrearsMinor?: number;
  dueDay: number;
  code: string;
  children: string[];
  compact?: boolean;
}) {
  const m = Number(period.split("-")[1]) - 1;
  const total = amountMinor + arrearsMinor;
  return (
    <div className={`overflow-hidden rounded-2xl border-2 border-brand bg-white ${compact ? "text-[13px]" : ""}`} data-testid="fee-slip">
      <div className="flex items-center justify-between bg-brand px-4 py-2 text-white">
        <span className="font-semibold">{school.replace(/\s*\(DEMO\)/, "")}</span>
        <span dir="rtl" lang="ur" className="text-sm">
          فیس {MONTHS_UR[m]}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 px-4 pt-3">
        {children.map((c) => (
          <div key={c} className="flex items-center gap-2 rounded-full bg-brand-soft py-1 pl-1 pr-3">
            <span className="grid size-8 place-items-center rounded-full bg-brand text-xs font-bold text-white">{initials(c)}</span>
            <span className="text-sm font-medium">{c}</span>
          </div>
        ))}
      </div>
      <div className="px-4 py-3 text-center">
        <p className="tabular text-4xl font-black tracking-tight">{formatMoney(total)}</p>
        {arrearsMinor > 0 && (
          <p className="text-xs text-danger">
            includes {formatMoney(arrearsMinor)} from earlier months
          </p>
        )}
        <div className="mt-2 inline-flex items-center gap-2 rounded-lg bg-warn-soft px-3 py-1.5 text-sm font-semibold text-warn">
          <span aria-hidden>📅</span>
          <span>
            {dueDay} {MONTHS_EN[m]}
          </span>
          <span dir="rtl" lang="ur">
            · آخری تاریخ {dueDay} {MONTHS_UR[m]}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 border-t border-dashed border-line px-4 py-3">
        <QrMark seed={code} />
        <div>
          <p className="text-[11px] text-muted">Payment code · show at any wallet shop or bank app</p>
          <p className="tabular text-lg font-bold tracking-widest">{code}</p>
        </div>
      </div>
    </div>
  );
}

/** Visual placeholder for the bank-issued QR (real QR comes from the school's bank / 1Bill). */
function QrMark({ seed }: { seed: string }) {
  const digits = seed.replace(/\D/g, "");
  const cells = Array.from({ length: 49 }, (_, i) => {
    const r = Math.floor(i / 7);
    const c = i % 7;
    const finder = (r < 2 && c < 2) || (r < 2 && c > 4) || (r > 4 && c < 2);
    return finder || Number(digits[(i * 7) % digits.length] ?? 0) % 2 === 0;
  });
  return (
    <div className="grid size-14 shrink-0 grid-cols-7 gap-px rounded bg-white p-1 ring-1 ring-line" aria-label="Payment QR code (demo)">
      {cells.map((on, i) => (
        <span key={i} className={on ? "bg-ink" : "bg-white"} />
      ))}
    </div>
  );
}
