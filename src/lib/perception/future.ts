/**
 * Extension points for future capabilities.
 * Not implemented in v1 — types only, to keep architecture open.
 */

export interface GenerativeEmergenceConfig {
  seed?: string;
  parameters?: Record<string, number>;
}

export interface DynamicPerceptualState {
  id: string;
  timeMs?: number;
  trigger?: "rotation" | "zoom" | "idle";
}

export interface CollectorOrientationMemory {
  collectorId: string;
  lastAngle: number;
  lastStateId?: string;
  visitedAt: string;
}

export interface CollaborativeAnnotation {
  id: string;
  author?: string;
  angle: number;
  text: string;
  createdAt: string;
}

export interface BlockchainMintRef {
  chainId?: number;
  contractAddress?: string;
  tokenId?: string;
  ipfsCid?: string;
}

export interface AIFormAnalysisHint {
  suggestedAngles: number[];
  confidence?: number;
  labels?: string[];
}
