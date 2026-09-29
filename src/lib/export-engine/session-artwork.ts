import type { PerceptionArtwork } from "@/lib/perception/types";

/** Artwork safe for sessionStorage — no image payloads. */
export type StoredPerceptionArtwork = PerceptionArtwork & { imageSrc: "" };

export function stripArtworkForStorage(
  artwork: PerceptionArtwork,
): StoredPerceptionArtwork {
  return {
    ...artwork,
    imageSrc: "",
  };
}

export function hydrateArtworkPreview(
  stored: PerceptionArtwork,
  objectUrl: string,
): PerceptionArtwork {
  return {
    ...stored,
    imageSrc: objectUrl,
  };
}

export function isBlobOrDataImageSrc(src: string): boolean {
  return (
    src.startsWith("blob:") ||
    src.startsWith("data:") ||
    src.length > 2048
  );
}
