import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

type BackgroundShape = "rounded" | "full" | "none";

interface IconVariant {
  readonly outputPath: string;
  readonly size: number;
  readonly background: BackgroundShape;
  readonly markColor: string;
  readonly markScale: number;
}

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_SVG_PATH = path.join(PROJECT_ROOT, "public/icons/icon.svg");
const CANVAS_SIZE = 512;
const CANVAS_CENTER = CANVAS_SIZE / 2;
const ROUNDED_CORNER_RADIUS = 112;
const RENDER_DENSITY = 288;
const BACKGROUND_COLOR = "#0B0F14";
const ACCENT_COLOR = "#F5A524";
const BADGE_COLOR = "#FFFFFF";
const MARK_GROUP_PATTERN = /<g id="mark"[^>]*>([\s\S]*?)<\/g>/;

const ICON_VARIANTS: readonly IconVariant[] = [
  {
    outputPath: "public/icons/icon-192.png",
    size: 192,
    background: "rounded",
    markColor: ACCENT_COLOR,
    markScale: 1,
  },
  {
    outputPath: "public/icons/icon-512.png",
    size: 512,
    background: "rounded",
    markColor: ACCENT_COLOR,
    markScale: 1,
  },
  {
    outputPath: "public/icons/icon-maskable-512.png",
    size: 512,
    background: "full",
    markColor: ACCENT_COLOR,
    markScale: 0.78,
  },
  {
    outputPath: "public/icons/badge-72.png",
    size: 72,
    background: "none",
    markColor: BADGE_COLOR,
    markScale: 1.2,
  },
  {
    outputPath: "public/apple-touch-icon.png",
    size: 180,
    background: "full",
    markColor: ACCENT_COLOR,
    markScale: 0.86,
  },
];

function extractMarkContent(sourceSvg: string): string {
  const match = MARK_GROUP_PATTERN.exec(sourceSvg);
  const markContent = match?.[1];
  if (markContent === undefined || markContent.trim().length === 0) {
    throw new Error(`Could not find a non-empty <g id="mark"> group in ${SOURCE_SVG_PATH}`);
  }
  return markContent;
}

function renderBackground(shape: BackgroundShape): string {
  if (shape === "none") {
    return "";
  }
  const cornerRadius = shape === "rounded" ? ROUNDED_CORNER_RADIUS : 0;
  return `<rect width="${CANVAS_SIZE}" height="${CANVAS_SIZE}" rx="${cornerRadius}" fill="${BACKGROUND_COLOR}"/>`;
}

function composeVariantSvg(markContent: string, variant: IconVariant): string {
  const markTransform = `translate(${CANVAS_CENTER} ${CANVAS_CENTER}) scale(${variant.markScale}) translate(${-CANVAS_CENTER} ${-CANVAS_CENTER})`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}">`,
    renderBackground(variant.background),
    `<g color="${variant.markColor}" transform="${markTransform}">${markContent}</g>`,
    "</svg>",
  ].join("");
}

async function renderVariant(markContent: string, variant: IconVariant): Promise<void> {
  const outputPath = path.join(PROJECT_ROOT, variant.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const svgBuffer = Buffer.from(composeVariantSvg(markContent, variant));
  await sharp(svgBuffer, { density: RENDER_DENSITY })
    .resize(variant.size, variant.size)
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  console.warn(`Generated ${variant.outputPath} (${variant.size}x${variant.size})`);
}

async function generateIcons(): Promise<void> {
  const sourceSvg = await readFile(SOURCE_SVG_PATH, "utf-8");
  const markContent = extractMarkContent(sourceSvg);
  await Promise.all(ICON_VARIANTS.map((variant) => renderVariant(markContent, variant)));
}

generateIcons().catch((error: unknown) => {
  console.error("Icon generation failed", error);
  process.exitCode = 1;
});
