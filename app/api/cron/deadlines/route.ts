import { NextResponse, type NextRequest } from "next/server";
import { runDeadlineWatcher } from "@/lib/deadlines/run";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import { serverEnv } from "@/lib/server-env";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDeadlineWatcher();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("deadline watcher failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
