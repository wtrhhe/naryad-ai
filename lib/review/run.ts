import "server-only";
import { z } from "zod";
import { getAiProvider } from "@/lib/ai/provider";
import { resolveLocale } from "@/i18n/config";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { runChecks } from "@/lib/review/checks";
import { DUPLICATE_MAX_DISTANCE } from "@/lib/review/checks/photos";
import {
  toReviewContext,
  type HistoryRow,
  type PhotoMatchRow,
  type ReviewOrderRow,
  type ReviewRows,
} from "@/lib/review/context";
import { MASTER_ALIAS, reviewWithLlm } from "@/lib/review/llm";
import { buildReviewNotifications, type ReviewRecipient } from "@/lib/review/notify";
import { scoreChecks } from "@/lib/review/score";
import { REVIEW_SETTING_KEYS, toReviewSettings } from "@/lib/review/settings";
import { pickStuckOrders, type PendingOrderRow } from "@/lib/review/stuck";
import type { PersonAlias } from "@/lib/review/anonymize";
import type { CheckResult, FinalReview, ReviewVerdict } from "@/lib/review/types";

type AdminClient = ReturnType<typeof getSupabaseAdminClient>;
type AiReviewInsert = Database["public"]["Tables"]["ai_reviews"]["Insert"];

const ORDER_COLUMNS =
  "id, number, kind, status, description, work_performed, close_comment, fault_code_id, standard_hours, due_at, started_at, done_at, paused_seconds, rework_count, assignee_id, brigade_id, master_id, equipment:equipment_id(name, equipment_type, requires_lockout), fault_code:fault_codes!work_orders_fault_code_id_fkey(id, code, name, category, standard_hours)";
const HISTORY_LIMIT = 1000;
const WORKER_ALIAS_PREFIX = "И-";

export type ReviewRunStatus = "created" | "exists" | "skipped";

export interface ReviewRunResult {
  orderId: string;
  status: ReviewRunStatus;
  reason?: string;
  verdict?: ReviewVerdict;
  score?: number;
  usedLlm?: boolean;
}

interface Person {
  id: string;
  full_name: string;
  locale: string;
}

function fail(context: string, message: string): never {
  throw new Error(`order review ${context} failed: ${message}`);
}

function toJson(value: unknown): NonNullable<Json> {
  return JSON.parse(JSON.stringify(value)) as NonNullable<Json>;
}

