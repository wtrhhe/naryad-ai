const LATIN_LOOKALIKES: Readonly<Record<string, string>> = {
  a: "а",
  b: "в",
  c: "с",
  e: "е",
  h: "н",
  k: "к",
  m: "м",
  o: "о",
  p: "р",
  t: "т",
  x: "х",
  y: "у",
};

const RU_ENDINGS = [
  "иями",
  "ями",
  "ами",
  "ией",
  "иях",
  "ого",
  "его",
  "ому",
  "ему",
  "ыми",
  "ими",
  "ые",
  "ие",
  "ий",
  "ый",
  "ой",
  "ая",
  "яя",
  "ое",
  "ее",
  "ую",
  "юю",
  "ом",
  "ем",
  "ам",
  "ям",
  "ах",
  "ях",
  "ов",
  "ев",
  "ей",
  "ия",
  "ью",
  "ья",
  "а",
  "я",
  "о",
  "е",
  "ы",
  "и",
  "у",
  "ю",
  "ь",
  "й",
].sort((left, right) => right.length - left.length);

const STOP_WORDS = new Set([
  "по",
  "на",
  "в",
  "во",
  "с",
  "со",
  "у",
  "за",
  "для",
  "и",
  "или",
  "из",
  "от",
  "до",
  "к",
  "о",
  "об",
  "участок",
  "участка",
  "участке",
  "участку",
  "участком",
  "цех",
  "цеха",
  "оборудование",
  "оборудования",
  "инв",
  "инвентарный",
  "номер",
  "учаске",
  "учаскесі",
  "учаскесінің",
  "учаскесінде",
  "бойынша",
  "жабдық",
]);

const SYNONYMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ұсақта\p{L}*|дробильн\p{L}*/gu, "дробление"],
  [/байыт\p{L}*|обогатительн\p{L}*/gu, "обогащение"],
  [/тиеу\p{L}*|отгрузк\p{L}*|погрузочн\p{L}*/gu, "погрузка"],
  [/ремонтно[- ]механическ\p{L}*|жөндеу[- ]механика\p{L}*/gu, "рмц"],
];

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
  "ни",
  "же",
  "ли",
  "бы",
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
]);

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»"'`“”„()[\]{}!?.,;:№#*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toCyrillic(token: string): string {
  return token.replace(/[a-z]/g, (letter) => LATIN_LOOKALIKES[letter] ?? letter);
}

export function isCodeToken(token: string): boolean {
  return /\d/.test(token);
}

export function canonicalCode(token: string): string {
  return toCyrillic(token.toLowerCase())
    .replace(/[-–—_/\s]/g, "")
    .replace(/×/g, "х")
    .replace(/\d+/g, (digits) => String(Number(digits)));
}

export function stem(word: string): string {
  if (word.length < 4 || isCodeToken(word)) {
    return word;
  }
  const ending = RU_ENDINGS.find(
    (candidate) => word.endsWith(candidate) && word.length - candidate.length >= 3,
  );
  return ending ? word.slice(0, -ending.length) : word;
}

function applySynonyms(text: string): string {
  return SYNONYMS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    text,
  );
}

function mergeSpacedCodes(words: readonly string[]): string[] {
  const merged: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] ?? "";
    const next = words[index + 1];
    const lettersOnly = /^[a-zа-я]{1,3}$/.test(word) && !SPACED_CODE_STOP.has(word);
    if (lettersOnly && next !== undefined && /^\d{1,5}$/.test(next)) {
      merged.push(`${word}${next}`);
      index += 1;
    } else {
      merged.push(word);
    }
  }
  return merged;
}

export function tokenize(value: string): string[] {
  const words = normalizeText(applySynonyms(value.toLowerCase())).split(" ").filter(Boolean);
  return mergeSpacedCodes(words)
    .filter((word) => !STOP_WORDS.has(word))
    .map((word) => (isCodeToken(word) ? canonicalCode(word) : stem(word.replace(/^-+|-+$/g, ""))))
    .filter((word) => word.length > 0);
}

export function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      current.push(
        Math.min(
          (current[column - 1] ?? 0) + 1,
          (previous[column] ?? 0) + 1,
          (previous[column - 1] ?? 0) + cost,
        ),
      );
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

