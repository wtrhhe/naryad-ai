export const ANALYSIS_LONG_SIDE = 128;
export const CAPTURE_MAX_SIDE = 1600;
export const CONTOUR_LONG_SIDE = 480;
export const DEFAULT_ASPECT = 3 / 4;

export interface Size {
  width: number;
  height: number;
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export function safeAspect(width: number, height: number, fallback = DEFAULT_ASPECT): number {
  return width > 0 && height > 0 && Number.isFinite(width / height) ? width / height : fallback;
}

export function coverCrop(sourceWidth: number, sourceHeight: number, aspect: number): CropRect {
  const sourceAspect = safeAspect(sourceWidth, sourceHeight, aspect);
  if (sourceAspect > aspect) {
    const sw = sourceHeight * aspect;
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight };
  }
  const sh = sourceWidth / aspect;
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh };
}

export function sizeForAspect(aspect: number, longSide: number): Size {
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : DEFAULT_ASPECT;
  return ratio >= 1
    ? { width: longSide, height: Math.max(1, Math.round(longSide / ratio)) }
    : { width: Math.max(1, Math.round(longSide * ratio)), height: longSide };
}

export function fitWithin(width: number, height: number, maxSide: number): Size {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
