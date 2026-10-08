import { describe, expect, it, vi } from "vitest";
import {
  toEquipmentRow,
  toExternalWorkOrder,
  type WorkOrderExportRow,
} from "@/integrations/mappers";
import {
  isAuthorizedIntegrationRequest,
  signPayload,
  verifySignature,
} from "@/integrations/signing";
import { createRestAdapter } from "@/integrations/adapters/rest";
import { externalEquipmentSchema, externalWorkOrderSchema } from "@/integrations/types";
import { parseIntegrationEnv } from "@/integrations/config";

const row: WorkOrderExportRow = {
  id: "11111111-1111-4111-8111-111111111111",
  number: 147,
  kind: "unplanned",
  priority: "emergency",
  status: "closed",
  description: "Течь масла",
  work_performed: "Заменён сальник",
  issued_at: "2026-10-16T08:00:00Z",
  started_at: "2026-10-16T08:30:00Z",
  done_at: "2026-10-16T10:30:00Z",
  closed_at: "2026-10-16T11:00:00Z",
  paused_seconds: 1800,
  standard_hours: 2,
  downtime_started_at: "2026-10-16T08:00:00Z",
  downtime_ended_at: "2026-10-16T11:00:00Z",
  downtime_cost: 1080000,
  site: { code: "ENRICH", name: "Обогащение" },
  equipment: { inventory_number: "INV-0401", name: "Насос Н-4" },
  fault_code: { code: "Г-01" },
  assignee: { personnel_number: "2001" },
  master: { personnel_number: "1002" },
  material_writeoffs: [
    { quantity: 2, material: { code: "M-001", name: "Сальник", unit: "шт", price: 4500 } },
    { quantity: 1, material: null },
  ],
  ai_reviews: [
    { revision: 0, score: 55, master_score: null },
    { revision: 1, score: 82, master_score: 88 },
  ],
};

describe("toExternalWorkOrder", () => {
  it("maps a closed order into the exchange format", () => {
    const order = toExternalWorkOrder(row);
    expect(externalWorkOrderSchema.parse(order)).toEqual(order);
    expect(order).toMatchObject({
      number: 147,
      faultCode: "Г-01",
      actualHours: 1.5,
      downtimeHours: 3,
      score: 88,
      equipment: { inventoryNumber: "INV-0401", name: "Насос Н-4" },
    });
    expect(order.materials).toEqual([
      { code: "M-001", name: "Сальник", unit: "шт", quantity: 2, price: 4500 },
    ]);
  });

  it("leaves open intervals and missing reviews empty", () => {
    const order = toExternalWorkOrder({
      ...row,
      done_at: null,
      downtime_ended_at: null,
      ai_reviews: [],
    });
    expect(order).toMatchObject({ actualHours: null, downtimeHours: null, score: null });
  });
});

describe("toEquipmentRow", () => {
  it("applies defaults from the schema", () => {
    const item = externalEquipmentSchema.parse({
      inventoryNumber: "INV-9",
      name: "Насос",
      siteCode: "ENRICH",
      equipmentType: "pump",
    });
    expect(toEquipmentRow(item, "site-1")).toEqual({
      inventory_number: "INV-9",
      name: "Насос",
      site_id: "site-1",
      equipment_type: "pump",
      criticality: 2,
      downtime_cost_per_hour: 0,
      requires_lockout: true,
    });
  });
});

describe("signing", () => {
  const secret = "s".repeat(40);

  it("verifies a fresh signature and rejects tampering or stale timestamps", () => {
    const signature = signPayload("{}", secret, 1000);
    expect(verifySignature("{}", secret, 1000, signature, 1100)).toBe(true);
    expect(verifySignature("{ }", secret, 1000, signature, 1100)).toBe(false);
    expect(verifySignature("{}", secret, 1000, signature, 2000)).toBe(false);
    expect(verifySignature("{}", "", 1000, signature, 1000)).toBe(false);
  });

  it("requires a long bearer token", () => {
    const token = "t".repeat(32);
    expect(isAuthorizedIntegrationRequest(`Bearer ${token}`, token)).toBe(true);
    expect(isAuthorizedIntegrationRequest(`Bearer ${token}`, "short")).toBe(false);
    expect(isAuthorizedIntegrationRequest(null, token)).toBe(false);
  });
});

describe("createRestAdapter", () => {
  it("posts signed events and parses imported equipment", async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      if (String(url).endsWith("/equipment") && !init) {
        return new Response(
          JSON.stringify([
            {
              inventoryNumber: "INV-1",
              name: "Конвейер",
              siteCode: "CRUSH",
              equipmentType: "conveyor",
            },
          ]),
        );
      }
      return new Response("{}");
    }) as unknown as typeof fetch;
    const adapter = createRestAdapter({
      baseUrl: "https://toir.example/api/",
      secret: "k".repeat(40),
      fetchImpl,
      now: () => 1000,
    });
    await adapter.publish({
      type: "work_order.closed",
      occurredAt: "2026-10-16T11:00:00Z",
      data: toExternalWorkOrder(row),
    });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] ?? [];
    expect(String(url)).toBe("https://toir.example/api/events");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-naryad-signature"]).toBe(
      signPayload(String(init?.body), "k".repeat(40), 1000),
    );
    await expect(adapter.importEquipment()).resolves.toHaveLength(1);
    await expect(adapter.exportWorkOrders([])).resolves.toEqual({ accepted: 0 });
  });

  it("throws on failed requests", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("no", { status: 503 }),
    ) as unknown as typeof fetch;
    const adapter = createRestAdapter({ baseUrl: "https://toir.example/", secret: "k", fetchImpl });
    await expect(adapter.exportWorkOrders([])).rejects.toThrow(/503/);
  });
});

describe("parseIntegrationEnv", () => {
  it("defaults to disabled integration", () => {
    expect(parseIntegrationEnv({})).toEqual({
      INTEGRATION_API_TOKEN: "",
      INTEGRATION_WEBHOOK_URL: "",
      INTEGRATION_WEBHOOK_SECRET: "",
    });
  });
});
