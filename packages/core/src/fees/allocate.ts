import type { Minor } from "../shared/money";

export interface OpenInvoice {
  id: string;
  dueDate: Date;
  balanceMinor: Minor;
}

export interface Allocation {
  invoiceId: string;
  amountMinor: Minor;
  /** Invoice balance after this payment. */
  newBalanceMinor: Minor;
}

/**
 * Apply a payment to a family's open invoices, oldest due first (the usual school practice:
 * clear old months before the current one). Returns allocations and any unallocated advance.
 */
export function allocatePayment(amountMinor: Minor, invoices: OpenInvoice[]): { allocations: Allocation[]; advanceMinor: Minor } {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("payment must be a positive integer amount");
  let left = amountMinor;
  const allocations: Allocation[] = [];
  const sorted = [...invoices]
    .filter((i) => i.balanceMinor > 0)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.id.localeCompare(b.id));
  for (const inv of sorted) {
    if (left === 0) break;
    const take = Math.min(left, inv.balanceMinor);
    allocations.push({ invoiceId: inv.id, amountMinor: take, newBalanceMinor: inv.balanceMinor - take });
    left -= take;
  }
  return { allocations, advanceMinor: left };
}

export function invoiceStatusFor(totalMinor: Minor, balanceMinor: Minor): "open" | "partially_paid" | "paid" {
  if (balanceMinor <= 0) return "paid";
  return balanceMinor < totalMinor ? "partially_paid" : "open";
}

/**
 * Undo a payment's allocations (for a reversal entry). Returns the new balance of each touched invoice.
 * Throws if an allocation is larger than what was paid on that invoice (data would be inconsistent).
 */
export function reverseAllocations(
  allocations: { invoiceId: string; amountMinor: Minor }[],
  invoices: { id: string; totalMinor: Minor; paidMinor: Minor; balanceMinor: Minor }[],
): { invoiceId: string; paidMinor: Minor; balanceMinor: Minor; status: "open" | "partially_paid" | "paid" }[] {
  const byId = new Map(invoices.map((i) => [i.id, { ...i }]));
  for (const a of allocations) {
    const inv = byId.get(a.invoiceId);
    if (!inv) throw new Error(`invoice ${a.invoiceId} not found`);
    if (a.amountMinor > inv.paidMinor) throw new Error("reversal larger than amount paid on invoice");
    inv.paidMinor -= a.amountMinor;
    inv.balanceMinor += a.amountMinor;
  }
  return [...new Set(allocations.map((a) => a.invoiceId))].map((id) => {
    const i = byId.get(id)!;
    return { invoiceId: id, paidMinor: i.paidMinor, balanceMinor: i.balanceMinor, status: invoiceStatusFor(i.totalMinor, i.balanceMinor) };
  });
}
