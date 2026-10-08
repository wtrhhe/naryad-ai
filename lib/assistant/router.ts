import type { Locale } from "@/i18n/config";
import { productionDate } from "@/lib/assistant/time";
import type { Priority, Specialty, ToolName } from "@/lib/assistant/types";

export interface RoutedCall {
  tool: ToolName;
  input: Record<string, string | number>;
}

const START = "(?<!\\p{L})";
const END = "(?!\\p{L})";

function stems(source: string): RegExp {
  return new RegExp(`${START}(?:${source})`, "iu");
}

function words(source: string): RegExp {
  return new RegExp(`${START}(?:${source})${END}`, "iu");
}

const KAZAKH_LETTERS = /[әғқңөұүһі]/iu;
const KAZAKH_WORDS = words(
  "кім|бос|есеп|бойынша|жаса|кеше|бүгін|апта\\p{L}*|мерзім\\p{L}*|жабдық\\p{L}*|учаскес\\p{L}*|наряд\\p{L}*\\s+жаса\\p{L}*",
);

const DRAFT = new RegExp(
  [
    `${START}(?:созда\\p{L}*|сформир\\p{L}*|оформ\\p{L}*|выпи[шс]\\p{L}*|подготов\\p{L}*|состав\\p{L}*|завед\\p{L}*|заведи|откр[оы]\\p{L}*|нужен|новый|заготов\\p{L}*)\\s+(?:черновик\\p{L}*\\s+)?(?:нов\\p{L}*\\s+)?наряд\\p{L}*`,
    `${START}черновик\\p{L}*\\s+наряд\\p{L}*`,
    `^\\s*наряд\\s+на${END}`,
    `${START}наряд\\p{L}*\\s+(?:жаса\\p{L}*|дайында\\p{L}*|толтыр\\p{L}*|(?:құр|аш)(?:у|ыңыз|шы)?${END})`,
    `${START}жаңа\\s+наряд\\p{L}*`,
    `${START}наряд\\s+жобас\\p{L}*`,
  ].join("|"),
  "iu",
);

const REPORT = stems(
  "отчет\\p{L}*|сводк\\p{L}*|итог\\p{L}*|рапорт\\p{L}*|как\\s+прош\\p{L}*|есеп\\p{L}*|қорытынды\\p{L}*|шолу",
);

const OVERDUE = stems(
  "просроч\\p{L}*|просрок\\p{L}*|опаздыва\\p{L}*|опоздан\\p{L}*|горит\\s+срок|сорва\\p{L}*\\s+срок|не\\s+успева\\p{L}*|срок\\p{L}*\\s+(?:истек|прошел|вышел)|мерзім\\p{L}*\\s+өт\\p{L}*|кешік\\p{L}*|кешіг\\p{L}*",
);

const FREE = stems(
  `свобод\\p{L}*|незанят\\p{L}*|не\\s+занят\\p{L}*|кого\\s+(?:можно\\s+)?(?:назнач|отправ|постав|посла)\\p{L}*|кто\\s+может|кто\\s+(?:сейчас\\s+)?на\\s+смене|бос${END}|бостар\\p{L}*|кім\\s+бар|ауысымда\\s+кім`,
);

const PROBLEMS = stems(
  "проблем\\p{L}*|что\\s+не\\s+так|узк\\p{L}*\\s+мест\\p{L}*|слаб\\p{L}*\\s+мест\\p{L}*|авари\\p{L}*|отказ\\p{L}*|поломк\\p{L}*|простои|простоя|анализ\\p{L}*|аналитик\\p{L}*|мәселе\\p{L}*|ақау\\p{L}*|талда\\p{L}*",
);

const HISTORY = stems(
  "истори\\p{L}*|что\\s+(?:было|случалось|делали|ремонтировали)|ремонт\\p{L}*|память\\s+оборуд\\p{L}*|тарих\\p{L}*|паспорт\\p{L}*|что\\s+с\\s|как\\s+(?:там|работает)",
);

