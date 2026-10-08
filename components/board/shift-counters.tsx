import { useTranslations } from "next-intl";
import type { ShiftCounters as Counters } from "@/lib/board/model";
import { cn } from "@/lib/utils";

const TILES: { key: keyof Counters; tone: string }[] = [
  { key: "issued", tone: "text-foreground" },
  { key: "done", tone: "text-status-free" },
  { key: "overdue", tone: "text-danger" },
  { key: "equipmentDown", tone: "text-accent" },
];

export function ShiftCounters({ counters }: { counters: Counters }) {
  const t = useTranslations("board.counters");
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {TILES.map(({ key, tone }) => (
        <div key={key} className="border-border bg-surface rounded-xl border-2 px-4 py-3">
          <dt className="text-muted text-xs font-semibold tracking-wide uppercase">{t(key)}</dt>
          <dd
            className={cn(
              "font-mono text-3xl font-bold",
              tone,
              key === "overdue" && counters.overdue === 0 && "text-muted",
            )}
          >
            {counters[key]}
          </dd>
        </div>
      ))}
    </dl>
  );
}
