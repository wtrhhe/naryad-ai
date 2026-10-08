"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Bell, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  mergeNotifications,
  NOTIFICATION_COLUMNS,
  notificationHref,
  notificationSchema,
  type AppNotification,
} from "@/lib/notifications/client";
import { cn } from "@/lib/utils";
import { EmergencyAlert } from "./emergency-alert";

const LIMIT = 30;

function useNotifications(employeeId: string) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [urgent, setUrgent] = useState<AppNotification | null>(null);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;
    void supabase
      .from("notifications")
      .select(NOTIFICATION_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(LIMIT)
      .then(({ data }) => {
        if (active)
          setItems(
            notificationSchema
              .array()
              .catch([])
              .parse(data ?? []),
          );
      });
    const channel = supabase
      .channel(`notifications-${employeeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${employeeId}`,
        },
        (change) => {
          const parsed = notificationSchema.safeParse(change.new);
          if (!parsed.success) return;
          setItems((current) => mergeNotifications(current, parsed.data, LIMIT));
          if (parsed.data.is_urgent) setUrgent(parsed.data);
          navigator.vibrate?.(parsed.data.is_urgent ? [300, 100, 300, 100, 600] : [150]);
        },
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [employeeId]);
  return { items, setItems, urgent, setUrgent };
}

export function NotificationCenter({ employeeId }: { employeeId: string }) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const { items, setItems, urgent, setUrgent } = useNotifications(employeeId);
  const unread = items.filter((item) => item.read_at === null).length;
  const markAllRead = useCallback(async () => {
    const ids = items.filter((item) => item.read_at === null).map((item) => item.id);
    if (ids.length === 0) return;
    const readAt = new Date().toISOString();
    setItems((current) =>
      current.map((item) => (ids.includes(item.id) ? { ...item, read_at: readAt } : item)),
    );
    const { error } = await getSupabaseBrowserClient()
      .from("notifications")
      .update({ read_at: readAt })
      .in("id", ids);
    if (error) console.error("failed to mark notifications read", error.message);
  }, [items, setItems]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open")}
        className="border-border text-muted hover:text-foreground relative flex min-h-11 min-w-11 items-center justify-center rounded-lg border-2"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 ? (
          <span className="bg-danger text-danger-foreground absolute -top-1.5 -right-1.5 min-w-5 rounded-full px-1 font-mono text-xs font-bold">
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-black/50"
          onClick={() => setOpen(false)}
        >
          <aside
            aria-label={t("title")}
            className="border-border bg-background flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto border-l-2 p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-bold">{t("title")}</h2>
              <div className="flex items-center gap-2">
                {unread > 0 ? (
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    className="text-accent min-h-11 px-2 text-sm font-semibold"
                  >
                    {t("markAllRead")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("close")}
                  className="flex min-h-11 min-w-11 items-center justify-center"
                >
                  <X className="size-6" aria-hidden />
                </button>
              </div>
            </div>
            {items.length === 0 ? (
              <p className="text-muted py-10 text-center">{t("empty")}</p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {items.map((item) => {
                const href = notificationHref(item);
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "flex flex-col gap-1 rounded-lg border-2 p-3",
                      item.is_urgent ? "border-danger" : "border-border",
                      item.read_at === null ? "bg-surface" : "bg-transparent opacity-75",
                    )}
                  >
                    <span className="font-semibold">{item.title}</span>
                    <span className="text-muted text-sm">{item.body}</span>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <time className="text-muted font-mono text-xs" dateTime={item.created_at}>
                        {format.relativeTime(new Date(item.created_at))}
                      </time>
                      {href ? (
                        <Link
                          href={href}
                          onClick={() => setOpen(false)}
                          className="text-accent min-h-11 content-center text-sm font-semibold"
                        >
                          {t("openOrder")}
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      ) : null}
      {urgent ? <EmergencyAlert notification={urgent} onClose={() => setUrgent(null)} /> : null}
    </>
  );
}
