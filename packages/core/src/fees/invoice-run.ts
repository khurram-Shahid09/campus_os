import type { Minor } from "../shared/money";

/**
 * Monthly invoice run (pure). One invoice per family per period: brothers and sisters are billed together,
 * which is how Pakistani schools collect. Discounts come only from approved adjustments.
 */
export interface RunStudent {
  id: string;
  familyId: string;
  classId: string;
  name: string;
}
export interface RunHead {
  id: string;
  name: string;
  /** monthly heads are always billed; others only when listed in `extraHeadIds` */
  frequency: "monthly" | "term" | "annual" | "one_time" | string;
}
export interface RunStructure {
  classId: string;
  feeHeadId: string;
  amountMinor: Minor;
}
export interface RunAdjustment {
  studentId: string;
  /** null = applies to every head */
  feeHeadId: string | null;
  kind: "percent" | "fixed";
  /** percent: 0..100; fixed: minor units off per line */
  value: number;
  validFrom: Date;
  validTo: Date | null;
}
export interface RunLine {
  studentId: string;
  feeHeadId: string;
  description: string;
  amountMinor: Minor;
  discountMinor: Minor;
}
export interface RunInvoice {
  familyId: string;
  lines: RunLine[];
  totalMinor: Minor;
}

export interface InvoiceRunInput {
  period: string; // "2026-12"
  students: RunStudent[];
  heads: RunHead[];
  structures: RunStructure[];
  adjustments: RunAdjustment[];
  extraHeadIds?: string[];
  /** families already billed for this period are skipped (makes the run safe to repeat) */
  alreadyBilledFamilyIds?: Iterable<string>;
}

export interface InvoiceRunResult {
  invoices: RunInvoice[];
  skippedFamilyIds: string[];
  /** students whose class has no fee set: shown to the user, never silently billed 0 */
  studentsWithoutFee: RunStudent[];
}

export function periodBounds(period: string): { first: Date; last: Date } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`Invalid period "${period}"`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new Error(`Invalid period "${period}"`);
  return { first: new Date(Date.UTC(y, mo - 1, 1)), last: new Date(Date.UTC(y, mo, 0)) };
}

function adjustmentActive(a: RunAdjustment, first: Date, last: Date) {
  return a.validFrom.getTime() <= last.getTime() && (a.validTo === null || a.validTo.getTime() >= first.getTime());
}

/** Discount for one line from all active adjustments; never more than the line amount. */
export function lineDiscount(amountMinor: Minor, feeHeadId: string, adjustments: RunAdjustment[]): Minor {
  let off = 0;
  for (const a of adjustments) {
    if (a.feeHeadId !== null && a.feeHeadId !== feeHeadId) continue;
    if (a.kind === "percent") {
      if (a.value < 0 || a.value > 100) throw new Error("percent adjustment must be 0..100");
      off += Math.round((amountMinor * a.value) / 100);
    } else {
      if (!Number.isSafeInteger(a.value) || a.value < 0) throw new Error("fixed adjustment must be a non-negative integer");
      off += a.value;
    }
  }
  return Math.min(off, amountMinor);
}

export function buildInvoiceRun(input: InvoiceRunInput): InvoiceRunResult {
  const { first, last } = periodBounds(input.period);
  const extra = new Set(input.extraHeadIds ?? []);
  const billable = input.heads.filter((h) => h.frequency === "monthly" || extra.has(h.id));
  const headById = new Map(billable.map((h) => [h.id, h]));
  const skip = new Set(input.alreadyBilledFamilyIds ?? []);

  const byClass = new Map<string, RunStructure[]>();
  for (const st of input.structures) {
    if (!headById.has(st.feeHeadId)) continue;
    if (!Number.isSafeInteger(st.amountMinor) || st.amountMinor < 0) throw new Error("fee amount must be a non-negative integer");
    byClass.set(st.classId, [...(byClass.get(st.classId) ?? []), st]);
  }
  const adjByStudent = new Map<string, RunAdjustment[]>();
  for (const a of input.adjustments) {
    if (!adjustmentActive(a, first, last)) continue;
    adjByStudent.set(a.studentId, [...(adjByStudent.get(a.studentId) ?? []), a]);
  }

  const families = new Map<string, RunLine[]>();
  const skipped = new Set<string>();
  const withoutFee: RunStudent[] = [];
  const sortedStudents = [...input.students].sort((a, b) => a.familyId.localeCompare(b.familyId) || a.name.localeCompare(b.name));
  for (const stu of sortedStudents) {
    if (skip.has(stu.familyId)) {
      skipped.add(stu.familyId);
      continue;
    }
    const lines = (byClass.get(stu.classId) ?? []).filter((x) => x.amountMinor > 0);
    if (!lines.length) {
      withoutFee.push(stu);
      continue;
    }
    const adjs = adjByStudent.get(stu.id) ?? [];
    const out = families.get(stu.familyId) ?? [];
    for (const st of lines) {
      const head = headById.get(st.feeHeadId)!;
      out.push({
        studentId: stu.id,
        feeHeadId: st.feeHeadId,
        description: `${head.name}: ${stu.name}`,
        amountMinor: st.amountMinor,
        discountMinor: lineDiscount(st.amountMinor, st.feeHeadId, adjs),
      });
    }
    families.set(stu.familyId, out);
  }

  const invoices: RunInvoice[] = [...families.entries()].map(([familyId, lines]) => ({
    familyId,
    lines,
    totalMinor: lines.reduce((sum, l) => sum + l.amountMinor - l.discountMinor, 0),
  }));
  return { invoices, skippedFamilyIds: [...skipped], studentsWithoutFee: withoutFee };
}
