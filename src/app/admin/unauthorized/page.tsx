import { AdminUnauthorizedActions } from "@/components/admin/AdminUnlock";

export const metadata = {
  title: "Unauthorized | Anekaroopam",
  robots: { index: false, follow: false },
};

export default function AdminUnauthorizedPage() {
  return (
    <main className="mx-auto max-w-md space-y-6 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-[0.62rem] tracking-[0.18em] uppercase text-[var(--muted)]">
          Access denied
        </h1>
        <p className="text-[0.9rem] leading-relaxed text-[var(--muted)]">
          This GitHub account is not authorized to use the archival admin
          interface.
        </p>
      </div>
      <AdminUnauthorizedActions />
    </main>
  );
}
