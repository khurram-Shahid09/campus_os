"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  buildImportPreview, FIELD_LABEL, guessColumns, IMPORT_FIELDS, IMPORT_TEMPLATE_CSV, parseCsv, type ColumnMap, type ImportField,
} from "@campusos/core";
import { Card } from "@/components/ui";
import { commitImportAction } from "../../actions";

type Cell = string | number | boolean | null;

async function readFile(file: File): Promise<Cell[][]> {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    const data = await readSheet(file);
    return data.map((row) => row.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : (c as Cell))));
  }
  throw new Error("Choose an Excel (.xlsx) or CSV file. For old .xls files, open in Excel and Save As .xlsx.");
}

export function Importer() {
  const [rows, setRows] = useState<Cell[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [map, setMap] = useState<ColumnMap>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const preview = useMemo(() => (rows ? buildImportPreview(rows, map) : null), [rows, map]);
  const headers = rows?.[0]?.map((h) => String(h ?? "")) ?? [];
  const errors = preview?.issues.filter((i) => i.level === "error") ?? [];
  const warnings = preview?.issues.filter((i) => i.level === "warning") ?? [];

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    setResult(null);
    try {
      const r = await readFile(f);
      if (r.length < 2) throw new Error("The file has no student rows.");
      setRows(r);
      setFileName(f.name);
      setMap(guessColumns(r[0]!.map((h) => String(h ?? ""))));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE_CSV)}`;

  if (result) {
    return (
      <Card>
        <p className="text-lg font-semibold text-brand" data-testid="import-done">{result}</p>
        <div className="mt-3 flex gap-3 text-sm">
          <Link href="/app/setup#fees" className="font-semibold text-brand underline">Check class fees</Link>
          <Link href="/app/students" className="font-semibold text-brand underline">See students</Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <label className="block">
          <span className="text-sm font-medium">Register file (.xlsx or .csv)</span>
          <input type="file" accept=".xlsx,.csv" onChange={(e) => onFile(e.target.files?.[0])} data-testid="import-file"
            className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:font-semibold file:text-white" />
        </label>
        <p className="mt-2 text-xs text-muted">
          First row should be the column headings. No file? <a href={templateHref} download="campusos-register-template.csv" className="text-brand underline">Download the template</a>.
          Only the first sheet is read.
        </p>
        {error && <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      </Card>

      {rows && preview && (
        <>
          <Card title="Which column is which?" sub={`${fileName}: ${rows.length - 1} rows. Check the guesses; change any that are wrong.`}>
            <div className="grid gap-3 sm:grid-cols-3">
              {IMPORT_FIELDS.map((field: ImportField) => (
                <label key={field} className="block text-sm font-medium">
                  {FIELD_LABEL[field]}{(field === "name" || field === "className") && <span className="text-danger"> *</span>}
                  <select
                    value={map[field] ?? ""}
                    onChange={(e) => setMap({ ...map, [field]: e.target.value === "" ? undefined : Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="">(not in file)</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </Card>

          <Card title="What will be saved">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-paper p-3"><p className="text-2xl font-semibold tabular" data-testid="import-students">{preview.studentCount}</p><p className="text-xs text-muted">students</p></div>
              <div className="rounded-lg bg-paper p-3"><p className="text-2xl font-semibold tabular">{preview.families.length}</p><p className="text-xs text-muted">families (siblings together)</p></div>
              <div className="rounded-lg bg-paper p-3"><p className="text-2xl font-semibold tabular">{preview.classes.length}</p><p className="text-xs text-muted">classes</p></div>
            </div>
            <p className="mt-3 text-sm text-muted">
              {preview.classes.map((c) => `${c.className} (${c.sections.join(", ")}): ${c.count}`).join(" · ")}
            </p>
            {errors.length > 0 && (
              <div className="mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">
                <p className="font-semibold">{errors.length} problem{errors.length > 1 ? "s" : ""} to fix in the file first:</p>
                <ul className="mt-1 list-disc pl-5">{errors.slice(0, 20).map((i, k) => <li key={k}>Row {i.row}: {i.message}</li>)}</ul>
              </div>
            )}
            {warnings.length > 0 && (
              <details className="mt-3 rounded-lg bg-warn-soft p-3 text-sm text-warn">
                <summary className="cursor-pointer font-semibold">{warnings.length} warning{warnings.length > 1 ? "s" : ""} (can be fixed later)</summary>
                <ul className="mt-1 list-disc pl-5">{warnings.slice(0, 50).map((i, k) => <li key={k}>Row {i.row}: {i.message}</li>)}</ul>
              </details>
            )}
            <button
              data-testid="import-commit"
              disabled={pending || errors.length > 0 || !preview.studentCount}
              onClick={() => start(async () => {
                setError(null);
                const r = await commitImportAction(rows, map);
                if (r.error) setError(r.error);
                else setResult(r.ok ?? "Imported.");
              })}
              className="mt-4 w-full rounded-xl bg-brand py-3 font-semibold text-white disabled:opacity-50 sm:w-auto sm:px-6"
            >
              {pending ? "Saving…" : `Save ${preview.studentCount} students`}
            </button>
            {error && <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          </Card>
        </>
      )}
    </div>
  );
}