async function loadOrder(admin: AdminClient, orderId: string): Promise<ReviewOrderRow | null> {
  const { data, error } = await admin
    .from("work_orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .maybeSingle();
  if (error) fail("order load", error.message);
  return data as unknown as ReviewOrderRow | null;
}

async function reviewExists(admin: AdminClient, orderId: string, revision: number) {
  const { data, error } = await admin
    .from("ai_reviews")
    .select("id")
    .eq("work_order_id", orderId)
    .eq("revision", revision)
    .maybeSingle();
  if (error) fail("existing review lookup", error.message);
  return data !== null;
}

async function submitForReview(
  admin: AdminClient,
  order: ReviewOrderRow,
): Promise<ReviewOrderRow | null> {
  if (order.status !== "done") {
    return order;
  }
  const { error } = await admin.rpc("transition_work_order", {
    order_id: order.id,
    action: "submit_review",
    payload: { expected_status: "done" },
  });
  if (error && !/wo:(stale_status|invalid_transition)/.test(error.message)) {
    fail("submit_review", error.message);
  }
  return loadOrder(admin, order.id);
}

const photoMatchSchema = z.array(
  z.object({
    photo_id: z.string(),
    match_photo_id: z.string(),
    match_order_id: z.string(),
    match_order_number: z.coerce.number().nullable(),
    distance: z.coerce.number(),
  }),
);

type UntypedRpc = (
  fn: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

async function loadPhotoMatches(admin: AdminClient, orderId: string): Promise<PhotoMatchRow[]> {
  const rpc = admin.rpc.bind(admin) as unknown as UntypedRpc;
  const { data, error } = await rpc("review_photo_matches", {
    target_order: orderId,
    max_distance: DUPLICATE_MAX_DISTANCE,
  });
  if (error) {
    console.warn("photo duplicate lookup unavailable", error.message);
    return [];
  }
  const parsed = photoMatchSchema.safeParse(data ?? []);
  return parsed.success ? parsed.data : [];
}

async function loadHistory(
  admin: AdminClient,
  order: ReviewOrderRow,
  materialIds: readonly string[],
): Promise<HistoryRow[]> {
  if (!order.fault_code_id || materialIds.length === 0) {
    return [];
  }
  const { data, error } = await admin
    .from("material_writeoffs")
    .select("material_id, quantity, work_orders!inner(fault_code_id, status)")
    .in("material_id", [...materialIds])
    .neq("work_order_id", order.id)
    .eq("work_orders.fault_code_id", order.fault_code_id)
    .eq("work_orders.status", "closed")
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) fail("material history", error.message);
  return (data ?? []).map((row) => ({ material_id: row.material_id, quantity: row.quantity }));
}

async function loadRows(admin: AdminClient, order: ReviewOrderRow): Promise<ReviewRows> {
  const [writeoffs, norms, photos, matches, lockouts, acoustic, events] = await Promise.all([
    admin
      .from("material_writeoffs")
      .select("material_id, quantity, material:materials(code, name, unit, categories)")
      .eq("work_order_id", order.id),
    order.fault_code_id
      ? admin
          .from("material_norms")
          .select("material_id, qty_min, qty_typical, qty_max, material:materials(name)")
          .eq("fault_code_id", order.fault_code_id)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("photos")
      .select("id, kind, taken_at, received_at, phash, ghost_score, forced_reason")
      .eq("work_order_id", order.id),
    loadPhotoMatches(admin, order.id),
    admin.from("lockouts").select("locked_at, released_at").eq("work_order_id", order.id),
    admin
      .from("acoustic_samples")
      .select("kind, rms, spectral_kurtosis, peaks, recorded_at")
      .eq("work_order_id", order.id)
      .order("recorded_at"),
    admin
      .from("work_order_events")
      .select("action, occurred_at")
      .eq("work_order_id", order.id)
      .in("action", ["start", "complete"])
      .order("occurred_at"),
  ]);
  const failure =
    writeoffs.error ??
    norms.error ??
    photos.error ??
    lockouts.error ??
    acoustic.error ??
    events.error;
  if (failure) fail("context load", failure.message);
  const writeoffRows = (writeoffs.data ?? []) as unknown as ReviewRows["writeoffs"];
  return {
    order,
    writeoffs: writeoffRows,
    norms: (norms.data ?? []) as unknown as ReviewRows["norms"],
    history: await loadHistory(
      admin,
      order,
      writeoffRows.map((row) => row.material_id),
    ),
    photos: photos.data ?? [],
    matches,
    lockouts: lockouts.data ?? [],
    acoustic: acoustic.data ?? [],
    events: events.data ?? [],
  };
}

async function loadSettings(admin: AdminClient) {
  const { data, error } = await admin
    .from("settings")
    .select("key, value")
    .in("key", Object.values(REVIEW_SETTING_KEYS));
  if (error) fail("settings load", error.message);
  return toReviewSettings(data ?? []);
}

async function loadPeople(admin: AdminClient, order: ReviewOrderRow) {
  const workerQuery = order.assignee_id
    ? admin.from("employees").select("id, full_name, locale").eq("id", order.assignee_id)
    : order.brigade_id
      ? admin
          .from("employees")
          .select("id, full_name, locale")
          .eq("brigade_id", order.brigade_id)
          .eq("role", "worker")
          .eq("is_active", true)
      : Promise.resolve({ data: [] as Person[], error: null });
  const [workers, master] = await Promise.all([
    workerQuery,
    admin.from("employees").select("id, full_name, locale").eq("id", order.master_id).maybeSingle(),
  ]);
  const failure = workers.error ?? master.error;
  if (failure) fail("people load", failure.message);
  return { workers: (workers.data ?? []) as Person[], master: master.data as Person | null };
}

function aliasesOf(people: { workers: readonly Person[]; master: Person | null }): PersonAlias[] {
  return [
    ...people.workers.map((person, index) => ({
      fullName: person.full_name,
      alias: `${WORKER_ALIAS_PREFIX}${index + 1}`,
    })),
    ...(people.master ? [{ fullName: people.master.full_name, alias: MASTER_ALIAS }] : []),
  ];
}

const recipientOf = (person: Person): ReviewRecipient => ({
  id: person.id,
  locale: resolveLocale(person.locale),
});

function reviewRow(
  order: ReviewOrderRow,
  checks: readonly CheckResult[],
  review: FinalReview,
): AiReviewInsert {
  return {
    work_order_id: order.id,
    revision: order.rework_count,
    verdict: review.verdict,
    score: review.score,
    rating: review.rating,
    checks: toJson(checks),
    strengths: review.strengths,
    improvements: review.improvements,
    worker_explanation: review.workerExplanation,
    master_explanation: review.masterExplanation,
    confidence: review.confidence,
    needs_master_review: review.needsMasterReview,
    used_llm: review.usedLlm,
    model: review.model,
  };
}

async function insertReview(admin: AdminClient, row: AiReviewInsert): Promise<boolean> {
  const { data, error } = await admin
    .from("ai_reviews")
    .upsert(row, { onConflict: "work_order_id,revision", ignoreDuplicates: true })
    .select("id");
  if (error) fail("review insert", error.message);
  return (data ?? []).length > 0;
}

async function notifyReview(
  admin: AdminClient,
  order: ReviewOrderRow,
  review: FinalReview,
  people: { workers: readonly Person[]; master: Person | null },
) {
  const rows = buildReviewNotifications({
    orderId: order.id,
    orderNumber: order.number,
    revision: order.rework_count,
    equipmentName: order.equipment?.name ?? "",
    review,
    master: people.master ? recipientOf(people.master) : null,
    workers: people.workers.map(recipientOf),
  });
  if (rows.length === 0) return;
  const { error } = await admin
    .from("notifications")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (error) fail("review notifications", error.message);
}

export async function runOrderReview(orderId: string): Promise<ReviewRunResult> {
  const admin = getSupabaseAdminClient();
  const initial = await loadOrder(admin, orderId);
  if (!initial) {
    return { orderId, status: "skipped", reason: "not_found" };
  }
  if (initial.status !== "done" && initial.status !== "ai_review") {
    return { orderId, status: "skipped", reason: initial.status };
  }
  const order = await submitForReview(admin, initial);
  if (!order || order.status !== "ai_review") {
    return { orderId, status: "skipped", reason: order?.status ?? "not_found" };
  }
  if (await reviewExists(admin, order.id, order.rework_count)) {
    return { orderId, status: "exists" };
  }
  const [rows, settings, people] = await Promise.all([
    loadRows(admin, order),
    loadSettings(admin),
    loadPeople(admin, order),
  ]);
  const context = toReviewContext(rows);
  const checks = runChecks(context, settings);
  const rules = scoreChecks(checks);
  const review = await reviewWithLlm(
    getAiProvider(),
    { context, checks, rules, people: aliasesOf(people) },
    settings,
  );
  const created = await insertReview(admin, reviewRow(order, checks, review));
  if (!created) {
    return { orderId, status: "exists" };
  }
  await notifyReview(admin, order, review, people);
  return {
    orderId,
    status: "created",
    verdict: review.verdict,
    score: review.score,
    usedLlm: review.usedLlm,
  };
}

export async function runOrderReviewSafely(orderId: string): Promise<ReviewRunResult | null> {
  try {
    return await runOrderReview(orderId);
  } catch (error) {
    console.error("order review failed", orderId, error instanceof Error ? error.message : error);
    return null;
  }
}

export interface PendingReviewsResult {
  candidates: number;
  results: ReviewRunResult[];
  failed: number;
}

export async function runPendingReviews(now: Date = new Date()): Promise<PendingReviewsResult> {
  const admin = getSupabaseAdminClient();
  const { data: orders, error } = await admin
    .from("work_orders")
    .select("id, status, rework_count, done_at, review_started_at, updated_at")
    .in("status", ["done", "ai_review"])
    .order("updated_at")
    .limit(200);
  if (error) fail("pending orders", error.message);
  const pending = (orders ?? []) as PendingOrderRow[];
  if (pending.length === 0) {
    return { candidates: 0, results: [], failed: 0 };
  }
  const { data: reviews, error: reviewsError } = await admin
    .from("ai_reviews")
    .select("work_order_id, revision")
    .in(
      "work_order_id",
      pending.map((order) => order.id),
    );
  if (reviewsError) fail("pending reviews", reviewsError.message);
  const stuck = pickStuckOrders(pending, reviews ?? [], now);
  const settled = await Promise.all(stuck.map((id) => runOrderReviewSafely(id)));
  const results = settled.filter((result): result is ReviewRunResult => result !== null);
  return { candidates: stuck.length, results, failed: settled.length - results.length };
}
