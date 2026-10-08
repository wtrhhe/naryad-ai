import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import { PriorityBadge } from "@/components/work-orders/priority-badge";
import { StatusBadge } from "@/components/work-orders/status-badge";
import { DowntimeCounter } from "@/components/downtime/downtime-counter";
import { effectiveDueAt, isOverdue } from "@/lib/domain/overdue";
import type { OrderBundle } from "@/lib/orders/detail";

export async function OrderView({ bundle }: { bundle: OrderBundle }) {
  const { order, events, photos, materials } = bundle;
  const [t, workOrder, format] = await Promise.all([
    getTranslations("workerApp"),
    getTranslations("workOrder"),
    getFormatter(),
  ]);
  const now = new Date();
  const due = effectiveDueAt(order);
  const overdue = isOverdue(order, now);
  const dateTime = (value: string) =>
    format.dateTime(new Date(value), {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  const groups = (["before", "after", "loto"] as const)
    .map((kind) => ({ kind, items: photos.filter((photo) => photo.kind === kind && photo.url) }))
    .filter((group) => group.items.length > 0);
  return (
    <div className="flex flex-col gap-5">
      <header
        className={
          order.priority === "emergency"
            ? "border-status-emergency bg-status-emergency/10 flex flex-col gap-3 rounded-xl border-2 p-4"
            : "border-border bg-surface flex flex-col gap-3 rounded-xl border-2 p-4"
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-bold">
            {workOrder("number", { number: order.number })}
          </h1>
          <PriorityBadge priority={order.priority} />
          <StatusBadge status={order.status} overdue={overdue} />
        </div>
        <p className="text-lg font-semibold">{order.equipment.name}</p>
        <p className="text-muted text-sm">
          {order.siteName}
          {" · "}
          {order.equipment.inventoryNumber}
          {" · "}
          {workOrder(`kind.${order.kind}`)}
        </p>
        <p className="text-base leading-relaxed whitespace-pre-line">{order.description}</p>
        {order.downtimeStartedAt ? (
          <DowntimeCounter
            startedAt={order.downtimeStartedAt}
            endedAt={order.downtimeEndedAt}
            costPerHour={order.equipment.costPerHour}
          />
        ) : null}
      </header>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted">{workOrder("fields.assignee")}</dt>
          <dd className="font-semibold">{order.assigneeName ?? t("nobody")}</dd>
        </div>
        <div>
          <dt className="text-muted">{workOrder("fields.master")}</dt>
          <dd className="font-semibold">{order.masterName}</dd>
        </div>
        <div>
          <dt className="text-muted">{workOrder("fields.issuedAt")}</dt>
          <dd className="font-mono font-semibold">{dateTime(order.issuedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">{workOrder("fields.dueAt")}</dt>
          <dd className={overdue ? "text-danger font-mono font-bold" : "font-mono font-semibold"}>
            {due ? dateTime(due.toISOString()) : t("noDeadline")}
          </dd>
        </div>
      </dl>

      {order.lastComment ? (
        <p className="border-border bg-surface rounded-lg border-2 p-3 text-sm">
          <span className="text-muted">{t("lastComment")}</span>
          {": "}
          {order.lastComment}
        </p>
      ) : null}

      {order.workPerformed ? (
        <section className="border-border bg-surface flex flex-col gap-2 rounded-xl border-2 p-4">
          <h2 className="font-bold">{workOrder("fields.workPerformed")}</h2>
          <p className="whitespace-pre-line">{order.workPerformed}</p>
          {order.faultCode ? (
            <p className="text-sm">
              <span className="text-muted">{workOrder("fields.faultCode")}</span>
              {": "}
              <span className="font-mono font-semibold">{order.faultCode.code}</span>
              {" — "}
              {order.faultCode.name}
            </p>
          ) : null}
          {materials.length > 0 ? (
            <ul className="text-sm">
              {materials.map((line) => (
                <li key={line.name}>
                  {line.name}
                  {" — "}
                  <span className="font-mono">
                    {line.quantity} {line.unit}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {order.closeComment ? <p className="text-muted text-sm">{order.closeComment}</p> : null}
        </section>
      ) : null}

      {groups.map((group) => (
        <section key={group.kind} className="flex flex-col gap-2">
          <h2 className="font-bold">{t(`photos.${group.kind}`)}</h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {group.items.map((photo) => (
              <a
                key={photo.id}
                href={photo.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="relative aspect-square overflow-hidden rounded-lg"
              >
                <Image src={photo.url ?? ""} alt="" fill unoptimized className="object-cover" />
              </a>
            ))}
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">{workOrder("timeline.title")}</h2>
        <ol className="border-border flex flex-col gap-2 border-l-2 pl-4">
          {events.map((event) => (
            <li key={event.id} className="text-sm">
              <span className="text-muted font-mono">{dateTime(event.occurredAt)}</span>{" "}
              <span className="font-semibold">{workOrder(`action.${event.action}`)}</span>
              {event.toStatus ? (
                <>
                  {" — "}
                  {workOrder(`status.${event.toStatus}`)}
                </>
              ) : null}
              {" · "}
              {event.actorName ?? workOrder("timeline.system")}
              {event.reason ? <span className="block">{event.reason}</span> : null}
              {event.comment ? <span className="text-muted block">{event.comment}</span> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
