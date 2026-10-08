import { useTranslations } from "next-intl";
import type { Locale } from "@/i18n/config";
import type { RatingExplanation } from "@/lib/rating/explain";
import { explainWorkerRating, type WorkerRating } from "@/lib/rating/queries";
import { cn } from "@/lib/utils";

export function ExplanationBody({
  explanation,
  pending = false,
}: {
  explanation: RatingExplanation;
  pending?: boolean;
}) {
  const t = useTranslations("rating.explanation");
  return (
    <section
      aria-labelledby="rating-explanation-title"
      aria-busy={pending}
      className="border-border bg-surface flex flex-col gap-3 rounded-xl border-2 p-4 md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="rating-explanation-title" className="text-lg font-bold">
          {t("title")}
        </h2>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-xs font-semibold",
            explanation.source === "llm"
              ? "bg-accent text-accent-foreground"
              : "bg-surface-raised text-muted",
          )}
        >
          {explanation.source === "llm" ? t("llm") : t("template")}
        </span>
      </div>
      {explanation.source === "llm" ? (
        <p className="leading-relaxed">{explanation.text}</p>
      ) : (
        <ul className="flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
          {explanation.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

export async function WorkerExplanation({
  rating,
  locale,
}: {
  rating: WorkerRating;
  locale: Locale;
}) {
  const explanation = await explainWorkerRating(rating, locale);
  return explanation ? <ExplanationBody explanation={explanation} /> : null;
}
