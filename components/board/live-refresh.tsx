"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

type LiveState = "connecting" | "connected" | "offline";

const REFRESH_DEBOUNCE_MS = 250;
const WATCHED_TABLES = ["work_orders", "employees", "lockouts"] as const;

export function LiveRefresh({ channel }: { channel: string }) {
  const router = useRouter();
  const t = useTranslations("board.live");
  const format = useFormatter();
  const [state, setState] = useState<LiveState>("connecting");
  const [updatedAt, setUpdatedAt] = useState<Date>(() => new Date());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const scheduleRefresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        router.refresh();
        setUpdatedAt(new Date());
      }, REFRESH_DEBOUNCE_MS);
    };
    const subscription = WATCHED_TABLES.reduce(
      (current, table) =>
        current.on("postgres_changes", { event: "*", schema: "public", table }, scheduleRefresh),
      supabase.channel(channel),
    ).subscribe((status) => {
      setState(
        status === "SUBSCRIBED"
          ? "connected"
          : status === "CHANNEL_ERROR" || status === "TIMED_OUT"
            ? "offline"
            : "connecting",
      );
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(subscription);
    };
  }, [channel, router]);

  return (
    <span className="text-muted inline-flex items-center gap-2 text-sm" aria-live="polite">
      <span
        className={cn(
          "size-2.5 rounded-full",
          state === "connected"
            ? "bg-status-free"
            : state === "offline"
              ? "bg-danger"
              : "bg-status-busy animate-pulse",
        )}
        aria-hidden
      />
      {t(state)}
      <span className="hidden sm:inline">
        {t("updated", {
          time: format.dateTime(updatedAt, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        })}
      </span>
    </span>
  );
}
