import { can } from "@campusos/core";
import { getProofImageInfo, withSchool } from "@campusos/db/app";
import { currentSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { readImage } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Serves a payment screenshot only to staff of the same school who handle fees. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await currentSession();
  if (!session?.school || !session.role || !can(session.role, "fees.view") || !UUID.test(id)) return new Response("Not found", { status: 404 });
  const info = await withSchool(getDb(), session.school.id, (tx) => getProofImageInfo(tx, { schoolId: session.school!.id }, id));
  if (!info) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readImage(info.imageKey);
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": info.mime ?? "image/png", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" },
    });
  } catch {
    return new Response("Image file missing", { status: 404 });
  }
}