const SPECIALTY_PATTERNS: ReadonlyArray<readonly [Specialty, RegExp]> = [
  ["electrician", stems("электр(?:ик|омонт|ослесар|омеханик)\\p{L}*")],
  ["hydraulic", stems("гидравлик\\p{L}*")],
  ["welder", stems("(?:сварщ|сварк|сварочн|электросвар|дәнекерле)\\p{L}*")],
  ["lubricator", stems("(?:смазчик|смазк|майлау)\\p{L}*")],
  [
    "instrumentation",
    stems(`кипиа|киповц\\p{L}*|кип${END}|прибор\\p{L}*|наладчик\\p{L}*|автоматчик\\p{L}*|асутп`),
  ],
  ["fitter", stems("(?:слесар|механик)\\p{L}*")],
];

const SITE_LEXICON: ReadonlyArray<readonly [string, RegExp]> = [
  ["дробление", stems("дроблен\\p{L}*|дробильн\\p{L}*|ұсақта\\p{L}*")],
  ["обогащение", stems("обогащ\\p{L}*|обогатит\\p{L}*|байыт\\p{L}*")],
  ["РМЦ", stems("рмц(?![-\\p{L}\\d])|ремонтно[- ]механ\\p{L}*|жөндеу[- ]механ\\p{L}*")],
  ["погрузка", stems("погрузк\\p{L}*|погрузоч\\p{L}*|отгрузк\\p{L}*|тиеу\\p{L}*")],
];

const GENERIC_SITE_RU = /(?<!\p{L})участ\p{L}*\s+(?:№\s*)?([\p{L}\d-]{2,})/iu;
const GENERIC_SITE_KK = /([\p{L}\d-]{2,})\s+учаске\p{L}*/iu;

const PRIORITY_PATTERNS: ReadonlyArray<readonly [Priority, RegExp]> = [
  [
    "emergency",
    stems(
      "авари\\p{L}*|апат\\p{L}*|пожар\\p{L}*|возгоран\\p{L}*|задымлен\\p{L}*|травм\\p{L}*|шұғыл\\p{L}*|встал[аи]?\\s+(?:линия|фабрика)|стоит\\s+(?:линия|фабрика)",
    ),
  ],
  ["high", stems("срочн\\p{L}*|немедленн\\p{L}*|жедел\\p{L}*|тез\\s+арада")],
  ["planned", stems("планов\\p{L}*|ппр|жоспарл\\p{L}*")],
];

const EQUIPMENT_NOUN =
  /^(?:конвейер|транспортер|насос|сорғ|дробилк|ұсатқыш|мельниц|диірмен|грохот|питател|классификатор|гидроциклон|вентилятор|компрессор|кран|вагоноопрокид|лент)/iu;

const CODE_MENTION =
  /(?<![\p{L}\d])(\p{L}{1,5})(\s?[-–]\s?|\s)?(\d{1,5}(?:[x×х]\d{1,5})?)(?![\p{L}\d])/giu;

const SPACED_CODE_STOP = new Set([
  "за",
  "на",
  "по",
  "в",
  "с",
  "до",
  "от",
  "и",
  "у",
  "из",
  "о",
  "об",
  "со",
  "во",
  "не",
  "уже",
  "еще",
  "при",
  "про",
  "без",
  "над",
  "под",
  "для",
  "все",
  "чем",
  "как",
  "так",
  "что",
  "кто",
  "это",
  "бір",
  "екі",
  "үш",
  "мен",
  "тек",
  "соңғы",
]);

const FILLER = new RegExp(
  `^(?:покаж\\p{L}*|расскаж\\p{L}*|дай|дайте|выведи|найди|открой|истори\\p{L}*|что|было|были|случалось|делали|ремонтировали|с|со|по|за|на|у|о|об|мне|нам|пожалуйста|последн\\p{L}*|ремонт\\p{L}*|поломк\\p{L}*|оборудовани\\p{L}*|тарих\\p{L}*|көрсет\\p{L}*|бойынша|соңғы|как\\p{L}*|все|весь|дн\\p{L}*|день|недел\\p{L}*|месяц\\p{L}*|сут\\p{L}*|ай\\p{L}*|апта\\p{L}*|күн\\p{L}*|паспорт\\p{L}*|память|памяти|сейчас|там|работает|\\d+)$`,
  "iu",
);

