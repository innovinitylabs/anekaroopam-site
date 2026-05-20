"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { BrandLogo } from "@/components/site/BrandLogo";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/archive", label: "Archive" },
  { href: "/manifesto", label: "Manifesto" },
  { href: "/process", label: "Process" },
  { href: "/writings", label: "Writings" },
  { href: "/about", label: "About" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 z-40 w-full">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 md:px-10">
        <BrandLogo href="/" size="sm" priority />
        <ul className="hidden items-center gap-8 md:flex">
          {links.slice(1).map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  "text-[0.68rem] tracking-[0.2em] uppercase transition-opacity",
                  pathname === link.href ? "opacity-100" : "opacity-45 hover:opacity-80",
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/perceive"
          className="text-[0.62rem] tracking-[0.18em] uppercase opacity-50 transition-opacity hover:opacity-90"
        >
          Orient
        </Link>
      </nav>
      <motion.div
        className="mx-auto h-px max-w-6xl bg-[var(--border)]"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      />
    </header>
  );
}
