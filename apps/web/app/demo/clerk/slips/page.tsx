import { paymentCodeFor } from "@campusos/core";
import { getDemoFamilies, getLatestSlip } from "@campusos/db/roles";
import { FeeSlip } from "@/components/fee-slip";
import { Card, PageTitle, SavesNote } from "@/components/ui";
import { demoCtx } from "@/lib/ctx";
import { FeeRuleCheck } from "./fee-rule-check";

export const dynamic = "force-dynamic";

export default async function Slips() {
  const { db, ctx, demo } = await demoCtx("accountant");
  const families = await getDemoFamilies(db, ctx.schoolId);
  const slips = (await Promise.all(families.slice(0, 2).map((f) => getLatestSlip(db, ctx.schoolId, f.id)))).filter((x) => x !== null);

  return (
    <div className="space-y-5">
      <PageTitle role="Fee clerk" title="Fee slips & fee rules" sub="Generated on the 1st, sent on WhatsApp, printed only if asked." />
      <SavesNote>no writing or printing challans for every child. Parents who can&apos;t read still see their child, the amount and the date.</SavesNote>
      <div className="grid gap-5 md:grid-cols-2">
        {slips.map((s) => (
          <FeeSlip
            key={s.invoice.id}
            school={demo.school.name}
            period={s.invoice.period}
            amountMinor={s.invoice.totalMinor}
            arrearsMinor={s.arrearsMinor}
            dueDay={s.invoice.dueDate.getUTCDate()}
            code={paymentCodeFor(s.invoice.id)}
            children={s.lines.map((l) => l.child)}
          />
        ))}
      </div>
      <Card title="Fee rule check" sub="Before you raise fees, CampusOS checks the common rules so you avoid fines and complaints.">
        <FeeRuleCheck />
      </Card>
    </div>
  );
}
