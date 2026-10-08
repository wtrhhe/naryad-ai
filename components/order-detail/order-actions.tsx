"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Minus, Plus, Trash2 } from "lucide-react";
import { transitionWorkOrder } from "@/app/actions/work-orders";
import { availableActions, type WorkOrderStatus } from "@/lib/domain/work-order-machine";
import { WORK_ORDER_PRIORITIES } from "@/lib/domain/work-order-schemas";
import type { ActionErrorCode } from "@/lib/domain/action-result";
import type { ActionReferences } from "@/lib/orders/detail";
import { uploadOrderPhotos } from "@/lib/photos/upload";
import type { CompressedPhoto } from "@/lib/photos/types";
import { PhotoPicker } from "@/components/photos/photo-picker";
import { StartGate } from "@/components/safety/start-gate";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "reject" | "pause" | "cancel" | "complete" | "start" | "reassign" | "priority" | null;

export interface OrderActionTarget {
  id: string;
  status: WorkOrderStatus;
  kind: "planned" | "unplanned";
  priority: (typeof WORK_ORDER_PRIORITIES)[number];
  suggestedFaultCodeId: string | null;
}

export interface WorkerOption {
  id: string;
  name: string;
  hint: string;
}

const fieldClass =
  "border-border-strong bg-surface text-foreground focus:border-accent w-full rounded-lg border-2 px-3 py-3 text-base focus:outline-none";

