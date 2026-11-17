import { describe, expect, it } from "vitest";
import {
  buildImportPreview,
  buildInvoiceRun,
  can,
  guessColumns,
  lineDiscount,
  normalizeClassName,
  normalizePkPhone,
  parseDayFirstDate,
  parseRupees,
  periodBounds,
  todayIn,
  whatsappLink,
  type RunAdjustment,
} from "./index";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("invoice run", () => {
  const heads = [
    { id: "tuition", name: "Tuition", frequency: "monthly" },
    { id: "exam", name: "Exam fee", frequency: "term" },
  ];
  const structures = [
    { classId: "c1", feeHeadId: "tuition", amountMinor: 300_000 },
    { classId: "c2", feeHeadId: "tuition", amountMinor: 400_000 },
    { classId: "c1", feeHeadId: "exam", amountMinor: 50_000 },
    { classId: "c2", feeHeadId: "exam", amountMinor: 50_000 },
  ];
  const students = [
    { id: "s1", familyId: "f1", classId: "c1", name: "Ali" },
    { id: "s2", familyId: "f1", classId: "c2", name: "Sara" },
    { id: "s3", familyId: "f2", classId: "c2", name: "Bilal" },
    { id: "s4", familyId: "f3", classId: "c9", name: "NoFee" },
  ];

  it("bills siblings on one family invoice, monthly heads only by default", () => {
    const r = buildInvoiceRun({ period: "2026-12", students, heads, structures, adjustments: [] });
    expect(r.invoices).toHaveLength(2);
    const f1 = r.invoices.find((i) => i.familyId === "f1")!;
    expect(f1.lines.map((l) => l.description)).toEqual(["Tuition: Ali", "Tuition: Sara"]);
    expect(f1.totalMinor).toBe(700_000);
    expect(r.studentsWithoutFee.map((s) => s.id)).toEqual(["s4"]);
  });

  it("adds a non-monthly head only when chosen", () => {
    const r = buildInvoiceRun({ period: "2026-12", students, heads, structures, adjustments: [], extraHeadIds: ["exam"] });
    expect(r.invoices.find((i) => i.familyId === "f2")!.totalMinor).toBe(450_000);
  });

  it("applies approved discounts active in the period, capped at the line", () => {
    const adjustments: RunAdjustment[] = [
      { studentId: "s2", feeHeadId: "tuition", kind: "percent", value: 25, validFrom: d("2026-09-01"), validTo: null },
      { studentId: "s3", feeHeadId: null, kind: "fixed", value: 900_000, validFrom: d("2026-12-15"), validTo: d("2027-03-31") },
      { studentId: "s1", feeHeadId: null, kind: "percent", value: 50, validFrom: d("2026-01-01"), validTo: d("2026-11-30") }, // expired
    ];
    const r = buildInvoiceRun({ period: "2026-12", students, heads, structures, adjustments });
    const f1 = r.invoices.find((i) => i.familyId === "f1")!;
    expect(f1.lines.map((l) => l.discountMinor)).toEqual([0, 100_000]);
    expect(f1.totalMinor).toBe(600_000);
    expect(r.invoices.find((i) => i.familyId === "f2")!.totalMinor).toBe(0);
  });

  it("is safe to run twice: already billed families are skipped", () => {
    const r = buildInvoiceRun({ period: "2026-12", students, heads, structures, adjustments: [], alreadyBilledFamilyIds: ["f1"] });
    expect(r.invoices.map((i) => i.familyId)).toEqual(["f2"]);
    expect(r.skippedFamilyIds).toEqual(["f1"]);
  });

  it("rejects bad input", () => {
    expect(() => periodBounds("2026-13")).toThrow();
    expect(() => lineDiscount(100, "x", [{ studentId: "s", feeHeadId: null, kind: "percent", value: 120, validFrom: d("2026-01-01"), validTo: null }])).toThrow();
    expect(periodBounds("2027-02").last.toISOString().slice(0, 10)).toBe("2027-02-28");
  });
});

describe("phones", () => {
  it("normalises the ways schools write numbers", () => {
    for (const v of ["0300-1234567", "03001234567", "+92 300 1234567", "923001234567", "3001234567", "0092-300-1234567"]) {
      expect(normalizePkPhone(v)).toBe("+923001234567");
    }
    expect(normalizePkPhone("042-35761234")).toBeNull();
    expect(normalizePkPhone("")).toBeNull();
  });
  it("builds a click-to-chat link", () => {
    expect(whatsappLink("+923001234567", "Fee: Rs 2,500")).toBe("https://wa.me/923001234567?text=Fee%3A%20Rs%202%2C500");
  });
});

