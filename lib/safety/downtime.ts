const MS_PER_HOUR = 3_600_000;

export function downtimeHours(startedAt: string, endedAt: string | null, now: Date): number {
  const end = endedAt ? new Date(endedAt).getTime() : now.getTime();
  return Math.max(0, (end - new Date(startedAt).getTime()) / MS_PER_HOUR);
}

export function downtimeCost(
  startedAt: string,
  endedAt: string | null,
  costPerHour: number,
  now: Date,
): number {
  return Math.round(downtimeHours(startedAt, endedAt, now) * costPerHour);
}

export function formatTenge(amount: number): string {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(amount))} ₸`;
}

export function formatElapsed(hours: number): string {
  const totalSeconds = Math.floor(hours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
}
