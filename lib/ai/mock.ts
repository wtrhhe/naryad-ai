import type { z } from "zod";
import { errorMessage, failure } from "@/lib/ai/runtime";
import { validateWithSchema, zodToJsonSchema, type JsonSchema } from "@/lib/ai/schema";
import type {
  AiFailureCode,
  AiFeature,
  AiJsonRequest,
  AiOutcome,
  AiProvider,
  AiTextRequest,
  AiTier,
  AiToolsRequest,
  AiToolsResponse,
  AiUsage,
} from "@/lib/ai/types";

export interface MockFixture {
  json?: (request: AiJsonRequest<unknown>) => unknown;
  text?: (request: AiTextRequest) => string;
  tools?: (request: AiToolsRequest) => AiToolsResponse;
  failure?: AiFailureCode;
}

export type MockFixtures = Partial<Record<AiFeature, MockFixture>>;

export const MOCK_MODELS: Readonly<Record<AiTier, string>> = {
  smart: "mock-smart",
  fast: "mock-fast",
};

const DEFAULT_TEXT = "Готово.";

const DEFAULT_TEXTS: Partial<Record<AiFeature, string>> = {
  rating_explanation:
    "Рейтинг складывается из качества работ, соблюдения сроков, отсутствия доработок и объёма выполненных нарядов.",
  shift_summary:
    "Смена прошла штатно: основные наряды закрыты в срок, критичных замечаний по качеству нет.",
  insight_text:
    "Повторяющиеся отказы сосредоточены на одном участке — рекомендуется внеплановый осмотр оборудования.",
  rca_draft:
    "Вероятная причина — износ узла. Меры: заменить изношенные детали и проверить узел на ближайшем ТО.",
  acoustic_text: "После ремонта уровень вибрации снизился — дефект устранён.",
  notification_text: "Наряд требует внимания.",
  assistant: DEFAULT_TEXT,
};

const defaults = new Map<AiFeature, MockFixture>(
  Object.entries(DEFAULT_TEXTS).map(([feature, text]) => [
    feature as AiFeature,
    { text: () => text },
  ]),
);
const overrides = new Map<AiFeature, MockFixture>();

export function registerMockDefault(feature: AiFeature, fixture: MockFixture): void {
  defaults.set(feature, { ...defaults.get(feature), ...fixture });
}

export function setMockFixture(feature: AiFeature, fixture: MockFixture): () => void {
  const previous = overrides.get(feature);
  overrides.set(feature, fixture);
  return () => {
    if (previous) {
      overrides.set(feature, previous);
    } else {
      overrides.delete(feature);
    }
  };
}

export function resetMockFixtures(): void {
  overrides.clear();
}

const SAMPLE_STRING = "Демо";
const SAMPLE_FORMATS: Readonly<Record<string, string>> = {
  "date-time": "2026-01-01T00:00:00.000Z",
  date: "2026-01-01",
  time: "00:00:00",
  uuid: "00000000-0000-4000-8000-000000000000",
  email: "demo@example.com",
  uri: "https://example.com",
};
const MAX_SAMPLE_DEPTH = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sampleString(node: Record<string, unknown>): string {
  const format = typeof node.format === "string" ? SAMPLE_FORMATS[node.format] : undefined;
  if (format) {
    return format;
  }
  const minLength = typeof node.minLength === "number" ? node.minLength : 0;
  const maxLength = typeof node.maxLength === "number" ? node.maxLength : Infinity;
  const padded = SAMPLE_STRING.padEnd(minLength, "о");
  return padded.slice(0, Math.max(minLength, Math.min(padded.length, maxLength)));
}

function sampleNumber(node: Record<string, unknown>, integer: boolean): number {
  if (typeof node.minimum === "number") {
    return integer ? Math.ceil(node.minimum) : node.minimum;
  }
  if (typeof node.exclusiveMinimum === "number") {
    return integer ? Math.floor(node.exclusiveMinimum) + 1 : node.exclusiveMinimum + 0.5;
  }
  if (typeof node.maximum === "number" && node.maximum < 0) {
    return integer ? Math.floor(node.maximum) : node.maximum;
  }
  if (typeof node.exclusiveMaximum === "number" && node.exclusiveMaximum <= 0) {
    return integer ? Math.ceil(node.exclusiveMaximum) - 1 : node.exclusiveMaximum - 0.5;
  }
  return 0;
}

