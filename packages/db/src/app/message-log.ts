/** WhatsApp message log: every message CampusOS triggered, and what started it. */
import { and, desc, eq, ne, sql } from "drizzle-orm";
import type { Tx } from "../index";
import * as s from "../schema/index";
import type { AppCtx } from "./commands";

const TRIGGER: Record<string, string> = {
  fee_slip: "Fee slip made",
  receipt: "Payment received",
  absence_alert: "Marked absent",
  fee_reminder_1: "Reminder: 3 days late",
  fee_reminder_2: "Reminder: 10 days late",
  fee_reminder_manual: "Reminder sent by staff",
  proof_rejected: "Screenshot not accepted",
  morning_brief: "Morning Brief",
};
export const triggerLabel = (key: string | null) => (key ? TRIGGER[key] ?? key.replace(/_/g, " ") : "Message");

export async function getMessageLog(tx: Tx, ctx: AppCtx, opts: { includeOwnerBrief: boolean; familyId?: string; limit?: number }) {
  return tx
    .select({
      id: s.messages.id, toPhone: s.messages.toPhone, body: s.messages.body, category: s.messages.category, templateKey: s.messages.templateKey,
      status: s.messages.status, direction: s.messages.direction, createdAt: s.messages.createdAt, sentAt: s.messages.sentAt,
      guardian: s.guardians.name, familyId: s.messages.familyId,
    })
    .from(s.messages)
    .leftJoin(s.guardians, eq(s.guardians.id, s.messages.guardianId))
    .where(and(
      eq(s.messages.schoolId, ctx.schoolId),
      ...(opts.includeOwnerBrief ? [] : [ne(s.messages.category, "brief")]),
      ...(opts.familyId ? [eq(s.messages.familyId, opts.familyId)] : []),
    ))
    .orderBy(desc(s.messages.createdAt))
    .limit(opts.limit ?? 150);
}

/** Messages triggered since `since`, by trigger: for the "sent automatically" summary. */
export async function getMessageStats(tx: Tx, ctx: AppCtx, since: Date) {
  return tx.execute<{ template_key: string | null; n: number }>(sql`
    select template_key, count(*)::int as n from ${s.messages}
    where school_id = ${ctx.schoolId} and created_at >= ${since.toISOString()}::timestamptz and direction = 'out' and category <> 'brief'
    group by template_key order by n desc
  `);
}
