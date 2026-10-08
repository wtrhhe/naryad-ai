import "server-only";
import webpush from "web-push";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { publicEnv } from "@/lib/public-env";
import { buildPush, isGoneSubscription, type NotificationRecord } from "@/lib/push/payload";

const LOOKBACK_MINUTES = 30;
const BATCH_SIZE = 100;
const URGENT_TTL_SECONDS = 600;
const REGULAR_TTL_SECONDS = 3600;

interface Subscription {
  id: string;
  employee_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushDispatchResult {
  notifications: number;
  delivered: number;
  removed: number;
}

function configureVapid(): boolean {
  const env = serverEnv();
  if (!env.VAPID_PRIVATE_KEY || !publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
    return false;
  }
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  return true;
}

async function sendOne(
  subscription: Subscription,
  notification: NotificationRecord,
): Promise<"sent" | "gone" | "failed"> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(buildPush(notification)),
      {
        TTL: notification.is_urgent ? URGENT_TTL_SECONDS : REGULAR_TTL_SECONDS,
        urgency: notification.is_urgent ? "high" : "normal",
      },
    );
    return "sent";
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (isGoneSubscription(statusCode)) {
      return "gone";
    }
    console.error(
      "push delivery failed",
      statusCode,
      error instanceof Error ? error.message : error,
    );
    return "failed";
  }
}

export async function dispatchPendingPushes(): Promise<PushDispatchResult> {
  if (!configureVapid()) {
    return { notifications: 0, delivered: 0, removed: 0 };
  }
  const admin = getSupabaseAdminClient();
  const since = new Date(Date.now() - LOOKBACK_MINUTES * 60_000).toISOString();
  const { data: pending, error } = await admin
    .from("notifications")
    .select("id, recipient_id, title, body, is_urgent, work_order_id, payload")
    .is("push_sent_at", null)
    .gte("created_at", since)
    .order("created_at")
    .limit(BATCH_SIZE);
  if (error) throw new Error(`pending notifications failed: ${error.message}`);
  if (!pending?.length) return { notifications: 0, delivered: 0, removed: 0 };
  const recipients = [...new Set(pending.map((item) => item.recipient_id))];
  const { data: subscriptions, error: subscriptionError } = await admin
    .from("push_subscriptions")
    .select("id, employee_id, endpoint, p256dh, auth")
    .in("employee_id", recipients);
  if (subscriptionError) throw new Error(`push subscriptions failed: ${subscriptionError.message}`);
  const deliveries = pending.flatMap((notification) =>
    (subscriptions ?? [])
      .filter((subscription) => subscription.employee_id === notification.recipient_id)
      .map(async (subscription) => ({
        subscription,
        outcome: await sendOne(subscription, notification),
      })),
  );
  const outcomes = await Promise.all(deliveries);
  const gone = outcomes
    .filter((item) => item.outcome === "gone")
    .map((item) => item.subscription.id);
  await Promise.all([
    gone.length ? admin.from("push_subscriptions").delete().in("id", gone) : Promise.resolve(),
    admin
      .from("notifications")
      .update({ push_sent_at: new Date().toISOString() })
      .in(
        "id",
        pending.map((item) => item.id),
      ),
  ]);
  return {
    notifications: pending.length,
    delivered: outcomes.filter((item) => item.outcome === "sent").length,
    removed: gone.length,
  };
}
