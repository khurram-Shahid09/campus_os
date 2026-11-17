"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ROLES = [
  { href: "/demo/owner", label: "Owner" },
  { href: "/demo/principal", label: "Principal" },
  { href: "/demo/clerk", label: "Fee clerk" },
  { href: "/demo/teacher", label: "Teacher" },
  { href: "/demo/parent", label: "Parent" },
];

export function RoleNav() {
  const path = usePathname();
  return (
    <nav className="-mx-1 flex min-w-0 gap-1 overflow-x-auto" aria-label="Switch role">
      {ROLES.map((r) => {
        const active = path.startsWith(r.href);
        return (
          <Link
            key={r.href}
            href={r.href}
            className={`shrink-0 rounded-full px-3 py-1 text-sm ${active ? "bg-ink font-semibold text-white" : "text-muted hover:bg-paper"}`}
          >
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}
