import { z } from "zod";

export const notificationSchema = z.object({
  id: z.uuid(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  work_order_id: z.uuid().nullable(),
  payload: z.unknown(),
  is_urgent: z.boolean(),
  read_at: z.string().nullable(),
  created_at: z.string(),
});

export type AppNotification = z.infer<typeof notificationSchema>;

export const NOTIFICATION_COLUMNS =
  "id, kind, title, body, work_order_id, payload, is_urgent, read_at, created_at";

export function notificationHref(notification: AppNotification): string | null {
  const payload = notification.payload;
  if (typeof payload === "object" && payload !== null && "url" in payload) {
    const { url } = payload as { url: unknown };
    if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//")) {
      return url;
    }
  }
  return null;
}

export function mergeNotifications(
  current: readonly AppNotification[],
  incoming: AppNotification,
  limit = 30,
): AppNotification[] {
  return [incoming, ...current.filter((item) => item.id !== incoming.id)].slice(0, limit);
}

export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  return (
    /iPad|iPhone|iPod/.test(userAgent) || (userAgent.includes("Macintosh") && maxTouchPoints > 1)
  );
}
