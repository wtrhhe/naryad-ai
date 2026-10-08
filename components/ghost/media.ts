import {
  ANALYSIS_LONG_SIDE,
  CAPTURE_MAX_SIDE,
  coverCrop,
  fitWithin,
  sizeForAspect,
  type CropRect,
  type Size,
} from "@/lib/ghost/geometry";

export const JPEG_QUALITY = 0.85;

export interface Raster extends Size {
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

function context2d(canvas: HTMLCanvasElement, readBack = false): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", readBack ? { willReadFrequently: true } : undefined);
  if (!context) throw new Error("Canvas 2D context is unavailable");
  return context;
}

export function createCanvas({ width, height }: Size): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function rasterize(
  source: CanvasImageSource,
  crop: CropRect,
  size: Size,
  canvas: HTMLCanvasElement = createCanvas(size),
): Raster {
  if (canvas.width !== size.width || canvas.height !== size.height) {
    canvas.width = size.width;
    canvas.height = size.height;
  }
  const context = context2d(canvas, true);
  context.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size.width, size.height);
  const { data } = context.getImageData(0, 0, size.width, size.height);
  return { width: size.width, height: size.height, rgba: data };
}

export function analysisRaster(
  source: CanvasImageSource,
  sourceSize: Size,
  aspect: number,
  canvas?: HTMLCanvasElement,
): Raster {
  return rasterize(
    source,
    coverCrop(sourceSize.width, sourceSize.height, aspect),
    sizeForAspect(aspect, ANALYSIS_LONG_SIDE),
    canvas,
  );
}

export function captureVideoFrame(video: HTMLVideoElement, aspect: number): HTMLCanvasElement {
  const crop = coverCrop(video.videoWidth, video.videoHeight, aspect);
  const size = fitWithin(crop.sw, crop.sh, CAPTURE_MAX_SIDE);
  const canvas = createCanvas(size);
  context2d(canvas).drawImage(
    video,
    crop.sx,
    crop.sy,
    crop.sw,
    crop.sh,
    0,
    0,
    size.width,
    size.height,
  );
  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("JPEG encoding failed"))),
      "image/jpeg",
      quality,
    ),
  );
}

export async function fileToJpeg(file: Blob): Promise<{ blob: Blob } & Size> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const size = fitWithin(bitmap.width, bitmap.height, CAPTURE_MAX_SIDE);
    const canvas = createCanvas(size);
    context2d(canvas).drawImage(bitmap, 0, 0, size.width, size.height);
    return { blob: await canvasToJpeg(canvas), ...size };
  } finally {
    bitmap.close();
  }
}

export async function loadBitmap(url: string, signal?: AbortSignal): Promise<ImageBitmap> {
  const response = await fetch(url, { signal, cache: "force-cache" });
  if (!response.ok) throw new Error(`Image request failed with ${response.status}`);
  return createImageBitmap(await response.blob(), { imageOrientation: "from-image" });
}
