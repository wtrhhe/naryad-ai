"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { CircleCheck, LogIn, RefreshCw, TriangleAlert, WifiOff } from "lucide-react";
import { bannerMode, DELIVERED_VISIBLE_MS, type BannerMode } from "@/lib/offline/banner";
import { useOutboxState } from "@/lib/offline/client";
import { outboxRuntime } from "@/lib/offline/runtime";
import { cn } from "@/lib/utils";
import { ConflictsSheet } from "./conflicts-sheet";

const MODE_STYLES: Record<Exclude<BannerMode, "hidden">, string> = {
  offline: "bg-accent text-accent-foreground",
  offlineEmpty: "bg-accent text-accent-foreground",
  signIn: "bg-danger text-danger-foreground",
  waiting: "bg-surface-raised text-foreground border-b-2 border-accent",
  sending: "bg-surface-raised text-foreground border-b-2 border-status-queue",
  delivered: "bg-surface-raised text-foreground border-b-2 border-status-free",
};

function ModeIcon({ mode }: { mode: Exclude<BannerMode, "hidden"> }) {
  const className = "size-6 shrink-0";
  switch (mode) {
    case "offline":
    case "offlineEmpty":
      return <WifiOff className={className} aria-hidden />;
    case "signIn":
      return <LogIn className={className} aria-hidden />;
    case "sending":
      return <RefreshCw className={cn(className, "text-status-queue animate-spin")} aria-hidden />;
    case "delivered":
      return <CircleCheck className={cn(className, "text-status-free")} aria-hidden />;
    case "waiting":
      return <RefreshCw className={cn(className, "text-accent")} aria-hidden />;
  }
}

function useDeliveredFlash(lastDeliveredAt: number | null): boolean {
  const [expiredAt, setExpiredAt] = useState<number | null>(null);
  useEffect(() => {
    if (lastDeliveredAt === null) {
      return;
    }
    const timer = setTimeout(() => setExpiredAt(lastDeliveredAt), DELIVERED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [lastDeliveredAt]);
  return lastDeliveredAt !== null && lastDeliveredAt !== expiredAt;
}

export function OfflineIndicator({ ownerId }: { ownerId: string }) {
  const t = useTranslations("offline");
  const state = useOutboxState();
  const [sheetOpen, setSheetOpen] = useState(false);
  const showDelivered = useDeliveredFlash(state.lastDeliveredAt);
  const mode = bannerMode(state, showDelivered);

  useEffect(() => outboxRuntime.start(ownerId), [ownerId]);

  const retry = useCallback(() => {
    void outboxRuntime.flush({ force: true });
  }, []);
  const dismiss = useCallback((id: string) => {
    void outboxRuntime.dismissConflict(id);
  }, []);
  const dismissAll = useCallback(() => {
    void outboxRuntime.dismissAllConflicts();
    setSheetOpen(false);
  }, []);

  const messages: Record<Exclude<BannerMode, "hidden">, string> = {
    offline: t("banner.offline", { count: state.pending }),
    offlineEmpty: t("banner.offlineEmpty"),
    signIn: t("banner.signIn", { count: state.pending }),
    waiting: t("banner.waiting", { count: state.pending }),
    sending: t("banner.sending"),
    delivered: t("banner.delivered"),
  };
  const conflictCount = state.conflicts.length;
  const barClass =
    "flex min-h-16 w-full flex-1 items-center gap-3 px-4 py-2 text-left font-semibold leading-snug";

  let banner: ReactNode = null;
  if (mode === "signIn") {
    banner = (
      <Link href="/login" className={barClass}>
        <ModeIcon mode={mode} />
        <span>{messages[mode]}</span>
      </Link>
    );
  } else if (mode !== "hidden") {
    banner = (
      <button
        type="button"
        onClick={retry}
        disabled={mode === "sending"}
        aria-label={mode === "sending" ? undefined : `${messages[mode]} · ${t("banner.retry")}`}
        className={cn(barClass, "disabled:cursor-progress")}
      >
        <ModeIcon mode={mode} />
        <span>{messages[mode]}</span>
      </button>
    );
  }

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "sticky top-[calc(4rem+2px+env(safe-area-inset-top))] z-20 flex items-stretch print:hidden",
          mode === "hidden" ? "bg-transparent" : MODE_STYLES[mode],
        )}
      >
        {banner}
        {conflictCount > 0 ? (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={cn(
              "border-danger bg-background text-danger m-2 flex min-h-16 shrink-0 items-center gap-2 rounded-lg border-2 px-3 font-semibold",
              mode === "hidden" ? "ml-auto" : null,
            )}
          >
            <TriangleAlert className="size-5" aria-hidden />
            {t("conflicts.open", { count: conflictCount })}
          </button>
        ) : null}
      </div>
      {sheetOpen ? (
        <ConflictsSheet
          conflicts={state.conflicts}
          onDismiss={dismiss}
          onDismissAll={dismissAll}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}
    </>
  );
}
