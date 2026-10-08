"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import {
  composeForcedReason,
  FORCED_REASON_CODES,
  FORCED_REASON_MIN,
  type ForcedReasonCode,
} from "@/lib/ghost/settings";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ForceReasonSheet({
  onConfirm,
  onClose,
}: {
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("ghost.force");
  const titleId = useId();
  const hintId = useId();
  const [code, setCode] = useState<ForcedReasonCode | null>(null);
  const [details, setDetails] = useState("");
  const needsDetails = code === "other";
  const detailsMissing = needsDetails && details.trim().length < FORCED_REASON_MIN;
  const valid = code !== null && !detailsMissing;
  const confirm = () => {
    if (code && valid) onConfirm(composeForcedReason(t(`reasons.${code}`), details));
  };
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="absolute inset-0 z-20 flex items-end bg-black/70"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="border-border bg-surface flex max-h-full w-full flex-col gap-4 overflow-y-auto rounded-t-2xl border-t-2 px-4 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-xl font-bold">
            {t("title")}
          </h2>
          <p className="text-muted">{t("description")}</p>
        </div>
        <div role="radiogroup" aria-labelledby={titleId} className="grid gap-2 sm:grid-cols-2">
          {FORCED_REASON_CODES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={code === option}
              onClick={() => setCode(option)}
              className={cn(
                "min-h-touch rounded-lg border-2 px-4 text-left text-lg font-semibold",
                code === option
                  ? "border-accent bg-accent/15 text-foreground"
                  : "border-border bg-surface-raised text-foreground",
              )}
            >
              {t(`reasons.${option}`)}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-2">
          <span className="font-semibold">{t("details")}</span>
          <textarea
            rows={2}
            maxLength={300}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            aria-invalid={detailsMissing}
            aria-describedby={detailsMissing ? hintId : undefined}
            className="border-border-strong bg-background text-foreground focus:border-accent aria-invalid:border-danger min-h-touch rounded-lg border-2 px-4 py-3 text-lg focus:outline-none"
          />
        </label>
        {detailsMissing ? (
          <p id={hintId} className="text-muted text-sm">
            {t("detailsRequired")}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={onClose}>
            {t("back")}
          </Button>
          <Button variant="danger" disabled={!valid} onClick={confirm}>
            {t("confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
