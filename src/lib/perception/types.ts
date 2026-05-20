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
  title: string;
  year?: number;
  process?: string;
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
