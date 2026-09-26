import type { Metadata } from "next";
import { PerceiveClientShell } from "@/components/perception/PerceiveClientShell";

export const metadata: Metadata = {
  title: {
    default: "Pattarai",
    template: "%s — Pattarai",
  },
  description:
    "Pattarai — perception tools and artwork preparation for multistable works.",
};

export default function PerceiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="perceive-theme flex h-[100dvh] flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <PerceiveClientShell>{children}</PerceiveClientShell>
    </div>
  );
}