export function sampleFromJsonSchema(
  schema: JsonSchema,
  root: JsonSchema = schema,
  depth = 0,
): unknown {
  if (depth > MAX_SAMPLE_DEPTH) {
    return null;
  }
  if ("const" in schema) {
    return schema.const;
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }
  if ("default" in schema) {
    return schema.default;
  }
  if (typeof schema.$ref === "string") {
    const name = schema.$ref.replace(/^#\/\$defs\//u, "");
    const definition = isRecord(root.$defs) ? root.$defs[name] : undefined;
    return isRecord(definition) ? sampleFromJsonSchema(definition, root, depth + 1) : null;
  }
  const variants = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : Array.isArray(schema.allOf)
        ? schema.allOf
        : null;
  if (variants) {
    const preferred =
      variants.find((variant) => isRecord(variant) && variant.type !== "null") ?? variants[0];
    return isRecord(preferred) ? sampleFromJsonSchema(preferred, root, depth + 1) : null;
  }
  const type = Array.isArray(schema.type)
    ? (schema.type.find((entry) => entry !== "null") ?? schema.type[0])
    : schema.type;
  switch (type) {
    case "object": {
      const properties = isRecord(schema.properties) ? schema.properties : {};
      const required = Array.isArray(schema.required) ? schema.required : [];
      return Object.fromEntries(
        required
          .filter((key): key is string => typeof key === "string")
          .map((key) => {
            const property = properties[key];
            return [
              key,
              isRecord(property) ? sampleFromJsonSchema(property, root, depth + 1) : null,
            ];
          }),
      );
    }
    case "array": {
      const count = typeof schema.minItems === "number" ? schema.minItems : 0;
      const items = isRecord(schema.items) ? schema.items : {};
      return Array.from({ length: count }, () => sampleFromJsonSchema(items, root, depth + 1));
    }
    case "string":
      return sampleString(schema);
    case "integer":
      return sampleNumber(schema, true);
    case "number":
      return sampleNumber(schema, false);
    case "boolean":
      return false;
    default:
      return null;
  }
}

export function sampleFromSchema(schema: z.ZodType): unknown {
  return sampleFromJsonSchema(zodToJsonSchema(schema));
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateUsage(input: string, output: string): AiUsage {
  return {
    inputTokens: estimateTokens(input),
    outputTokens: estimateTokens(output),
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

function lastUserContent(request: AiToolsRequest): string {
  return request.messages.findLast((message) => message.role === "user")?.content ?? "";
}

export interface MockProviderOptions {
  fixtures?: MockFixtures;
}

export class MockProvider implements AiProvider {
  readonly name = "mock" as const;
  readonly enabled = true;
  private readonly fixtures: MockFixtures;

  constructor(options: MockProviderOptions = {}) {
    this.fixtures = options.fixtures ?? {};
  }

  modelFor(tier: AiTier): string {
    return MOCK_MODELS[tier];
  }

  private fixtureFor(feature: AiFeature): MockFixture {
    return this.fixtures[feature] ?? overrides.get(feature) ?? defaults.get(feature) ?? {};
  }

  async json<T>(request: AiJsonRequest<T>): Promise<AiOutcome<T>> {
    const model = this.modelFor(request.tier);
    const fixture = this.fixtureFor(request.feature);
    if (fixture.failure) {
      return failure(fixture.failure, `Mock failure for ${request.feature}`, { model });
    }
    try {
      const raw = fixture.json
        ? fixture.json(request as AiJsonRequest<unknown>)
        : sampleFromSchema(request.schema);
      const validated = validateWithSchema(request.schema, raw);
      const usage = estimateUsage(request.system + request.prompt, JSON.stringify(raw) ?? "");
      if (!validated.ok) {
        return failure("invalid_response", validated.message, { model, usage });
      }
      return { ok: true, value: validated.value, model, cached: false, usage };
    } catch (error) {
      return failure("provider_error", errorMessage(error), { model });
    }
  }

  async text(request: AiTextRequest): Promise<AiOutcome<string>> {
    const model = this.modelFor(request.tier);
    const fixture = this.fixtureFor(request.feature);
    if (fixture.failure) {
      return failure(fixture.failure, `Mock failure for ${request.feature}`, { model });
    }
    try {
      const value = fixture.text ? fixture.text(request) : DEFAULT_TEXT;
      return {
        ok: true,
        value,
        model,
        cached: false,
        usage: estimateUsage(request.system + request.prompt, value),
      };
    } catch (error) {
      return failure("provider_error", errorMessage(error), { model });
    }
  }

  async tools(request: AiToolsRequest): Promise<AiOutcome<AiToolsResponse>> {
    const model = this.modelFor(request.tier);
    const fixture = this.fixtureFor(request.feature);
    if (fixture.failure) {
      return failure(fixture.failure, `Mock failure for ${request.feature}`, { model });
    }
    try {
      const value: AiToolsResponse = fixture.tools
        ? fixture.tools(request)
        : {
            text: fixture.text
              ? fixture.text({ ...request, prompt: lastUserContent(request) })
              : DEFAULT_TEXT,
            toolCalls: [],
            stopReason: "end",
          };
      const input = request.system + request.messages.map((message) => message.content).join("\n");
      return {
        ok: true,
        value: {
          ...value,
          assistantMessage: value.assistantMessage ?? {
            role: "assistant",
            content: value.text,
            toolCalls: value.toolCalls,
          },
        },
        model,
        cached: false,
        usage: estimateUsage(input, value.text + JSON.stringify(value.toolCalls)),
      };
    } catch (error) {
      return failure("provider_error", errorMessage(error), { model });
    }
  }
}
