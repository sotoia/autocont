import { NextRequest } from "next/server";
import { repo } from "@/lib/db";

/** GET /api/ideas — list all non-dismissed ideas, ordered (pinned first then order_index). */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const includeDismissed = url.searchParams.get("includeDismissed") === "1";
  return Response.json({ ideas: repo.listIdeas({ includeDismissed }) });
}
