import { useFormatter, useTranslations } from "next-intl";
import type { RatedBrigade, RatedOrder, WorkerRatingView } from "@/lib/rating/board";
import { maxPoints, RATING_COMPONENT_KEYS, type RatingComponentKey } from "@/lib/rating/explain";
import type { RatingWeights } from "@/lib/rating/formula";
import { cn } from "@/lib/utils";
import { ContributionBar, PointsMeter } from "./contribution-bar";
import { PENALTY_PATTERN, SERIES_COLOR } from "./palette";

const CARD = "border-border bg-surface rounded-xl border-2 p-4 md:p-6";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function MyRatingCard({
  rating,
  weights,
}: {
  rating: WorkerRatingView;
  weights: RatingWeights;
}) {
  const t = useTranslations("rating");
  const format = useFormatter();
  const me = rating.me;
  if (!me) {
    return (
      <section className={CARD}>
        <p className="text-muted">{t("my.noData")}</p>
      </section>
    );
  }
  const max = maxPoints(weights);
  const raw: Record<RatingComponentKey, string> = {
    quality: t("raw.quality", { value: round1(me.components.quality) }),
    onTime: t("raw.onTime", { count: me.onTimeCount, total: me.closedCount }),
    noRework: t("raw.noRework", { count: me.cleanCount, total: me.closedCount }),
    volume: t("raw.volume", {
      hours: round1(me.workload),
      value: Math.round(me.components.volume),
    }),
  };
  return (
    <section aria-labelledby="my-rating-title" className={cn(CARD, "flex flex-col gap-5")}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="my-rating-title"
            className="text-muted text-xs font-semibold tracking-wide uppercase"
          >
            {t("myTitle")}
          </h2>
          <p className="flex items-baseline gap-2">
            <span className="text-6xl leading-none font-bold">{format.number(me.score)}</span>
            <span className="text-muted text-sm">{t("my.outOf")}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">
            {rating.place === null
              ? t("my.noPlace")
              : t("my.place", { place: rating.place, total: rating.total })}
          </p>
          <p className="text-muted text-sm">{t("my.closed", { count: me.closedCount })}</p>
        </div>
      </div>
      {me.closedCount === 0 ? (
        <p className="text-muted">{t("my.noData")}</p>
      ) : (
        <ContributionBar
          contributions={me.contributions}
          penalty={me.components.refusalPenalty}
          className="h-4"
        />
      )}
      <div className="flex flex-col gap-3">
        <h3 className="text-muted text-sm font-bold tracking-wide uppercase">
          {t("my.breakdown")}
        </h3>
        <ul className="flex flex-col gap-4">
          {RATING_COMPONENT_KEYS.map((key) => (
            <li key={key} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-semibold">
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-sm"
                    style={{ background: SERIES_COLOR[key] }}
                  />
                  {t(`components.${key}`)}
                </span>
                <span className="font-mono font-bold tabular-nums">
                  {t("my.contribution", { points: me.contributions[key], max: max[key] })}
                </span>
              </div>
              <PointsMeter value={me.contributions[key]} max={max[key]} color={SERIES_COLOR[key]} />
              <span className="text-muted text-xs">{raw[key]}</span>
            </li>
          ))}
          {me.unexcusedRefusals > 0 ? (
            <li className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-semibold">
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-sm"
                    style={{ background: PENALTY_PATTERN }}
                  />
                  {t("components.penalty")}
                </span>
                <span className="text-danger font-mono font-bold tabular-nums">
                  {t("chart.penalty", { value: me.components.refusalPenalty })}
                </span>
              </div>
              <span className="text-muted text-xs">
                {t("raw.penalty", { count: me.unexcusedRefusals })}
              </span>
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}

export function BrigadeCard({
  brigade,
  place,
  total,
}: {
  brigade: RatedBrigade | null;
  place: number | null;
  total: number;
}) {
  const t = useTranslations("rating");
  const format = useFormatter();
  return (
    <section aria-labelledby="my-brigade-title" className={cn(CARD, "flex flex-col gap-3")}>
      <h2
        id="my-brigade-title"
        className="text-muted text-xs font-semibold tracking-wide uppercase"
      >
        {t("my.brigade")}
      </h2>
      {brigade ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{brigade.name ?? t("table.unknown")}</p>
              <p className="text-muted text-sm">
                {t("table.members", { count: brigade.memberCount })}
              </p>
            </div>
            <div className="text-right">
              <p className="font-mono text-3xl font-bold">{format.number(brigade.score)}</p>
              <p className="text-sm font-semibold">
                {place === null ? t("my.noPlace") : t("my.brigadePlace", { place, total })}
              </p>
            </div>
          </div>
          {brigade.closedCount > 0 ? (
            <ContributionBar
              contributions={brigade.contributions}
              penalty={brigade.components.refusalPenalty}
            />
          ) : null}
        </>
      ) : (
        <p className="text-muted">{t("my.noBrigade")}</p>
      )}
    </section>
  );
}

function scoreTone(score: number | null): string {
  if (score === null) return "text-muted";
  if (score >= 85) return "text-status-free";
  if (score < 60) return "text-danger";
  return "text-foreground";
}

export function RecentOrders({ orders }: { orders: RatedOrder[] }) {
  const t = useTranslations("rating");
  const workOrder = useTranslations("workOrder");
  const format = useFormatter();
  return (
    <section aria-labelledby="my-orders-title" className="flex flex-col gap-3">
      <h2 id="my-orders-title" className="text-lg font-bold">
        {t("my.orders")}
      </h2>
      {orders.length === 0 ? (
        <p className="border-border text-muted rounded-xl border-2 border-dashed p-6 text-center">
          {t("my.ordersEmpty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((order) => (
            <li
              key={order.orderId}
              className="border-border bg-surface flex items-start justify-between gap-3 rounded-xl border-2 p-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-semibold">
                  {workOrder("number", { number: order.number })}
                </span>
                <span className="text-muted truncate text-sm">
                  {order.equipmentName}
                  {order.faultCode ? (
                    <>
                      {" · "}
                      <span className="font-mono">{order.faultCode}</span>
                    </>
                  ) : null}
                </span>
                <span className="text-muted font-mono text-xs">
                  {format.dateTime(new Date(order.closedAt), {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {order.reworkCount > 0 || order.repeated || !order.onTime ? (
                  <span className="flex flex-wrap gap-1.5 pt-1">
                    {order.reworkCount > 0 ? (
                      <span className="bg-surface-raised rounded-md px-2 py-0.5 text-xs font-semibold">
                        {t("flags.rework")}
                      </span>
                    ) : null}
                    {order.repeated ? (
                      <span className="bg-danger text-danger-foreground rounded-md px-2 py-0.5 text-xs font-semibold">
                        {t("flags.repeat")}
                      </span>
                    ) : null}
                    {!order.onTime ? (
                      <span className="border-danger text-danger rounded-md border px-2 py-0.5 text-xs font-semibold">
                        {t("flags.late")}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end">
                <span className="text-muted text-xs">{t("my.scoreLabel")}</span>
                <span className={cn("font-mono text-2xl font-bold", scoreTone(order.score))}>
                  {order.score === null ? t("my.noScore") : format.number(order.score)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
