/**
 * CampusOS worker: one process next to the web app. pg-boss keeps its queue in the same Postgres (schema
 * "pgboss"), so there is no Redis. Every 10 minutes a "tick" job checks each school's local time and runs the
 * jobs that are due (risk scores 02:00, Morning Brief 07:00, fee reminders 10:00 Mon–Sat). Each job runs once
 * per school per day (job_runs table), so extra ticks, restarts or two workers never double-send.
 */
import path from "node:path";
import { PgBoss } from "pg-boss";
import { createDb } from "@campusos/db";
import { runDueJobs } from "@campusos/db/app";

try {
  process.loadEnvFile(path.resolve(import.meta.dirname, "../../../.env"));
} catch {
  // no root .env: use the host environment
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = createDb(url);
const boss = new PgBoss({ connectionString: url, schema: "pgboss" });
boss.on("error", (e) => console.error("[pg-boss]", e));

const TICK = "automation-tick";

async function tick() {
  const started = Date.now();
  const report = await runDueJobs(db);
  for (const r of report) {
    const detail = r.status === "done" ? JSON.stringify(r.result) : r.error;
    console.log(`[${new Date().toISOString()}] ${r.school} · ${r.job} · ${r.status} · ${detail}`);
  }
  if (!report.length) console.log(`[${new Date().toISOString()}] tick: nothing due (${Date.now() - started} ms)`);
}

await boss.start();
await boss.createQueue(TICK);
await boss.schedule(TICK, "*/10 * * * *", null, { tz: "UTC" });
await boss.work(TICK, async () => {
  await tick();
});
console.log("CampusOS worker started: automation tick every 10 minutes.");
await tick(); // catch up straight away after a restart

async function shutdown() {
  console.log("Stopping worker…");
  await boss.stop({ graceful: true });
  await db.$client.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
