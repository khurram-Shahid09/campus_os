import { getClassesSetup } from "@campusos/db/app";
import { Card, PageTitle } from "@/components/ui";
import { ActionForm, Field, inputCls, Submit } from "@/components/form";
import { requireApp } from "@/lib/auth";
import { sendNoticeAction } from "./actions";

export default async function Notices() {
  const { run } = await requireApp("messages.send");
  const classes = await run((tx, c) => getClassesSetup(tx, c));
  return (
    <div className="max-w-2xl space-y-4">
      <PageTitle role="Notices" title="Send a notice on WhatsApp" sub="Holiday, PTM, exam dates, fee deadline: one message to every parent, instead of printing circulars and sending them home with children." />
      <Card>
        <ActionForm action={sendNoticeAction} className="space-y-3" testId="notice-form">
          <Field label="Send to">
            <select name="audience" className={inputCls} defaultValue="all">
              <option value="all">All parents</option>
              <option value="dues">Only families with overdue fees</option>
              <optgroup label="One class">
                {classes.flatMap((c) => c.sections.map((x) => <option key={x.id} value={`section:${x.id}`}>{c.name} {x.name}</option>))}
              </optgroup>
            </select>
          </Field>
          <Field label="Message in Urdu" hint="Most parents read Urdu best. Leave empty to send English only.">
            <textarea name="ur" rows={3} dir="rtl" lang="ur" className={inputCls} placeholder="کل اسکول بند رہے گا۔" />
          </Field>
          <Field label="Message in English">
            <textarea name="en" rows={3} className={inputCls} placeholder="School will be closed tomorrow." />
          </Field>
          <p className="text-xs text-muted">The school name is added at the end. Parents without a WhatsApp number are skipped and counted.</p>
          <Submit testId="notice-send" confirm="Send this notice?">Send notice</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
