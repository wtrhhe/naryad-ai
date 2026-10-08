import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseJsonText,
  prepareStructuredSchema,
  toStrictJsonSchema,
  unwrapRootValue,
  validateWithSchema,
  wrapRootSchema,
  zodToJsonSchema,
} from "@/lib/ai/schema";

const verdict = z.object({
  verdict: z.enum(["accepted", "needs_review", "rejected"]),
  score: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  good: z.array(z.string().max(200)).max(5),
  note: z.string().nullable(),
  details: z.object({ id: z.string().uuid(), at: z.string().datetime() }).optional(),
});

describe("zodToJsonSchema", () => {
  it("drops the $schema marker and describes input shape", () => {
    const schema = zodToJsonSchema(z.object({ a: z.number().default(1), b: z.string() }));
    expect(schema).not.toHaveProperty("$schema");
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["b"]);
  });
});

describe("toStrictJsonSchema", () => {
  const strict = toStrictJsonSchema(zodToJsonSchema(verdict));
  const properties = strict.properties as Record<string, Record<string, unknown>>;

  it("closes every object", () => {
    expect(strict.additionalProperties).toBe(false);
    const details = properties.details as Record<string, unknown>;
    expect(details.additionalProperties).toBe(false);
  });

  it("keeps enums and supported formats", () => {
    expect(properties.verdict).toEqual({
      type: "string",
      enum: ["accepted", "needs_review", "rejected"],
    });
    const details = properties.details?.properties as Record<string, Record<string, unknown>>;
    expect(details.id).toEqual({ type: "string", format: "uuid" });
    expect(details.at?.format).toBe("date-time");
  });

  it("moves unsupported numeric and string constraints into the description", () => {
    expect(properties.score?.type).toBe("integer");
    expect(properties.score).not.toHaveProperty("minimum");
    expect(properties.score?.description).toBe("{minimum: 0, maximum: 100}");
    const good = properties.good as Record<string, unknown>;
    expect(good.description).toBe("{maxItems: 5}");
    expect((good.items as Record<string, unknown>).description).toBe("{maxLength: 200}");
  });

  it("omits the safe integer bounds zod adds to plain integers", () => {
    const schema = toStrictJsonSchema(zodToJsonSchema(z.object({ count: z.int() })));
    const count = (schema.properties as Record<string, Record<string, unknown>>).count;
    expect(count).toEqual({ type: "integer" });
  });

  it("turns nullable values into anyOf branches", () => {
    expect(properties.note).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
    const union = toStrictJsonSchema({ type: ["string", "number"] });
    expect(union).toEqual({ anyOf: [{ type: "string" }, { type: "number" }] });
  });

  it("converts oneOf and allOf, keeps refs and defs", () => {
    expect(toStrictJsonSchema({ oneOf: [{ type: "string" }, { type: "integer" }] })).toEqual({
      anyOf: [{ type: "string" }, { type: "integer" }],
    });
    expect(toStrictJsonSchema({ allOf: [{ type: "object", properties: {} }] })).toEqual({
      allOf: [{ type: "object", properties: {}, additionalProperties: false }],
    });
    const withDefs = toStrictJsonSchema({
      $defs: { node: { type: "object", properties: { x: { type: "string" } } } },
      $ref: "#/$defs/node",
    });
    expect(withDefs.$ref).toBe("#/$defs/node");
    expect(
      (withDefs.$defs as Record<string, Record<string, unknown>>).node?.additionalProperties,
    ).toBe(false);
  });

  it("keeps small minItems and describes records, tuples and unknown formats", () => {
    const schema = toStrictJsonSchema(
      zodToJsonSchema(
        z.object({
          tags: z.array(z.string()).min(1),
          many: z.array(z.string()).min(2),
          map: z.record(z.string(), z.number()),
          pair: z.tuple([z.string(), z.number()]),
          code: z.string().regex(/^[A-Z]+$/),
        }),
      ),
    );
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.tags?.minItems).toBe(1);
    expect(properties.many?.minItems).toBeUndefined();
    expect(properties.many?.description).toContain("minItems: 2");
    expect(properties.map?.additionalProperties).toBe(false);
    expect(properties.map?.description).toContain("additionalProperties");
    expect(properties.pair?.items).toEqual({ anyOf: [{ type: "string" }, { type: "number" }] });
    expect(properties.code?.description).toContain("pattern");
    const email = toStrictJsonSchema({ type: "string", format: "phone", description: "Номер" });
    expect(email).toEqual({ type: "string", description: 'Номер\n\n{format: "phone"}' });
  });
});

describe("root wrapping", () => {
  it("leaves object roots untouched", () => {
    const prepared = prepareStructuredSchema(verdict);
    expect(prepared.wrapped).toBe(false);
    expect(prepared.strict.type).toBe("object");
    expect(prepared.plain).toHaveProperty("properties.score.minimum", 0);
  });

  it("wraps non-object roots and unwraps the value", () => {
    const prepared = prepareStructuredSchema(z.array(z.string()));
    expect(prepared.wrapped).toBe(true);
    expect(prepared.strict).toEqual({
      type: "object",
      properties: { result: { type: "array", items: { type: "string" } } },
      required: ["result"],
      additionalProperties: false,
    });
    expect(unwrapRootValue({ result: ["a"] }, true)).toEqual(["a"]);
    expect(unwrapRootValue(["a"], true)).toBeUndefined();
    expect(unwrapRootValue(["a"], false)).toEqual(["a"]);
  });

  it("hoists definitions to the wrapper", () => {
    const wrapped = wrapRootSchema({ type: "array", $defs: { a: { type: "string" } } });
    expect(wrapped.schema.$defs).toEqual({ a: { type: "string" } });
  });
});

describe("validateWithSchema", () => {
  it("returns the parsed value", () => {
    expect(validateWithSchema(z.object({ a: z.number() }), { a: 1 })).toEqual({
      ok: true,
      value: { a: 1 },
    });
  });

  it("summarises issues", () => {
    const result = validateWithSchema(z.object({ a: z.number() }), { a: "x" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/^Response does not match schema: a:/);
    const root = validateWithSchema(z.number(), "x");
    expect(!root.ok && root.message).toContain("(root)");
  });
});

describe("parseJsonText", () => {
  it("parses plain, fenced and embedded JSON", () => {
    expect(parseJsonText('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonText('```json\n{"a":2}\n```')).toEqual({ ok: true, value: { a: 2 } });
    expect(parseJsonText('Ответ: {"a":3} готово')).toEqual({ ok: true, value: { a: 3 } });
    expect(parseJsonText("[1,2]")).toEqual({ ok: true, value: [1, 2] });
  });

  it("reports invalid text", () => {
    expect(parseJsonText("нет json")).toEqual({ ok: false });
    expect(parseJsonText("{broken")).toEqual({ ok: false });
    expect(parseJsonText("x {a: 1} y")).toEqual({ ok: false });
  });
});
