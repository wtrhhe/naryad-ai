export interface PushPayload {
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly urgent: boolean;
  readonly tag: string | undefined;
}

export interface NotificationClickData {
  readonly url: string;
}

export interface PushNotificationOptions extends NotificationOptions {
  readonly body: string;
  readonly icon: string;
  readonly badge: string;
  readonly data: NotificationClickData;
  readonly requireInteraction: boolean;
  readonly renotify: boolean;
  readonly vibrate: number[];
  readonly tag?: string;
}

export interface WindowClientLike {
  readonly url: string;
}

export interface WindowClientSelection<TClient extends WindowClientLike> {
  readonly client: TClient;
  readonly action: "focus" | "navigate";
}

export const APP_NAME = "НарядAI";
export const DEFAULT_NOTIFICATION_URL = "/";
export const NOTIFICATION_ICON_URL = "/icons/icon-192.png";
export const NOTIFICATION_BADGE_URL = "/icons/badge-72.png";
export const REGULAR_VIBRATION_PATTERN: readonly number[] = [200, 100, 200];
export const URGENT_VIBRATION_PATTERN: readonly number[] = [300, 100, 300, 100, 600];

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 500;
const MAX_TAG_LENGTH = 64;
const URGENT_TAG_PREFIX = "urgent:";
const PATH_NORMALIZATION_BASE = "https://app.invalid";

export const FALLBACK_PUSH_PAYLOAD: PushPayload = {
  title: APP_NAME,
  body: "",
  url: DEFAULT_NOTIFICATION_URL,
  urgent: false,
  tag: undefined,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrimmedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : undefined;
}

export function normalizeInternalPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return DEFAULT_NOTIFICATION_URL;
  }
  try {
    const parsed = new URL(value, PATH_NORMALIZATION_BASE);
    if (parsed.origin !== PATH_NORMALIZATION_BASE) {
      return DEFAULT_NOTIFICATION_URL;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_NOTIFICATION_URL;
  }
}

export function parsePushPayload(raw: unknown): PushPayload | null {
  if (!isRecord(raw)) {
    return null;
  }
  const title = readTrimmedString(raw.title, MAX_TITLE_LENGTH);
  if (title === undefined) {
    return null;
  }
  return {
    title,
    body: readTrimmedString(raw.body, MAX_BODY_LENGTH) ?? "",
    url: normalizeInternalPath(raw.url),
    urgent: raw.urgent === true,
    tag: readTrimmedString(raw.tag, MAX_TAG_LENGTH),
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function decodePushMessage(text: string | null | undefined): PushPayload {
  if (typeof text !== "string") {
    return FALLBACK_PUSH_PAYLOAD;
  }
  return parsePushPayload(parseJson(text)) ?? FALLBACK_PUSH_PAYLOAD;
}

function resolveNotificationTag(payload: PushPayload): string | undefined {
  if (payload.tag !== undefined) {
    return payload.tag;
  }
  return payload.urgent ? `${URGENT_TAG_PREFIX}${payload.url}` : undefined;
}

export function buildNotificationOptions(payload: PushPayload): PushNotificationOptions {
  const tag = resolveNotificationTag(payload);
  const vibrationPattern = payload.urgent ? URGENT_VIBRATION_PATTERN : REGULAR_VIBRATION_PATTERN;
  return {
    body: payload.body,
    icon: NOTIFICATION_ICON_URL,
    badge: NOTIFICATION_BADGE_URL,
    data: { url: payload.url },
    requireInteraction: payload.urgent,
    renotify: payload.urgent,
    vibrate: [...vibrationPattern],
    ...(tag === undefined ? {} : { tag }),
  };
}

export function readNotificationUrl(data: unknown): string {
  return isRecord(data) ? normalizeInternalPath(data.url) : DEFAULT_NOTIFICATION_URL;
}

export function selectWindowClient<TClient extends WindowClientLike>(
  clients: readonly TClient[],
  targetUrl: string,
): WindowClientSelection<TClient> | null {
  const matchingClient = clients.find((client) => client.url === targetUrl);
  if (matchingClient !== undefined) {
    return { client: matchingClient, action: "focus" };
  }
  const firstClient = clients[0];
  return firstClient === undefined ? null : { client: firstClient, action: "navigate" };
}
