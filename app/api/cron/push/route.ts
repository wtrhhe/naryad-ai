import { NextResponse, type NextRequest } from "next/server";
import { dispatchPendingPushes } from "@/lib/push/dispatch";
import { isAuthorizedCronRequest } from "@/lib/security/cron-auth";
import { serverEnv } from "@/lib/server-env";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), serverEnv().CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await dispatchPendingPushes()) });
  } catch (error) {
    console.error("push dispatch failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
  }
}
