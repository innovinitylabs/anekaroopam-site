import { cn } from "@/lib/utils";

export function SpecTable({
  rows,
  className,
}: {
  rows: { label: string; value: string }[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "space-y-2 overflow-hidden border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-[0.75rem]",
        className,
      )}
    >
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
          <dt className="tracking-[0.12em] uppercase text-[var(--muted)]">
            {row.label}
          </dt>
          <dd className="min-w-0 break-words text-right font-mono text-[0.72rem]">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
