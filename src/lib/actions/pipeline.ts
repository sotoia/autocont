"use server";
import { repo } from "@/lib/db";
import { revealInFinderAction } from "./system";

function sanitizeProjectName(name: string): string {
  // DaVinci Resolve rejects many special chars in project names. Keep it safe:
  // ASCII letters/digits/space/dash/underscore/dot only. Collapse whitespace. 60 max.
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining marks
    .replace(/[^\w\s.\-]/g, " ") // replace anything weird (｜, [, ], ·, etc.) with space
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .replace(/[.\s]+$/, ""); // DaVinci rechaza nombres terminados en . o espacio
  return cleaned || "Proyecto sin nombre";
}

export async function openTimelineAction(projectId: string) {
  const project = repo.getProject(projectId);
  if (!project) return { ok: false, error: "Proyecto no encontrado" };
  const { listTimelineFiles } = await import("@/lib/pipeline/utils");
  const files = listTimelineFiles(project.folder_path);
  if (files.length === 0) return { ok: false, error: "Aún no hay timeline generado" };
  const file = files[0];

  const { ensureDaVinciRunning, importTimelineIntoDaVinci } = await import(
    "@/lib/pipeline/davinci"
  );

  // Step 1: ensure DaVinci is running before we try to script it.
  const launch = await ensureDaVinciRunning(45_000);
  if (!launch.ok) {
    await revealInFinderAction(file);
    return {
      ok: false,
      error: launch.error ?? "No se pudo arrancar DaVinci Resolve",
      errorKind: "not_running" as const,
      path: file,
      openedIn: "Finder",
    };
  }

  // Step 2: drive the scripting API to create-or-load project + import timeline.
  const davinciProjectName = sanitizeProjectName(`Contenido ${project.name}`);
  const result = await importTimelineIntoDaVinci(davinciProjectName, file);

  if (result.ok) {
    return {
      ok: true,
      openedIn: "DaVinci Resolve",
      path: file,
      davinciProject: result.project,
      created: result.created,
      reused: result.reused,
      replaced: result.replaced,
      timeline: result.timeline,
    };
  }

  await revealInFinderAction(file);
  return {
    ok: false,
    openedIn: "Finder",
    path: file,
    error: result.error,
    errorKind: result.error_kind ?? "unknown",
  };
}
