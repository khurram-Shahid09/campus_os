import Link from "next/link";
import { getClassesSetup } from "@campusos/db/app";
import { Card, PageTitle } from "@/components/ui";
import { ActionForm, Field, inputCls, Submit } from "@/components/form";
import { requireApp } from "@/lib/auth";
import { addStudentAction } from "../../actions";

export default async function NewStudent() {
  const { run } = await requireApp("students.edit");
  const classes = await run((tx, c) => getClassesSetup(tx, c));
  const sections = classes.flatMap((c) => c.sections.map((x) => ({ id: x.id, label: `${c.name} ${x.name}` })));
  return (
    <div className="max-w-2xl space-y-4">
      <PageTitle role="Students" title="New admission" sub="If the father's phone is already in CampusOS, the child joins that family's fee account (siblings pay on one slip)." />
      {!sections.length ? (
        <Card><p className="text-sm">Add classes first in <Link href="/app/setup" className="text-brand underline">Setup</Link>.</p></Card>
      ) : (
        <Card>
          <ActionForm action={addStudentAction} className="grid gap-3 sm:grid-cols-2" testId="new-student">
            <Field label="Student name"><input name="name" required className={inputCls} /></Field>
            <Field label="Class">
              <select name="sectionId" required className={inputCls}>
                {sections.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </Field>
            <Field label="Gender">
              <select name="gender" className={inputCls} defaultValue="">
                <option value="">—</option><option value="M">Boy</option><option value="F">Girl</option>
              </select>
            </Field>
            <Field label="Admission / GR no." hint="Leave empty for the next number"><input name="admissionNo" className={inputCls} /></Field>
            <Field label="Father / guardian name"><input name="guardianName" required className={inputCls} /></Field>
            <Field label="Father's WhatsApp number"><input name="phone" inputMode="tel" placeholder="0300 1234567" className={inputCls} /></Field>
            <Field label="Monthly fee (Rs)" hint="Only if different from the class fee"><input name="tuitionFee" inputMode="numeric" className={inputCls} /></Field>
            <div className="flex items-end"><Submit testId="save-student">Save admission</Submit></div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
