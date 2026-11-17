import Link from "next/link";
import { RoleNav } from "./role-nav";

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 sm:px-6">
          <Link href="/demo" className="shrink-0 text-sm font-bold text-brand">
            CampusOS
          </Link>
          <span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-bold text-warn">DEMO</span>
          <RoleNav />
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-5 sm:px-6">{children}</div>
    </div>
  );
}
