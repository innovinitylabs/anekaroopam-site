/**
 * AVIF encoding surface — browser-native via Canvas / OffscreenCanvas.
 * Server-side sharp integration can be added here for API routes.
 */

import { detectFormatSupport, mimeForFormat } from "@/lib/image-processing/format-support";

export { detectFormatSupport, mimeForFormat };

export function isAvifSupported(): Promise<boolean> {
  return detectFormatSupport().then((s) => s.avif);
}
