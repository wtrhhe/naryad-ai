import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { z } from "zod";
import { buttonVariants } from "@/components/ui/button";
import { BoardFilters } from "@/components/board/board-filters";
import { BoardHotkeys } from "@/components/board/board-hotkeys";
import { Kanban } from "@/components/board/kanban";
import { LiveRefresh } from "@/components/board/live-refresh";
import { ShiftCounters } from "@/components/board/shift-counters";
import { WorkersStrip } from "@/components/board/workers-strip";
import { activeDowntime, applyFilters, buildColumns, shiftCounters } from "@/lib/board/model";
import { DowntimeTotal } from "@/components/downtime/downtime-counter";
import { loadBoard } from "@/lib/board/queries";
import { currentShiftWindow } from "@/lib/board/shift";
import { WORK_ORDER_PRIORITIES } from "@/lib/domain/work-order-schemas";
import { requireRole } from "@/lib/auth/session";

const NEW_ORDER_HREF = "/master/orders/new";
const FILTER_FIELD_ID = "board-filter-site";

const filtersSchema = z.object({
  site: z.uuid().optional().catch(undefined),
  equipment: z.uuid().optional().catch(undefined),
  assignee: z.uuid().optional().catch(undefined),
  priority: z.enum(WORK_ORDER_PRIORITIES).optional().catch(undefined),
});

export async function generateMetadata() {
  const t = await getTranslations("board");
  return { title: t("title") };
}

export default async function MasterBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const employee = await requireRole("master");
  const now = new Date();
  const shift = currentShiftWindow(now);
  const [params, data, t, format] = await Promise.all([
    searchParams,
    loadBoard(shift),
    getTranslations("board"),
    getFormatter(),
  ]);
  const filters = filtersSchema.parse(params);
  const visible = applyFilters(data.orders, {
    siteId: filters.site,
    equipmentId: filters.equipment,
    assigneeId: filters.assignee,
    priority: filters.priority,
  });
  const time = (date: Date) => format.dateTime(date, { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-col gap-5">
      <BoardHotkeys newOrderHref={NEW_ORDER_HREF} filterId={FILTER_FIELD_ID} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">{t("title")}</h1>
          <p className="text-muted text-sm">
            {t(`shift.${shift.period}`)}
            {" · "}
            {t("shift.window", { start: time(shift.start), end: time(shift.end) })}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <LiveRefresh channel={`board-${employee.id}`} />
          <Link href={NEW_ORDER_HREF} className={buttonVariants({ size: "touch" })}>
            <Plus className="size-6" aria-hidden />
            {t("newOrder")}
          </Link>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <ShiftCounters counters={shiftCounters(visible, shift, now)} />
        <DowntimeTotal items={activeDowntime(visible)} />
      </div>
      <WorkersStrip workers={data.workers} />
      <BoardFilters
        firstFieldId={FILTER_FIELD_ID}
        sites={data.sites}
        equipment={data.equipment}
        workers={data.workers.map((worker) => ({ id: worker.id, name: worker.fullName }))}
      />
      <Kanban columns={buildColumns(visible, now)} />
      <p className="text-muted hidden text-xs md:block">{t("hotkeys")}</p>
    </div>
  );
}
