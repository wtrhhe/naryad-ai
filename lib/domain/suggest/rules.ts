import type {
  FaultCodeRef,
  OrderFieldSuggestion,
  SuggestionContext,
} from "@/lib/domain/suggest/types";

interface FaultRule {
  code: string;
  patterns: readonly RegExp[];
  weight: number;
}

const FAULT_RULES: readonly FaultRule[] = [
  { code: "М-05", patterns: [/сальник/, /уплотнени/], weight: 3 },
  { code: "М-02", patterns: [/подшипник/, /вибрац/, /\bшум/, /гудит|гул/], weight: 2 },
  { code: "М-03", patterns: [/лент[аыу]/, /сход ленты/, /порыв/], weight: 2 },
  { code: "М-04", patterns: [/ролик/, /роликоопор/], weight: 2 },
  { code: "М-01", patterns: [/футеровк/, /бронефутер/], weight: 3 },
  { code: "М-06", patterns: [/трещин/, /сварн|сварк/, /\bшов/, /рам[аеы]/], weight: 2 },
  { code: "М-07", patterns: [/муфт/, /зацеплен/, /редуктор/, /шестерн/], weight: 2 },
  { code: "Г-02", patterns: [/гидроцилиндр/], weight: 3 },
  { code: "Г-03", patterns: [/гидронасос/, /маслостанц/], weight: 3 },
  { code: "Г-01", patterns: [/утечк|течь|подтек|капает/, /гидравл|масл/], weight: 1 },
  { code: "П-02", patterns: [/пневмоклапан|пневмоцилиндр/], weight: 3 },
  { code: "П-01", patterns: [/пневм|воздух/, /утечк|травит|шипит/], weight: 1 },
  { code: "С-03", patterns: [/централизован/, /станци[яи] смазки/], weight: 3 },
  { code: "С-02", patterns: [/загрязн|грязн|деградац/, /смазк|масл/], weight: 1 },
  { code: "С-01", patterns: [/смазк|смазать|смазыван/], weight: 1 },
  { code: "Э-01", patterns: [/перегрев|греется|горяч/, /двигател|мотор/], weight: 1 },
  { code: "Э-01", patterns: [/выбивает|отключается|срабатывает защита/], weight: 2 },
  { code: "Э-02", patterns: [/изоляц|пробой|замыкан|кз\b/], weight: 3 },
  { code: "Э-03", patterns: [/пускател|контактор|не запускается|не включается/], weight: 3 },
  { code: "Э-04", patterns: [/кабел|провод/], weight: 2 },
  { code: "Э-05", patterns: [/датчик|кипиа|\bкип\b|прибор|сигнализац/], weight: 2 },
];

const EMERGENCY =
  /авари|срочн|пожар|дым|искрит|задымлен|останов|встал|стоит|не работает|разруш|обрыв/;
const HIGH = /сильн|быстро|растёт|растет|нараста|критич|опасн/;
const PLANNED = /планов|ппр|осмотр|профилакт|по графику|ревизи|техобслуж|\bто\b/;

function normalize(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function ruleScore(rule: FaultRule, text: string): { score: number; matched: string[] } {
  const matched = rule.patterns
    .map((pattern) => text.match(pattern)?.[0])
    .filter((value): value is string => typeof value === "string");
  if (matched.length < rule.patterns.length && rule.weight === 1) {
    return { score: 0, matched: [] };
  }
  return { score: matched.length * rule.weight, matched };
}

function bestFault(
  text: string,
  faultCodes: readonly FaultCodeRef[],
  equipmentType: SuggestionContext["equipmentType"],
): { fault: FaultCodeRef | null; matched: string[]; score: number } {
  const byCode = new Map(faultCodes.map((fault) => [fault.code, fault]));
  let best: { fault: FaultCodeRef | null; matched: string[]; score: number } = {
    fault: null,
    matched: [],
    score: 0,
  };
  for (const rule of FAULT_RULES) {
    const fault = byCode.get(rule.code);
    if (!fault) continue;
    const { score, matched } = ruleScore(rule, text);
    const boosted =
      score > 0 && equipmentType === "pump" && rule.code === "М-05" ? score + 1 : score;
    if (boosted > best.score) best = { fault, matched, score: boosted };
  }
  if (!best.fault && equipmentType === "pump" && /течь|утечк|подтек/.test(text)) {
    const gland = byCode.get("М-05");
    if (gland) return { fault: gland, matched: ["течь"], score: 1 };
  }
  return best;
}

export async function suggestOrderFields(
  context: SuggestionContext,
): Promise<OrderFieldSuggestion> {
  return suggestOrderFieldsSync(context);
}

export function suggestOrderFieldsSync(context: SuggestionContext): OrderFieldSuggestion {
  const text = normalize(context.description);
  const planned = PLANNED.test(text);
  const emergency = !planned && EMERGENCY.test(text);
  const high = !planned && !emergency && HIGH.test(text);
  const { fault, matched, score } = bestFault(text, context.faultCodes, context.equipmentType);
  const priorityWords = [
    ...(planned ? [text.match(PLANNED)?.[0]] : []),
    ...(emergency ? [text.match(EMERGENCY)?.[0]] : []),
    ...(high ? [text.match(HIGH)?.[0]] : []),
  ].filter((value): value is string => typeof value === "string");
  return {
    kind: planned ? "planned" : "unplanned",
    priority: planned ? "planned" : emergency ? "emergency" : high ? "high" : "normal",
    faultCodeId: fault?.id ?? null,
    standardHours: fault?.standardHours ?? null,
    confidence: Math.min(
      0.9,
      (fault ? 0.35 + 0.12 * score : 0.2) + (priorityWords.length > 0 ? 0.1 : 0),
    ),
    source: "rules",
    matchedKeywords: [...new Set([...matched, ...priorityWords])],
  };
}
