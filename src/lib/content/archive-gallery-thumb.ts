import { isAbsoluteMediaUrl } from "@/lib/r2/public-url";

export const ARCHIVE_GALLERY_THUMB_CLASSNAME =
  "relative z-[1] object-contain p-5 sm:p-6";

export const ARCHIVE_GALLERY_THUMB_SIZES =
  "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";

export const ARCHIVE_GALLERY_NATIVE_FILL_STYLE = {
  position: "absolute",
  height: "100%",
  width: "100%",
  inset: 0,
} as const;

export type ArchiveGalleryThumbModel =
  | {
      kind: "native";
      src: string;
      alt: string;
      loading: "eager" | "lazy";
      decoding: "async";
      className: string;
      style: typeof ARCHIVE_GALLERY_NATIVE_FILL_STYLE;
    }
  | {
      kind: "next-image";
      src: string;
      alt: string;
      fill: true;
      sizes: string;
      priority: boolean;
      className: string;
    };

/**
 * Deterministic archive-grid thumb rendering:
 * absolute CDN URLs use a plain img (never /_next/image);
 * relative legacy paths keep next/image.
 */
export function resolveArchiveGalleryThumb(input: {
  src: string;
  alt: string;
  priority?: boolean;
}): ArchiveGalleryThumbModel {
  const className = ARCHIVE_GALLERY_THUMB_CLASSNAME;
  const priority = Boolean(input.priority);
  if (isAbsoluteMediaUrl(input.src)) {
    return {
      kind: "native",
      src: input.src,
      alt: input.alt,
      loading: priority ? "eager" : "lazy",
      decoding: "async",
      className,
      style: ARCHIVE_GALLERY_NATIVE_FILL_STYLE,
    };
  }
  return {
    kind: "next-image",
    src: input.src,
    alt: input.alt,
    fill: true,
    sizes: ARCHIVE_GALLERY_THUMB_SIZES,
    priority,
    className,
  };
}
