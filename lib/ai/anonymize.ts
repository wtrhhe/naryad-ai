import type { AiImage } from "@/lib/ai/types";

export interface AnonymizePerson {
  id: string;
  fullName: string;
  personnelNumber?: string | null;
  ref?: number;
}

export interface AnonymizedText {
  text: string;
  tokens: ReadonlyMap<string, string>;
}

export const PHONE_PLACEHOLDER = "[телефон]";
export const PERSONNEL_PLACEHOLDER = "[таб.№]";
export const EMAIL_PLACEHOLDER = "[email]";
export const IIN_PLACEHOLDER = "[ИИН]";
export const AMBIGUOUS_PERSON_TOKEN = "[И]";

const PERSON_TOKEN_PATTERN = /\[И-(\d+)\]/g;
const BEFORE = "(?<![\\p{L}\\p{N}])";
const AFTER = "(?![\\p{L}\\p{N}])";
const EQUIVALENT_LETTERS = ["её", "аә", "оө", "уұү", "кқ", "гғ", "нң", "хһ", "иі"];
const ENDINGS = [
  "ого",
  "его",
  "ому",
  "ему",
  "ыми",
  "ими",
  "ами",
  "ями",
  "ой",
  "ей",
  "ою",
  "ею",
  "ом",
  "ем",
  "ым",
  "им",
  "ая",
  "яя",
  "ую",
  "юю",
  "ий",
  "ый",
  "ых",
  "их",
  "ам",
  "ям",
  "ах",
  "ях",
  "ью",
  "а",
  "я",
  "ы",
  "и",
  "у",
  "ю",
  "е",
  "о",
  "й",
  "ь",
];
const ENDING_GROUP = `(?:${ENDINGS.join("|")})?`;
const MIN_STANDALONE_LENGTH = 3;
const MIN_STANDALONE_NUMBER_LENGTH = 5;

