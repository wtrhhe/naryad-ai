import { describe, expect, it, vi } from "vitest";
import { decodeDraft } from "@/lib/assistant/draft";
import {
  executeTool,
  memoizeGateway,
  shiftLoad,
  TOOL_DEFINITIONS,
  toModelPayload,
  type ToolExecution,
} from "@/lib/assistant/tools";
import type { AssistantCard } from "@/lib/assistant/types";
import { FIXTURE_NOW, FIXTURE_WORKERS, fakeGateway } from "@/lib/assistant/test-fixtures";

async function run(tool: string, input: unknown, options = {}) {
  const { gateway } = fakeGateway(options);
  return executeTool(tool, input, { gateway, now: FIXTURE_NOW });
}

async function card<Kind extends AssistantCard["kind"]>(
  kind: Kind,
  tool: string,
  input: unknown,
  options = {},
): Promise<Extract<AssistantCard, { kind: Kind }>> {
  const execution = await run(tool, input, options);
  if (!execution.ok || execution.card.kind !== kind) {
    throw new Error(`unexpected result ${JSON.stringify(execution)}`);
  }
  return execution.card as Extract<AssistantCard, { kind: Kind }>;
}

describe("tool definitions", () => {
  it("exposes the six assistant tools with JSON schemas", () => {
    expect(TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
      "find_free_workers",
      "list_overdue",
      "equipment_history",
      "shift_report",
      "site_problems",
      "create_work_order_draft",
    ]);
    TOOL_DEFINITIONS.forEach((tool) => {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.inputSchema).not.toHaveProperty("$schema");
    });
  });

  it("marks required inputs", () => {
    const schema = (name: string) =>
      TOOL_DEFINITIONS.find((tool) => tool.name === name)?.inputSchema;
    expect(schema("equipment_history")).toMatchObject({ required: ["equipment"] });
    expect(schema("create_work_order_draft")).toMatchObject({ required: ["description"] });
    expect(schema("find_free_workers")).not.toHaveProperty("required");
  });
});

describe("executeTool", () => {
  it("rejects unknown tools and invalid input", async () => {
    expect(await run("drop_tables", {})).toEqual({
      ok: false,
      tool: "drop_tables",
      error: "unknown_tool",
    });
    expect(await run("equipment_history", { days: 5 })).toMatchObject({
      ok: false,
      error: "invalid_input",
    });
    expect(await run("find_free_workers", "electrician")).toMatchObject({
      ok: false,
      error: "invalid_input",
    });
  });

  it("reports gateway failures as unavailable", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await run("list_overdue", {}, { failOn: "openOrders" })).toMatchObject({
      ok: false,
      error: "unavailable",
    });
    spy.mockRestore();
  });

  it("ignores null and empty optional values from the model", async () => {
    const result = await card("workers", "find_free_workers", {
      specialty: null,
      site: "",
    });
    expect(result.onShiftCount).toBe(4);
    expect(await run("find_free_workers", null)).toMatchObject({ ok: true });
  });
});

describe("find_free_workers", () => {
  it("lists on-shift electricians free first with short names", async () => {
    const result = await card("workers", "find_free_workers", { specialty: "electrician" });
    expect(result).toMatchObject({ specialty: "electrician", onShiftCount: 3, freeCount: 1 });
    expect(result.workers.map((worker) => [worker.name, worker.status])).toEqual([
      ["Петров И.", "free"],
      ["Сидоров П.", "queue"],
      ["Ахметов Е.", "busy"],
    ]);
  });

  it("filters by a fuzzy site name", async () => {
    const result = await card("workers", "find_free_workers", {
      specialty: "electrician",
      site: "дробления",
    });
    expect(result.site).toBe("Дробление");
    expect(result.workers.map((worker) => worker.id)).toEqual(["w2", "w1"]);
  });

  it("asks to clarify an unknown site", async () => {
    const result = await card("lookup", "find_free_workers", { site: "карьер" });
    expect(result.miss).toEqual({
      target: "site",
      status: "not_found",
      query: "карьер",
      candidates: ["Дробление", "Обогащение"],
    });
  });
});

