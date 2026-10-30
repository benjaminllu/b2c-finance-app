"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@optima/ui";

const SECTIONS = [
  { href: "/cards", label: "Cards" },
  { href: "/offers", label: "Offers" },
  { href: "/banking", label: "Banking" },
  { href: "/planner", label: "Planner" },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
      {SECTIONS.map((s) => {
        const active = pathname.startsWith(s.href);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-accent text-accent-foreground" : "text-muted-foreground",
            )}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