function prepare(text: string): string {
  return text.replace(/ё/g, "е").replace(/Ё/g, "Е").replace(/\s+/g, " ").trim();
}

function compact(input: Record<string, string | number | null | undefined>) {
  return Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, string | number] => entry[1] != null),
  );
}

export function detectLocale(text: string, fallback: Locale): Locale {
  if (KAZAKH_LETTERS.test(text) || KAZAKH_WORDS.test(prepare(text))) {
    return "kk";
  }
  return /\p{Script=Cyrillic}/u.test(text) ? "ru" : fallback;
}

export function detectSpecialty(text: string): Specialty | null {
  const prepared = prepare(text);
  return SPECIALTY_PATTERNS.find(([, pattern]) => pattern.test(prepared))?.[0] ?? null;
}

export function detectPriority(text: string): Priority | null {
  const prepared = prepare(text);
  return PRIORITY_PATTERNS.find(([, pattern]) => pattern.test(prepared))?.[0] ?? null;
}

export function extractSite(text: string): string | null {
  const prepared = prepare(text);
  const known = SITE_LEXICON.find(([, pattern]) => pattern.test(prepared));
  if (known) {
    return known[0];
  }
  const generic = GENERIC_SITE_RU.exec(prepared)?.[1] ?? GENERIC_SITE_KK.exec(prepared)?.[1];
  return generic && !SPACED_CODE_STOP.has(generic.toLowerCase()) ? generic : null;
}

const UNIT_DAYS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(?:дн|день|сут|күн)/iu, 1],
  [/^(?:недел|апта)/iu, 7],
  [/^(?:месяц|мес|ай)/iu, 30],
];

function clampDays(days: number): number {
  return Math.min(365, Math.max(1, Math.round(days)));
}

export function extractDays(text: string): number | null {
  const prepared = prepare(text);
  for (const numeric of prepared.matchAll(/(?<![\d\p{L}-])(\d{1,3})\s?-?\s?(\p{L}+)/giu)) {
    const factor = UNIT_DAYS.find(([pattern]) => pattern.test(numeric[2] ?? ""))?.[1];
    if (factor) {
      return clampDays(Number(numeric[1]) * factor);
    }
  }
  const rules: ReadonlyArray<readonly [RegExp, number]> = [
    [stems("две\\s+недел\\p{L}*|екі\\s+апта\\p{L}*"), 14],
    [stems("квартал\\p{L}*|тоқсан\\p{L}*|три\\s+месяц\\p{L}*|үш\\s+ай\\p{L}*"), 90],
    [stems("полгода|полугод\\p{L}*|жарты\\s+жыл\\p{L}*"), 180],
    [words("год|года|год\\p{L}*|жыл|жылдағы|жылғы"), 365],
    [stems("недел\\p{L}*|апта\\p{L}*"), 7],
    [stems("месяц\\p{L}*"), 30],
    [words("ай|айда|айдағы|айлық|айға|айдың|айын"), 30],
    [stems("сутки|сегодня|бүгін\\p{L}*|за\\s+день"), 1],
  ];
  return rules.find(([pattern]) => pattern.test(prepared))?.[1] ?? null;
}

