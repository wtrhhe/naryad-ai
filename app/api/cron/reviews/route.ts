import { NextResponse, type NextRequest } from "next/server";
import { runPendingReviews } from "@/lib/review/run";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import { serverEnv } from "@/lib/server-env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runPendingReviews();
    return NextResponse.json({
      ok: true,
      candidates: result.candidates,
      created: result.results.filter((item) => item.status === "created").length,
      failed: result.failed,
    });
  } catch (error) {
    console.error("review watcher failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
