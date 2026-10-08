"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";
import { notificationHref, type AppNotification } from "@/lib/notifications/client";
import { buttonVariants } from "@/components/ui/button";

export function EmergencyAlert({
  notification,
  onClose,
}: {
  notification: AppNotification;
  onClose: () => void;
}) {
  const t = useTranslations("notifications");
  const href = notificationHref(notification);
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="emergency-title"
      className="bg-status-emergency text-danger-foreground fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-6 text-center"
    >
      <AlertTriangle className="size-24 animate-pulse" aria-hidden strokeWidth={2.5} />
      <span className="rounded-md bg-black/30 px-3 py-1 text-sm font-bold tracking-[0.3em] uppercase">
        {t("emergency.label")}
      </span>
      <h2 id="emergency-title" className="text-3xl font-extrabold">
        {notification.title}
      </h2>
      <p className="max-w-md text-xl">{notification.body}</p>
      <div className="flex w-full max-w-md flex-col gap-3">
        {href ? (
          <Link
            href={href}
            onClick={onClose}
            className={buttonVariants({
              variant: "secondary",
              block: true,
              className: "border-white bg-white text-black",
            })}
          >
            {t("emergency.acknowledge")}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="min-h-touch rounded-lg border-2 border-white/70 text-lg font-semibold"
        >
          {t("emergency.later")}
        </button>
      </div>
    </div>
  );
}
