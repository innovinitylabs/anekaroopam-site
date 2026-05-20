import type { Metadata } from "next";
import { PerceiveHeader } from "@/components/site/PerceiveHeader";

export const metadata: Metadata = {
  title: "Orientation System",
  description:
    "Perception Engine and configurational interface for multistable artworks.",
};

export default function PerceiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="perceive-theme flex h-[100dvh] flex-col overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <PerceiveHeader />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
