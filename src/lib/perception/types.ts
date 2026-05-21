export type BackgroundPreset =
  | "black"
  | "paper"
  | "gallery"
  | "archival"
  | "custom";

export interface PerceptualState {
  id: string;
  name: string;
  angle: number;
  caption?: string;
  metadata?: Record<string, string>;
}

export interface ArtworkMetadata {
  /** Permanent local archival identifier, e.g. AR-2026-0001. */
  accessionId?: string;
  title: string;
  year?: number;
  /** Exact creation date (ISO date from date input) */
  date?: string;
  process?: string;
  medium?: string;
  dimensions?: string;
  edition?: string;
  collection?: string;
  postProcessing?: string;
  captureMethod?: string;
  orientationNotes?: string;
  artistWebsite?: string;
  archivalLink?: string;
  transientLink?: string;
  discoveredForms?: string;
  perceptualNotes?: string;
  rotationalObservations?: string;
  description?: string;
  tags?: string[];
}

export interface PerceptionArtwork {
  id: string;
  metadata: ArtworkMetadata;
  imageSrc: string;
  states: PerceptualState[];
  background: BackgroundPreset | string;
  initialAngle?: number;
  snapToState?: boolean;
  showMetadataOverlay?: boolean;
  overlayFields?: {
    title?: boolean;
    year?: boolean;
    process?: boolean;
    state?: boolean;
    caption?: boolean;
    advanced?: boolean;
  };
}

export interface ViewTransform {
  angle: number;
  zoom: number;
  panX: number;
  panY: number;
}

export interface PerceptionEngineOptions {
  snapToState?: boolean;
  rotationStep?: number;
  minZoom?: number;
  maxZoom?: number;
  interpolateMs?: number;
}

export const DEFAULT_ENGINE_OPTIONS: Required<PerceptionEngineOptions> = {
  snapToState: false,
  rotationStep: 22.5,
  minZoom: 0.4,
  maxZoom: 4,
  interpolateMs: 680,
};

export interface ExportPayload {
  version: 1;
  artwork: PerceptionArtwork;
  exportedAt: string;
}
