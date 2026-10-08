"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BellRing, Share } from "lucide-react";
import { savePushSubscription } from "@/app/actions/push";
import { publicEnv } from "@/lib/public-env";
import { isIosDevice, urlBase64ToUint8Array } from "@/lib/notifications/client";
import { Button } from "@/components/ui/button";

type PushState =
  "checking" | "unsupported" | "ios_install" | "prompt" | "denied" | "enabled" | "dismissed";

const DISMISS_KEY = "push-setup-dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true)
  );
}

function detectState(): PushState {
  if (isIosDevice(navigator.userAgent, navigator.maxTouchPoints) && !isStandalone())
    return "ios_install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted") return "enabled";
  return localStorage.getItem(DISMISS_KEY) ? "dismissed" : "prompt";
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

function serverState(): PushState {
  return "checking";
}

async function subscribe(): Promise<boolean> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    }));
  const json = subscription.toJSON();
  const result = await savePushSubscription({
    endpoint: json.endpoint,
    keys: json.keys,
    userAgent: navigator.userAgent.slice(0, 300),
  });
  return result.ok;
}

export function PushSetup() {
  const t = useTranslations("notifications");
  const detected = useSyncExternalStore(subscribeToNothing, detectState, serverState);
  const [override, setState] = useState<PushState | null>(null);
  const state = override ?? detected;
  const [failed, setFailed] = useState(false);
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    if (detected === "enabled") void subscribe().catch(() => undefined);
  }, [detected]);
  if (state === "ios_install") {
    return (
      <div className="border-accent bg-surface flex flex-col gap-2 rounded-xl border-2 p-4">
        <p className="flex items-center gap-2 font-bold">
          <Share className="text-accent size-5" aria-hidden />
          {t("ios.title")}
        </p>
        <p className="text-muted text-sm">{t("ios.body")}</p>
        <ol className="list-decimal pl-5 text-sm">
          <li>{t("ios.step1")}</li>
          <li>{t("ios.step2")}</li>
          <li>{t("ios.step3")}</li>
        </ol>
      </div>
    );
  }
  if (state !== "prompt") return null;
  const enable = () =>
    startTransition(async () => {
      try {
        const ok = await subscribe();
        setFailed(!ok);
        setState(ok ? "enabled" : detectState());
      } catch (error) {
        console.error("push subscription failed", error);
        setFailed(true);
      }
    });
  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setState("dismissed");
  };
  return (
    <div className="border-accent bg-surface flex flex-col gap-3 rounded-xl border-2 p-4 md:flex-row md:items-center">
      <p className="flex flex-1 items-center gap-3 text-sm">
        <BellRing className="text-accent size-6 shrink-0" aria-hidden />
        {failed ? t("push.failed") : t("push.hint")}
      </p>
      <div className="flex gap-2">
        <Button onClick={enable} disabled={isPending} size="md">
          {t("push.enable")}
        </Button>
        <Button onClick={dismiss} variant="ghost" size="md">
          {t("push.dismiss")}
        </Button>
      </div>
    </div>
  );
}
