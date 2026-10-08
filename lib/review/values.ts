import type { CheckValues } from "@/lib/review/types";

export const EMPTY_VALUE = "—";

export function messageValues(values: CheckValues): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      value === null ? EMPTY_VALUE : typeof value === "boolean" ? String(value) : value,
    ]),
  );
}
