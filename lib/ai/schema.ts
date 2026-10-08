import { z } from "zod";

export type JsonSchema = Record<string, unknown>;

export const WRAPPED_RESULT_KEY = "result";

const STRICT_STRING_FORMATS: ReadonlySet<string> = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);

const DROPPED_KEYWORDS: ReadonlySet<string> = new Set(["$schema", "$id", "propertyNames"]);

const SAFE_INTEGER_BOUND = Number.MAX_SAFE_INTEGER;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function zodToJsonSchema(schema: z.ZodType): JsonSchema {
  const generated = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as JsonSchema;
  const { $schema: _ignored, ...rest } = generated;
  return rest;
}

export function isObjectSchema(schema: JsonSchema): boolean {
  return schema.type === "object";
}

export function wrapRootSchema(schema: JsonSchema): { schema: JsonSchema; wrapped: boolean } {
  if (isObjectSchema(schema)) {
    return { schema, wrapped: false };
  }
  const { $defs, ...inner } = schema;
  return {
    schema: {
      type: "object",
      properties: { [WRAPPED_RESULT_KEY]: inner },
      required: [WRAPPED_RESULT_KEY],
      ...(isRecord($defs) ? { $defs } : {}),
    },
    wrapped: true,
  };
}

export function unwrapRootValue(value: unknown, wrapped: boolean): unknown {
  if (!wrapped) {
    return value;
  }
  return isRecord(value) ? value[WRAPPED_RESULT_KEY] : undefined;
}

function describeLeftovers(
  description: unknown,
  leftovers: Record<string, unknown>,
): string | null {
  const entries = Object.entries(leftovers).filter(([key, value]) => {
    if (DROPPED_KEYWORDS.has(key)) {
      return false;
    }
    if ((key === "minimum" || key === "maximum") && typeof value === "number") {
      return Math.abs(value) < SAFE_INTEGER_BOUND;
    }
    return true;
  });
  const base = typeof description === "string" && description.length > 0 ? description : null;
  if (entries.length === 0) {
    return base;
  }
  const constraints = `{${entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(", ")}}`;
  return base ? `${base}\n\n${constraints}` : constraints;
}

function strictBranch(node: JsonSchema): JsonSchema {
  const working: Record<string, unknown> = { ...node };
  const result: JsonSchema = {};
  const take = (key: string): unknown => {
    const value = working[key];
    delete working[key];
    return value;
  };

  const defs = take("$defs");
  if (isRecord(defs)) {
    result.$defs = Object.fromEntries(
      Object.entries(defs).map(([name, definition]) => [
        name,
        isRecord(definition) ? toStrictJsonSchema(definition) : definition,
      ]),
    );
  }

  const ref = take("$ref");
  if (typeof ref === "string") {
    result.$ref = ref;
    return result;
  }

  const type = take("type");
  const anyOf = take("anyOf");
  const oneOf = take("oneOf");
  const allOf = take("allOf");
  const variants = Array.isArray(anyOf) ? anyOf : Array.isArray(oneOf) ? oneOf : null;

  if (Array.isArray(type)) {
    const shared = { ...working };
    return {
      ...result,
      anyOf: type.map((single) =>
        single === "null"
          ? { type: "null" }
          : toStrictJsonSchema({ ...shared, type: single } as JsonSchema),
      ),
    };
  }

  if (variants) {
    result.anyOf = variants.map((variant) =>
      isRecord(variant) ? toStrictJsonSchema(variant) : variant,
    );
  } else if (Array.isArray(allOf)) {
    result.allOf = allOf.map((entry) => (isRecord(entry) ? toStrictJsonSchema(entry) : entry));
  } else if (type !== undefined) {
    result.type = type;
  }

  for (const key of ["enum", "const", "title"]) {
    const value = take(key);
    if (value !== undefined) {
      result[key] = value;
    }
  }
  const description = take("description");

  if (type === "object") {
    const properties = take("properties");
    result.properties = isRecord(properties)
      ? Object.fromEntries(
          Object.entries(properties).map(([key, value]) => [
            key,
            isRecord(value) ? toStrictJsonSchema(value) : value,
          ]),
        )
      : {};
    const required = take("required");
    if (Array.isArray(required)) {
      result.required = required;
    }
    const additional = take("additionalProperties");
    if (isRecord(additional)) {
      working.additionalProperties = additional;
    }
    result.additionalProperties = false;
  } else if (type === "string") {
    const format = take("format");
    if (typeof format === "string" && STRICT_STRING_FORMATS.has(format)) {
      result.format = format;
      if (format === "uuid") {
        delete working.pattern;
      }
    } else if (format !== undefined) {
      working.format = format;
    }
  } else if (type === "array") {
    const items = take("items");
    const prefixItems = take("prefixItems");
    if (Array.isArray(prefixItems)) {
      result.items = {
        anyOf: prefixItems.map((entry) => (isRecord(entry) ? toStrictJsonSchema(entry) : entry)),
      };
    } else if (isRecord(items)) {
      result.items = toStrictJsonSchema(items);
    }
    const minItems = take("minItems");
    if (minItems === 0 || minItems === 1) {
      result.minItems = minItems;
    } else if (minItems !== undefined) {
      working.minItems = minItems;
    }
  }

  const merged = describeLeftovers(description, working);
  if (merged !== null) {
    result.description = merged;
  }
  return result;
}

export function toStrictJsonSchema(schema: JsonSchema): JsonSchema {
  return strictBranch(schema);
}

export interface PreparedSchema {
  plain: JsonSchema;
  strict: JsonSchema;
  wrapped: boolean;
}

export function prepareStructuredSchema(schema: z.ZodType): PreparedSchema {
  const plain = zodToJsonSchema(schema);
  const { schema: root, wrapped } = wrapRootSchema(plain);
  return { plain, strict: toStrictJsonSchema(root), wrapped };
}

export function validateWithSchema<T>(
  schema: z.ZodType<T>,
  value: unknown,
): { ok: true; value: T } | { ok: false; message: string } {
  const parsed = schema.safeParse(value);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  const issues = parsed.error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  return { ok: false, message: `Response does not match schema: ${issues}` };
}

export function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const candidate = fenced?.[1] ?? trimmed;
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch {
    const start = candidate.search(/[[{]/);
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      try {
        return { ok: true, value: JSON.parse(candidate.slice(start, end + 1)) };
      } catch {
        return { ok: false };
      }
    }
    return { ok: false };
  }
}
