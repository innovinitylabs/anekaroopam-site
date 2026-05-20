/**
 * AVIF encoding — cross-browser via libavif WebAssembly (@jsquash/avif).
 * Canvas toBlob AVIF is only used as a decode/display path elsewhere.
 */

import { detectFormatSupport, mimeForFormat } from "@/lib/image-processing/format-support";
import { encodeAvifWasm } from "@/lib/image-processing/encode-avif";

export { detectFormatSupport, mimeForFormat, encodeAvifWasm };

export function isAvifSupported(): Promise<boolean> {
  return typeof document === "undefined"
    ? Promise.resolve(false)
    : detectFormatSupport().then((s) => s.avif);
}
