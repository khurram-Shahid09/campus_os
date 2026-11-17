"use client";

import { useState } from "react";
import { ActionForm, Field, inputCls, Submit } from "@/components/form";
import { runInvoicesAction } from "../actions";

/**
 * Month and due date are controlled so they keep what the user chose after the run. (An uncontrolled form is
 * reset after the action, and the default month moves forward once slips exist, so a second click would
 * otherwise bill the next month by mistake.)
 */
export function InvoiceRunForm({ defaultPeriod, defaultDue, dueDay, extraHeads }: { defaultPeriod: string; defaultDue: string; dueDay: string; extraHeads: { id: string; name: string }[] }) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [dueDate, setDueDate] = useState(defaultDue);
  return (
    <ActionForm action={runInvoicesAction} resetOnOk={false} className="grid gap-3 sm:grid-cols-4" testId="invoice-run">
      <Field label="Month">
        <input type="month" name="period" value={period} required className={inputCls}
          onChange={(e) => { setPeriod(e.target.value); if (e.target.value) setDueDate(`${e.target.value}-${dueDay}`); }} />
      </Field>
      <Field label="Due date"><input type="date" name="dueDate" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required className={inputCls} /></Field>
      <div className="text-sm sm:col-span-2">
        {extraHeads.length > 0 && <p className="font-medium">Also charge this month</p>}
        {extraHeads.map((h) => (
          <label key={h.id} className="mr-4 inline-flex items-center gap-1.5"><input type="checkbox" name="extraHeadIds" value={h.id} /> {h.name}</label>
        ))}
      </div>
      <div><Submit testId="run-invoices">Make slips</Submit></div>
    </ActionForm>
  );
}
