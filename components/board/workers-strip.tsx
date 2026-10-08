import { useTranslations } from "next-intl";
import {
  sortWorkers,
  workerStatus,
  type BoardWorker,
  type WorkerLiveStatus,
} from "@/lib/board/model";
import { cn } from "@/lib/utils";

const DOT: Record<WorkerLiveStatus, string> = {
  free: "bg-status-free",
  busy: "bg-status-busy",
  queue: "bg-status-queue",
  off_shift: "bg-status-off",
};

export function WorkersStrip({ workers }: { workers: BoardWorker[] }) {
  const t = useTranslations("board.workers");
  const sorted = sortWorkers(workers);
  return (
    <section aria-labelledby="workers-title" className="flex flex-col gap-2">
      <h2 id="workers-title" className="text-muted text-sm font-bold tracking-wide uppercase">
        {t("title")}
      </h2>
      {sorted.length === 0 ? <p className="text-muted">{t("empty")}</p> : null}
      <ul className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap">
        {sorted.map((worker) => {
          const status = workerStatus(worker);
          return (
            <li
              key={worker.id}
              className={cn(
                "border-border bg-surface flex min-h-14 shrink-0 items-center gap-2 rounded-lg border-2 px-3",
                status === "off_shift" && "opacity-60",
              )}
            >
              <span className={cn("size-3 shrink-0 rounded-full", DOT[status])} aria-hidden />
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-semibold">{worker.fullName}</span>
                <span className="text-muted text-xs">
                  {status === "busy"
                    ? t("busy", { number: worker.activeOrderNumber ?? 0 })
                    : status === "queue"
                      ? t("queue", { count: worker.queueLength })
                      : t(status)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
