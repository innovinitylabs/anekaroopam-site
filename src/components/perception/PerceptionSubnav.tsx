"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/perceive", label: "Orient", exact: true },
  { href: "/perceive/tools/prepare", label: "Prepare", exact: false },
];

export function PerceptionSubnav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex items-center gap-6"
      aria-label="Perception system"
    >
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "text-[0.68rem] tracking-[0.2em] uppercase transition-opacity",
              active ? "opacity-100" : "opacity-40 hover:opacity-75",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
