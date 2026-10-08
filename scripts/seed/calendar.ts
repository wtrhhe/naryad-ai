type Interval = { readonly start: number; readonly end: number };

export type EquipmentCalendar = {
  readonly reserve: (equipmentId: string, start: number, end: number) => void;
  readonly isFree: (equipmentId: string, start: number, end: number) => boolean;
  readonly findStart: (
    equipmentId: string,
    desiredStart: number,
    durationMs: number,
    latestStart: number,
  ) => number | null;
};

export function createEquipmentCalendar(marginMs: number): EquipmentCalendar {
  const reservations = new Map<string, Interval[]>();

  const intervalsOf = (equipmentId: string): readonly Interval[] =>
    reservations.get(equipmentId) ?? [];

  const findConflict = (equipmentId: string, start: number, end: number): Interval | undefined =>
    intervalsOf(equipmentId).find(
      (interval) => start < interval.end + marginMs && end + marginMs > interval.start,
    );

  const reserve = (equipmentId: string, start: number, end: number): void => {
    const next = [...intervalsOf(equipmentId), { start, end }].sort((a, b) => a.start - b.start);
    reservations.set(equipmentId, next);
  };

  const isFree = (equipmentId: string, start: number, end: number): boolean => {
    return intervalsOf(equipmentId).every(
      (interval) => start >= interval.end || end <= interval.start,
    );
  };

  const findStart = (
    equipmentId: string,
    desiredStart: number,
    durationMs: number,
    latestStart: number,
  ): number | null => {
    let candidate = desiredStart;
    while (candidate <= latestStart) {
      const conflict = findConflict(equipmentId, candidate, candidate + durationMs);
      if (!conflict) return candidate;
      candidate = Math.max(candidate + 1, conflict.end + marginMs);
    }
    return null;
  };

  return { reserve, isFree, findStart };
}
