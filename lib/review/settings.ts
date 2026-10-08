import type { Json } from "@/lib/supabase/database.types";
import { DEFAULT_REVIEW_SETTINGS, type ReviewSettings } from "@/lib/review/types";

export const REVIEW_SETTING_KEYS = {
  materialOverusePercent: "review.material_overuse_percent",
  lowConfidenceThreshold: "review.low_confidence_threshold",
  ghostMinAlignment: "ghost.min_alignment",
} as const;

export interface SettingRow {
  key: string;
  value: Json;
}

function numberOf(value: Json | undefined, min: number, max: number): number | null {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

export function toReviewSettings(rows: readonly SettingRow[]): ReviewSettings {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const read = (name: keyof ReviewSettings, min: number, max: number) =>
    numberOf(byKey.get(REVIEW_SETTING_KEYS[name]), min, max) ?? DEFAULT_REVIEW_SETTINGS[name];
  return {
    materialOverusePercent: read("materialOverusePercent", 0, 1000),
    lowConfidenceThreshold: read("lowConfidenceThreshold", 0, 1),
    ghostMinAlignment: read("ghostMinAlignment", 0, 1),
  };
}
