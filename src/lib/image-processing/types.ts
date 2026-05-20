export type ImageFormat = "avif" | "webp" | "png" | "jpeg";

export type ExportPresetId = "archival" | "perceptual" | "distribution";

export type ChromaSubsampling = "4:4:4" | "4:2:2" | "4:2:0";

export interface ConversionOptions {
  format: ImageFormat;
  quality: number;
  lossless: boolean;
  maxWidth?: number;
  maxHeight?: number;
  chromaSubsampling: ChromaSubsampling;
  filename: string;
}

export interface ImageStats {
  width: number;
  height: number;
  byteSize: number;
  mimeType: string;
  aspectRatio: number;
}

export interface ConversionResult {
  blob: Blob;
  dataUrl: string;
  stats: ImageStats;
  /** Actual encoded format (from blob MIME). */
  format: ImageFormat;
  /** Format the user selected before browser capability fallback. */
  requestedFormat?: ImageFormat;
  compressionRatio: number;
  processingMs: number;
  transcodedFromHeic?: boolean;
}

export interface ImageAnalysis {
  stats: ImageStats;
  hasTransparency: boolean;
  estimatedMemoryMb: number;
  dominantColors: string[];
  formatSupport: Record<ImageFormat, boolean>;
  loadingEstimate: "fast" | "moderate" | "slow";
}

export interface ExportPreset {
  id: ExportPresetId;
  label: string;
  description: string;
  options: Partial<ConversionOptions> & { format: ImageFormat };
}
