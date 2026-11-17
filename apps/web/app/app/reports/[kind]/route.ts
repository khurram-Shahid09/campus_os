import { can, type Action } from "@campusos/core";
import { reportAttendanceMonth, reportDefaulters, reportPayments, reportStaffMonth, withSchool, type AppCtx } from "@campusos/db/app";
import { todayIn } from "@campusos/core";
import { currentSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

const PERM: Record<string, Action> = { defaulters: "fees.view", payments: "fees.view", attendance: "attendance.view", staff: "staff.edit" };

/** CSV with a UTF-8 BOM so Excel shows Urdu correctly. Cells starting with = + - @ are quoted as text (CSV injection). */
function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "﻿No data\r\n";
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n") + "\r\n";
}

export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const session = await currentSession();
  const perm = PERM[kind];
  if (!session?.school || !session.role || !perm || !can(session.role, perm)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const ctx: AppCtx = {
    schoolId: session.school.id, schoolName: session.school.name, userId: session.user.id, role: session.role,
    today: todayIn(session.school.timezone), settings: session.school.settings as AppCtx["settings"],
  };
  const month = /^\d{4}-\d{2}$/.test(url.searchParams.get("month") ?? "") ? url.searchParams.get("month")! : ctx.today.toISOString().slice(0, 7);
  const day = (k: string, d: Date) => (/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get(k) ?? "") ? new Date(`${url.searchParams.get(k)}T00:00:00Z`) : d);
  const rows = await withSchool(getDb(), ctx.schoolId, (tx) => {
    if (kind === "defaulters") return reportDefaulters(tx, ctx);
    if (kind === "payments") return reportPayments(tx, ctx, day("from", new Date(`${month}-01T00:00:00Z`)), day("to", ctx.today));
    if (kind === "attendance") return reportAttendanceMonth(tx, ctx, month);
    return reportStaffMonth(tx, ctx, month);
  });
  const name = `${kind}-${kind === "attendance" || kind === "staff" ? month : ctx.today.toISOString().slice(0, 10)}.csv`;
  return new Response(toCsv([...rows]), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
