import { getFormatter, getTranslations } from "next-intl/server";
import { requireRole } from "@/lib/auth/session";
import { loadDashboard } from "@/lib/dashboard/queries";
import { parsePeriod } from "@/lib/dashboard/period";
import { LiveRefresh } from "@/components/board/live-refresh";
import { ActiveLockouts } from "@/components/dashboard/active-lockouts";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { BestWorkers } from "@/components/dashboard/best-workers";
import { DowntimeChart } from "@/components/dashboard/downtime-chart";
import { DowntimeHero } from "@/components/dashboard/downtime-hero";
import { KpiTiles } from "@/components/dashboard/kpi-tiles";
import { OpenRca } from "@/components/dashboard/open-rca";
import { Panel } from "@/components/dashboard/panel";
import { PeriodSwitcher } from "@/components/dashboard/period-switcher";
import { RiskList } from "@/components/dashboard/risk-list";
import { TopEquipment } from "@/components/dashboard/top-equipment";

const BASE_PATH = "/manager";
const EQUIPMENT_HREF = "/manager/equipment";

export async function generateMetadata() {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function ManagerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const employee = await requireRole("manager");
  const params = await searchParams;
  const days = parsePeriod(params.period);
  const now = new Date();
  const [model, t, charts, format] = await Promise.all([
    loadDashboard(days, now),
    getTranslations("dashboard"),
    getTranslations("dashboard.charts"),
    getFormatter(),
  ]);
  const date = (iso: string) =>
    format.dateTime(new Date(iso), { day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">{t("title")}</h1>
          <p className="text-muted text-sm">
            {t("range", { start: date(model.period.start), end: date(model.period.end) })}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-4">
          <LiveRefresh channel={`dashboard-${employee.id}`} />
          <PeriodSwitcher current={days} basePath={BASE_PATH} />
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <DowntimeHero
          days={days}
          closedHours={model.kpis.downtime.closedHours}
          closedCost={model.kpis.downtime.closedCost}
          open={model.kpis.downtime.open}
          equipmentDown={model.kpis.downtime.equipmentDown}
          renderedAt={now.toISOString()}
        />
        <KpiTiles kpis={model.kpis} lockouts={model.lockouts.length} rca={model.rca.length} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title={charts("activity")}>
          <ActivityChart
            data={model.series.map(({ day, issued, closed }) => ({ day, issued, closed }))}
          />
        </Panel>
        <Panel title={charts("downtime")}>
          <DowntimeChart
            data={model.series.map(({ day, downtimeCost, downtimeHours }) => ({
              day,
              downtimeCost,
              downtimeHours,
            }))}
          />
        </Panel>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <TopEquipment items={model.topEquipment} hrefBase={EQUIPMENT_HREF} />
        <BestWorkers items={model.bestWorkers} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <RiskList items={model.risks} hrefBase={EQUIPMENT_HREF} />
        <ActiveLockouts items={model.lockouts} hrefBase={EQUIPMENT_HREF} />
        <OpenRca items={model.rca} hrefBase={EQUIPMENT_HREF} />
      </div>
    </div>
  );
}
