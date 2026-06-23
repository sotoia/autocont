import type { NextRequest } from "next/server";
import { repo } from "@/lib/db";
import type { AssetKind } from "@/lib/types";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { headers: CORS });
}

/**
 * GET /api/assets?kind=stock_video,stock_photo,music
 * Returns the indexed assets of the given kinds. Used by the DaVinci addon
 * Stock tab to render the sectioned, browsable library.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const kinds: AssetKind[] = kindParam
    ? (kindParam.split(",").map((k) => k.trim()) as AssetKind[])
    : ["stock_video", "stock_photo", "music"];

  const all = kinds.flatMap((k) => repo.listAssets(k));
  return Response.json(
    all.map((a) => ({
      id: a.id,
      kind: a.kind,
      path: a.path,
      filename: a.filename,
      tags: a.tags,
      duration_sec: a.duration_sec,
      width: a.width,
      height: a.height,
      size_bytes: a.size_bytes,
    })),
    { headers: CORS },
  );
}
