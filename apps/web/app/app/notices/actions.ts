"use server";

import { revalidatePath } from "next/cache";
import { sendNotice, type NoticeAudience } from "@campusos/db/app";
import { action } from "@/lib/auth";
import type { FormState } from "@/components/form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sendNoticeAction(_: FormState, f: FormData): Promise<FormState> {
  const a = String(f.get("audience") ?? "all");
  let audience: NoticeAudience;
  if (a === "all" || a === "dues") audience = { kind: a };
  else if (a.startsWith("section:") && UUID.test(a.slice(8))) audience = { kind: "section", sectionId: a.slice(8) };
  else return { error: "Choose who gets the notice." };
  const r = await action("messages.send", (tx, ctx) => sendNotice(tx, ctx, { audience, en: String(f.get("en") ?? ""), ur: String(f.get("ur") ?? "") }));
  if (r.error) return { error: r.error };
  revalidatePath("/app", "layout");
  const x = r.result!;
  return { ok: `Sent to ${x.sent} famil${x.sent === 1 ? "y" : "ies"} on WhatsApp.${x.noPhone ? ` ${x.noPhone} have no WhatsApp number.` : ""}` };
}