export function tokenSimilarity(query: string, candidate: string): number {
  if (query === candidate) {
    return 1;
  }
  const queryIsCode = isCodeToken(query);
  const candidateIsCode = isCodeToken(candidate);
  if (queryIsCode || candidateIsCode) {
    if (queryIsCode && candidateIsCode) {
      return 0;
    }
    if (candidateIsCode && query.length >= 2 && candidate.startsWith(query)) {
      return /\d/.test(candidate.charAt(query.length)) ? 0.8 : 0;
    }
    return 0;
  }
  const shorter = Math.min(query.length, candidate.length);
  if (shorter >= 4 && (candidate.startsWith(query) || query.startsWith(candidate))) {
    return 0.85;
  }
  const distance = levenshtein(query, candidate);
  if (shorter >= 5 && distance <= 1) {
    return 0.75;
  }
  if (shorter >= 8 && distance <= 2) {
    return 0.6;
  }
  return 0;
}

function weightOf(token: string): number {
  return isCodeToken(token) ? 2 : 1;
}

export function matchScore(query: string, labels: readonly string[]): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return 0;
  }
  const candidateTokens = labels.flatMap((label) => tokenize(label));
  let total = 0;
  let matched = 0;
  for (const token of queryTokens) {
    const weight = weightOf(token);
    const best = candidateTokens.reduce(
      (score, candidate) => Math.max(score, tokenSimilarity(token, candidate)),
      0,
    );
    total += weight;
    matched += weight * best;
  }
  return total === 0 ? 0 : matched / total;
}

function labelMention(textTokens: ReadonlySet<string>, label: string): number {
  const labelTokens = [...new Set(tokenize(label))];
  if (labelTokens.length === 0) {
    return 0;
  }
  const hasCode = labelTokens.some(isCodeToken);
  const codeHit = labelTokens.some((token) => isCodeToken(token) && textTokens.has(token));
  if (hasCode && !codeHit) {
    return 0;
  }
  const total = labelTokens.reduce((sum, token) => sum + weightOf(token), 0);
  const matched = labelTokens.reduce(
    (sum, token) => sum + (textTokens.has(token) ? weightOf(token) : 0),
    0,
  );
  return matched / total;
}

export function mentionScore(text: string, labels: readonly string[]): number {
  const textTokens = new Set(tokenize(text));
  return labels.reduce((best, label) => Math.max(best, labelMention(textTokens, label)), 0);
}

export type Resolution<T> =
  | { status: "found"; item: T; score: number }
  | { status: "ambiguous"; items: T[] }
  | { status: "not_found"; items: T[] };

const MIN_SCORE = 0.5;
const TIE_MARGIN = 0.05;
const MAX_CANDIDATES = 6;

export function resolveByName<T>(
  query: string,
  items: readonly T[],
  labelsOf: (item: T) => readonly string[],
): Resolution<T> {
  const normalizedQuery = canonicalCode(normalizeText(query));
  const exact = items.filter((item) =>
    labelsOf(item).some((label) => canonicalCode(normalizeText(label)) === normalizedQuery),
  );
  if (exact.length === 1 && exact[0] !== undefined) {
    return { status: "found", item: exact[0], score: 1 };
  }
  const ranked = items
    .map((item) => ({ item, score: matchScore(query, labelsOf(item)) }))
    .filter((entry) => entry.score >= MIN_SCORE)
    .sort((left, right) => right.score - left.score);
  const top = ranked[0];
  if (!top) {
    return { status: "not_found", items: [] };
  }
  const ties = ranked.filter((entry) => entry.score >= top.score - TIE_MARGIN);
  if (ties.length === 1) {
    return { status: "found", item: top.item, score: top.score };
  }
  return { status: "ambiguous", items: ties.slice(0, MAX_CANDIDATES).map((entry) => entry.item) };
}

export function findMention<T>(
  text: string,
  items: readonly T[],
  labelsOf: (item: T) => readonly string[],
): T | null {
  const ranked = items
    .map((item) => ({ item, score: mentionScore(text, labelsOf(item)) }))
    .filter((entry) => entry.score >= 0.6)
    .sort((left, right) => right.score - left.score);
  const [first, second] = ranked;
  if (!first || (second && second.score >= first.score - TIE_MARGIN)) {
    return null;
  }
  return first.item;
}
