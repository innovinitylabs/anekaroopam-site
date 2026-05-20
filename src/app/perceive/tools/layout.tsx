import Link from "next/link";

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="perceive-theme min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)]">
      <header className="fixed top-0 z-50 flex w-full items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/90 px-6 py-4 backdrop-blur-sm">
        <nav className="flex items-center gap-6 text-[0.62rem] tracking-[0.18em] uppercase">
          <Link href="/perceive" className="opacity-50 hover:opacity-90">
            Orient
          </Link>
          <Link href="/perceive/tools/prepare" className="opacity-90">
            Prepare
          </Link>
        </nav>
        <Link href="/" className="text-[0.62rem] tracking-[0.18em] uppercase opacity-40 hover:opacity-80">
          Anekaroopam
        </Link>
      </header>
      {children}
    </div>
  );
}
