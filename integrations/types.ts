import { z } from "zod";

export const externalMaterialSchema = z.object({
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  quantity: z.number(),
  price: z.number(),
});

export const externalWorkOrderSchema = z.object({
  externalId: z.string(),
  number: z.number().int(),
  kind: z.enum(["planned", "unplanned"]),
  priority: z.enum(["emergency", "high", "normal", "planned"]),
  status: z.string(),
  description: z.string(),
  workPerformed: z.string().nullable(),
  site: z.object({ code: z.string(), name: z.string() }),
  equipment: z.object({ inventoryNumber: z.string(), name: z.string() }),
  faultCode: z.string().nullable(),
  assigneePersonnelNumber: z.string().nullable(),
  masterPersonnelNumber: z.string().nullable(),
  issuedAt: z.string(),
  startedAt: z.string().nullable(),
  doneAt: z.string().nullable(),
  closedAt: z.string().nullable(),
  standardHours: z.number().nullable(),
  actualHours: z.number().nullable(),
  downtimeHours: z.number().nullable(),
  downtimeCost: z.number().nullable(),
  score: z.number().nullable(),
  materials: z.array(externalMaterialSchema),
});

export type ExternalWorkOrder = z.infer<typeof externalWorkOrderSchema>;

export const externalEquipmentSchema = z.object({
  inventoryNumber: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(160),
  siteCode: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_-]{2,16}$/),
  equipmentType: z.enum([
    "crusher",
    "conveyor",
    "pump",
    "screen",
    "mill",
    "classifier",
    "feeder",
    "fan",
    "compressor",
    "other",
  ]),
  criticality: z.number().int().min(1).max(3).default(2),
  downtimeCostPerHour: z.number().min(0).default(0),
  requiresLockout: z.boolean().default(true),
});

export type ExternalEquipment = z.infer<typeof externalEquipmentSchema>;

export type IntegrationEvent =
  | { type: "work_order.closed"; occurredAt: string; data: ExternalWorkOrder }
  | { type: "work_order.issued"; occurredAt: string; data: ExternalWorkOrder };

export interface MaintenanceSystemAdapter {
  readonly name: string;
  exportWorkOrders(orders: readonly ExternalWorkOrder[]): Promise<{ accepted: number }>;
  importEquipment(): Promise<ExternalEquipment[]>;
  publish(event: IntegrationEvent): Promise<void>;
}