describe("list_overdue", () => {
  it("sorts overdue orders by lateness", async () => {
    const result = await card("overdue", "list_overdue", {});
    expect(result.total).toBe(2);
    expect(result.orders.map((item) => [item.number, item.lateMinutes, item.assignee])).toEqual([
      [101, 270, "Ахметов Е."],
      [102, 90, null],
    ]);
  });

  it("filters by site", async () => {
    const result = await card("overdue", "list_overdue", { site: "обогащение" });
    expect(result.site).toBe("Обогащение");
    expect(result.orders.map((item) => item.number)).toEqual([102]);
  });

  it("returns a lookup for an unknown site", async () => {
    expect((await card("lookup", "list_overdue", { site: "карьер" })).tool).toBe("list_overdue");
  });
});

describe("equipment_history", () => {
  it("summarizes orders, downtime, faults and RCA", async () => {
    const result = await card("equipment_history", "equipment_history", { equipment: "к3" });
    expect(result.equipment).toMatchObject({ name: "Конвейер К-3", site: "Дробление" });
    expect(result).toMatchObject({ days: 30, total: 2, unplanned: 2, open: 1 });
    expect(result.downtime).toEqual({ hours: 7.5, cost: 2_250_000 });
    expect(result.topFaults).toEqual([{ code: "М-02", name: "Износ подшипника", count: 2 }]);
    expect(result.recent.map((item) => item.number)).toEqual([101, 90]);
    expect(result.recent[1]?.description.length).toBeLessThanOrEqual(140);
    expect(result.openRca).toHaveLength(1);
  });

  it("respects the period", async () => {
    const result = await card("equipment_history", "equipment_history", {
      equipment: "ДР-005",
      days: "3",
    });
    expect(result.total).toBe(1);
  });

  it("asks to clarify ambiguous equipment", async () => {
    const result = await card("lookup", "equipment_history", { equipment: "конвейер" });
    expect(result.miss).toMatchObject({
      status: "ambiguous",
      candidates: ["Конвейер К-3", "Конвейер К-1"],
    });
  });
});

describe("shift_report", () => {
  it("reports the current shift", async () => {
    const result = await card("shift_report", "shift_report", {});
    expect(result).toMatchObject({
      scope: "current_shift",
      period: "day",
      issued: 4,
      done: 1,
      overdue: 3,
      rejected: 1,
      equipmentDown: 1,
      downtime: { hours: 5.5, cost: 1_650_000 },
      load: { onShift: 4, busy: 1, queue: 1, free: 2, percent: 50 },
    });
  });

  it("reports a production day", async () => {
    const result = await card("shift_report", "shift_report", { date: "2026-10-01" });
    expect(result).toMatchObject({
      scope: "day",
      date: "2026-10-01",
      from: "2026-10-01T03:00:00.000Z",
      issued: 1,
      done: 1,
      overdue: 0,
      equipmentDown: 0,
      downtime: { hours: 2, cost: 600_000 },
      load: null,
    });
  });

  it("rejects impossible dates", async () => {
    expect(await run("shift_report", { date: "2026-02-30" })).toMatchObject({
      error: "invalid_input",
    });
  });

  it("computes load for an empty shift", () => {
    expect(shiftLoad([])).toEqual({ onShift: 0, busy: 0, queue: 0, free: 0, percent: 0 });
    expect(shiftLoad(FIXTURE_WORKERS).percent).toBe(50);
  });
});

