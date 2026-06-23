import { NextRequest } from "next/server";
import { repo } from "@/lib/db";
import type { NewsCategory } from "@/lib/news/types";

export async function GET(req: NextRequest) {
  const includeDismissed = req.nextUrl.searchParams.get("includeDismissed") === "1";
  const category = (req.nextUrl.searchParams.get("category") as NewsCategory | null) || undefined;
  return Response.json({ news: repo.listNews({ includeDismissed, category }) });
}
