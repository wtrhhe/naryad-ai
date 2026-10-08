import { createTranslator } from "next-intl";
import ruReview from "@/messages/ru/review.json";
import kkReview from "@/messages/kk/review.json";
import { TIME_ZONE, type Locale } from "@/i18n/config";

type ReviewMessages = { review: typeof ruReview };

const MESSAGES: Record<Locale, ReviewMessages> = {
  ru: { review: ruReview },
  kk: { review: kkReview },
};

function buildTranslator(locale: Locale) {
  return createTranslator({
    locale,
    timeZone: TIME_ZONE,
    messages: MESSAGES[locale],
    namespace: "review",
  });
}

export type ReviewTranslator = ReturnType<typeof buildTranslator>;

const cache = new Map<Locale, ReviewTranslator>();

export function reviewTranslator(locale: Locale): ReviewTranslator {
  const cached = cache.get(locale);
  if (cached) {
    return cached;
  }
  const translator = buildTranslator(locale);
  cache.set(locale, translator);
  return translator;
}
