import type { EquipmentType } from "@/lib/domain/assignment";

export interface FaultCodeRef {
  id: string;
  code: string;
  name: string;
  category: string;
  standardHours: number;
}

export interface OrderFieldSuggestion {
  kind: "planned" | "unplanned";
  priority: "emergency" | "high" | "normal" | "planned";
  faultCodeId: string | null;
  standardHours: number | null;
  confidence: number;
  source: "rules" | "llm";
  matchedKeywords: readonly string[];
}

export interface SuggestionContext {
  description: string;
  equipmentType: EquipmentType | null;
  faultCodes: readonly FaultCodeRef[];
}

export type SuggestOrderFields = (context: SuggestionContext) => Promise<OrderFieldSuggestion>;
