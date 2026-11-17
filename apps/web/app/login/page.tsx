import { redirect } from "next/navigation";
import { demoLoginEnabled } from "@campusos/db/app";
import { currentSession } from "@/lib/auth";
import { demoLoginAction } from "./actions";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in · CampusOS" };

const DEMO_ROLES = [
  { role: "owner", label: "Owner", what: "money, savings, decisions" },
  { role: "principal", label: "Principal", what: "attendance, calls, staff" },
  { role: "accountant", label: "Fee clerk", what: "cash, screenshots, slips" },
  { role: "teacher", label: "Teacher", what: "30-second attendance" },
] as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ demo_error?: string }> }) {
  const s = await currentSession();
  if (s) redirect("/app");
  const { demo_error } = await searchParams;
  const demo = demoLoginEnabled();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <p className="text-sm font-semibold text-brand">CampusOS</p>
      <h1 className="mt-1 text-2xl font-semibold">Log in with your phone</h1>
      <p className="mt-1 text-sm text-muted">No password. We send a 6-digit code to your mobile number.</p>
      <LoginForm />
      {demo && (
        <section className="mt-8 rounded-2xl border border-line bg-white p-4" data-testid="demo-logins">
          <p className="font-semibold">Try the demo school</p>
          <p className="text-xs text-muted">A made-up school with 620 students and a year of history. Nothing in it is real.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO_ROLES.map((r) => (
              <form key={r.role} action={demoLoginAction.bind(null, r.role)}>
                <button className="w-full rounded-xl border border-line px-3 py-2 text-left hover:bg-paper" data-testid={`demo-${r.role}`}>
                  <span className="block text-sm font-semibold">{r.label}</span>
                  <span className="block text-[11px] text-muted">{r.what}</span>
                </button>
              </form>
            ))}
          </div>
          {demo_error && <p role="alert" className="mt-2 text-sm text-danger">{demo_error}</p>}
        </section>
      )}
      <p className="mt-8 text-xs text-muted">
        New school? Log in with the owner&apos;s number and create your school in the next step. Staff are added by the owner.
      </p>
    </main>
  );
}
