import { homeForRole, type AppRole } from "@/lib/auth/roles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_PATH = /^\/q\/([0-9a-f-]{36})\/?$/i;
const NEW_ORDER_PATH = "/master/orders/new";

export type CameraErrorKey = "denied" | "notFound" | "unsupported" | "failed";

export function normalizeQrToken(value: string): string | null {
  const trimmed = value.trim();
  return UUID.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function qrTokenUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, "")}/q/${token}`;
}

function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function parseQrToken(raw: string, allowedOrigins: readonly string[] = []): string | null {
  const direct = normalizeQrToken(raw);
  if (direct) {
    return direct;
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const origins = allowedOrigins.map(originOf).filter((origin) => origin !== null);
  if (origins.length > 0 && !origins.includes(url.origin)) {
    return null;
  }
  const match = TOKEN_PATH.exec(url.pathname);
  return match?.[1] ? normalizeQrToken(match[1]) : null;
}

export function newOrderPath(equipmentId: string | null): string {
  return equipmentId
    ? `${NEW_ORDER_PATH}?equipment=${encodeURIComponent(equipmentId)}`
    : NEW_ORDER_PATH;
}

export function qrRedirectTarget(role: AppRole | null, equipmentId: string | null): string {
  const target = newOrderPath(equipmentId);
  if (role === null) {
    return `/login?next=${encodeURIComponent(target)}`;
  }
  return role === "master" ? target : homeForRole(role);
}

export function cameraErrorKey(error: unknown): CameraErrorKey {
  const name =
    typeof error === "object" && error !== null ? (error as { name?: unknown }).name : null;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
    case "PermissionDeniedError":
      return "denied";
    case "NotFoundError":
    case "OverconstrainedError":
    case "DevicesNotFoundError":
      return "notFound";
    case "TypeError":
      return "unsupported";
    default:
      return "failed";
  }
}

export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide || longest === 0) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
