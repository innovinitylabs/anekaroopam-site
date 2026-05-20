import Link from "next/link";

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex w-full shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-3">
        <nav className="flex items-center gap-6 text-[0.62rem] tracking-[0.18em] uppercase">
          <Link href="/perceive" className="opacity-50 hover:opacity-90">
            Orient
          </Link>
          <Link href="/perceive/tools/prepare" className="opacity-90">
            Prepare
          </Link>
        </nav>
        <Link
          href="/"
          className="text-[0.62rem] tracking-[0.18em] uppercase opacity-40 hover:opacity-80"
        >
          Anekaroopam
        </Link>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
