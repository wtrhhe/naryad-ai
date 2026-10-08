export interface PersonAlias {
  fullName: string;
  alias: string;
}

const MIN_NAME_PART = 3;
const PHONE_PATTERN = /\+?\d[\d\s()-]{8,}\d/g;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
export const PHONE_PLACEHOLDER = "[phone]";
export const EMAIL_PLACEHOLDER = "[email]";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namePattern(part: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(part)}(?![\\p{L}\\p{N}])`, "giu");
}

export function nameParts(fullName: string): string[] {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length >= MIN_NAME_PART);
  const whole = fullName.trim().replace(/\s+/g, " ");
  return [...new Set([whole, ...parts])].sort((left, right) => right.length - left.length);
}

export function anonymizeText(text: string, people: readonly PersonAlias[]): string {
  const replaced = people.reduce(
    (current, person) =>
      nameParts(person.fullName).reduce(
        (inner, part) => inner.replace(namePattern(part), person.alias),
        current,
      ),
    text,
  );
  return replaced
    .replace(EMAIL_PATTERN, EMAIL_PLACEHOLDER)
    .replace(PHONE_PATTERN, PHONE_PLACEHOLDER);
}
