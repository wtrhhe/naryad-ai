import { NextResponse } from "next/server";
import { buildAssetLinks } from "@/lib/twa/config";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(buildAssetLinks(process.env), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
