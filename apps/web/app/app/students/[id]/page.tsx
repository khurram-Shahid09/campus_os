import Link from "next/link";
import { notFound } from "next/navigation";
import { can, formatMoney, periodOf } from "@campusos/core";
import { getClassesSetup, getStudent } from "@campusos/db/app";
import { Badge, Card, PageTitle } from "@/components/ui";
import { ActionForm, Field, inputCls, Submit } from "@/components/form";
import { requireApp } from "@/lib/auth";
import { requestDiscountAction, updateStudentAction, withdrawStudentAction } from "../../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ added?: string }> }) {
  const { id } = await params;
  const { added } = await searchParams;
  if (!UUID.test(id)) notFound();
  const { ctx, run } = await requireApp("students.view");
  const { st, classes } = await run(async (tx, c) => ({ st: await getStudent(tx, c, id), classes: await getClassesSetup(tx, c) }));
  if (!st) notFound();
  const stu = st.student;
  const edit = can(ctx.role, "students.edit") && stu.status === "active";
  const sections = classes.flatMap((c) => c.sections.map((x) => ({ id: x.id, label: `${c.name} ${x.name}` })));
  const att = st.attendance30;

  return (
    <div className="max-w-3xl space-y-4">
      <PageTitle
        role={`GR ${stu.admissionNo}`}
        title={stu.name}
        sub={`${st.className ? `${st.className} ${st.section}` : "No class"}${stu.status !== "active" ? ` · ${stu.status}` : ""}`}
        right={can(ctx.role, "fees.view") ? <Link href={`/app/families/${stu.familyId}`} className="text-sm font-semibold text-brand underline">Family fee account →</Link> : undefined}
      />
      {added && (
        <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">
          Admission saved.{added === "sibling" ? " This child joined an existing family (same father's phone), so siblings pay on one slip." : ""}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card><p className="text-xs text-muted">Attendance, last 30 days</p><p className="text-lg font-semibold tabular">{att.total ? `${Math.round((att.present / att.total) * 100)}%` : "—"}</p><p className="text-xs text-muted">{att.present} of {att.total} days</p></Card>
        <Card><p className="text-xs text-muted">Own monthly fee</p><p className="text-lg font-semibold tabular">{stu.tuitionFeeMinor !== null ? formatMoney(stu.tuitionFeeMinor) : "Class fee"}</p></Card>
        <Card><p className="text-xs text-muted">Admitted</p><p className="text-lg font-semibold">{stu.admittedOn ? stu.admittedOn.toLocaleDateString("en-GB", { timeZone: "UTC" }) : "—"}</p></Card>
      </div>

      {edit && (
        <Card title="Edit">
          <ActionForm action={updateStudentAction} resetOnOk={false} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="studentId" value={stu.id} />
            <Field label="Name"><input name="name" defaultValue={stu.name} className={inputCls} /></Field>
            <Field label="Class">
              <select name="sectionId" defaultValue={st.sectionId ?? ""} className={inputCls}>
                {sections.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            </Field>
            <Field label="Gender">
              <select name="gender" defaultValue={stu.gender ?? ""} className={inputCls}>
                <option value="">—</option><option value="M">Boy</option><option value="F">Girl</option>
              </select>
            </Field>
            <Field label="Own monthly fee (Rs)" hint="Empty = class fee">
              <input name="tuitionFee" inputMode="numeric" defaultValue={stu.tuitionFeeMinor !== null ? String(stu.tuitionFeeMinor / 100) : ""} className={inputCls} />
            </Field>
            <div><Submit>Save</Submit></div>
          </ActionForm>
        </Card>
      )}

      {can(ctx.role, "fees.discount.request") && stu.status === "active" && (
        <Card title="Discount" sub={can(ctx.role, "fees.discount.approve") ? "As owner, your discount is approved at once." : "Goes to the owner for approval. Nothing changes until approved."}>
          {st.adjustments.length > 0 && (
            <ul className="mb-3 space-y-1 text-sm">
              {st.adjustments.map((a) => (
                <li key={a.id}>
                  <Badge tone={a.status === "approved" ? "brand" : a.status === "rejected" ? "danger" : "warn"}>{a.status}</Badge>{" "}
                  {a.requestedValue ?? a.value}% from {a.validFrom.toISOString().slice(0, 7)} · <span className="text-muted">{a.reason}</span>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={requestDiscountAction} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="studentId" value={stu.id} />
            <Field label="Percent off"><input name="percent" type="number" min={1} max={100} required className={inputCls} /></Field>
            <Field label="From month"><input name="validFrom" type="month" defaultValue={periodOf(ctx.today)} required className={inputCls} /></Field>
            <Field label="Reason"><input name="reason" placeholder="Sibling / staff child / hardship" required className={inputCls} /></Field>
            <div className="flex items-end"><Submit variant="ghost">{can(ctx.role, "fees.discount.approve") ? "Give discount" : "Ask owner"}</Submit></div>
          </ActionForm>
        </Card>
      )}

      {edit && (
        <Card title="Withdraw (school leaving)" sub="Stops monthly billing. Old dues stay on the family account. Records are never deleted.">
          <ActionForm action={withdrawStudentAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="studentId" value={stu.id} />
            <input name="reason" placeholder="Reason (moved city, fees, other school…)" className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm" />
            <Submit variant="danger" confirm={`Withdraw ${stu.name}?`}>Withdraw</Submit>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
