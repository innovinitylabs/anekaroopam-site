"use client";

import { PerceiveWorkspaceProvider } from "@/lib/perception/workspace";
import { PerceptionShell } from "@/components/perception/PerceptionShell";

export function PerceiveClientShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PerceiveWorkspaceProvider>
      <PerceptionShell>{children}</PerceptionShell>
    </PerceiveWorkspaceProvider>
  );
}
