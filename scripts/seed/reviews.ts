import type { OrderFacts } from "./facts";
import type { Rng } from "./random";
import {
  CHECK_LABELS,
  checksAsJson,
  improvementsOf,
  MASTER_AGREE_COMMENTS,
  MASTER_OVERRIDE_COMMENTS,
  masterExplanation,
  strengthsOf,
  workerExplanation,
  type ReviewCheck,
  type ReviewVerdictKind,
} from "./review-texts";
import type { AiReviewRow, MaterialNormRow, MaterialWriteoffRow, PhotoRow } from "./types";

export const OVERUSE_RATIO_LIMIT = 1.25;
const TIME_RATIO_LIMIT = 1.25;
const GHOST_SCORE_LIMIT = 0.8;
const QUALITY_BASE = 60;
const QUALITY_PER_GRADE = 4;
const SCORE_DEVIATION = 8;
const OVERUSE_PENALTY = 8;
const SLOW_PENALTY = 6;
const GHOST_PENALTY = 15;
const MIN_ACCEPTED_SCORE = 60;
const REWORK_SCORE_RANGE = [35, 58] as const;
const ACCEPTED_SCORE = 80;
const CONFIDENCE_RANGE = [0.55, 0.98] as const;
const LOW_CONFIDENCE = 0.6;
const MODEL_USAGE_CHANCE = 0.85;
const MASTER_REVIEW_CHANCE = 0.15;
const OVERRIDE_CHANCE = 0.2;
const REVIEW_MODEL = "review-model-v1";
const REVIEW_LATENCY_SECONDS = [40, 150] as const;
const RATING_THRESHOLDS: ReadonlyArray<readonly [number, number]> = [
  [90, 5],
  [80, 4],
  [70, 3],
  [55, 2],
];

export type ReviewInputs = {
  readonly writeoffs: readonly MaterialWriteoffRow[];
  readonly norms: readonly MaterialNormRow[];
  readonly photos: readonly PhotoRow[];
};

export const ratingFor = (score: number): number =>
  RATING_THRESHOLDS.find(([threshold]) => score >= threshold)?.[1] ?? 1;

export function verdictFor(score: number): ReviewVerdictKind {
  if (score >= ACCEPTED_SCORE) return "accepted";
  return score >= MIN_ACCEPTED_SCORE ? "accepted_with_remarks" : "rework";
}

export function materialRatioOf(facts: OrderFacts, inputs: ReviewInputs): number | null {
  const typicalByMaterial = new Map(
    inputs.norms.map((norm) => [norm.material_id, norm.qty_typical]),
  );
  const used = inputs.writeoffs.reduce((sum, row) => sum + row.quantity, 0);
  const norm = inputs.writeoffs.reduce(
    (sum, row) => sum + (typicalByMaterial.get(row.material_id) ?? 0),
    0,
  );
  return facts.fault && norm > 0 ? used / norm : null;
}

function buildChecks(
  facts: OrderFacts,
  inputs: ReviewInputs,
  materialRatio: number | null,
): ReviewCheck[] {
  const hasKind = (kind: PhotoRow["kind"]) => inputs.photos.some((photo) => photo.kind === kind);
  const ghost = inputs.photos.some(
    (photo) => photo.kind === "after" && (photo.ghost_score ?? 0) > GHOST_SCORE_LIMIT,
  );
  const checks: Array<Omit<ReviewCheck, "label">> = [
    {
      key: "before_photos",
      passed: hasKind("before"),
      detail: `Фото до ремонта: ${inputs.photos.filter((photo) => photo.kind === "before").length}`,
    },
    {
      key: "after_photos",
      passed: hasKind("after"),
      detail: `Фото после ремонта: ${inputs.photos.filter((photo) => photo.kind === "after").length}`,
    },
    {
      key: "ghost",
      passed: !ghost,
      detail: ghost ? "Фото «после» совпадает с фото «до»" : "Различия между фото достаточны",
    },
    { key: "work_description", passed: true, detail: "Описание соответствует коду неисправности" },
    {
      key: "materials",
      passed: materialRatio === null || materialRatio <= OVERUSE_RATIO_LIMIT,
      detail:
        materialRatio === null
          ? "Списания нет"
          : `Расход ${Math.round(materialRatio * 100)}% от нормы`,
    },
    {
      key: "time",
      passed: facts.workHours <= facts.standardHours * TIME_RATIO_LIMIT,
      detail: `Фактически ${facts.workHours.toFixed(1)} ч, норматив ${facts.standardHours.toFixed(1)} ч`,
    },
    ...(facts.equipment.requires_lockout
      ? [{ key: "lockout" as const, passed: hasKind("loto"), detail: "Фото бирки блокировки" }]
      : []),
  ];
  return checks.map((check) => ({ ...check, label: CHECK_LABELS[check.key] }));
}

