import type { ExportPreset, ExportPresetId } from "./types";

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "archival",
    label: "Archival",
    description:
      "Maximum fidelity for preservation. Minimal compression, larger files acceptable.",
    options: {
      format: "png",
      quality: 0.98,
      lossless: true,
      chromaSubsampling: "4:4:4",
    },
  },
  {
    id: "perceptual",
    label: "Perceptual",
    description:
      "Balanced for rotational viewing. Preserves edge relationships and subtle gradients.",
    options: {
      format: "avif",
      quality: 0.82,
      lossless: false,
      chromaSubsampling: "4:4:4",
    },
  },
  {
    id: "distribution",
    label: "Distribution",
    description:
      "Smaller previews for sharing. Faster load, reduced fine detail.",
    options: {
      format: "webp",
      quality: 0.72,
      lossless: false,
      maxWidth: 2048,
      maxHeight: 2048,
      chromaSubsampling: "4:2:0",
    },
  },
];

export function getPreset(id: ExportPresetId) {
  return EXPORT_PRESETS.find((p) => p.id === id) ?? EXPORT_PRESETS[1];
}
