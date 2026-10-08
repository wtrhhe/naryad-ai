export const THEMES = ["dark", "light"] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_COOKIE = "theme";

export function resolveTheme(value: unknown): Theme {
  return value === "light" ? "light" : "dark";
}