function finalScore(facts: OrderFacts, checks: readonly ReviewCheck[], rng: Rng): number {
  const quality = QUALITY_BASE + QUALITY_PER_GRADE * (facts.executor.grade ?? 3);
  const failed = (key: ReviewCheck["key"]) =>
    checks.some((check) => check.key === key && !check.passed);
  const penalty =
    (failed("materials") ? OVERUSE_PENALTY : 0) +
    (failed("time") ? SLOW_PENALTY : 0) +
    (failed("ghost") ? GHOST_PENALTY : 0);
  return Math.min(
    99,
    Math.max(MIN_ACCEPTED_SCORE, Math.round(rng.normal(quality, SCORE_DEVIATION)) - penalty),
  );
}

function buildMasterDecision(
  verdict: ReviewVerdictKind,
  score: number,
  decidedAtMs: number | null,
  needsReview: boolean,
  facts: OrderFacts,
  rng: Rng,
) {
  const decided = decidedAtMs !== null && (needsReview || rng.chance(MASTER_REVIEW_CHANCE));
  if (!decided || decidedAtMs === null)
    return {
      masterId: null,
      verdict: null,
      score: null,
      rating: null,
      comment: null,
      decidedAt: null,
    };
  const override = verdict === "accepted_with_remarks" && rng.chance(OVERRIDE_CHANCE);
  const masterScore = override ? Math.min(99, score + rng.int(3, 10)) : score;
  return {
    masterId: facts.master.id,
    verdict: override ? verdictFor(masterScore) : verdict,
    score: masterScore,
    rating: ratingFor(masterScore),
    comment: rng.pick(override ? MASTER_OVERRIDE_COMMENTS : MASTER_AGREE_COMMENTS),
    decidedAt: new Date(decidedAtMs).toISOString(),
  };
}

export function buildReviews(facts: OrderFacts, inputs: ReviewInputs, rng: Rng): AiReviewRow[] {
  const materialRatio = materialRatioOf(facts, inputs);
  return facts.submissionsMs.map((submittedAtMs, revision) => {
    const decisionAtMs = facts.decisionsMs[revision] ?? null;
    const returned = facts.steps.some(
      (step) => step.action === "return_rework" && step.atMs === decisionAtMs,
    );
    const checks = buildChecks(facts, inputs, materialRatio);
    const score = returned ? rng.int(...REWORK_SCORE_RANGE) : finalScore(facts, checks, rng);
    const verdict = verdictFor(score);
    const confidence = Number(rng.float(...CONFIDENCE_RANGE).toFixed(3));
    const needsMasterReview =
      confidence < LOW_CONFIDENCE ||
      verdict !== "accepted" ||
      checks.some((check) => !check.passed && check.key === "ghost");
    const master = buildMasterDecision(verdict, score, decisionAtMs, needsMasterReview, facts, rng);
    const improvements = improvementsOf(checks);
    const createdAt = new Date(
      submittedAtMs + Math.round(rng.float(...REVIEW_LATENCY_SECONDS) * 1000),
    ).toISOString();
    const usedModel = rng.chance(MODEL_USAGE_CHANCE);
    return {
      id: rng.uuid(),
      work_order_id: facts.orderId,
      revision,
      verdict,
      score,
      rating: ratingFor(score),
      checks: checksAsJson(checks),
      strengths: strengthsOf(checks),
      improvements,
      worker_explanation: workerExplanation(verdict, score, improvements),
      master_explanation: masterExplanation({
        verdict,
        score,
        checks,
        materialRatio,
        workHours: facts.workHours,
        standardHours: facts.standardHours,
      }),
      confidence,
      needs_master_review: needsMasterReview,
      used_llm: usedModel,
      model: usedModel ? REVIEW_MODEL : null,
      master_id: master.masterId,
      master_verdict: master.verdict,
      master_score: master.score,
      master_rating: master.rating,
      master_comment: master.comment,
      master_decided_at: master.decidedAt,
      created_at: createdAt,
      updated_at: master.decidedAt ?? createdAt,
    };
  });
}
