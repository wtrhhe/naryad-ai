import { describe, expect, it, vi } from "vitest";
import { disabledProvider } from "@/lib/ai/provider";
import type { AiProvider, AiTextRequest } from "@/lib/ai/types";
import {
  buildHintPrompt,
  buildHintSystemPrompt,
  hintCacheKey,
  parseHintText,
  requestCheckHint,
} from "@/lib/equipment/hint";
import { summarizeEquipmentMemory, type MemoryOrder } from "@/lib/equipment/memory";

const now = new Date("2026-10-08T12:00:00Z");

function leak(number: number, issuedAt: string): MemoryOrder {
  return {
    id: `order-${number}`,
    number,
    kind: "unplanned",
    priority: "high",
    status: "closed",
    issuedAt,
    doneAt: null,
    closedAt: issuedAt,
    faultCodeId: "f-gland",
    faultCode: "М-05",
    faultName: "Течь сальникового уплотнения",
    workPerformed: "Заменена набивка",
    downtimeStartedAt: null,
    downtimeEndedAt: null,
    downtimeCost: null,
    materials: [{ materialId: "m1", name: "Набивка сальниковая", unit: "кг", quantity: 1 }],
  };
}

const summary = summarizeEquipmentMemory(
  {
    equipment: {
      id: "eq-n4",
      name: "Насос Н-4",
      inventoryNumber: "ОБ-011",
      siteName: "Обогащение",
      criticality: 3,
      downtimeCostPerHour: 540_000,
    },
    orders: [leak(438, "2026-09-05T18:00:00.000Z"), leak(482, "2026-09-11T16:00:00.000Z")],
    openRca: [],
    activeLockout: false,
  },
  { now },
);

function providerReturning(outcome: Awaited<ReturnType<AiProvider["text"]>>) {
  const text = vi.fn(async (_request: AiTextRequest) => outcome);
  const provider: AiProvider = { ...disabledProvider, name: "mock", enabled: true, text };
  return { provider, text };
}

describe("requestCheckHint", () => {
  it("uses the rules when the provider is disabled", async () => {
    const hint = await requestCheckHint(disabledProvider, summary, "ru");
    expect(hint.source).toBe("rules");
    expect(hint.items.length).toBeGreaterThan(0);
  });

  it("returns the FAST model answer split into items", async () => {
    const { provider, text } = providerReturning({
      ok: true,
      value: "- Проверьте давление уплотнительной воды\n2) Осмотрите втулку вала\n\n",
      model: "fast",
      cached: false,
    });
    const hint = await requestCheckHint(provider, summary, "kk");
    expect(hint).toEqual({
      source: "ai",
      items: ["Проверьте давление уплотнительной воды", "Осмотрите втулку вала"],
    });
    const request = text.mock.calls[0]?.[0];
    expect(request?.tier).toBe("fast");
    expect(request?.system).toContain("казахском");
    expect(request?.cacheKey).toBe(hintCacheKey(summary, "kk"));
  });

  it("falls back when the provider fails, throws or answers nothing", async () => {
    const failing = providerReturning({ ok: false, error: "timeout", message: "slow" });
    expect((await requestCheckHint(failing.provider, summary, "ru")).source).toBe("rules");
    const empty = providerReturning({ ok: true, value: " \n", model: "fast", cached: true });
    expect((await requestCheckHint(empty.provider, summary, "ru")).source).toBe("rules");
    const throwing: AiProvider = {
      ...disabledProvider,
      enabled: true,
      text: async () => {
        throw new Error("network");
      },
    };
    expect((await requestCheckHint(throwing, summary, "ru")).source).toBe("rules");
  });
});

describe("prompts", () => {
  it("describes the history without personal data", () => {
    const prompt = buildHintPrompt(summary);
    expect(prompt).toContain("Насос Н-4");
    expect(prompt).toContain("М-05 «Течь сальникового уплотнения», 2 раз(а)");
    expect(prompt).toContain("Ремонт №482");
    expect(buildHintSystemPrompt("ru")).toContain("русском");
  });

  it("cleans list markers and trims long lines", () => {
    const long = "а".repeat(300);
    const items = parseHintText(`1. **Первое**\n• Второе\n-\n${long}\n5\n6\n7`);
    expect(items[0]).toBe("Первое");
    expect(items[1]).toBe("Второе");
    expect(items[2]).toHaveLength(240);
    expect(items).toHaveLength(3);
  });
});
