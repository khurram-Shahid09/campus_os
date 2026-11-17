"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError, createSchool, requestOtp, revokeSession, SESSION_TTL_MS, switchSchool, verifyOtp } from "@campusos/db/app";
import { getDb } from "@/lib/db";
import { currentSession, SESSION_COOKIE } from "@/lib/auth";

/**
 * Delivery of the login code. Until the WhatsApp/SMS sender is connected (Stage 3), OTP_DEV_SHOW=1 shows the code
 * on screen. Without it, login is refused rather than pretending a message was sent.
 */
function deliveryChannel(): "dev" | null {
  return process.env.OTP_DEV_SHOW === "1" ? "dev" : null;
}

export async function requestCodeAction(phone: string): Promise<{ phone?: string; devCode?: string; error?: string }> {
  const channel = deliveryChannel();
  if (!channel) return { error: "Login codes can't be sent yet: WhatsApp/SMS delivery is not connected on this server." };
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const { phone: e164, code } = await requestOtp(getDb(), phone, ip, channel);
    return { phone: e164, devCode: channel === "dev" ? code : undefined };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    console.error(e);
    return { error: "Could not send a code. Try again." };
  }
}

export async function verifyCodeAction(phone: string, code: string): Promise<{ error?: string; next?: string }> {
  try {
    const h = await headers();
    const { token } = await verifyOtp(getDb(), phone, code.trim(), h.get("user-agent"));
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
      path: "/", maxAge: SESSION_TTL_MS / 1000,
    });
    return { next: "/app" };
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    console.error(e);
    return { error: "Could not check the code. Try again." };
  }
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(getDb(), token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function createSchoolAction(_: unknown, form: FormData): Promise<{ error?: string }> {
  const session = await currentSession();
  if (!session) redirect("/login");
  const ownerName = String(form.get("ownerName") ?? "").trim();
  const schoolName = String(form.get("schoolName") ?? "").trim();
  const city = String(form.get("city") ?? "").trim();
  const startMonth = Number(form.get("startMonth") ?? 4);
  if (!ownerName) return { error: "Write your name." };
  const now = new Date();
  const year = now.getUTCMonth() + 1 >= startMonth ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  try {
    const { schoolId } = await createSchool(getDb(), {
      userId: session.user.id, ownerName, schoolName, city, yearStartsOn: new Date(Date.UTC(year, startMonth - 1, 1)),
    });
    await switchSchool(getDb(), session.sessionId, session.user.id, schoolId);
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    console.error(e);
    return { error: "Could not create the school. Try again." };
  }
  redirect("/app");
}

export async function chooseSchoolAction(schoolId: string) {
  const session = await currentSession();
  if (!session) redirect("/login");
  await switchSchool(getDb(), session.sessionId, session.user.id, schoolId);
  redirect("/app");
}
