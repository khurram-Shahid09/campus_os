import Link from "next/link";
import { can, ROLE_LABEL, type Action } from "@campusos/core";
import { getOutboxCount, getProofs } from "@campusos/db/app";
import { requireApp } from "@/lib/auth";
import { logoutAction } from "../login/actions";
import { AppNav } from "./nav";
import { SyncBanner } from "./sync-banner";

export const dynamic = "force-dynamic";

const ITEMS: { href: string; label: string; perm: Action }[] = [
  { href: "/app", label: "Home", perm: "students.view" },
  { href: "/app/attendance", label: "Attendance", perm: "attendance.mark" },
  { href: "/app/cash", label: "Cash counter", perm: "fees.collect" },
  { href: "/app/proofs", label: "Screenshots", perm: "fees.collect" },
  { href: "/app/fees", label: "Fees", perm: "fees.view" },
  { href: "/app/students", label: "Students", perm: "students.view" },
  { href: "/app/staff", label: "Staff", perm: "staff.edit" },
  { href: "/app/calls", label: "Calls", perm: "attendance.mark.any" },
  { href: "/app/outbox", label: "WhatsApp", perm: "messages.send" },
  { href: "/app/automation", label: "Automation", perm: "attendance.mark.any" },
  { href: "/app/reports", label: "Reports", perm: "fees.view" },
  { href: "/app/savings", label: "Savings", perm: "dashboard.owner" },
  { href: "/app/setup", label: "Setup", perm: "school.setup" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, ctx, run } = await requireApp();
  const items = ITEMS.filter((i) => can(ctx.role, i.perm) && !(ctx.role === "teacher" && i.href === "/app"));
  const outbox = can(ctx.role, "messages.send") ? await run((tx, c) => getOutboxCount(tx, c)) : 0;
  const proofs = can(ctx.role, "fees.collect") ? (await run((tx, c) => getProofs(tx, c, "pending", 99))).length : 0;
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/app" className="min-w-0">
            <p className="truncate font-semibold leading-tight" data-testid="school-title">{ctx.schoolName}</p>
            <p className="text-xs text-muted">{session.user.name || session.user.phone} · {ROLE_LABEL[ctx.role]}</p>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {session.memberships.length > 1 && <Link href="/choose-school" className="text-muted hover:text-ink">Switch</Link>}
            <form action={logoutAction}><button className="text-muted hover:text-ink" data-testid="logout">Log out</button></form>
          </div>
        </div>
        <AppNav items={items.map(({ href, label }) => ({ href, label, badge: href === "/app/outbox" ? outbox : href === "/app/proofs" ? proofs : 0 }))} />
      </header>
      {session.school?.isDemo && (
        <div className="bg-ink px-4 py-1.5 text-center text-xs font-semibold text-white print:hidden" data-testid="demo-banner">
          DEMO SCHOOL · made-up students, parents and numbers · nothing here is a real school
        </div>
      )}
      <SyncBanner />
      <main className="mx-auto max-w-6xl px-4 py-5 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}
