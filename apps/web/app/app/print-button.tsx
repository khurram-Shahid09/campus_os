"use client";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white print:hidden" data-testid="print">
      {label}
    </button>
  );
}
