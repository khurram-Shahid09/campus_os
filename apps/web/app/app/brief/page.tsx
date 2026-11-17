import { getLatestBrief } from "@campusos/db/app";
import { Card, PageTitle } from "@/components/ui";
import { requireApp } from "@/lib/auth";

export default async function Brief() {
  const { run } = await requireApp("dashboard.owner");
  const b = await run((tx, c) => getLatestBrief(tx, c.schoolId));
  const ur = (b?.facts as { ur?: string } | undefined)?.ur;
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <PageTitle role="Morning Brief" title={b ? b.date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : "No brief yet"}
        sub="Made at 7:00 every morning from yesterday's records. It will also arrive on your WhatsApp once the Business number is connected." />
      {b ? (
        <Card>
          <p className="whitespace-pre-line text-sm leading-relaxed" data-testid="brief-text">{b.text}</p>
          {ur && <p className="mt-4 border-t border-line pt-3 text-base leading-loose" dir="rtl" lang="ur">{ur}</p>}
        </Card>
      ) : (
        <Card><p className="text-sm text-muted">The first brief arrives tomorrow at 7:00 (the worker must be running). Owners can also press Run now on the Automation page.</p></Card>
      )}
    </div>
  );
}