describe("site_problems", () => {
  it("ranks problem equipment on a site", async () => {
    const result = await card("site_problems", "site_problems", {
      site: "участка дробления",
      period_days: 30,
    });
    expect(result).toMatchObject({
      site: { name: "Дробление" },
      days: 30,
      limited: false,
      total: 3,
      unplanned: 2,
      emergency: 0,
      overdueNow: 1,
    });
    expect(result.topEquipment[0]).toMatchObject({ name: "Конвейер К-3", unplanned: 2, total: 2 });
    expect(result.topFaults[0]).toMatchObject({ code: "М-02", count: 2 });
    expect(result.insights.map((insight) => insight.id)).toEqual(["i1"]);
    expect(result.openRca).toHaveLength(1);
  });

  it("flags sites outside the master's zone", async () => {
    const result = await card("site_problems", "site_problems", { site: "обогащение" });
    expect(result.limited).toBe(true);
    expect(result.insights.map((insight) => insight.id)).toEqual(["i2"]);
  });

  it("covers all sites when none is given", async () => {
    const result = await card(
      "site_problems",
      "site_problems",
      { period_days: 7 },
      { viewerSiteIds: null },
    );
    expect(result).toMatchObject({ site: null, limited: false, total: 5 });
    expect(result.insights).toHaveLength(2);
  });

  it("returns a lookup for an unknown site", async () => {
    expect((await card("lookup", "site_problems", { site: "луна" })).tool).toBe("site_problems");
  });
});

describe("create_work_order_draft", () => {
  it("prepares a draft link without writing anything", async () => {
    const { gateway, calls } = fakeGateway();
    const execution = await executeTool(
      "create_work_order_draft",
      { description: "Течь сальника на насосе Н-4, срочно" },
      { gateway, now: FIXTURE_NOW },
    );
    expect(execution.ok).toBe(true);
    const result = (execution as Extract<ToolExecution, { ok: true }>).card;
    expect(result).toMatchObject({
      kind: "draft",
      priority: "high",
      equipment: { name: "Насос Н-4", site: "Обогащение" },
      equipmentMiss: null,
    });
    const link = result.kind === "draft" ? result.link : "";
    expect(link.startsWith("/master/orders/new?draft=")).toBe(true);
    expect(decodeDraft(new URL(link, "http://localhost").searchParams.get("draft"))).toEqual({
      description: "Течь сальника на насосе Н-4, срочно",
      equipmentId: "00000000-0000-4000-8000-0000000000e4",
      priority: "high",
    });
    expect(Object.keys(calls).sort()).toEqual(["equipment", "sites"]);
  });

  it("uses the explicit equipment and priority", async () => {
    const result = await card("draft", "create_work_order_draft", {
      description: "Заменить футеровку",
      equipment: "кмд",
      priority: "planned",
    });
    expect(result).toMatchObject({ priority: "planned", equipment: { name: "Дробилка КМД-1750" } });
  });

  it("keeps the draft when the equipment is unclear", async () => {
    const result = await card("draft", "create_work_order_draft", {
      description: "Порыв ленты",
      equipment: "конвейер",
    });
    expect(result.equipment).toBeNull();
    expect(result.priority).toBe("normal");
    expect(result.equipmentMiss).toMatchObject({ status: "ambiguous" });
  });
});

describe("model payload", () => {
  it("drops identifiers, links and full names", async () => {
    const overdue = toModelPayload(await run("list_overdue", {}));
    expect(overdue).not.toMatch(/"id"|Id"|o1|Маратович/);
    expect(overdue).toContain("Ахметов Е.");
    const draft = toModelPayload(
      await run("create_work_order_draft", { description: "Течь на насосе Н-4" }),
    );
    expect(draft).not.toContain("/master/orders/new");
    expect(draft).not.toContain("0000000000e4");
  });

  it("returns errors as JSON", async () => {
    expect(toModelPayload(await run("nope", {}))).toBe('{"error":"unknown_tool"}');
  });
});

describe("memoizeGateway", () => {
  it("loads reference data once per run", async () => {
    const { gateway, calls } = fakeGateway();
    const memoized = memoizeGateway(gateway);
    await Promise.all([memoized.sites(), memoized.sites(), memoized.equipment()]);
    await memoized.workers();
    await memoized.workers();
    await memoized.openOrders();
    await memoized.viewerSiteIds();
    await memoized.ordersActiveBetween(FIXTURE_NOW, FIXTURE_NOW);
    await memoized.ordersIssuedSince(FIXTURE_NOW, {});
    await memoized.insightsSince(FIXTURE_NOW);
    await memoized.openRca([]);
    expect(calls).toMatchObject({ sites: 1, equipment: 1, workers: 1, openOrders: 1 });
  });
});
