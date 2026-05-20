import type { PerceptionArtwork } from "@/lib/perception/types";

const SESSION_KEY = "anekaroopam-prepare-session";

export interface PrepareSession {
  artwork: PerceptionArtwork;
  customBackground?: string;
  savedAt: string;
}

export function savePrepareSession(session: PrepareSession): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadPrepareSession(): PrepareSession | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PrepareSession;
  } catch {
    return null;
  }
}

export function clearPrepareSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(SESSION_KEY);
}
