export type UnitTranslate = (
  key: "minutes" | "hours" | "days",
  values: { count: number },
) => string;

const DECIMAL = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export function formatHours(hours: number): string {
  return DECIMAL.format(Math.round(hours * 10) / 10);
}

export function formatDurationWith(t: UnitTranslate, totalMinutes: number): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  if (minutes < 60) {
    return t("minutes", { count: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes % 60;
    return rest === 0
      ? t("hours", { count: hours })
      : `${t("hours", { count: hours })} ${t("minutes", { count: rest })}`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0
    ? t("days", { count: days })
    : `${t("days", { count: days })} ${t("hours", { count: restHours })}`;
}

export function shortDate(isoDate: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? "");
  return match ? `${match[3]}.${match[2]}.${match[1]}` : (isoDate ?? "");
}