const EMAIL_PATTERN = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu;
const PHONE_PATTERNS = [
  /(?<![\d\p{L}])(?:\+\s?7|8|7)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/gu,
  /(?<![\d\p{L}])\+\d[\d\s\-()]{9,16}\d(?!\d)/gu,
  /(?<![\d\p{L}-])\d{3}-\d{2}-\d{2}(?![\d-])/gu,
];
const IIN_PATTERN = /(?<!\d)\d{12}(?!\d)/g;
const PERSONNEL_MARKER_PATTERN =
  /(?<![\p{L}\p{N}])(?:таб(?:ельный|\.)?\s*(?:номер|ном\.|№|n)?|т\.\s?н\.|тн)\s*[:№#]?\s*(\d{2,10})(?!\d)/giu;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

function letterClass(char: string): string {
  const lower = char.toLocaleLowerCase("ru");
  const group = EQUIVALENT_LETTERS.find((letters) => letters.includes(lower));
  return group ? `[${group}]` : escapeRegExp(lower);
}

function stemOf(word: string): string {
  if (word.length > 4 && /(ий|ый|ой|ая|яя)$/iu.test(word)) {
    return word.slice(0, -2);
  }
  if (word.length > 3 && /[аяйьеоыи]$/iu.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}

function wordPattern(word: string): string {
  return Array.from(stemOf(word), letterClass).join("") + ENDING_GROUP;
}

function initialPattern(word: string): string {
  const first = Array.from(word)[0] ?? "";
  return `${letterClass(first)}\\.`;
}

function normalizedKey(word: string): string {
  return Array.from(stemOf(word).toLocaleLowerCase("ru"))
    .map((char) => EQUIVALENT_LETTERS.find((letters) => letters.includes(char))?.[0] ?? char)
    .join("");
}

export function personToken(ref: number): string {
  return `[И-${ref}]`;
}

interface NameParts {
  surname: string;
  given: string | null;
  patronymic: string | null;
}

function splitName(fullName: string): NameParts | null {
  const parts = fullName.trim().split(/\s+/u).filter(Boolean);
  const [surname, given, ...rest] = parts;
  if (!surname) {
    return null;
  }
  return { surname, given: given ?? null, patronymic: rest.length > 0 ? rest.join(" ") : null };
}

interface Candidate {
  level: number;
  weight: number;
  source: string;
  token: string;
  requireCapital: boolean;
}

function sequence(...pieces: string[]): string {
  return pieces.join("\\s+");
}

function personCandidates(
  parts: NameParts,
  token: string,
  ambiguity: { surname: boolean; given: boolean },
): Candidate[] {
  const surname = wordPattern(parts.surname);
  const list: Candidate[] = [];
  const add = (level: number, source: string, weight: number, candidateToken = token) =>
    list.push({ level, weight, source, token: candidateToken, requireCapital: level >= 5 });

  if (parts.given) {
    const given = wordPattern(parts.given);
    const givenInitial = initialPattern(parts.given);
    if (parts.patronymic) {
      const patronymic = parts.patronymic.split(/\s+/u).map(wordPattern).join("\\s+");
      const patronymicInitial = initialPattern(parts.patronymic);
      const full = parts.surname.length + parts.given.length + parts.patronymic.length;
      add(1, sequence(surname, given, patronymic), full);
      add(1, sequence(given, patronymic, surname), full);
      add(2, `${surname}\\s+${givenInitial}\\s*${patronymicInitial}`, full);
      add(2, `${givenInitial}\\s*${patronymicInitial}\\s*${surname}`, full);
      add(4, sequence(given, patronymic), parts.given.length + parts.patronymic.length);
    }
    add(2, `${surname}\\s+${givenInitial}`, parts.surname.length + 1);
    add(2, `${givenInitial}\\s*${surname}`, parts.surname.length + 1);
    add(3, sequence(surname, given), parts.surname.length + parts.given.length);
    add(3, sequence(given, surname), parts.surname.length + parts.given.length);
    if (Array.from(parts.given).length >= MIN_STANDALONE_LENGTH) {
      add(6, given, parts.given.length, ambiguity.given ? AMBIGUOUS_PERSON_TOKEN : token);
    }
  }
  if (Array.from(parts.surname).length >= MIN_STANDALONE_LENGTH) {
    add(5, surname, parts.surname.length, ambiguity.surname ? AMBIGUOUS_PERSON_TOKEN : token);
  }
  return list;
}

function countKeys(keys: readonly (string | null)[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) {
    if (key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function refOf(person: AnonymizePerson, index: number): number {
  return person.ref ?? index + 1;
}

function replaceNumbers(text: string, people: readonly AnonymizePerson[]): string {
  const byNumber = new Map<string, string>();
  people.forEach((person, index) => {
    const number = person.personnelNumber?.trim();
    if (number) {
      byNumber.set(number, personToken(refOf(person, index)));
    }
  });

  let result = text.replace(EMAIL_PATTERN, EMAIL_PLACEHOLDER);
  for (const pattern of PHONE_PATTERNS) {
    result = result.replace(pattern, PHONE_PLACEHOLDER);
  }
  result = result.replace(IIN_PATTERN, IIN_PLACEHOLDER);
  result = result.replace(
    PERSONNEL_MARKER_PATTERN,
    (_match, digits: string) => byNumber.get(digits) ?? PERSONNEL_PLACEHOLDER,
  );
  for (const [number, token] of byNumber) {
    if (number.length >= MIN_STANDALONE_NUMBER_LENGTH && /^\d+$/.test(number)) {
      result = result.replace(new RegExp(`(?<!\\d)${number}(?!\\d)`, "g"), token);
    }
  }
  return result;
}

export function anonymizeDetailed(
  text: string,
  people: readonly AnonymizePerson[] = [],
): AnonymizedText {
  const tokens = new Map<string, string>();
  const parsed = people.map((person, index) => ({
    person,
    token: personToken(refOf(person, index)),
    parts: splitName(person.fullName),
  }));
  for (const entry of parsed) {
    tokens.set(entry.token, entry.person.id);
  }

  const surnameCounts = countKeys(
    parsed.map((entry) => entry.parts && normalizedKey(entry.parts.surname)),
  );
  const givenCounts = countKeys(
    parsed.map((entry) => (entry.parts?.given ? normalizedKey(entry.parts.given) : null)),
  );

  const candidates = parsed
    .flatMap((entry) =>
      entry.parts
        ? personCandidates(entry.parts, entry.token, {
            surname: (surnameCounts.get(normalizedKey(entry.parts.surname)) ?? 0) > 1,
            given:
              entry.parts.given !== null &&
              (givenCounts.get(normalizedKey(entry.parts.given)) ?? 0) > 1,
          })
        : [],
    )
    .sort((left, right) => left.level - right.level || right.weight - left.weight);

  let result = replaceNumbers(text, people);
  for (const candidate of candidates) {
    const pattern = new RegExp(`${BEFORE}${candidate.source}${AFTER}`, "giu");
    result = result.replace(pattern, (match) => {
      if (candidate.requireCapital && match[0] === match[0]?.toLocaleLowerCase("ru")) {
        return match;
      }
      return candidate.token;
    });
  }
  return { text: result, tokens };
}

export function anonymize(text: string, people: readonly AnonymizePerson[] = []): string {
  return anonymizeDetailed(text, people).text;
}

export function deanonymize(
  text: string,
  people: readonly AnonymizePerson[],
  display: (person: AnonymizePerson) => string = (person) => person.fullName,
): string {
  const byRef = new Map<number, AnonymizePerson>();
  people.forEach((person, index) => byRef.set(refOf(person, index), person));
  return text.replace(PERSON_TOKEN_PATTERN, (match, ref: string) => {
    const person = byRef.get(Number(ref));
    return person ? display(person) : match;
  });
}

export const MAX_IMAGE_BASE64_LENGTH = 5 * 1024 * 1024;

const JPEG_STRIPPED_MARKERS = (marker: number) =>
  (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
const PNG_STRIPPED_CHUNKS: ReadonlySet<string> = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);
const WEBP_STRIPPED_CHUNKS: ReadonlySet<string> = new Set(["EXIF", "XMP "]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function detectImageType(bytes: Buffer): AiImage["mediaType"] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("latin1", 0, 4) === "RIFF" &&
    bytes.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function stripJpeg(bytes: Buffer): Buffer | null {
  const kept: Buffer[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0xda) {
      kept.push(bytes.subarray(offset));
      return Buffer.concat(kept);
    }
    const length = bytes.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) {
      return null;
    }
    if (!JPEG_STRIPPED_MARKERS(marker)) {
      kept.push(bytes.subarray(offset, end));
    }
    offset = end;
  }
  return null;
}

function stripPng(bytes: Buffer): Buffer | null {
  const kept: Buffer[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length) {
      return null;
    }
    if (!PNG_STRIPPED_CHUNKS.has(type)) {
      kept.push(bytes.subarray(offset, end));
    }
    offset = end;
    if (type === "IEND") {
      return Buffer.concat(kept);
    }
  }
  return null;
}

function stripWebp(bytes: Buffer): Buffer | null {
  const chunks: Buffer[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("latin1", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (offset + 8 + size > bytes.length) {
      return null;
    }
    if (!WEBP_STRIPPED_CHUNKS.has(type)) {
      const chunk = Buffer.from(bytes.subarray(offset, Math.min(end, bytes.length)));
      if (type === "VP8X" && chunk.length > 8) {
        chunk[8] = (chunk[8] ?? 0) & ~0x0c;
      }
      chunks.push(chunk);
    }
    offset = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

export function stripImageMetadata(image: AiImage): AiImage | null {
  const base64 = image.base64.replace(/^data:[^,]*,/u, "").replace(/\s+/gu, "");
  if (
    base64.length === 0 ||
    base64.length > MAX_IMAGE_BASE64_LENGTH ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(base64)
  ) {
    return null;
  }
  const bytes = Buffer.from(base64, "base64");
  const mediaType = detectImageType(bytes);
  if (!mediaType) {
    return null;
  }
  const stripped =
    mediaType === "image/jpeg"
      ? stripJpeg(bytes)
      : mediaType === "image/png"
        ? stripPng(bytes)
        : stripWebp(bytes);
  if (!stripped) {
    return null;
  }
  return { mediaType, base64: stripped.toString("base64") };
}

export function prepareImages(
  images: readonly AiImage[] | undefined,
): { ok: true; images: AiImage[] } | { ok: false; index: number } {
  const prepared: AiImage[] = [];
  for (const [index, image] of (images ?? []).entries()) {
    const clean = stripImageMetadata(image);
    if (!clean) {
      return { ok: false, index };
    }
    prepared.push(clean);
  }
  return { ok: true, images: prepared };
}
