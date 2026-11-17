import { normalizePkPhone } from "../shared/phone";
import { toMinor } from "../shared/money";

/**
 * Student register import (pure). Takes the rows of a school's Excel/CSV register, guesses which column is
 * which, checks every row, and groups brothers and sisters into one family by the father's/guardian's phone.
 * Nothing is saved here; the user sees the preview and errors first.
 */
export const IMPORT_FIELDS = [
  "name", "fatherName", "phone", "className", "section", "admissionNo", "gender", "monthlyFee", "admittedOn",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMap = Partial<Record<ImportField, number>>;

export const FIELD_LABEL: Record<ImportField, string> = {
  name: "Student name",
  fatherName: "Father / guardian name",
  phone: "Phone (WhatsApp)",
  className: "Class",
  section: "Section",
  admissionNo: "Admission / GR no.",
  gender: "Gender",
  monthlyFee: "Monthly fee (Rs)",
  admittedOn: "Admission date",
};

const SYNONYMS: Record<ImportField, string[]> = {
  name: ["student name", "name of student", "student", "name", "naam", "student's name"],
  fatherName: ["father name", "father's name", "father", "guardian name", "guardian", "parent name", "parent", "f/name", "walid", "s/o", "d/o"],
  phone: ["phone", "mobile", "cell", "contact", "whatsapp", "father phone", "father mobile", "phone no", "mobile no", "contact no", "cell no"],
  className: ["class", "grade", "class name", "jamat"],
  section: ["section", "sec"],
  admissionNo: ["admission no", "adm no", "admission number", "gr no", "gr", "reg no", "registration no", "roll no", "sr no", "admission #"],
  gender: ["gender", "sex", "boy/girl"],
  monthlyFee: ["monthly fee", "fee", "tuition fee", "tuition", "fees", "monthly fees"],
  admittedOn: ["admission date", "date of admission", "doa", "admitted on", "joining date"],
};

const norm = (h: string) => h.toLowerCase().replace(/[._:#-]+/g, " ").replace(/\s+/g, " ").trim();

/** Best guess of which column holds which field. Exact match beats "contains". Each column used once. */
export function guessColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const used = new Set<number>();
  const hs = headers.map((h) => norm(String(h ?? "")));
  for (const pass of ["exact", "contains"] as const) {
    for (const field of IMPORT_FIELDS) {
      if (map[field] !== undefined) continue;
      for (const syn of SYNONYMS[field]) {
        const idx = hs.findIndex((h, i) => !used.has(i) && h !== "" && (pass === "exact" ? h === syn : h.includes(syn)));
        if (idx >= 0) {
          map[field] = idx;
          used.add(idx);
          break;
        }
      }
    }
  }
  return map;
}

export interface ImportStudent {
  row: number; // 1-based sheet row, for error messages
  name: string;
  gender: "M" | "F" | null;
  className: string;
  section: string;
  admissionNo: string | null;
  monthlyFeeMinor: number | null;
  admittedOn: Date | null;
}
export interface ImportFamily {
  key: string; // phone, or "row-N" when the phone is missing
  phoneE164: string | null;
  guardianName: string;
  students: ImportStudent[];
}
export interface ImportIssue {
  row: number;
  level: "error" | "warning";
  message: string;
}
export interface ImportPreview {
  families: ImportFamily[];
  issues: ImportIssue[];
  studentCount: number;
  classes: { className: string; sections: string[]; count: number }[];
}

function cell(row: unknown[], idx: number | undefined): string {
  if (idx === undefined) return "";
  const v = row[idx];
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function parseGender(v: string): "M" | "F" | null {
  const x = v.toLowerCase();
  if (["m", "male", "boy", "b", "son", "s/o"].includes(x)) return "M";
  if (["f", "female", "girl", "g", "daughter", "d/o"].includes(x)) return "F";
  return null;
}

/** "2,500", "Rs. 2500", "2500/-" -> minor units. */
export function parseRupees(v: string): number | null {
  const cleaned = v.replace(/rs\.?|pkr|\/-|,|\s/gi, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return NaN;
  return toMinor(Number(cleaned));
}

/** Accepts 2024-04-01, 01/04/2024, 1-4-2024 (day first, as written in Pakistan). */
export function parseDayFirstDate(v: string): Date | null {
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return utc(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(v);
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return utc(y, Number(m[2]), Number(m[1]));
  }
  return null;
}
function utc(y: number, mo: number, d: number): Date | null {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
}

/** "Class 5", "5th", "V", "grade-5" -> "Class 5"; "Nursery", "KG" kept as written (title case). */
export function normalizeClassName(v: string): string {
  const x = v.trim().replace(/\s+/g, " ");
  const roman: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
  const bare = x.toLowerCase().replace(/^(class|grade)\s*[-:]?\s*/, "").replace(/(st|nd|rd|th)$/, "");
  if (/^\d{1,2}$/.test(bare)) return `Class ${Number(bare)}`;
  if (roman[bare]) return `Class ${roman[bare]}`;
  return x.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildImportPreview(rows: unknown[][], map: ColumnMap, opts: { headerRow?: boolean } = {}): ImportPreview {
  const issues: ImportIssue[] = [];
  const families = new Map<string, ImportFamily>();
  const seenAdmission = new Map<string, number>();
  const start = opts.headerRow === false ? 0 : 1;
  if (map.name === undefined) issues.push({ row: 1, level: "error", message: "No column chosen for the student name." });
  if (map.className === undefined) issues.push({ row: 1, level: "error", message: "No column chosen for the class." });

  for (let i = start; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rowNo = i + 1;
    const name = cell(r, map.name);
    if (r.every((c) => cell([c], 0) === "")) continue; // blank line
    if (!name) {
      issues.push({ row: rowNo, level: "error", message: "Student name is empty." });
      continue;
    }
    const className = cell(r, map.className);
    if (!className) {
      issues.push({ row: rowNo, level: "error", message: `${name}: class is empty.` });
      continue;
    }
    const rawPhone = cell(r, map.phone);
    const phone = normalizePkPhone(rawPhone);
    if (!rawPhone) issues.push({ row: rowNo, level: "warning", message: `${name}: no phone number, so no WhatsApp messages until one is added.` });
    else if (!phone) issues.push({ row: rowNo, level: "warning", message: `${name}: "${rawPhone}" is not a Pakistani mobile number.` });

    const feeRaw = cell(r, map.monthlyFee);
    let fee = feeRaw ? parseRupees(feeRaw) : null;
    if (fee !== null && Number.isNaN(fee)) {
      issues.push({ row: rowNo, level: "warning", message: `${name}: fee "${feeRaw}" is not a number; class fee will be used.` });
      fee = null;
    }
    const admissionNo = cell(r, map.admissionNo) || null;
    if (admissionNo) {
      const prev = seenAdmission.get(admissionNo);
      if (prev) issues.push({ row: rowNo, level: "error", message: `${name}: admission no. ${admissionNo} is also on row ${prev}.` });
      else seenAdmission.set(admissionNo, rowNo);
    }
    const dateRaw = cell(r, map.admittedOn);
    const admittedOn = parseDayFirstDate(dateRaw);
    if (dateRaw && !admittedOn) issues.push({ row: rowNo, level: "warning", message: `${name}: admission date "${dateRaw}" not understood; left empty.` });

    const student: ImportStudent = {
      row: rowNo, name, gender: parseGender(cell(r, map.gender)), className: normalizeClassName(className),
      section: cell(r, map.section).toUpperCase() || "A", admissionNo, monthlyFeeMinor: fee, admittedOn,
    };
    const key = phone ?? `row-${rowNo}`;
    const fam = families.get(key) ?? { key, phoneE164: phone, guardianName: cell(r, map.fatherName) || `Parent of ${name}`, students: [] };
    fam.students.push(student);
    families.set(key, fam);
  }

  const classMap = new Map<string, { sections: Set<string>; count: number }>();
  let studentCount = 0;
  for (const f of families.values())
    for (const s of f.students) {
      studentCount++;
      const c = classMap.get(s.className) ?? { sections: new Set<string>(), count: 0 };
      c.sections.add(s.section);
      c.count++;
      classMap.set(s.className, c);
    }
  return {
    families: [...families.values()],
    issues,
    studentCount,
    classes: [...classMap.entries()]
      .map(([className, c]) => ({ className, sections: [...c.sections].sort(), count: c.count }))
      .sort((a, b) => classOrder(a.className) - classOrder(b.className) || a.className.localeCompare(b.className)),
  };
}

/** Sort key: Playgroup/Nursery/Prep/KG before Class 1..12. */
export function classOrder(name: string): number {
  const x = name.toLowerCase();
  const m = /class (\d+)/.exec(x);
  if (m) return Number(m[1]);
  if (/play/.test(x)) return -4;
  if (/nursery/.test(x)) return -3;
  if (/prep|kg|kinder/.test(x)) return -2;
  return 50;
}

/** Minimal RFC 4180 CSV parser (quotes, commas and newlines inside quotes, CRLF). Strips a UTF-8 BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (quoted) {
      if (ch === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** The register template offered for download. */
export const IMPORT_TEMPLATE_CSV =
  "GR No,Student Name,Father Name,Class,Section,Mobile No,Monthly Fee,Gender,Admission Date\r\n" +
  "101,Ahmed Raza,Raza Khan,Class 5,A,0300-1234567,2500,Boy,05/04/2024\r\n";
