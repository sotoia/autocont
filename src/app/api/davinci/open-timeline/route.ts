import { NextRequest } from "next/server";
import { openTimelineAction } from "@/lib/actions/pipeline";

export async function POST(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId requerido" }, { status: 400 });
  const result = await openTimelineAction(projectId);
  return Response.json(result);
}
