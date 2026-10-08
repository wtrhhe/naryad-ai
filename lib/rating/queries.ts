import "server-only";
import { after } from "next/server";
import { z } from "zod";
import { resolveLocale, type Locale } from "@/i18n/config";
import type { CurrentEmployee } from "@/lib/auth/session";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildRatingTables,
  factRowSchema,
  followUpRowSchema,
  refusalRowSchema,
  snapshotRows,
  toFollowUp,
  toOrderFact,
  toRefusal,
  workerView,
  type BrigadeRecord,
  type PersonRecord,
  type RatedBrigade,
  type RatedEmployee,
  type RatingTables,
  type WorkerRatingView,
} from "@/lib/rating/board";
import {
  explainRating,
  templateExplanation,
  type RatingBenchmark,
  type RatingExplanation,
} from "@/lib/rating/explain";
import { parseRatingWeights, type RatingWeights } from "@/lib/rating/formula";
import type { RatingPeriod } from "@/lib/rating/period";

type RatingFunction = "rating_facts" | "rating_follow_ups" | "rating_refusals";

interface RpcPage {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

interface RatingRpcClient {
  rpc(fn: RatingFunction, args: { period_start: string; period_end: string }): RpcPage;
}

type SupabaseClient =
  | Awaited<ReturnType<typeof createSupabaseServerClient>>
  | ReturnType<typeof getSupabaseAdminClient>;

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

async function callRating<T>(
  client: SupabaseClient,
  fn: RatingFunction,
  period: RatingPeriod,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const rpcClient = client as unknown as RatingRpcClient;
  const args = { period_start: period.start.toISOString(), period_end: period.end.toISOString() };
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await rpcClient
      .rpc(fn, args)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to load ${fn}: ${error.message}`);
    const batch = z.array(schema).parse(data ?? []);
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

interface EmployeeRecord {
  id: string;
  full_name: string;
  role: string;
  brigade_id: string | null;
  is_active: boolean;
  locale: string;
  employee_sites: { site_id: string }[] | null;
}

export interface RatingBoard extends RatingTables {
  period: RatingPeriod;
  weights: RatingWeights;
  sites: { id: string; name: string }[];
  brigadeOptions: { id: string; name: string; siteId: string | null }[];
}

function clientFor(viewer: CurrentEmployee): Promise<SupabaseClient> | SupabaseClient {
  return viewer.role === "worker" ? getSupabaseAdminClient() : createSupabaseServerClient();
}

function saveSnapshots(board: RatingBoard): void {
  const rows = snapshotRows(
    board,
    board.period,
    (rating: RatedEmployee | RatedBrigade, locale: Locale, benchmark: RatingBenchmark | null) =>
      templateExplanation(rating, board.weights, locale, benchmark).text,
  );
  if (rows.length === 0) return;
  after(async () => {
    const { error } = await getSupabaseAdminClient()
      .from("rating_snapshots")
      .upsert(
        rows.map((row) => ({ ...row, components: row.components as unknown as NonNullable<Json> })),
        { onConflict: "subject_type,subject_id,period_start,period_end" },
      );
    if (error) console.error(`Failed to save rating snapshots: ${error.message}`);
  });
}

export async function loadRatingBoard(
  period: RatingPeriod,
  viewer: CurrentEmployee,
): Promise<RatingBoard> {
  const client = await clientFor(viewer);
  const [facts, followUps, refusals, settings, employees, brigades, sites] = await Promise.all([
    callRating(client, "rating_facts", period, factRowSchema),
    callRating(client, "rating_follow_ups", period, followUpRowSchema),
    callRating(client, "rating_refusals", period, refusalRowSchema),
    client.from("settings").select("value").eq("key", "rating.weights").maybeSingle(),
    client
      .from("employees")
      .select("id, full_name, role, brigade_id, is_active, locale, employee_sites(site_id)"),
    client.from("brigades").select("id, name, site_id, is_active").order("name"),
    client.from("sites").select("id, name").eq("is_active", true).order("name"),
  ]);
  const failure = settings.error ?? employees.error ?? brigades.error ?? sites.error;
  if (failure) throw new Error(`Failed to load rating references: ${failure.message}`);
  const weights = parseRatingWeights(settings.data?.value);
  const people: PersonRecord[] = ((employees.data ?? []) as unknown as EmployeeRecord[]).map(
    (row) => ({
      id: row.id,
      fullName: row.full_name,
      role: row.role,
      brigadeId: row.brigade_id,
      isActive: row.is_active,
      locale: resolveLocale(row.locale),
      siteIds: (row.employee_sites ?? []).map((site) => site.site_id),
    }),
  );
  const brigadeRecords: BrigadeRecord[] = (brigades.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    siteId: row.site_id,
    isActive: row.is_active,
  }));
  const tables = buildRatingTables({
    facts: facts.map(toOrderFact),
    followUps: followUps.map(toFollowUp),
    refusals: refusals.map(toRefusal),
    weights,
    people,
    brigades: brigadeRecords,
  });
  const board: RatingBoard = {
    ...tables,
    period,
    weights,
    sites: sites.data ?? [],
    brigadeOptions: brigadeRecords
      .filter((brigade) => brigade.isActive)
      .map((brigade) => ({ id: brigade.id, name: brigade.name, siteId: brigade.siteId })),
  };
  saveSnapshots(board);
  return board;
}

export interface WorkerRating extends WorkerRatingView {
  period: RatingPeriod;
  weights: RatingWeights;
}

export async function loadWorkerRating(
  period: RatingPeriod,
  viewer: CurrentEmployee,
): Promise<WorkerRating> {
  const board = await loadRatingBoard(period, viewer);
  return {
    ...workerView(board, viewer.id, viewer.brigadeId),
    period,
    weights: board.weights,
  };
}

export async function explainWorkerRating(
  rating: WorkerRating,
  locale: Locale,
): Promise<RatingExplanation | null> {
  const me = rating.me;
  if (!me) return null;
  const explanation = await explainRating({
    rating: me,
    weights: rating.weights,
    locale,
    benchmark: rating.benchmark,
    cacheKey: [
      "rating",
      me.subjectId,
      rating.period.start.toISOString(),
      rating.period.end.toISOString(),
      me.score,
      me.closedCount,
      locale,
    ].join(":"),
  });
  if (explanation.source === "llm") {
    after(async () => {
      const { error } = await getSupabaseAdminClient()
        .from("rating_snapshots")
        .update({ explanation: explanation.text })
        .eq("subject_type", "employee")
        .eq("subject_id", me.subjectId)
        .eq("period_start", rating.period.start.toISOString())
        .eq("period_end", rating.period.end.toISOString());
      if (error) console.error(`Failed to save rating explanation: ${error.message}`);
    });
  }
  return explanation;
}
