"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BrandLogo } from "@/components/site/BrandLogo";
import { MobileNav } from "@/components/site/MobileNav";
import { PattaraiNavLabel } from "@/components/site/PattaraiNavLabel";
import {
  isSiteNavScrolled,
  SITE_NAV_SCROLL_THRESHOLD_PX,
} from "@/lib/site/site-nav-scroll";
import {
  isPattaraiPath,
  PATTARAI_ARIA_LABEL,
  PATTARAI_HREF,
  PATTARAI_TITLE,
} from "@/lib/site/pattarai-nav";
import { cn } from "@/lib/utils";

const links = [
  { href: "/archive", label: "Archive" },
  { href: "/manifesto", label: "Manifesto" },
  { href: "/process", label: "Process" },
  { href: "/writings", label: "Writings" },
  { href: "/about", label: "About" },
];

const linkFocusClass =
  "outline-none focus-visible:ring-1 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)]";

export function SiteNav() {
  const pathname = usePathname();
  const onPattarai = isPattaraiPath(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setMobileOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [pathname]);

  useEffect(() => {
    const update = () => {
      setScrolled(isSiteNavScrolled(window.scrollY));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const surfaceActive = scrolled || mobileOpen;

  return (
    <header
      data-scrolled={surfaceActive ? "true" : "false"}
      data-scroll-threshold={SITE_NAV_SCROLL_THRESHOLD_PX}
      className={cn(
        "fixed top-0 z-40 w-full border-b transition-[background-color,border-color,backdrop-filter,-webkit-backdrop-filter] duration-250 ease-out",
        surfaceActive
          ? "border-[var(--border)] bg-[var(--paper)]/94 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--paper)]/92"
          : "border-transparent bg-transparent",
      )}
    >
      <nav
        aria-label="Primary"
        className="relative z-[1] mx-auto flex max-w-6xl items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 md:px-10 md:pt-[calc(env(safe-area-inset-top)+1.5rem)] md:pb-6"
      >
        <BrandLogo href="/" size="sm" priority />
        <ul className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cn(
                  "text-[0.68rem] tracking-[0.2em] uppercase text-[var(--ink)] transition-opacity",
                  linkFocusClass,
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
            className={cn(
              "min-h-11 py-2 text-[0.62rem] tracking-[0.28em] uppercase text-[var(--ink)]/70 transition-opacity hover:opacity-100 md:hidden",
              linkFocusClass,
            )}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-panel"
            onClick={() => setMobileOpen((open) => !open)}
          >
            Menu
          </button>
          <Link
            href={PATTARAI_HREF}
            aria-label={PATTARAI_ARIA_LABEL}
            title={PATTARAI_TITLE}
            className={cn(
              "group/pattarai hidden py-3 text-[0.62rem] text-[var(--ink)] transition-opacity md:inline-block",
              linkFocusClass,
              onPattarai ? "opacity-100" : "opacity-50 hover:opacity-90",
            )}
          >
            <PattaraiNavLabel variant="desktop" />
          </Link>
        </div>
      </nav>
      <motion.div
        aria-hidden
        className={cn(
          "mx-auto h-px max-w-6xl bg-[var(--border)] transition-opacity duration-250",
          surfaceActive ? "opacity-0" : "opacity-100",
        )}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      />
      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </header>
  );
}
