"use client";

import { useFormatter, useTranslations } from "next-intl";
import { TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isActionErrorCode, isTransitionActionName } from "@/lib/offline/banner";
import type { ConflictEntry } from "@/lib/offline/types";

interface ConflictsSheetProps {
  conflicts: readonly ConflictEntry[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onClose: () => void;
}

function ConflictCard({ entry, onDismiss }: { entry: ConflictEntry; onDismiss: () => void }) {
  const t = useTranslations("offline.conflicts");
  const workOrder = useTranslations("workOrder");
  const format = useFormatter();
  const title = entry.label ?? t(`kind.${entry.kind}`);
  const action = isTransitionActionName(entry.action) ? workOrder(`action.${entry.action}`) : null;
  const resolution =
    entry.resolution === "gave_up"
      ? t("resolution.gave_up", { attempts: entry.attempts })
      : t(`resolution.${entry.resolution}`);
  const detail = isActionErrorCode(entry.reason) ? workOrder(`errors.${entry.reason}`) : null;
  return (
    <li className="border-danger bg-surface flex flex-col gap-2 rounded-lg border-2 p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold">{title}</span>
        {action ? <span className="text-muted text-sm">{action}</span> : null}
      </div>
      <p className="font-semibold">{resolution}</p>
      {detail && entry.resolution !== "server_wins" ? (
        <p className="text-muted text-sm">{detail}</p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <time className="text-muted font-mono text-xs" dateTime={entry.createdAt}>
          {t("madeAt", {
            time: format.dateTime(new Date(entry.createdAt), {
              dateStyle: "short",
              timeStyle: "short",
            }),
          })}
        </time>
        <Button variant="secondary" size="touch" onClick={onDismiss}>
          {t("dismiss")}
        </Button>
      </div>
    </li>
  );
}

export function ConflictsSheet({
  conflicts,
  onDismiss,
  onDismissAll,
  onClose,
}: ConflictsSheetProps) {
  const t = useTranslations("offline.conflicts");
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("title")}
        className="border-border bg-background flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto border-l-2 p-4 pt-[max(1rem,env(safe-area-inset-top))]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <TriangleAlert className="text-danger size-6" aria-hidden />
            {t("title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex min-h-16 min-w-16 items-center justify-center"
          >
            <X className="size-7" aria-hidden />
          </button>
        </div>
        <p className="text-muted text-sm">{t("description")}</p>
        {conflicts.length === 0 ? (
          <p className="text-muted py-10 text-center">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {conflicts.map((entry) => (
              <ConflictCard key={entry.id} entry={entry} onDismiss={() => onDismiss(entry.id)} />
            ))}
          </ul>
        )}
        {conflicts.length > 1 ? (
          <Button variant="ghost" block onClick={onDismissAll} className="mt-auto">
            {t("dismissAll")}
          </Button>
        ) : null}
      </aside>
    </div>
  );
}