export function extractDate(text: string, now: Date): string | null {
  const prepared = prepare(text);
  if (stems("позавчера|алдыңғы\\s+күн\\p{L}*").test(prepared)) {
    return productionDate(now, -2);
  }
  if (stems(`вчера\\p{L}*|кеше${END}|кешегі`).test(prepared)) {
    return productionDate(now, -1);
  }
  if (stems("сегодня|бүгін\\p{L}*|за\\s+сутки|за\\s+день").test(prepared)) {
    return productionDate(now);
  }
  const iso = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(prepared);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const dotted = /(?<![\d.])(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?(?![\d])/.exec(prepared);
  if (dotted?.[1] && dotted[2]) {
    const year = dotted[3]
      ? dotted[3].length === 2
        ? `20${dotted[3]}`
        : dotted[3]
      : productionDate(now).slice(0, 4);
    return `${year}-${dotted[2].padStart(2, "0")}-${dotted[1].padStart(2, "0")}`;
  }
  return null;
}

export function extractEquipment(text: string): string | null {
  const prepared = prepare(text);
  for (const match of prepared.matchAll(CODE_MENTION)) {
    const letters = match[1] ?? "";
    const separator = match[2] ?? "";
    const spaced = separator.length > 0 && !/[-–]/.test(separator);
    if (spaced && (letters.length > 3 || SPACED_CODE_STOP.has(letters.toLowerCase()))) {
      continue;
    }
    const code = match[0];
    const before = prepared.slice(0, match.index);
    const noun = /(\p{L}+)\s+$/u.exec(before)?.[1];
    return noun && EQUIPMENT_NOUN.test(noun) ? `${noun} ${code}` : code;
  }
  return null;
}

function remainder(text: string): string | null {
  const kept = prepare(text)
    .split(" ")
    .map((token) => token.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, ""))
    .filter((token) => token.length > 0 && !FILLER.test(token));
  const joined = kept.join(" ");
  return joined.length >= 2 ? joined : null;
}

function cleanDescription(value: string): string {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s:,.;–—-]+/u, "")
    .replace(/^(?:на|по|для)(?!\p{L})\s*[:,–—-]?\s*/iu, "")
    .replace(/^[\s:,.;–—-]+/u, "")
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function draftCall(prepared: string): RoutedCall {
  const match = DRAFT.exec(prepared);
  const start = match?.index ?? 0;
  const end = start + (match?.[0].length ?? 0);
  const combined = cleanDescription(`${prepared.slice(0, start)} ${prepared.slice(end)}`);
  return {
    tool: "create_work_order_draft",
    input: compact({
      description: combined.length >= 3 ? combined : prepared,
      equipment: extractEquipment(prepared),
      priority: detectPriority(prepared),
    }),
  };
}

function historyCall(equipment: string, days: number | null): RoutedCall {
  return { tool: "equipment_history", input: compact({ equipment, days }) };
}

export function routeQuestion(text: string, now: Date): RoutedCall | null {
  const prepared = prepare(text);
  if (prepared.length === 0) {
    return null;
  }
  const site = extractSite(prepared);
  const days = extractDays(prepared);
  const equipment = extractEquipment(prepared);
  if (DRAFT.test(prepared)) {
    return draftCall(prepared);
  }
  if (REPORT.test(prepared)) {
    if (site || (days !== null && days > 1)) {
      return { tool: "site_problems", input: compact({ site, period_days: days ?? 7 }) };
    }
    if (equipment) {
      return historyCall(equipment, days);
    }
    return { tool: "shift_report", input: compact({ date: extractDate(prepared, now) }) };
  }
  if (OVERDUE.test(prepared)) {
    return { tool: "list_overdue", input: compact({ site }) };
  }
  if (FREE.test(prepared)) {
    return {
      tool: "find_free_workers",
      input: compact({ specialty: detectSpecialty(prepared), site }),
    };
  }
  if (PROBLEMS.test(prepared)) {
    if (!site && equipment) {
      return historyCall(equipment, days);
    }
    return { tool: "site_problems", input: compact({ site, period_days: days ?? 30 }) };
  }
  if (HISTORY.test(prepared)) {
    const target = equipment ?? remainder(prepared);
    return target ? historyCall(target, days) : null;
  }
  if (equipment) {
    return historyCall(equipment, days);
  }
  const specialty = detectSpecialty(prepared);
  if (specialty) {
    return { tool: "find_free_workers", input: compact({ specialty, site }) };
  }
  if (site) {
    return { tool: "site_problems", input: compact({ site, period_days: days ?? 30 }) };
  }
  return null;
}
