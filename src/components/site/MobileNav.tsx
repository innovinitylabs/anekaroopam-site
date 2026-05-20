"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const mobileNavLinks = [
  { href: "/archive", label: "Archive" },
  { href: "/perceive", label: "Perceive" },
  { href: "/manifesto", label: "Manifesto" },
  { href: "/process", label: "Process" },
  { href: "/about", label: "About" },
] as const;

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
}

export function MobileNav({ open, onClose }: MobileNavProps) {
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-30 bg-[var(--paper)]/45 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={onClose}
          />
          <motion.nav
            id="mobile-nav-panel"
            aria-label="Site navigation"
            className="paper-depth fixed inset-x-0 z-[39] border-b border-[var(--border)] bg-[var(--surface-elevated)] md:hidden"
            style={{
              top: "calc(env(safe-area-inset-top) + 3.65rem)",
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <ul className="mx-auto max-w-6xl px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-5">
              {mobileNavLinks.map((link) => {
                const active =
                  pathname === link.href ||
                  pathname.startsWith(`${link.href}/`);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={onClose}
                      className={cn(
                        "block border-b border-[var(--border)] py-3.5 text-sm tracking-[0.14em] uppercase transition-opacity last:border-b-0",
                        active
                          ? "opacity-100"
                          : "opacity-50 hover:opacity-80",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  );
}
