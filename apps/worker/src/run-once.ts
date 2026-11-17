/**
 * Run the due jobs once and exit (for testing or a cron host).
 *   pnpm --filter @campusos/worker run-once                 # whatever is due now
 *   pnpm --filter @campusos/worker run-once morning_brief   # force one job for every school today
 */
import path from "node:path";
import { createDb } from "@campusos/db";
import { runDueJobs, type JobName } from "@campusos/db/app";

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, "../../../.env"));
} catch {
  // use the host environment
}

const only = process.argv[2] as JobName | undefined;
if (only && !["risk_scores", "morning_brief", "fee_reminders"].includes(only)) {
  console.error("Job must be one of: risk_scores, morning_brief, fee_reminders");
  process.exit(1);
}
const db = createDb();
const report = await runDueJobs(db, { only });
console.table(report.map((r) => ({ school: r.school, job: r.job, status: r.status, detail: r.status === "done" ? JSON.stringify(r.result) : r.error })));
await db.$client.end();
