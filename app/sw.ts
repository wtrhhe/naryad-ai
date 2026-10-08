import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
import {
  buildNotificationOptions,
  decodePushMessage,
  readNotificationUrl,
  selectWindowClient,
} from "../components/pwa/push-payload";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_PAGE_URL = "/offline";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  fallbacks: {
    entries: [
      {
        url: OFFLINE_PAGE_URL,
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

function readPushText(data: PushMessageData | null): string | null {
  if (data === null) {
    return null;
  }
  try {
    return data.text();
  } catch (error) {
    console.error("Failed to read push message data", error);
    return null;
  }
}

async function showPushNotification(event: PushEvent): Promise<void> {
  const payload = decodePushMessage(readPushText(event.data));
  await self.registration.showNotification(payload.title, buildNotificationOptions(payload));
}

async function focusAndNavigate(client: WindowClient, targetUrl: string): Promise<boolean> {
  try {
    await client.focus();
    await client.navigate(targetUrl);
    return true;
  } catch (error) {
    console.error("Failed to navigate an open window to the notification target", error);
    return false;
  }
}

async function openNotificationTarget(targetUrl: string): Promise<void> {
  const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const selection = selectWindowClient(windowClients, targetUrl);
  if (selection?.action === "focus") {
    await selection.client.focus();
    return;
  }
  if (selection?.action === "navigate" && (await focusAndNavigate(selection.client, targetUrl))) {
    return;
  }
  await self.clients.openWindow(targetUrl);
}

self.addEventListener("push", (event) => {
  event.waitUntil(showPushNotification(event));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(readNotificationUrl(event.notification.data), self.location.origin)
    .href;
  event.waitUntil(openNotificationTarget(targetUrl));
});

serwist.addEventListeners();