describe("register import", () => {
  const rows = [
    ["Sr No", "Student Name", "Father Name", "Class", "Sec", "Mobile No", "Monthly Fee", "Gender", "Admission Date"],
    ["101", "Ahmed Raza", "Raza Khan", "5th", "a", "0300-1112223", "2,500", "Boy", "05/04/2024"],
    ["102", "Ayesha Raza", "Raza Khan", "Class 2", "", "03001112223", "Rs. 2000/-", "Girl", ""],
    ["103", "Usman", "Tariq", "Nursery", "B", "042-111", "abc", "", "31/02/2024"],
    ["101", "Hamza", "Ali", "V", "A", "", "", "M", ""],
    ["", "", "", "", "", "", "", "", ""],
    ["104", "", "X", "1", "A", "", "", "", ""],
  ];

  it("guesses columns from common headings", () => {
    const m = guessColumns(rows[0]!);
    expect(m).toMatchObject({ admissionNo: 0, name: 1, fatherName: 2, className: 3, section: 4, phone: 5, monthlyFee: 6, gender: 7, admittedOn: 8 });
  });

  it("groups siblings by phone and reports problems by row", () => {
    const p = buildImportPreview(rows, guessColumns(rows[0]!));
    expect(p.studentCount).toBe(4);
    const raza = p.families.find((f) => f.phoneE164 === "+923001112223")!;
    expect(raza.students.map((s) => s.name)).toEqual(["Ahmed Raza", "Ayesha Raza"]);
    expect(raza.students[0]).toMatchObject({ className: "Class 5", section: "A", gender: "M", monthlyFeeMinor: 250_000 });
    expect(raza.students[0]!.admittedOn?.toISOString().slice(0, 10)).toBe("2024-04-05");
    expect(raza.students[1]).toMatchObject({ section: "A", monthlyFeeMinor: 200_000, gender: "F" });
    const msgs = p.issues.map((i) => `${i.row}:${i.level}`);
    expect(msgs).toContain("4:warning"); // bad phone / fee / date
    expect(msgs).toContain("5:error"); // duplicate admission no.
    expect(msgs).toContain("7:error"); // empty name
    expect(p.classes.map((c) => c.className)).toEqual(["Nursery", "Class 2", "Class 5"]);
  });

  it("parses helpers", () => {
    expect(parseRupees("Rs. 3,500/-")).toBe(350_000);
    expect(Number.isNaN(parseRupees("free"))).toBe(true);
    expect(parseDayFirstDate("31/02/2024")).toBeNull();
    expect(normalizeClassName("grade-10")).toBe("Class 10");
    expect(normalizeClassName("prep")).toBe("Prep");
  });
});

describe("roles", () => {
  it("only owner approves discounts and reverses payments; teachers only mark attendance", () => {
    expect(can("owner", "fees.discount.approve")).toBe(true);
    expect(can("accountant", "fees.discount.approve")).toBe(false);
    expect(can("accountant", "fees.reverse")).toBe(false);
    expect(can("teacher", "fees.view")).toBe(false);
    expect(can("teacher", "attendance.mark")).toBe(true);
    expect(can("nobody", "students.view")).toBe(false);
  });
});

describe("school day", () => {
  it("uses the school's timezone, not UTC", () => {
    // 20:30 UTC on 17 Nov is already 18 Nov in Karachi (UTC+5)
    expect(todayIn("Asia/Karachi", new Date("2026-11-17T20:30:00Z")).toISOString().slice(0, 10)).toBe("2026-11-18");
  });
});

import { allocatePayment, reverseAllocations } from "./index";
describe("payment reversal", () => {
  it("restores exactly what the payment cleared", () => {
    const invs = [
      { id: "a", dueDate: d("2026-10-10"), totalMinor: 300_000, paidMinor: 0, balanceMinor: 300_000 },
      { id: "b", dueDate: d("2026-11-10"), totalMinor: 300_000, paidMinor: 100_000, balanceMinor: 200_000 },
    ];
    const { allocations } = allocatePayment(400_000, invs);
    const after = invs.map((i) => {
      const a = allocations.find((x) => x.invoiceId === i.id);
      return a ? { ...i, paidMinor: i.paidMinor + a.amountMinor, balanceMinor: a.newBalanceMinor } : i;
    });
    expect(after.map((i) => i.balanceMinor)).toEqual([0, 100_000]);
    const undo = reverseAllocations(allocations, after);
    expect(undo).toEqual([
      { invoiceId: "a", paidMinor: 0, balanceMinor: 300_000, status: "open" },
      { invoiceId: "b", paidMinor: 100_000, balanceMinor: 200_000, status: "partially_paid" },
    ]);
    expect(() => reverseAllocations([{ invoiceId: "a", amountMinor: 1 }], invs)).toThrow();
  });
});

import { parseCsv } from "./index";
describe("csv", () => {
  it("handles quotes, commas, CRLF and BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n3,\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"'], ["3", ""]]);
  });
});