function ReasonForm({
  reasons,
  onSubmit,
  pending,
  submitLabel,
}: {
  reasons: { id: string; label: string }[];
  onSubmit: (reason: { reasonCodeId?: string; reasonText?: string }) => void;
  pending: boolean;
  submitLabel: string;
}) {
  const t = useTranslations("workerApp");
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const valid = reasonId !== null || text.trim().length >= 3;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {reasons.map((reason) => (
          <button
            key={reason.id}
            type="button"
            onClick={() => setReasonId(reason.id === reasonId ? null : reason.id)}
            className={cn(
              "min-h-14 rounded-lg border-2 px-3 text-left font-semibold",
              reason.id === reasonId ? "border-accent bg-accent/15" : "border-border bg-surface",
            )}
          >
            {reason.label}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("reasonText")}
        rows={2}
        className={fieldClass}
      />
      <Button
        variant="danger"
        disabled={!valid || pending}
        onClick={() =>
          onSubmit({
            reasonCodeId: reasonId ?? undefined,
            reasonText: text.trim() || undefined,
          })
        }
      >
        {submitLabel}
      </Button>
    </div>
  );
}

function ClosingForm({
  order,
  references,
  pending,
  onSubmit,
}: {
  order: OrderActionTarget;
  references: ActionReferences;
  pending: boolean;
  onSubmit: (closing: {
    workPerformed: string;
    faultCodeId: string;
    materials: { materialId: string; quantity: number }[];
    closeComment?: string;
    photos: readonly CompressedPhoto[];
  }) => void;
}) {
  const t = useTranslations("workerApp");
  const fields = useTranslations("workOrder.fields");
  const [work, setWork] = useState("");
  const [faultCodeId, setFaultCodeId] = useState(order.suggestedFaultCodeId ?? "");
  const [lines, setLines] = useState<{ materialId: string; quantity: number }[]>([]);
  const [pick, setPick] = useState("");
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState<readonly CompressedPhoto[]>([]);
  const needPhoto = order.kind === "unplanned";
  const valid = work.trim().length >= 3 && faultCodeId !== "" && (!needPhoto || photos.length > 0);
  const materialById = new Map(references.materials.map((item) => [item.id, item]));
  const addLine = (materialId: string) => {
    if (!materialId || lines.some((line) => line.materialId === materialId)) return;
    setLines([...lines, { materialId, quantity: 1 }]);
    setPick("");
  };
  const step = (materialId: string, delta: number) =>
    setLines(
      lines.map((line) =>
        line.materialId === materialId
          ? { ...line, quantity: Math.max(0.5, Math.round((line.quantity + delta) * 10) / 10) }
          : line,
      ),
    );
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 font-semibold">
        {fields("workPerformed")}
        <textarea
          value={work}
          onChange={(event) => setWork(event.target.value)}
          rows={3}
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1 font-semibold">
        {fields("faultCode")}
        <select
          value={faultCodeId}
          onChange={(event) => setFaultCodeId(event.target.value)}
          className={cn(fieldClass, "min-h-touch")}
        >
          <option value="">{t("choose")}</option>
          {references.faultCodes.map((fault) => (
            <option key={fault.id} value={fault.id}>
              {fault.code}
              {" — "}
              {fault.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-2">
        <span className="font-semibold">{fields("materials")}</span>
        <select
          value={pick}
          onChange={(event) => addLine(event.target.value)}
          className={cn(fieldClass, "min-h-touch")}
        >
          <option value="">{t("addMaterial")}</option>
          {references.materials.map((material) => (
            <option key={material.id} value={material.id}>
              {material.name}
            </option>
          ))}
        </select>
        {lines.map((line) => {
          const material = materialById.get(line.materialId);
          return (
            <div
              key={line.materialId}
              className="border-border bg-surface flex items-center gap-2 rounded-lg border-2 p-2"
            >
              <span className="flex-1 text-sm font-semibold">{material?.name}</span>
              <button
                type="button"
                aria-label={t("less")}
                onClick={() => step(line.materialId, -1)}
                className="bg-surface-raised flex size-12 items-center justify-center rounded-lg"
              >
                <Minus className="size-5" aria-hidden />
              </button>
              <span className="w-16 text-center font-mono font-bold">
                {line.quantity} {material?.unit}
              </span>
              <button
                type="button"
                aria-label={t("more")}
                onClick={() => step(line.materialId, 1)}
                className="bg-surface-raised flex size-12 items-center justify-center rounded-lg"
              >
                <Plus className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={t("removeMaterial")}
                onClick={() =>
                  setLines(lines.filter((item) => item.materialId !== line.materialId))
                }
                className="text-danger flex size-12 items-center justify-center rounded-lg"
              >
                <Trash2 className="size-5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      <PhotoPicker
        max={5}
        value={photos}
        onChange={setPhotos}
        required={needPhoto}
        label={fields("photosAfter")}
      />
      <label className="flex flex-col gap-1 font-semibold">
        {fields("comment")}
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          className={fieldClass}
        />
      </label>
      <Button
        disabled={!valid || pending}
        onClick={() =>
          onSubmit({
            workPerformed: work.trim(),
            faultCodeId,
            materials: lines,
            closeComment: comment.trim() || undefined,
            photos,
          })
        }
      >
        {t("submitClosing")}
      </Button>
    </div>
  );
}

export function OrderActions({
  order,
  role,
  references,
  workers = [],
}: {
  order: OrderActionTarget;
  role: "worker" | "master";
  references: ActionReferences;
  workers?: WorkerOption[];
}) {
  const t = useTranslations("workerApp");
  const actionLabel = useTranslations("workOrder.action");
  const priorities = useTranslations("workOrder.priority");
  const errors = useTranslations("workOrder.errors");
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [error, setError] = useState<ActionErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const [assigneeId, setAssigneeId] = useState(workers[0]?.id ?? "");
  const actions = availableActions(order.status, role).filter(
    (action) => !["comment", "approve", "return_rework"].includes(action),
  );

  const send = (input: Record<string, unknown>, before?: () => Promise<boolean>) =>
    startTransition(async () => {
      setError(null);
      if (before && !(await before())) return;
      const result = await transitionWorkOrder({
        orderId: order.id,
        expectedStatus: order.status,
        deviceAt: new Date().toISOString(),
        ...input,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode(null);
      router.refresh();
    });

  const simple = (action: string) => send({ action });

  const onButton = (action: string) => {
    if (
      action === "reject" ||
      action === "pause" ||
      action === "cancel" ||
      action === "complete" ||
      action === "start" ||
      action === "reassign"
    ) {
      setMode(mode === action ? null : action);
      return;
    }
    if (action === "change_priority") {
      setMode(mode === "priority" ? null : "priority");
      return;
    }
    simple(action);
  };

  if (actions.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <Button
            key={action}
            variant={
              action === "reject" || action === "cancel"
                ? "danger"
                : action === "accept" || action === "start" || action === "complete"
                  ? "primary"
                  : "secondary"
            }
            disabled={pending}
            onClick={() => onButton(action)}
          >
            {actionLabel(action)}
          </Button>
        ))}
      </div>
      {error ? (
        <p
          role="alert"
          className="border-danger bg-danger/10 rounded-lg border-2 p-3 font-semibold"
        >
          {errors(error)}
        </p>
      ) : null}
      {mode ? (
        <div className="border-border bg-surface-raised flex flex-col gap-3 rounded-xl border-2 p-4">
          <h3 className="text-lg font-bold">
            {mode === "priority" ? actionLabel("change_priority") : actionLabel(mode)}
          </h3>
          {mode === "reject" ? (
            <ReasonForm
              reasons={references.rejectReasons}
              pending={pending}
              submitLabel={actionLabel("reject")}
              onSubmit={(reason) => send({ action: "reject", reason })}
            />
          ) : null}
          {mode === "pause" ? (
            <ReasonForm
              reasons={references.pauseReasons}
              pending={pending}
              submitLabel={actionLabel("pause")}
              onSubmit={(reason) => send({ action: "pause", reason })}
            />
          ) : null}
          {mode === "cancel" ? (
            <ReasonForm
              reasons={[]}
              pending={pending}
              submitLabel={actionLabel("cancel")}
              onSubmit={(reason) => send({ action: "cancel", reason })}
            />
          ) : null}
          {mode === "start" ? (
            <StartGate
              orderId={order.id}
              onStarted={() => {
                setMode(null);
                router.refresh();
              }}
            />
          ) : null}
          {mode === "complete" ? (
            <ClosingForm
              order={order}
              references={references}
              pending={pending}
              onSubmit={({ photos, ...closing }) =>
                send({ action: "complete", closing }, async () => {
                  const upload = await uploadOrderPhotos(order.id, "after", photos);
                  if (!upload.ok) setError(upload.error);
                  return upload.ok;
                })
              }
            />
          ) : null}
          {mode === "reassign" ? (
            <div className="flex flex-col gap-2">
              {workers.map((worker) => (
                <button
                  key={worker.id}
                  type="button"
                  onClick={() => setAssigneeId(worker.id)}
                  className={cn(
                    "min-h-14 rounded-lg border-2 px-3 text-left",
                    worker.id === assigneeId
                      ? "border-accent bg-accent/15"
                      : "border-border bg-surface",
                  )}
                >
                  <span className="block font-semibold">{worker.name}</span>
                  <span className="text-muted text-sm">{worker.hint}</span>
                </button>
              ))}
              <Button
                disabled={!assigneeId || pending}
                onClick={() => send({ action: "reassign", assigneeId })}
              >
                {actionLabel("reassign")}
              </Button>
            </div>
          ) : null}
          {mode === "priority" ? (
            <div className="grid grid-cols-2 gap-2">
              {WORK_ORDER_PRIORITIES.map((priority) => (
                <Button
                  key={priority}
                  size="md"
                  variant={priority === order.priority ? "primary" : "secondary"}
                  disabled={pending || priority === order.priority}
                  onClick={() => send({ action: "change_priority", priority })}
                >
                  {priorities(priority)}
                </Button>
              ))}
            </div>
          ) : null}
          <Button variant="ghost" size="md" onClick={() => setMode(null)}>
            {t("close")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
