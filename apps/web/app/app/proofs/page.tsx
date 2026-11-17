import Link from "next/link";
import { can, formatMoney, proofWarnings, suggestFamilies } from "@campusos/core";
import { toReading, type StoredExtraction } from "@campusos/ai";
import { getMatchCandidates, getProofs, proofDuplicates } from "@campusos/db/app";
import { Badge, Card, PageTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/form";
import { requireApp } from "@/lib/auth";
import { approveProofAction, rejectProofAction, uploadProofAction } from "./actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Proofs({ searchParams }: { searchParams: Promise<{ family?: string }> }) {
  const { family } = await searchParams;
  const { ctx, run } = await requireApp("fees.collect");
  const data = await run(async (tx, c) => {
    const pending = await getProofs(tx, c, "pending", 30);
    const done = await getProofs(tx, c, "done", 15);
    const candidates = await getMatchCandidates(tx, c);
    const cards = [];
    for (const { proof, uploadedBy } of pending) {
      const x = proof.extracted as StoredExtraction;
      const reading = toReading(x);
      const dup = await proofDuplicates(tx, c, { imageHash: proof.imageHash, referenceNorm: x.referenceNorm ?? null, exceptProofId: proof.id });
      const suggestions = suggestFamilies(reading, candidates);
      if (proof.familyId && !suggestions.some((sg) => sg.familyId === proof.familyId)) suggestions.unshift({ familyId: proof.familyId, score: 0, reasons: ["chosen when uploading"] });
      cards.push({ proof, uploadedBy, x, suggestions, warnings: proofWarnings(reading, { today: c.today, schoolName: c.schoolName, ...dup }) });
    }
    return { cards, done, candidates };
  });
  const name = new Map(data.candidates.map((c) => [c.familyId, c]));
  const famLabel = (id: string) => {
    const f = name.get(id);
    if (!f) return "family";
    const owes = f.openBalancesMinor.reduce((a, b) => a + b, 0);
    return `${f.guardianName} (${f.childNames.join(", ")}) · owes ${formatMoney(owes)}`;
  };
  const sorted = [...data.candidates].sort((a, b) => a.guardianName.localeCompare(b.guardianName));

  return (
    <div className="space-y-5">
      <PageTitle role="Payment screenshots" title={`${data.cards.length} to check`} sub="Parents pay by JazzCash, Easypaisa or bank and send a screenshot. CampusOS reads it, suggests the family and checks for copies. You confirm; then the receipt goes out by itself." />

      <Card title="Add screenshots" sub="Save the screenshot from WhatsApp and add it here (up to 10 at once). On a phone you can take a photo of a deposit slip.">
        <ActionForm action={uploadProofAction} className="flex flex-wrap items-center gap-3" testId="proof-upload">
          {family && UUID.test(family) && <input type="hidden" name="familyId" value={family} />}
          <input type="file" name="images" accept="image/*" multiple required data-testid="proof-file"
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:font-semibold file:text-white" />
          <Submit testId="proof-submit">Read screenshots</Submit>
        </ActionForm>
        <p className="mt-2 text-xs text-muted">Reading takes a few seconds per image. AI only reads the picture; it never approves a payment.</p>
      </Card>

      {data.cards.map(({ proof, uploadedBy, x, suggestions, warnings }) => {
        const blocking = warnings.some((w) => w.blocking);
        const best = suggestions[0];
        return (
          <Card key={proof.id}>
            <div className="grid gap-4 md:grid-cols-[220px_1fr]" data-testid="proof-card">
              <a href={`/app/proofs/${proof.id}/image`} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/app/proofs/${proof.id}/image`} alt="Payment screenshot" className="max-h-80 w-full rounded-lg border border-line object-contain bg-paper" />
              </a>
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {x.source === "ai" ? <Badge tone="brand">Read by AI</Badge> : x.source === "demo" ? <Badge tone="muted">Demo reading (pre-filled)</Badge> : <Badge tone="warn">Not read: type the details</Badge>}
                  <span className="text-xs text-muted">added by {uploadedBy || "staff"} · {proof.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3" data-testid="proof-reading">
                  <div><dt className="text-xs text-muted">Amount</dt><dd className="font-semibold tabular">{x.amountMinor !== null ? formatMoney(x.amountMinor) : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Date</dt><dd>{x.date ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Transaction ID</dt><dd className="font-mono">{x.reference ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted">From</dt><dd>{x.senderName ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted">To</dt><dd>{x.receiverName ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Status</dt><dd>{x.status ?? "—"}</dd></div>
                </dl>
                {x.error && <p className="text-xs text-warn">{x.error}</p>}
                {warnings.length > 0 && (
                  <ul className="space-y-1" data-testid="proof-warnings">
                    {warnings.map((w) => <li key={w.code} className={`rounded-lg px-2.5 py-1.5 ${w.blocking ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>{w.text}</li>)}
                  </ul>
                )}
                <ActionForm action={approveProofAction} className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_120px_120px]">
                  <input type="hidden" name="proofId" value={proof.id} />
                  <label className="text-xs text-muted sm:col-span-3">
                    Which family paid? {best && best.score > 0 && <span className="text-brand">Suggested: {best.reasons.join("; ")}</span>}
                    <select name="familyId" defaultValue={best?.familyId ?? ""} className="mt-1 w-full rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink" data-testid="proof-family">
                      <option value="">— choose —</option>
                      {suggestions.length > 0 && (
                        <optgroup label="Suggested">
                          {suggestions.map((sg) => <option key={sg.familyId} value={sg.familyId}>{famLabel(sg.familyId)}</option>)}
                        </optgroup>
                      )}
                      <optgroup label="All families">
                        {sorted.map((c) => <option key={c.familyId} value={c.familyId}>{famLabel(c.familyId)}</option>)}
                      </optgroup>
                    </select>
                  </label>
                  <input name="reference" defaultValue={x.reference ?? ""} placeholder="Transaction ID" className="rounded-lg border border-line px-2 py-2 font-mono text-sm" aria-label="Transaction ID" />
                  <input name="amount" defaultValue={x.amountMinor !== null ? String(x.amountMinor / 100) : ""} placeholder="Rs" inputMode="numeric" className="rounded-lg border border-line px-2 py-2 text-right font-semibold tabular" aria-label="Amount" data-testid="proof-amount" />
                  <select name="method" defaultValue={x.method === "bank_transfer" || x.method === "deposit_slip" ? "bank" : "wallet"} className="rounded-lg border border-line bg-white px-2 py-2 text-sm" aria-label="Paid by">
                    <option value="wallet">Mobile wallet</option><option value="bank">Bank / Raast</option>
                  </select>
                  {blocking && can(ctx.role, "fees.reverse") && (
                    <label className="flex items-center gap-2 text-xs text-danger sm:col-span-3"><input type="checkbox" name="override" /> I checked the warnings above; approve anyway (owner)</label>
                  )}
                  <div className="sm:col-span-3"><Submit testId="proof-approve">{blocking ? "Approve despite warnings" : "Approve payment"}</Submit></div>
                </ActionForm>
                <ActionForm action={rejectProofAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="proofId" value={proof.id} />
                  <input type="hidden" name="familyId" value={proof.familyId ?? ""} />
                  <select name="reason" defaultValue={warnings.some((w) => w.code.startsWith("duplicate")) ? "duplicate" : "not_paid"} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm" aria-label="Reason">
                    <option value="duplicate">Copy of an old receipt</option><option value="not_paid">Money not received</option>
                    <option value="unreadable">Can&apos;t read it</option><option value="other">Other</option>
                  </select>
                  <input name="note" placeholder="Note" className="w-40 rounded-lg border border-line px-2 py-1.5 text-sm" />
                  <Submit variant="ghost" testId="proof-reject">Reject</Submit>
                </ActionForm>
              </div>
            </div>
          </Card>
        );
      })}

      <Card title="Recently checked">
        <ul className="divide-y divide-line text-sm">
          {data.done.map(({ proof }) => (
            <li key={proof.id} className="flex items-center justify-between gap-2 py-1.5">
              <span>
                <Badge tone={proof.status === "approved" ? "brand" : "danger"}>{proof.status}</Badge>{" "}
                {proof.familyId ? <Link href={`/app/families/${proof.familyId}`} className="text-brand hover:underline">{famLabel(proof.familyId).split(" (")[0]}</Link> : "—"}
                {proof.reviewNote && <span className="text-muted"> · {proof.reviewNote}</span>}
              </span>
              {proof.paymentId ? <Link href={`/app/receipts/${proof.paymentId}`} className="text-brand underline">receipt</Link> : <span />}
            </li>
          ))}
          {!data.done.length && <li className="py-2 text-muted">Nothing yet.</li>}
        </ul>
      </Card>
    </div>
  );
}
