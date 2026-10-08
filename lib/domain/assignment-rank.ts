import type {
  AssigneeCandidate,
  AssignmentNeed,
  Availability,
  BoardRow,
  RankAssignees,
  ScoreReason,
  ScoredCandidate,
  Specialty,
} from "@/lib/domain/assignment";

export const SPECIALTY_SUBSTITUTES: Readonly<Partial<Record<Specialty, readonly Specialty[]>>> = {
  lubricator: ["fitter"],
  hydraulic: ["fitter"],
  instrumentation: ["electrician"],
  welder: ["fitter"],
};

export const SCORE_WEIGHTS = {
  onShift: 40,
  offShift: -40,
  exactSpecialty: 30,
  substituteSpecialty: 15,
  free: 25,
  queuedBase: 15,
  queuedStep: 5,
  busy: 0,
  busyQueueStep: 3,
  experiencePerLog: 6,
  experienceMax: 20,
  ratingSpread: 10,
  noPermit: -1000,
} as const;

export type SpecialtyFit = "exact" | "substitute" | "other" | "unknown";

export function acceptableSpecialties(required: Specialty): readonly Specialty[] {
  return [required, ...(SPECIALTY_SUBSTITUTES[required] ?? [])];
}

export function specialtyFit(candidate: Specialty | null, required: Specialty | null): SpecialtyFit {
  if (!required) return "unknown";
  if (!candidate) return "other";
  if (candidate === required) return "exact";
  return SPECIALTY_SUBSTITUTES[required]?.includes(candidate) ? "substitute" : "other";
}

export function availabilityOf(candidate: AssigneeCandidate): Availability {
  if (candidate.missingPermits.length > 0) {
    return { kind: "no_permit", missing: candidate.missingPermits };
  }
  if (!candidate.onShift) return { kind: "off_shift" };
  if (candidate.activeOrderNumber !== null) {
    return { kind: "busy", orderNumber: candidate.activeOrderNumber };
  }
  if (candidate.queueLength > 0) return { kind: "queued", length: candidate.queueLength };
  return { kind: "free" };
}

function availabilityScore(candidate: AssigneeCandidate): number {
  const shift = candidate.onShift ? SCORE_WEIGHTS.onShift : SCORE_WEIGHTS.offShift;
  if (candidate.activeOrderNumber !== null) {
    return shift + SCORE_WEIGHTS.busy - SCORE_WEIGHTS.busyQueueStep * candidate.queueLength;
  }
  if (candidate.queueLength > 0) {
    return (
      shift +
      Math.max(0, SCORE_WEIGHTS.queuedBase - SCORE_WEIGHTS.queuedStep * candidate.queueLength)
    );
  }
  return shift + SCORE_WEIGHTS.free;
}

function availabilityReason(availability: Availability): ScoreReason {
  switch (availability.kind) {
    case "free":
      return { key: "free" };
    case "busy":
      return { key: "busy", values: { number: availability.orderNumber } };
    case "queued":
      return { key: "queued", values: { count: availability.length } };
    case "off_shift":
      return { key: "offShift" };
    case "no_permit":
      return { key: "noPermit", values: { permits: availability.missing.join(", ") } };
  }
}

function experienceScore(closedOnType: number): number {
  if (closedOnType <= 0) return 0;
  return Math.min(
    SCORE_WEIGHTS.experienceMax,
    SCORE_WEIGHTS.experiencePerLog * Math.log2(1 + closedOnType),
  );
}

function ratingScore(rating: number | null): number {
  if (rating === null || !Number.isFinite(rating)) return 0;
  const bounded = Math.min(100, Math.max(0, rating));
  return ((bounded - 50) / 50) * SCORE_WEIGHTS.ratingSpread;
}

function specialtyScore(fit: SpecialtyFit): number {
  if (fit === "exact") return SCORE_WEIGHTS.exactSpecialty;
  if (fit === "substitute") return SCORE_WEIGHTS.substituteSpecialty;
  return 0;
}

export function scoreCandidate(
  candidate: AssigneeCandidate,
  need: AssignmentNeed,
): ScoredCandidate {
  const availability = availabilityOf(candidate);
  const fit = specialtyFit(candidate.specialty, need.specialty);
  const selectable = availability.kind !== "no_permit";
  const reasons: ScoreReason[] = [availabilityReason(availability)];
  if (availability.kind === "no_permit" && !candidate.onShift) {
    reasons.push({ key: "offShift" });
  }
  if (candidate.closedOnType > 0) {
    reasons.push({
      key: "closedOnType",
      values: { count: candidate.closedOnType, type: need.equipmentType },
    });
  }
  if ((fit === "exact" || fit === "substitute") && candidate.specialty) {
    reasons.push({
      key: fit === "exact" ? "specialtyMatch" : "specialtySubstitute",
      values: { specialty: candidate.specialty },
    });
  }
  if (fit === "other" && candidate.specialty) {
    reasons.push({ key: "specialtyOther", values: { specialty: candidate.specialty } });
  }
  if (candidate.rating !== null && Number.isFinite(candidate.rating)) {
    reasons.push({ key: "rating", values: { score: Math.round(candidate.rating) } });
  }
  const raw =
    availabilityScore(candidate) +
    specialtyScore(fit) +
    experienceScore(candidate.closedOnType) +
    ratingScore(candidate.rating) +
    (selectable ? 0 : SCORE_WEIGHTS.noPermit);
  return {
    candidate,
    availability,
    score: Math.round(raw * 10) / 10,
    selectable,
    reasons,
  };
}

export const rankAssignees: RankAssignees = (candidates, need) =>
  candidates
    .map((candidate) => scoreCandidate(candidate, need))
    .sort(
      (left, right) =>
        Number(right.selectable) - Number(left.selectable) ||
        right.score - left.score ||
        left.candidate.fullName.localeCompare(right.candidate.fullName, "ru"),
    );

export function topCandidate(ranked: readonly ScoredCandidate[]): ScoredCandidate | null {
  return ranked.find((entry) => entry.selectable) ?? null;
}

export function candidateFromBoardRow(
  row: BoardRow,
  ratings: Readonly<Record<string, number>> = {},
): AssigneeCandidate {
  return {
    employeeId: row.employee_id,
    fullName: row.full_name,
    specialty: row.specialty,
    grade: row.grade,
    brigadeId: row.brigade_id,
    onShift: row.on_shift,
    activeOrderNumber: row.active_order_number ?? null,
    queueLength: row.queue_length ?? 0,
    closedOnType: row.closed_on_type ?? 0,
    rating: ratings[row.employee_id] ?? null,
    missingPermits: row.missing_permits ?? [],
  };
}
