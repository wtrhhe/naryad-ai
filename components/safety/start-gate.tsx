"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CheckCircle2, Lock, ShieldAlert } from "lucide-react";
import { loadStartGate, lockoutAndStart } from "@/app/actions/safety";
import { nextGateStep, type StartGate as Gate } from "@/lib/safety/gate";
import { uploadOrderPhotos } from "@/lib/photos/upload";
import type { CompressedPhoto } from "@/lib/photos/types";
import type { ActionErrorCode } from "@/lib/domain/action-result";
import { PhotoPicker } from "@/components/photos/photo-picker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function PermitList({ gate }: { gate: Gate }) {
  const t = useTranslations("safety.gate");
  const format = useFormatter();
  if (gate.missing_permits.length === 0) {
    return (
      <p className="text-status-free flex items-center gap-2 font-semibold">
        <CheckCircle2 className="size-6" aria-hidden />
        {t("permitsOk")}
      </p>
    );
  }
  return (
    <div
      role="alert"
      className="border-danger bg-danger/10 flex flex-col gap-2 rounded-lg border-2 p-4"
    >
      <p className="text-danger flex items-center gap-2 font-bold">
        <ShieldAlert className="size-6" aria-hidden />
        {t("permitsBlocked")}
      </p>
      <ul className="list-disc pl-6">
        {gate.missing_permits.map((permit) => (
          <li key={permit.code}>
            {permit.expired_on
              ? t("permitExpired", {
                  name: permit.name,
                  date: format.dateTime(new Date(permit.expired_on), { dateStyle: "short" }),
                })
              : t("permitAbsent", { name: permit.name })}
          </li>
        ))}
      </ul>
      <p className="text-muted text-sm">{t("askMaster")}</p>
    </div>
  );
}

function Checklist({
  gate,
  checked,
  onToggle,
}: {
  gate: Gate;
  checked: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("safety.gate");
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-lg font-bold">{t("checklistTitle")}</legend>
      {gate.checklist.map((item) => (
        <label
          key={item.id}
          className={cn(
            "min-h-touch flex cursor-pointer items-center gap-4 rounded-lg border-2 px-4",
            checked.has(item.id)
              ? "border-status-free bg-status-free/10"
              : "border-border bg-surface",
          )}
        >
          <input
            type="checkbox"
            className="size-7 accent-current"
            checked={checked.has(item.id)}
            onChange={() => onToggle(item.id)}
          />
          <span className="text-base font-medium">{item.text}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function StartGate({ orderId, onStarted }: { orderId: string; onStarted: () => void }) {
  const t = useTranslations("safety.gate");
  const errors = useTranslations("workOrder.errors");
  const [gate, setGate] = useState<Gate | null>(null);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [photos, setPhotos] = useState<readonly CompressedPhoto[]>([]);
  const [error, setError] = useState<ActionErrorCode | null>(null);
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    let active = true;
    void loadStartGate(orderId).then((result) => {
      if (!active) return;
      if (result.ok) setGate(result.data);
      else setError(result.error);
    });
    return () => {
      active = false;
    };
  }, [orderId]);
  if (!gate) {
    return <p className="text-muted animate-pulse">{error ? errors(error) : t("loading")}</p>;
  }
  const step = nextGateStep(gate, checked, photos.length > 0);
  const toggle = (id: string) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const start = () =>
    startTransition(async () => {
      setError(null);
      const needsPhoto = gate.lockout_required && !gate.lockout_active;
      const upload = needsPhoto ? await uploadOrderPhotos(orderId, "loto", photos) : null;
      if (upload && !upload.ok) return setError(upload.error);
      const result = await lockoutAndStart({
        orderId,
        photoId: upload?.ok ? (upload.data.photoIds[0] ?? null) : null,
        checklist: [...checked],
        aiCheck: null,
      });
      if (result.ok) onStarted();
      else setError(result.error);
    });
  return (
    <section className="flex flex-col gap-6" aria-labelledby="gate-title">
      <h2 id="gate-title" className="text-2xl font-bold">
        {t("title")}
      </h2>
      <PermitList gate={gate} />
      {step === "permits_blocked" ? null : (
        <>
          <Checklist gate={gate} checked={checked} onToggle={toggle} />
          <div className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-lg font-bold">
              <Lock className="size-5" aria-hidden />
              {t("lockoutTitle")}
            </h3>
            {!gate.lockout_required ? (
              <p className="text-muted">{t("lockoutNotRequired")}</p>
            ) : null}
            {gate.lockout_required && gate.lockout_active ? (
              <p className="text-status-free">{t("lockoutActive")}</p>
            ) : null}
            {gate.lockout_required && !gate.lockout_active ? (
              <>
                <p className="text-muted">{t("lockoutHint")}</p>
                <PhotoPicker
                  max={1}
                  value={photos}
                  onChange={setPhotos}
                  required
                  label={t("photoLabel")}
                />
              </>
            ) : null}
          </div>
          {error ? (
            <p
              role="alert"
              className="border-danger bg-danger/10 rounded-lg border-2 p-3 font-medium"
            >
              {errors(error)}
            </p>
          ) : null}
          <Button block onClick={start} disabled={step !== "ready" || isPending}>
            {isPending ? t("starting") : t("start")}
          </Button>
        </>
      )}
    </section>
  );
}
