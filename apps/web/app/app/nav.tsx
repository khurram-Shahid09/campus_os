"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppNav({ items }: { items: { href: string; label: string; badge: number }[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/app" ? path === "/app" : path.startsWith(href));
  return (
    <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2 text-sm">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={`shrink-0 rounded-lg px-3 py-1.5 font-medium ${active(i.href) ? "bg-brand text-white" : "text-muted hover:bg-paper hover:text-ink"}`}
        >
          {i.label}
          {i.badge > 0 && <span className="ml-1.5 rounded-full bg-danger px-1.5 text-[11px] font-bold text-white tabular">{i.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}
