import type { Metadata } from "next";
import { PerceptionShell } from "@/components/perception/PerceptionShell";

export const metadata: Metadata = {
  title: {
    default: "Perception",
    template: "%s — Perception",
  },
  description:
    "Orientation and archival preparation for multistable artworks.",
};

export default function PerceiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="perceive-theme flex h-[100dvh] flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <PerceptionShell>{children}</PerceptionShell>
    </div>
  );
}
