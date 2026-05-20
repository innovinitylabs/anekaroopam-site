/**
 * Extension points for future image pipeline capabilities.
 * Not implemented in v1.
 */

export interface TiledDeepZoomConfig {
  tileSize: number;
  maxZoomLevel: number;
}

export interface ProgressiveStreamConfig {
  chunkSize: number;
  mimeType: string;
}

export interface IiifManifestRef {
  manifestUrl: string;
  profile?: string;
}

export interface IpfsOptimizationHints {
  preferredCidVersion?: 0 | 1;
  chunkSize?: number;
}
