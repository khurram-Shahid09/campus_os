/**
 * Payment-screenshot eval: reads every receipt in eval/receipts with the real model and compares to truth.json.
 * Run: pnpm --filter @campusos/ai eval   (needs GEMINI_API_KEYS; images from tools/demo-video/make-receipts.mjs)
 * Writes eval/reports/<date>.md
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { normalizeReference } from "@campusos/core";
import { geminiConfigFromEnv } from "../gemini";
import { PROOF_PROMPT_VERSION, readPaymentProof, type StoredExtraction } from "../payment-proof";

const dir = path.resolve(import.meta.dirname, "../../eval/receipts");
const truth = JSON.parse(readFileSync(path.join(dir, "truth.json"), "utf8")) as Record<
  string,
  { isPaymentReceipt: boolean; amountMinor: number | null; date: string | null; reference: string | null; status: string | null }
>;
const cfg = geminiConfigFromEnv();
if (!cfg) throw new Error("GEMINI_API_KEYS is not set");

const fields = ["isPaymentReceipt", "amountMinor", "date", "reference", "status"] as const;
const rows: string[] = [];
let correct = 0;
let total = 0;
const models = new Set<string>();
let ms = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".png")).sort()) {
  const id = file.replace(/\.png$/, "");
  const t = truth[id];
  if (!t) continue;
  let got: StoredExtraction;
  try {
    got = await readPaymentProof(cfg, { bytes: readFileSync(path.join(dir, file)), mimeType: "image/png" });
  } catch (e) {
    rows.push(`| ${id} | error: ${(e as Error).message} | | | | | |`);
    total += fields.length;
    continue;
  }
  models.add(got.meta!.model);
  ms += got.meta!.ms;
  const cells = fields.map((f) => {
    // a non-receipt only has to be recognised as such; its other fields don't matter
    if (!t.isPaymentReceipt && f !== "isPaymentReceipt") return "–";
    const expected = f === "reference" ? normalizeReference(t.reference) : t[f];
    const actual = f === "reference" ? got.referenceNorm : got[f];
    total++;
    if (expected === actual) {
      correct++;
      return "✓";
    }
    return `✗ got ${JSON.stringify(actual)}`;
  });
  rows.push(`| ${id} | ${cells.join(" | ")} | ${got.confidence ?? ""} |`);
  console.log(id, cells.join(" "));
}

const day = new Date().toISOString().slice(0, 10);
const report = `# Payment screenshot eval, ${day}

Prompt ${PROOF_PROMPT_VERSION}. Model(s) used: ${[...models].join(", ") || "none"}. Average ${Math.round(ms / Math.max(1, rows.length))} ms per image.
Receipts are generated (fictional names and providers), see tools/demo-video/make-receipts.mjs.

**Fields read correctly: ${correct} / ${total} (${Math.round((correct / Math.max(1, total)) * 100)}%)**

| Receipt | Is receipt | Amount | Date | Transaction ID | Status | Confidence |
|---|---|---|---|---|---|---|
${rows.join("\n")}
`;
const out = path.resolve(import.meta.dirname, "../../eval/reports");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, `${day}.md`), report);
console.log(`\n${correct}/${total} fields correct. Report: eval/reports/${day}.md`);
