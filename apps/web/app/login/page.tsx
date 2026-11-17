import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in · CampusOS" };

export default async function LoginPage() {
  const s = await currentSession();
  if (s) redirect("/app");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <p className="text-sm font-semibold text-brand">CampusOS</p>
      <h1 className="mt-1 text-2xl font-semibold">Log in with your phone</h1>
      <p className="mt-1 text-sm text-muted">No password. We send a 6-digit code to your mobile number.</p>
      <LoginForm />
      <p className="mt-8 text-xs text-muted">
        Want to look first? <a href="/demo" className="text-brand underline">Open the demo school</a>. New school? Log in with the owner&apos;s number and create your school in the next step. Staff are added by the owner.
      </p>
    </main>
  );
}
