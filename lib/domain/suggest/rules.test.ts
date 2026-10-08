import { describe, expect, it } from "vitest";
import { suggestOrderFields, suggestOrderFieldsSync } from "@/lib/domain/suggest/rules";
import type { FaultCodeRef } from "@/lib/domain/suggest/types";

const codes: FaultCodeRef[] = [
  ["М-02", "mechanical", 4],
  ["М-03", "mechanical", 8],
  ["М-05", "mechanical", 3],
  ["Г-01", "hydraulic", 3],
  ["Э-03", "electrical", 2],
  ["Э-04", "electrical", 3.5],
  ["С-01", "lubrication", 1.5],
].map(([code, category, hours]) => ({
  id: `id-${code}`,
  code: String(code),
  name: String(code),
  category: String(category),
  standardHours: Number(hours),
}));

const suggest = (description: string, equipmentType: "pump" | "conveyor" | null = null) =>
  suggestOrderFieldsSync({ description, equipmentType, faultCodes: codes });

describe("suggestOrderFields", () => {
  it("recognises an oil leak on a pump as a gland leak emergency", () => {
    expect(suggest("Течь масла из-под сальника, насос остановлен", "pump")).toMatchObject({
      kind: "unplanned",
      priority: "emergency",
      faultCodeId: "id-М-05",
      standardHours: 3,
    });
  });

  it("treats a bare leak on a pump as the gland", () => {
    expect(suggest("Подтекает под насосом", "pump").faultCodeId).toBe("id-М-05");
  });

  it("maps bearing noise to the bearing code with normal priority", () => {
    expect(suggest("Повышенная вибрация и шум подшипника", "conveyor")).toMatchObject({
      faultCodeId: "id-М-02",
      priority: "normal",
    });
  });

  it("detects electrical faults", () => {
    expect(suggest("Двигатель не запускается, пускатель щелкает").faultCodeId).toBe("id-Э-03");
    expect(suggest("Повреждён кабель питания").faultCodeId).toBe("id-Э-04");
  });

  it("marks scheduled work as planned", () => {
    expect(suggest("Плановая смазка подшипников по графику ППР")).toMatchObject({
      kind: "planned",
      priority: "planned",
    });
  });

  it("raises priority for fast growing problems", () => {
    expect(suggest("Сильный нагрев, вибрация нарастает").priority).toBe("high");
  });

  it("returns no fault for unrelated text but keeps defaults", async () => {
    await expect(
      suggestOrderFields({ description: "Проверить", equipmentType: null, faultCodes: codes }),
    ).resolves.toMatchObject({
      faultCodeId: null,
      kind: "unplanned",
      priority: "normal",
      source: "rules",
    });
  });
});
