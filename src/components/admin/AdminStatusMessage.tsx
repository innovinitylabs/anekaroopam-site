import type { ReactNode } from "react";

export type AdminStatusTone = "info" | "success" | "warning" | "error";

const TONE_CLASS: Record<AdminStatusTone, string> = {
  info: "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]",
  success:
    "border-[var(--ink)]/25 bg-[var(--paper)] text-[var(--foreground)]",
  warning:
    "border-[var(--ink)]/30 bg-[var(--paper)] text-[var(--foreground)]",
  error:
    "border-red-800/40 bg-[var(--paper)] text-red-900",
};

export function AdminStatusMessage({
  tone = "info",
  title,
  children,
  role = "status",
}: {
  tone?: AdminStatusTone;
  title?: string;
  children: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role}
      className={`space-y-2 border px-3 py-3 text-[0.78rem] leading-relaxed ${TONE_CLASS[tone]}`}
    >
      {title ? (
        <p className="text-[0.58rem] tracking-[0.16em] uppercase text-[var(--ink)]/70">
          {title}
        </p>
      ) : null}
      <div className="text-[var(--foreground)]">{children}</div>
    </div>
  );
}
