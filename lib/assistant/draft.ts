import { z } from "zod";
import { PRIORITIES } from "@/lib/assistant/types";

export const DRAFT_PATH = "/master/orders/new";
export const DRAFT_PARAM = "draft";

export const draftPayloadSchema = z.object({
  description: z.string().trim().min(3).max(4000),
  equipmentId: z.uuid().optional(),
  priority: z.enum(PRIORITIES).optional(),
});

export type DraftPayload = z.infer<typeof draftPayloadSchema>;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function encodeDraft(payload: DraftPayload): string {
  return toBase64Url(JSON.stringify(draftPayloadSchema.parse(payload)));
}

export function decodeDraft(value: string | null | undefined): DraftPayload | null {
  if (!value || value.length > 12_000 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  try {
    const parsed = draftPayloadSchema.safeParse(JSON.parse(fromBase64Url(value)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function draftLink(payload: DraftPayload): string {
  return `${DRAFT_PATH}?${DRAFT_PARAM}=${encodeDraft(payload)}`;
}
