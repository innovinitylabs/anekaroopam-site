/**
 * Pure geometry helpers for the browser archive image pipeline.
 * Shared by Node unit tests and the client encode path.
 */

export function fitInsideMaxEdge(
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number,
): { width: number; height: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Source dimensions must be positive");
  }
  if (maxEdge <= 0) {
    throw new Error("maxEdge must be positive");
  }
  const longest = Math.max(sourceWidth, sourceHeight);
  if (longest <= maxEdge) {
    return { width: sourceWidth, height: sourceHeight };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

/**
 * Source rect for a cover crop into targetWidth x targetHeight
 * (center crop, matching Sharp fit: "cover" + position: "centre").
 */
export function coverCropRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error("Source dimensions must be positive");
  }
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new Error("Target dimensions must be positive");
  }
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  if (sourceRatio > targetRatio) {
    const sw = sourceHeight * targetRatio;
    const sx = (sourceWidth - sw) / 2;
    return { sx, sy: 0, sw, sh: sourceHeight };
  }

  const sh = sourceWidth / targetRatio;
  const sy = (sourceHeight - sh) / 2;
  return { sx: 0, sy, sw: sourceWidth, sh };
}
