import { signPayload, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "@/integrations/signing";
import type {
  ExternalEquipment,
  ExternalWorkOrder,
  IntegrationEvent,
  MaintenanceSystemAdapter,
} from "@/integrations/types";
import { externalEquipmentSchema } from "@/integrations/types";

export interface RestAdapterOptions {
  baseUrl: string;
  secret: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function createRestAdapter(options: RestAdapterOptions): MaintenanceSystemAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const post = async (path: string, payload: unknown) => {
    const body = JSON.stringify(payload);
    const timestamp = now();
    const response = await fetchImpl(new URL(path, options.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [TIMESTAMP_HEADER]: String(timestamp),
        [SIGNATURE_HEADER]: signPayload(body, options.secret, timestamp),
      },
      body,
    });
    if (!response.ok) {
      throw new Error(`integration request failed with ${response.status}`);
    }
    return response;
  };
  return {
    name: "rest",
    async exportWorkOrders(orders: readonly ExternalWorkOrder[]) {
      await post("work-orders", { orders });
      return { accepted: orders.length };
    },
    async importEquipment(): Promise<ExternalEquipment[]> {
      const response = await fetchImpl(new URL("equipment", options.baseUrl));
      if (!response.ok) {
        throw new Error(`integration request failed with ${response.status}`);
      }
      return externalEquipmentSchema.array().parse(await response.json());
    },
    async publish(event: IntegrationEvent) {
      await post("events", event);
    },
  };
}
