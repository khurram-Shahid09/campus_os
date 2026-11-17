"use client";

import { useState } from "react";
import { checkFeeIncrease, checkFeeSlip, formatMoney } from "@campusos/core";

const VERDICT = {
  ok: { text: "Within the 5% yearly limit", cls: "bg-brand-soft text-brand" },
  needs_permission: { text: "Above 5%: needs regulator permission (max 8%)", cls: "bg-warn-soft text-warn" },
  over_limit: { text: "Above 8%: likely not allowed", cls: "bg-danger-soft text-danger" },
} as const;

export function FeeRuleCheck() {
  const [current, setCurrent] = useState("3000");
  const [proposed, setProposed] = useState("3300");
  const [advanceSummer, setAdvanceSummer] = useState(false);
  const [annualCharge, setAnnualCharge] = useState(false);

  const cur = Math.round(Number(current || 0) * 100);
  const next = Math.round(Number(proposed || 0) * 100);
  const inc = checkFeeIncrease(cur, next);
  const lines = [{ feeHead: "Tuition", period: "2027-03", amountMinor: next }];
  if (advanceSummer) lines.push({ feeHead: "Tuition", period: "2027-06", amountMinor: next }, { feeHead: "Tuition", period: "2027-07", amountMinor: next });
  if (annualCharge) lines.push({ feeHead: "Annual charges", period: "2027-03", amountMinor: 500_000 });
  const warnings = checkFeeSlip("2027-03", lines);
  const v = VERDICT[inc.verdict];

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="text-muted">Current monthly fee (Rs)</span>
          <input value={current} onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="tabular mt-1 w-full rounded-lg border border-line px-3 py-2" />
        </label>
        <label>
          <span className="text-muted">New fee next year (Rs)</span>
          <input value={proposed} onChange={(e) => setProposed(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="tabular mt-1 w-full rounded-lg border border-line px-3 py-2" />
        </label>
      </div>
      <p className={`rounded-lg px-3 py-2 font-semibold ${v.cls}`}>
        +{inc.increasePct}% ({formatMoney(next - cur)}/month): {v.text}
      </p>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={advanceSummer} onChange={(e) => setAdvanceSummer(e.target.checked)} /> Collect June–July fees in March
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={annualCharge} onChange={(e) => setAnnualCharge(e.target.checked)} /> Add &quot;annual charges&quot; to the slip
        </label>
      </div>
      {warnings.length > 0 && (
        <ul className="space-y-1">
          {warnings.map((w, i) => (
            <li key={i} className="rounded-lg bg-warn-soft px-3 py-1.5 text-warn">
              ⚠{" "}
              {w.kind === "advance_summer_fee"
                ? `Advance summer fee (${w.period}): regulators have repeatedly called this illegal.`
                : w.kind === "extra_charge"
                  ? `"${w.feeHead}" on a monthly slip: often challenged by parents and regulators.`
                  : `Fee for ${w.period} charged in advance.`}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">Warnings only. Rules differ by province; CampusOS warns, you decide.</p>
    </div>
  );
}
