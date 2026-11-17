import Link from "next/link";
import { formatMoney } from "@campusos/core";
import { getDemoFamilies } from "@campusos/db/roles";
import { PageTitle, SavesNote } from "@/components/ui";
import { demoCtx } from "@/lib/ctx";

export const dynamic = "force-dynamic";

export default async function ParentPick() {
  const { db, ctx } = await demoCtx("parent");
  const families = await getDemoFamilies(db, ctx.schoolId);
  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageTitle role="Parent" title="What a parent sees" sub="Parents don't install anything. Everything arrives on their normal WhatsApp." />
      <SavesNote>works for parents who can&apos;t read (Urdu voice notes), and the office stops answering &quot;how much do I owe?&quot; calls.</SavesNote>
      <ul className="space-y-2">
        {families.map((f) => (
          <li key={f.id}>
            <Link href={`/demo/parent/${f.id}`} data-testid="parent-family" className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-4">
              <div className="min-w-0">
                <p className="font-semibold">{f.guardian}</p>
                <p className="truncate text-xs text-muted">Parent of {f.children}</p>
              </div>
              <span className="tabular shrink-0 text-sm text-danger">{formatMoney(f.balanceMinor)} due</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
