import "server-only";
import { notFound } from "next/navigation";
import { getDemoContext } from "@campusos/db/roles";
import type { Ctx } from "@campusos/db/commands";
import { getDb } from "./db";

/** Demo has no login yet: the role comes from the screen being used. Real auth (phone OTP) replaces this. */
export async function demoCtx(actorRole: Ctx["actorRole"]) {
  const db = getDb();
  const demo = await getDemoContext(db);
  if (!demo) notFound();
  const ctx: Ctx = { schoolId: demo.school.id, schoolName: demo.school.name, asOf: demo.asOf, actorRole };
  return { db, demo, ctx };
}
