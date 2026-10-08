import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { analyzeDataset, type AnalysisResult } from "@/lib/analytics/analyze";
import type { Insight, InsightKind, InsightOf } from "@/lib/analytics/insight";
import { fetchAnalyticsDataset } from "@/lib/analytics/source";
import type { AnalyticsDataset } from "@/lib/analytics/types";
import type { Database } from "@/lib/supabase/database.types";

const enabled = process.env.ANALYTICS_IT === "1";
const WINDOWS = [30, 90] as const;

function ofKind<K extends InsightKind>(result: AnalysisResult, kind: K): InsightOf<K>[] {
  return result.insights.filter(
    (insight): insight is InsightOf<K> & Insight => insight.kind === kind,
  );
}

describe.skipIf(!enabled)("analytics finds the seeded patterns", () => {
  let dataset: AnalyticsDataset;
  const results = new Map<number, AnalysisResult>();
  const equipmentId = (name: string) => dataset.equipment.find((item) => item.name === name)?.id;

  beforeAll(async () => {
    const client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await client
      .from("work_orders")
      .select("issued_at")
      .order("issued_at", { ascending: false })
      .limit(1)
      .single();
    if (error || !data) throw new Error(`seeded orders are missing: ${error?.message}`);
    const now = new Date(Date.parse(data.issued_at) + 3_600_000);
    dataset = await fetchAnalyticsDataset(client, { now });
    for (const days of WINDOWS) results.set(days, analyzeDataset(dataset, { windowDays: days }));
  }, 60_000);

  it.each(WINDOWS)(
    "pattern 1: conveyor К-3 breaks most, mostly bearings, high risk (%i days)",
    (days) => {
      const result = results.get(days) as AnalysisResult;
      const k3 = equipmentId("Конвейер К-3");
      const problem = ofKind(result, "problem_equipment").find(
        (insight) => insight.entityId === k3,
      );
      expect(problem).toBeDefined();
      expect(problem?.params.peerRatio).toBeGreaterThanOrEqual(2.3);
      expect(problem?.params.topFaultCode).toBe("М-02");
      expect(
        (problem?.params.topFaultCount ?? 0) / (problem?.params.unplanned ?? 1),
      ).toBeGreaterThan(0.6);
      const risks = ofKind(result, "failure_risk");
      expect(risks.map((insight) => insight.entityId)).toEqual([k3]);
      expect(risks[0]?.severity).toBe(3);
      expect(risks[0]?.params.score).toBeGreaterThanOrEqual(70);
      expect(risks[0]?.params.factors).toContain("acoustic");
      expect(risks[0]?.params.acoustic?.peakSlope).toBeGreaterThan(3);
    },
  );

  it.each(WINDOWS)(
    "pattern 2: one worker gets repeat failures after his repairs (%i days)",
    (days) => {
      const result = results.get(days) as AnalysisResult;
      const workers = ofKind(result, "worker_repeat_failures");
      expect(workers.map((insight) => insight.params.personnelNumber)).toEqual(["2004"]);
      expect(workers[0]?.severity).toBeGreaterThanOrEqual(2);
      expect(workers[0]?.params.rate).toBeGreaterThan(2 * (workers[0]?.params.teamRate ?? 100));
      expect(ofKind(result, "brigade_repeat_failures")).toEqual([]);
    },
  );

  it.each(WINDOWS)(
    "pattern 3: crusher КМД-1750 fails right after planned repairs (%i days)",
    (days) => {
      const result = results.get(days) as AnalysisResult;
      const findings = ofKind(result, "post_maintenance_failure");
      expect(findings.map((insight) => insight.entityId)).toEqual([
        equipmentId("Дробилка КМД-1750"),
      ]);
      const [crusher] = findings;
      expect(crusher?.params.followed).toBe(crusher?.params.maintenances);
      expect(crusher?.params.medianGapDays).toBeLessThanOrEqual(5);
    },
  );

  it.each(WINDOWS)("pattern 4: enrichment night shift overuses materials (%i days)", (days) => {
    const result = results.get(days) as AnalysisResult;
    const [top, ...rest] = ofKind(result, "material_overuse");
    expect(top?.params.dimension).toBe("site_period");
    expect(top?.params.site).toBe("Обогащение");
    expect(top?.params.period).toBe("night");
    expect(top?.params.overusePercent).toBeGreaterThan(25);
    expect(top?.params.overusePercent).toBeLessThan(55);
    expect(top?.severity).toBe(3);
    expect(rest).toEqual([]);
  });

  it.each(WINDOWS)(
    "pattern 5: pump Н-4 gland leak recurs with an open root cause case (%i days)",
    (days) => {
      const result = results.get(days) as AnalysisResult;
      const pump = equipmentId("Насос Н-4");
      const gland = ofKind(result, "repeat_fault").find(
        (insight) => insight.entityId === pump && insight.params.faultCode === "М-05",
      );
      const openCase = dataset.rcaCases.find(
        (rcaCase) => rcaCase.equipmentId === pump && rcaCase.status !== "closed",
      );
      expect(openCase).toBeDefined();
      expect(gland?.params.occurrences).toBeGreaterThanOrEqual(3);
      expect(gland?.rcaCaseId).toBe(openCase?.id);
      expect(["open", "in_progress"]).toContain(gland?.params.rcaState);
    },
  );

  it.each(WINDOWS)("keeps the list short and focused (%i days)", (days) => {
    const result = results.get(days) as AnalysisResult;
    expect(result.insights.length).toBeLessThanOrEqual(12);
    expect(result.insights.filter((insight) => insight.severity === 3).length).toBeLessThanOrEqual(
      7,
    );
    expect(ofKind(result, "shift_effect")).toEqual([]);
    expect(
      ofKind(result, "repeat_fault").filter((insight) => insight.severity >= 2).length,
    ).toBeLessThanOrEqual(2);
  });
});
