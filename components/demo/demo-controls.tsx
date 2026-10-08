"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Clapperboard, Flag, RotateCcw, Timer } from "lucide-react";
import {
  markDemoBaseline,
  preloadDemoScenario,
  resetDemo,
  setDemoTimeScale,
  type DemoActionResult,
} from "@/app/actions/demo";
import { DEMO_TIME_SCALES } from "@/lib/demo/scenario";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DemoControls({
  timeScale,
  baselineLabel,
}: {
  timeScale: number;
  baselineLabel: string | null;
}) {
  const t = useTranslations("demo");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  type SuccessKey = "timeScale.saved" | "scenario.done" | "baseline.saved" | "reset.done";
  const run = (action: () => Promise<DemoActionResult>, success: SuccessKey) =>
    startTransition(async () => {
      const result = await action();
      setMessage(
        result.ok
          ? { tone: "ok", text: t(success, { count: result.count ?? 0 }) }
          : { tone: "error", text: t("failed", { reason: result.error }) },
      );
    });

  return (
    <div className="flex flex-col gap-6">
      <section className="border-border bg-surface flex flex-col gap-3 rounded-xl border-2 p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Timer className="size-5" aria-hidden />
          {t("timeScale.title")}
        </h2>
        <p className="text-muted text-sm">{t("timeScale.hint")}</p>
        <div className="grid grid-cols-4 gap-2">
          {DEMO_TIME_SCALES.map((scale) => (
            <Button
              key={scale}
              size="md"
              variant={scale === timeScale ? "primary" : "secondary"}
              disabled={isPending}
              onClick={() => run(() => setDemoTimeScale(scale), "timeScale.saved")}
            >
              {t("timeScale.value", { scale })}
            </Button>
          ))}
        </div>
      </section>

      <section className="border-border bg-surface flex flex-col gap-3 rounded-xl border-2 p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Clapperboard className="size-5" aria-hidden />
          {t("scenario.title")}
        </h2>
        <p className="text-muted text-sm">{t("scenario.hint")}</p>
        <Button disabled={isPending} onClick={() => run(preloadDemoScenario, "scenario.done")}>
          {t("scenario.preload")}
        </Button>
      </section>

      <section className="border-border bg-surface flex flex-col gap-3 rounded-xl border-2 p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Flag className="size-5" aria-hidden />
          {t("baseline.title")}
        </h2>
        <p className="text-muted text-sm">
          {baselineLabel ? t("baseline.current", { at: baselineLabel }) : t("baseline.none")}
        </p>
        <Button
          variant="secondary"
          disabled={isPending}
          onClick={() => run(markDemoBaseline, "baseline.saved")}
        >
          {t("baseline.mark")}
        </Button>
        <Button
          variant="danger"
          disabled={isPending || !baselineLabel}
          onClick={() => {
            if (!confirmReset) {
              setConfirmReset(true);
              return;
            }
            setConfirmReset(false);
            run(resetDemo, "reset.done");
          }}
        >
          <RotateCcw className="size-5" aria-hidden />
          {confirmReset ? t("reset.confirm") : t("reset.action")}
        </Button>
      </section>

      {message ? (
        <p
          role="status"
          className={cn(
            "rounded-lg border-2 p-4 font-semibold",
            message.tone === "ok"
              ? "border-status-free text-status-free"
              : "border-danger text-danger",
          )}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
