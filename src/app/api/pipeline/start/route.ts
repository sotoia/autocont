import { NextRequest } from "next/server";
import { repo } from "@/lib/db";
import { runPipelineDetached } from "@/lib/pipeline/orchestrator";

export async function POST(request: NextRequest) {
  const url = request.nextUrl;
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId requerido" }, { status: 400 });

  const project = repo.getProject(projectId);
  if (!project) return Response.json({ error: "proyecto no encontrado" }, { status: 404 });
  if (!project.raw_path) return Response.json({ error: "sin raw_path" }, { status: 400 });

  const settings = repo.getSettings();
  if (!settings.claude_api_key) {
    return Response.json({ error: "falta API key" }, { status: 400 });
  }

  repo.updateProject(projectId, { status: "pending", notes: null });
  void runPipelineDetached(projectId);

  return Response.json({
    ok: true,
    projectId,
    message: "pipeline lanzado en background",
  });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId requerido" }, { status: 400 });

  const project = repo.getProject(projectId);
  if (!project) return Response.json({ error: "proyecto no encontrado" }, { status: 404 });

  const jobs = repo.listJobsForProject(projectId);
  return Response.json({ project, jobs });
}
