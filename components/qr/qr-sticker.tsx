import { qrGlyph, QR_QUIET_ZONE } from "./qr-matrix";

export interface QrStickerProps {
  url: string;
  name: string;
  inventoryLabel: string;
  siteName: string | null;
  footer: string;
}

export function QrSticker({ url, name, inventoryLabel, siteName, footer }: QrStickerProps) {
  const glyph = qrGlyph(url);
  const side = glyph.size + QR_QUIET_ZONE * 2;
  return (
    <figure className="qr-sticker flex flex-col items-center gap-1 overflow-hidden rounded-lg border-2 border-dashed border-neutral-400 bg-white p-3 text-center text-black">
      <svg
        viewBox={`${-QR_QUIET_ZONE} ${-QR_QUIET_ZONE} ${side} ${side}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={name}
        className="aspect-square w-full max-w-44 print:w-[38mm]"
      >
        <rect x={-QR_QUIET_ZONE} y={-QR_QUIET_ZONE} width={side} height={side} fill="#ffffff" />
        <path d={glyph.path} fill="#000000" />
      </svg>
      <figcaption className="flex w-full flex-col gap-0.5">
        <span className="line-clamp-2 text-sm leading-tight font-bold">{name}</span>
        <span className="font-mono text-sm font-semibold">{inventoryLabel}</span>
        {siteName ? <span className="truncate text-xs">{siteName}</span> : null}
        <span className="text-[10px] tracking-wide uppercase">{footer}</span>
      </figcaption>
    </figure>
  );
}
