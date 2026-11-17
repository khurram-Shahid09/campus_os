import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { can, todayIn, type Action } from "@campusos/core";
import { AppError, AuthError, getSession, withSchool, type AppCtx, type SessionInfo } from "@campusos/db/app";
import type { Tx } from "@campusos/db";
import { getDb } from "./db";

export const SESSION_COOKIE = "cos_session";

/** The logged-in session for this request (memoised per request). */
export const currentSession = cache(async (): Promise<SessionInfo | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return getSession(getDb(), token);
});

function ctxFrom(session: SessionInfo): AppCtx {
  const school = session.school!;
  return {
    schoolId: school.id,
    schoolName: school.name,
    userId: session.user.id,
    role: session.role!,
    today: todayIn(school.timezone),
    settings: school.settings as AppCtx["settings"],
  };
}

/** For pages: logged in, with a school, and allowed to do `action`. Redirects otherwise. */
export async function requireApp(action?: Action) {
  const session = await currentSession();
  if (!session) redirect("/login");
  if (!session.school || !session.role) redirect(session.memberships.length ? "/choose-school" : "/onboarding");
  const ctx = ctxFrom(session);
  if (action && !can(ctx.role, action)) redirect("/app?denied=1");
  const db = getDb();
  /** run reads/writes with row-level security for this school */
  const run = <T,>(fn: (tx: Tx, ctx: AppCtx) => Promise<T>) => withSchool(db, ctx.schoolId, (tx) => fn(tx, ctx));
  return { session, ctx, db, run };
}

export type ActionState = { error?: string; ok?: string; data?: unknown } | null;

/** For server actions: same checks, but returns `{ error }` instead of throwing for expected problems. */
export async function action<T>(perm: Action | null, fn: (tx: Tx, ctx: AppCtx) => Promise<T>): Promise<{ result?: T; error?: string }> {
  const session = await currentSession();
  if (!session?.school || !session.role) return { error: "Your login has expired. Please log in again." };
  const ctx = ctxFrom(session);
  if (perm && !can(ctx.role, perm)) return { error: "You don't have permission to do this." };
  try {
    return { result: await withSchool(getDb(), ctx.schoolId, (tx) => fn(tx, ctx)) };
  } catch (e) {
    if (e instanceof AppError || e instanceof AuthError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong. Nothing was saved. Please try again." };
  }
}
