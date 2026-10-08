import "server-only";
import sharp from "sharp";
import { PHASH_SIZE, phashFromGrayscale } from "@/lib/phash/phash";

export type ImageSource = Buffer | ArrayBuffer | Uint8Array;

export interface GrayscaleRaster {
  width: number;
  height: number;
  data: Float32Array;
}

function toBuffer(source: ImageSource): Buffer {
  if (Buffer.isBuffer(source)) return source;
  return source instanceof ArrayBuffer
    ? Buffer.from(source)
    : Buffer.from(source.buffer, source.byteOffset, source.byteLength);
}

export async function decodeGrayscale(
  source: ImageSource,
  width: number,
  height: number,
  fit: "fill" | "cover" = "fill",
): Promise<GrayscaleRaster> {
  const { data, info } = await sharp(toBuffer(source), { failOn: "none" })
    .autoOrient()
    .resize(width, height, { fit })
    .flatten({ background: "#ffffff" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = new Float32Array(info.width * info.height);
  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = data[index * info.channels] ?? 0;
  }
  return { width: info.width, height: info.height, data: pixels };
}

export async function computeImagePhash(source: ImageSource): Promise<string> {
  const raster = await decodeGrayscale(source, PHASH_SIZE, PHASH_SIZE);
  return phashFromGrayscale(raster.data, PHASH_SIZE);
}
