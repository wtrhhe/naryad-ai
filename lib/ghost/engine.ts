import { compareEdgeMaps, edgeMap, rgbaToGray, type GrayImage } from "@/lib/ghost/alignment";
import { renderContours, type Rgb } from "@/lib/ghost/contours";

export type AlignmentRequest =
  | { type: "reference"; width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> }
  | {
      type: "frame";
      id: number;
      width: number;
      height: number;
      rgba: Uint8ClampedArray<ArrayBuffer>;
    }
  | {
      type: "contours";
      id: number;
      width: number;
      height: number;
      rgba: Uint8ClampedArray<ArrayBuffer>;
      color?: Rgb;
    }
  | { type: "clear" };

export type AlignmentResponse =
  | { type: "reference"; width: number; height: number }
  | { type: "score"; id: number; score: number | null }
  | {
      type: "contours";
      id: number;
      width: number;
      height: number;
      rgba: Uint8ClampedArray<ArrayBuffer>;
    }
  | { type: "error"; id: number | null; message: string };

export interface EngineReply {
  response: AlignmentResponse;
  transfer: ArrayBuffer[];
}

export interface AlignmentEngine {
  handle(request: AlignmentRequest): EngineReply | null;
}

function failure(id: number | null, cause: unknown): EngineReply {
  return {
    response: {
      type: "error",
      id,
      message: cause instanceof Error ? cause.message : String(cause),
    },
    transfer: [],
  };
}

export function createAlignmentEngine(): AlignmentEngine {
  let reference: GrayImage | null = null;
  return {
    handle(request) {
      switch (request.type) {
        case "clear":
          reference = null;
          return null;
        case "reference":
          try {
            reference = edgeMap(rgbaToGray(request.rgba, request.width, request.height));
            return {
              response: { type: "reference", width: request.width, height: request.height },
              transfer: [],
            };
          } catch (cause) {
            reference = null;
            return failure(null, cause);
          }
        case "frame":
          if (!reference) {
            return { response: { type: "score", id: request.id, score: null }, transfer: [] };
          }
          try {
            const frame = edgeMap(rgbaToGray(request.rgba, request.width, request.height));
            return {
              response: { type: "score", id: request.id, score: compareEdgeMaps(reference, frame) },
              transfer: [],
            };
          } catch (cause) {
            return failure(request.id, cause);
          }
        case "contours":
          try {
            const rgba = renderContours(request.rgba, request.width, request.height, request.color);
            return {
              response: {
                type: "contours",
                id: request.id,
                width: request.width,
                height: request.height,
                rgba,
              },
              transfer: [rgba.buffer],
            };
          } catch (cause) {
            return failure(request.id, cause);
          }
      }
    },
  };
}
