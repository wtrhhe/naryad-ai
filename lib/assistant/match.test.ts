import { describe, expect, it } from "vitest";
import {
  canonicalCode,
  findMention,
  levenshtein,
  matchScore,
  normalizeText,
  resolveByName,
  stem,
  tokenize,
  tokenSimilarity,
} from "@/lib/assistant/match";

const SITES = [
  { id: "s1", name: "Дробление", code: "CRUSH" },
  { id: "s2", name: "Обогащение", code: "ENRICH" },
  { id: "s3", name: "РМЦ", code: "RMC" },
  { id: "s4", name: "Погрузка", code: "LOAD" },
];

const EQUIPMENT = [
  { id: "e1", name: "Дробилка КМД-1750", inventoryNumber: "ДР-001" },
  { id: "e2", name: "Дробилка КСД-2200", inventoryNumber: "ДР-002" },
  { id: "e3", name: "Конвейер К-1", inventoryNumber: "ДР-003" },
  { id: "e5", name: "Конвейер К-3", inventoryNumber: "ДР-005" },
  { id: "e6", name: "Конвейер К-30", inventoryNumber: "ДР-030" },
  { id: "e7", name: "Насос Н-4", inventoryNumber: "ОБ-011" },
  { id: "e8", name: "Мельница МШР-3600×5000", inventoryNumber: "ОБ-001" },
  { id: "e9", name: "Мельница МШЦ-3200×3100", inventoryNumber: "ОБ-002" },
  { id: "e10", name: "Вагоноопрокидыватель ВРС-93", inventoryNumber: "ПГ-003" },
];

const siteLabels = (site: (typeof SITES)[number]) => [site.name, site.code];
const equipmentLabels = (item: (typeof EQUIPMENT)[number]) => [item.name, item.inventoryNumber];

function resolveSite(query: string) {
  const result = resolveByName(query, SITES, siteLabels);
  return result.status === "found" ? result.item.name : result.status;
}

function resolveEquipment(query: string) {
  const result = resolveByName(query, EQUIPMENT, equipmentLabels);
  if (result.status === "found") return result.item.name;
  if (result.status === "ambiguous") return result.items.map((item) => item.name);
  return null;
}

describe("normalization", () => {
  it("lowercases, unifies ё and strips punctuation", () => {
    expect(normalizeText("  «Ёмкость», К-3!  ")).toBe("емкость к-3");
  });

  it("canonicalizes equipment codes", () => {
    expect(canonicalCode("К-3")).toBe("к3");
    expect(canonicalCode("K-3")).toBe("к3");
    expect(canonicalCode("ДР-005")).toBe("др5");
    expect(canonicalCode("МШР-3600x5000")).toBe("мшр3600х5000");
  });

  it("stems Russian word forms to a shared base", () => {
    expect(stem("дробления")).toBe(stem("дробление"));
    expect(stem("обогащения")).toBe(stem("обогащение"));
    expect(stem("конвейера")).toBe("конвейер");
    expect(stem("насосом")).toBe("насос");
    expect(stem("электриков")).toBe("электрик");
    expect(stem("рмц")).toBe("рмц");
    expect(stem("к3")).toBe("к3");
  });

  it("merges spaced codes but keeps prepositions apart", () => {
    expect(tokenize("конвейер к 3")).toEqual(["конвейер", "к3"]);
    expect(tokenize("за 7 дней")).toEqual(["7", "дне"]);
  });

  it("maps Kazakh site names to Russian ones", () => {
    expect(tokenize("ұсақтау")).toEqual(tokenize("дробление"));
    expect(tokenize("байыту учаскесі")).toEqual(tokenize("обогащение"));
  });

  it("measures edit distance", () => {
    expect(levenshtein("конвеер", "конвейер")).toBe(1);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("same", "same")).toBe(0);
  });

  it("scores token similarity conservatively for codes", () => {
    expect(tokenSimilarity("к3", "к3")).toBe(1);
    expect(tokenSimilarity("к3", "к30")).toBe(0);
    expect(tokenSimilarity("кмд", "кмд1750")).toBe(0.8);
    expect(tokenSimilarity("км", "кмд1750")).toBe(0);
    expect(tokenSimilarity("конвеер", "конвейер")).toBe(0.75);
    expect(tokenSimilarity("обогащ", "обогащен")).toBe(0.85);
    expect(tokenSimilarity("вагоноопракидыватель", "вагоноопрокидывател")).toBe(0.6);
    expect(tokenSimilarity("насос", "к3")).toBe(0);
  });

  it("returns zero score for empty queries", () => {
    expect(matchScore("на по", ["Насос Н-4"])).toBe(0);
  });
});

describe("site resolution", () => {
  it.each([
    ["Дробление", "Дробление"],
    ["дробления", "Дробление"],
    ["участка дробления", "Дробление"],
    ["обогащения", "Обогащение"],
    ["обогатительной фабрики", "Обогащение"],
    ["Байыту", "Обогащение"],
    ["рмц", "РМЦ"],
    ["погрузки", "Погрузка"],
    ["crush", "Дробление"],
  ])("resolves %s to %s", (query, expected) => {
    expect(resolveSite(query)).toBe(expected);
  });

  it("reports unknown sites", () => {
    expect(resolveSite("карьер")).toBe("not_found");
  });
});

describe("equipment resolution", () => {
  it.each([
    ["К-3", "Конвейер К-3"],
    ["к3", "Конвейер К-3"],
    ["K-3", "Конвейер К-3"],
    ["конвейера К 3", "Конвейер К-3"],
    ["ДР-005", "Конвейер К-3"],
    ["др5", "Конвейер К-3"],
    ["к-30", "Конвейер К-30"],
    ["насосом Н-4", "Насос Н-4"],
    ["дробилки КМД", "Дробилка КМД-1750"],
    ["кмд1750", "Дробилка КМД-1750"],
    ["вагоноопрокидывателя", "Вагоноопрокидыватель ВРС-93"],
    ["Мельница МШР-3600x5000", "Мельница МШР-3600×5000"],
  ])("resolves %s to %s", (query, expected) => {
    expect(resolveEquipment(query)).toBe(expected);
  });

  it("asks to clarify ambiguous names", () => {
    expect(resolveEquipment("конвейер")).toEqual(["Конвейер К-1", "Конвейер К-3", "Конвейер К-30"]);
    expect(resolveEquipment("мельница")).toHaveLength(2);
  });

  it("does not guess when nothing matches", () => {
    expect(resolveEquipment("экскаватор ЭКГ-10")).toBeNull();
  });
});

describe("mentions in free text", () => {
  it("finds equipment named inside a description", () => {
    expect(
      findMention("Течь сальника на насосе Н-4, срочно", EQUIPMENT, equipmentLabels)?.name,
    ).toBe("Насос Н-4");
    expect(findMention("Замена футеровки КМД-1750", EQUIPMENT, equipmentLabels)?.name).toBe(
      "Дробилка КМД-1750",
    );
  });

  it("ignores descriptions without a distinctive code", () => {
    expect(findMention("Конвейер шумит", EQUIPMENT, equipmentLabels)).toBeNull();
    expect(findMention("", EQUIPMENT, equipmentLabels)).toBeNull();
  });
});
