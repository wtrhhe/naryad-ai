"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Sparkles } from "lucide-react";
import { createWorkOrder } from "@/app/actions/work-orders";
import { rankAssignees } from "@/lib/domain/assignment-rank";
import type { AssigneeCandidate, EquipmentType, Specialty } from "@/lib/domain/assignment";
import { suggestOrderFieldsSync } from "@/lib/domain/suggest/rules";
import { WORK_ORDER_KINDS, WORK_ORDER_PRIORITIES } from "@/lib/domain/work-order-schemas";
import type { ActionErrorCode } from "@/lib/domain/action-result";
import { uploadOrderPhotos } from "@/lib/photos/upload";
import type { CompressedPhoto } from "@/lib/photos/types";
import { PhotoPicker } from "@/components/photos/photo-picker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface EquipmentOption {
  id: string;
  name: string;
  inventoryNumber: string;
  siteName: string;
  type: EquipmentType;
  recent: boolean;
}

export interface FaultOption {
  id: string;
  code: string;
  name: string;
  category: string;
  standardHours: number;
  specialty: Specialty;
}

const fieldClass =
  "border-border-strong bg-surface text-foreground focus:border-accent w-full rounded-lg border-2 px-3 py-3 text-base focus:outline-none";

export function OrderForm({
  equipment,
  faults,
  candidates,
  initialEquipmentId,
}: {
  equipment: EquipmentOption[];
  faults: FaultOption[];
  candidates: AssigneeCandidate[];
  initialEquipmentId: string | null;
}) {
  const t = useTranslations("orderCreate");
  const workOrder = useTranslations("workOrder");
  const errors = useTranslations("workOrder.errors");
  const router = useRouter();
  const [photos, setPhotos] = useState<readonly CompressedPhoto[]>([]);
  const [description, setDescription] = useState("");
  const [equipmentId, setEquipmentId] = useState(initialEquipmentId ?? "");
  const [assigneeChoice, setAssigneeChoice] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [kindOverride, setKindOverride] = useState<(typeof WORK_ORDER_KINDS)[number] | null>(null);
  const [priorityOverride, setPriorityOverride] = useState<
    (typeof WORK_ORDER_PRIORITIES)[number] | null
  >(null);
  const [hoursOverride, setHoursOverride] = useState<string>("");
  const [dueAt, setDueAt] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<ActionErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = equipment.find((item) => item.id === equipmentId) ?? null;
  const suggestion = useMemo(
    () =>
      suggestOrderFieldsSync({
        description,
        equipmentType: selected?.type ?? null,
        faultCodes: faults,
      }),
    [description, selected?.type, faults],
  );
  const fault = faults.find((item) => item.id === suggestion.faultCodeId) ?? null;
  const ranked = useMemo(
    () =>
      rankAssignees(candidates, {
        specialty: fault?.specialty ?? null,
        equipmentType: selected?.type ?? "other",
      }),
    [candidates, fault?.specialty, selected?.type],
  );
  const kind = kindOverride ?? suggestion.kind;
  const priority = priorityOverride ?? suggestion.priority;
  const hours = hoursOverride ? Number(hoursOverride) : (suggestion.standardHours ?? 2);
  const assigneeId =
    assigneeChoice ?? ranked.find((entry) => entry.selectable)?.candidate.employeeId ?? "";
  const quick = (
    equipment.some((item) => item.recent) ? equipment.filter((item) => item.recent) : equipment
  ).slice(0, 6);
  const valid = description.trim().length >= 3 && equipmentId !== "" && assigneeId !== "";

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await createWorkOrder({
        kind,
        priority,
        description: description.trim(),
        comment: comment.trim() || undefined,
        equipmentId,
        assigneeId,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        standardHours: dueAt ? undefined : hours,
        suggestedFaultCodeId: suggestion.faultCodeId ?? undefined,
        suggestedStandardHours: suggestion.standardHours ?? undefined,
        suggestion: { ...suggestion, matchedKeywords: [...suggestion.matchedKeywords] },
        deviceAt: new Date().toISOString(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const upload = await uploadOrderPhotos(result.data.id, "before", photos);
      if (!upload.ok) setError(upload.error);
      router.push(`/master/orders/${result.data.id}`);
    });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-24">
      <PhotoPicker
        max={5}
        value={photos}
        onChange={setPhotos}
        label={workOrder("fields.photosBefore")}
      />

      <label className="flex flex-col gap-1 font-semibold">
        {workOrder("fields.description")}
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          placeholder={t("descriptionPlaceholder")}
          className={fieldClass}
        />
      </label>

      {description.trim().length >= 3 ? (
        <div className="border-accent bg-accent/10 flex flex-wrap items-center gap-2 rounded-lg border-2 p-3 text-sm">
          <Sparkles className="text-accent size-5" aria-hidden />
          <span className="font-semibold">{t("suggestion")}</span>
          <span>{workOrder(`kind.${kind}`)}</span>
          {" · "}
          <span>{workOrder(`priority.${priority}`)}</span>
          {fault ? (
            <>
              {" · "}
              <span className="font-mono">{fault.code}</span>
              <span>{fault.name}</span>
            </>
          ) : null}
          {" · "}
          <span>{t("hours", { hours })}</span>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="font-semibold">{workOrder("fields.equipment")}</span>
        {quick.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {quick.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setEquipmentId(item.id)}
                className={cn(
                  "min-h-14 rounded-lg border-2 px-3 text-left text-sm font-semibold",
                  item.id === equipmentId
                    ? "border-accent bg-accent/15"
                    : "border-border bg-surface",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        ) : null}
        <select
          value={equipmentId}
          onChange={(event) => setEquipmentId(event.target.value)}
          className={cn(fieldClass, "min-h-touch")}
        >
          <option value="">{t("chooseEquipment")}</option>
          {equipment.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {" · "}
              {item.siteName}
            </option>
          ))}
        </select>
        {selected ? (
          <span className="text-muted text-sm">
            {workOrder("fields.site")}
            {": "}
            {selected.siteName}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-semibold">{workOrder("fields.assignee")}</span>
        {ranked.slice(0, 6).map((entry, index) => {
          const status = entry.availability;
          return (
            <button
              key={entry.candidate.employeeId}
              type="button"
              disabled={!entry.selectable}
              onClick={() => setAssigneeChoice(entry.candidate.employeeId)}
              className={cn(
                "flex min-h-16 items-center justify-between gap-3 rounded-lg border-2 px-3 text-left disabled:opacity-50",
                entry.candidate.employeeId === assigneeId
                  ? "border-accent bg-accent/15"
                  : "border-border bg-surface",
              )}
            >
              <span>
                <span className="block font-semibold">
                  {entry.candidate.fullName}
                  {index === 0 && entry.selectable ? (
                    <span className="text-accent ml-2 text-xs uppercase">{t("recommended")}</span>
                  ) : null}
                </span>
                <span className="text-muted text-sm">
                  {status.kind === "busy"
                    ? t("status.busy", { number: status.orderNumber })
                    : status.kind === "queued"
                      ? t("status.queued", { count: status.length })
                      : status.kind === "no_permit"
                        ? t("status.no_permit")
                        : t(`status.${status.kind}`)}
                  {entry.candidate.closedOnType > 0
                    ? ` · ${t("closedOnType", { count: entry.candidate.closedOnType })}`
                    : ""}
                </span>
              </span>
              <span
                className={cn(
                  "size-3 shrink-0 rounded-full",
                  status.kind === "free"
                    ? "bg-status-free"
                    : status.kind === "busy"
                      ? "bg-status-busy"
                      : status.kind === "queued"
                        ? "bg-status-queue"
                        : "bg-status-off",
                )}
              />
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowDetails((value) => !value)}
        className="text-muted flex items-center gap-2 font-semibold"
      >
        <ChevronDown
          className={cn("size-5 transition-transform", showDetails && "rotate-180")}
          aria-hidden
        />
        {t("details")}
      </button>
      {showDetails ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {workOrder("fields.kind")}
            <select
              value={kind}
              onChange={(event) => setKindOverride(event.target.value as typeof kind)}
              className={fieldClass}
            >
              {WORK_ORDER_KINDS.map((item) => (
                <option key={item} value={item}>
                  {workOrder(`kind.${item}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {workOrder("fields.priority")}
            <select
              value={priority}
              onChange={(event) => setPriorityOverride(event.target.value as typeof priority)}
              className={fieldClass}
            >
              {WORK_ORDER_PRIORITIES.map((item) => (
                <option key={item} value={item}>
                  {workOrder(`priority.${item}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {workOrder("fields.standardHours")}
            <input
              type="number"
              min={0.25}
              step={0.25}
              value={hoursOverride || String(hours)}
              onChange={(event) => setHoursOverride(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {workOrder("fields.dueAt")}
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold sm:col-span-2">
            {workOrder("fields.comment")}
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={2}
              className={fieldClass}
            />
          </label>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="border-danger bg-danger/10 rounded-lg border-2 p-3 font-semibold"
        >
          {errors(error)}
        </p>
      ) : null}

      <div className="bg-background/95 fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 p-3 md:static md:bg-transparent md:p-0">
        <Button
          block
          variant={priority === "emergency" ? "danger" : "primary"}
          disabled={!valid || pending}
          onClick={submit}
        >
          {pending ? t("issuing") : t("issue")}
        </Button>
      </div>
    </div>
  );
}
