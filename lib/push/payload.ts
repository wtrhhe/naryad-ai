export const PUSH_ENDPOINT_PATTERN =
  /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|push\.apple\.com|notify\.windows\.com)\//;

export interface NotificationRecord {
  id: string;
  title: string;
  body: string;
  is_urgent: boolean;
  work_order_id: string | null;
  payload: unknown;
}

export interface OutgoingPush {
  title: string;
  body: string;
  url: string;
  urgent: boolean;
  tag: string;
}

function payloadUrl(payload: unknown): string | null {
  if (typeof payload === "object" && payload !== null && "url" in payload) {
    const { url } = payload as { url: unknown };
    return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : null;
  }
  return null;
}

export function buildPush(notification: NotificationRecord): OutgoingPush {
  return {
    title: notification.title,
    body: notification.body,
    url: payloadUrl(notification.payload) ?? "/",
    urgent: notification.is_urgent,
    tag: notification.work_order_id
      ? `order:${notification.work_order_id}`
      : `notification:${notification.id}`,
  };
}

export function isGoneSubscription(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

export function isAllowedPushEndpoint(endpoint: string): boolean {
  return PUSH_ENDPOINT_PATTERN.test(endpoint);
}
