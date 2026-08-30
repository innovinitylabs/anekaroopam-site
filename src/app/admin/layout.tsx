import { notFound } from "next/navigation";
import { isAdminIngestEnabled } from "@/lib/archive/admin-guard";
import { AdminUnlock } from "@/components/admin/AdminUnlock";
import Link from "next/link";

export const metadata = {
  title: "Accession | Anekaroopam",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isAdminIngestEnabled()) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] text-[var(--foreground)]">
      <header className="border-b border-[var(--border)] px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-[0.62rem] tracking-[0.2em] uppercase text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Anekaroopam
            </Link>
            <Link
              href="/admin/drafts"
              className="text-[0.58rem] tracking-[0.18em] uppercase text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              Drafts
            </Link>
            <Link
              href="/admin/new"
              className="text-[0.58rem] tracking-[0.18em] uppercase text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              New
            </Link>
          </div>
          <span className="text-[0.58rem] tracking-[0.18em] uppercase text-[var(--muted)]">
            Archival ingestion
          </span>
        </div>
      </header>
      <AdminUnlock>{children}</AdminUnlock>
    </div>
  );
}
