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
        "space-y-2 border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-[0.75rem]",
        className,
      )}
    >
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4">
          <dt className="tracking-[0.12em] uppercase text-[var(--muted)]">
            {row.label}
          </dt>
          <dd className="text-right font-mono text-[0.72rem]">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
