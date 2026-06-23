import { NextRequest } from "next/server";
import { pollNews } from "@/lib/news/poll";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: { sinceHours?: number } = {};
  try { body = await req.json(); } catch { /* defaults */ }
  try {
    const summary = await pollNews(body);
    return Response.json(summary);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
