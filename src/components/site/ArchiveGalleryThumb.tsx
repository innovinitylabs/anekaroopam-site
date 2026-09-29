"use client";

import Image from "next/image";
import { resolveArchiveGalleryThumb } from "@/lib/content/archive-gallery-thumb";

/** Archive grid thumbnail: native img for absolute CDN URLs, next/image for relative. */
export function ArchiveGalleryThumb({
  src,
  alt,
  priority = false,
}: {
  src: string;
  alt: string;
  priority?: boolean;
}) {
  const model = resolveArchiveGalleryThumb({ src, alt, priority });
  if (model.kind === "native") {
    return (
      // Absolute R2/CDN URLs must not enter Next Image Optimization (/_next/image).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={model.src}
        alt={model.alt}
        loading={model.loading}
        decoding={model.decoding}
        className={model.className}
        style={model.style}
      />
    );
  }
  return (
    <Image
      src={model.src}
      alt={model.alt}
      fill
      sizes={model.sizes}
      priority={model.priority}
      className={model.className}
    />
  );
}
