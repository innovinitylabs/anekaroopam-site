"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BrandLogo } from "@/components/site/BrandLogo";
import { MobileNav } from "@/components/site/MobileNav";
import { cn } from "@/lib/utils";

const links = [
  { href: "/archive", label: "Archive" },
  { href: "/manifesto", label: "Manifesto" },
  { href: "/process", label: "Process" },
  { href: "/writings", label: "Writings" },
  { href: "/about", label: "About" },
];

export function SiteNav() {
  const pathname = usePathname();
  const onPerceive = pathname.startsWith("/perceive");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setMobileOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [pathname]);

  return (
    <header className="fixed top-0 z-40 w-full">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 md:px-10 md:pt-[calc(env(safe-area-inset-top)+1.5rem)] md:pb-6">
        <BrandLogo href="/" size="sm" priority />
        <ul className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  "text-[0.68rem] tracking-[0.2em] uppercase transition-opacity",
                  pathname === link.href || pathname.startsWith(`${link.href}/`)
                    ? "opacity-100"
                    : "opacity-45 hover:opacity-80",
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="min-h-11 py-2 text-[0.62rem] tracking-[0.28em] uppercase text-[var(--muted)] transition-opacity hover:opacity-80 md:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-panel"
            onClick={() => setMobileOpen((open) => !open)}
          >
            Menu
          </button>
          <Link
            href="/perceive"
            className={cn(
              "hidden py-3 text-[0.62rem] tracking-[0.18em] uppercase transition-opacity md:inline-block",
              onPerceive ? "opacity-100" : "opacity-50 hover:opacity-90",
            )}
          >
            Perception
          </Link>
        </div>
      </nav>
      <motion.div
        className="mx-auto h-px max-w-6xl bg-[var(--border)]"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      />
      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </header>
  );
}
