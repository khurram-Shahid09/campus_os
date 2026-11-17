/** URL of the demo receipt image for given proof data (rendered by apps/web /demo/receipt). */
export function demoReceiptImageKey(p: { amountMinor: number; reference: string; kind: string; date: string }): string {
  const q = new URLSearchParams({ a: String(p.amountMinor), r: p.reference, k: p.kind, d: p.date });
  return `/demo/receipt?${q.toString()}`;
}
