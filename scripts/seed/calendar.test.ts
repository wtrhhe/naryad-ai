import { describe, expect, it } from "vitest";
import { createEquipmentCalendar } from "./calendar";

const HOUR = 3_600_000;

describe("createEquipmentCalendar", () => {
  it("returns the desired start for a free equipment", () => {
    const calendar = createEquipmentCalendar(HOUR);
    expect(calendar.findStart("pump", 10 * HOUR, 4 * HOUR, 100 * HOUR)).toBe(10 * HOUR);
  });

  it("moves the start past a reserved interval and the margin", () => {
    const calendar = createEquipmentCalendar(HOUR);
    calendar.reserve("pump", 8 * HOUR, 12 * HOUR);
    expect(calendar.findStart("pump", 10 * HOUR, 2 * HOUR, 100 * HOUR)).toBe(13 * HOUR);
  });

  it("keeps the margin before the next reservation", () => {
    const calendar = createEquipmentCalendar(HOUR);
    calendar.reserve("pump", 20 * HOUR, 30 * HOUR);
    expect(calendar.findStart("pump", 14 * HOUR, 6 * HOUR, 100 * HOUR)).toBe(31 * HOUR);
    expect(calendar.findStart("pump", 14 * HOUR, 5 * HOUR, 100 * HOUR)).toBe(14 * HOUR);
  });

  it("hops over several reservations", () => {
    const calendar = createEquipmentCalendar(0);
    calendar.reserve("pump", 0, 5 * HOUR);
    calendar.reserve("pump", 5 * HOUR, 9 * HOUR);
    expect(calendar.findStart("pump", HOUR, 2 * HOUR, 100 * HOUR)).toBe(9 * HOUR);
  });

  it("returns null when no start is possible before the latest start", () => {
    const calendar = createEquipmentCalendar(0);
    calendar.reserve("pump", 0, 50 * HOUR);
    expect(calendar.findStart("pump", HOUR, 2 * HOUR, 20 * HOUR)).toBeNull();
  });

  it("isolates equipment from each other", () => {
    const calendar = createEquipmentCalendar(HOUR);
    calendar.reserve("pump", 0, 50 * HOUR);
    expect(calendar.findStart("fan", HOUR, 2 * HOUR, 20 * HOUR)).toBe(HOUR);
  });

  it("reports conflicts through isFree", () => {
    const calendar = createEquipmentCalendar(0);
    calendar.reserve("pump", 10 * HOUR, 12 * HOUR);
    expect(calendar.isFree("pump", 12 * HOUR, 14 * HOUR)).toBe(true);
    expect(calendar.isFree("pump", 11 * HOUR, 14 * HOUR)).toBe(false);
  });
});
