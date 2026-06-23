import { NextRequest } from "next/server";
import { repo } from "@/lib/db";
import type { CreationKind } from "@/lib/creations/types";

export async function GET(req: NextRequest) {
  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
  return Response.json({ creations: repo.listCreations({ includeArchived }) });
}

/**
 * POST /api/creations
 * Body opcional: { kind, source_idea_id, title, description, script, notes }
 * Si trae source_idea_id, prefill desde la idea.
 */
export async function POST(req: NextRequest) {
  let body: Partial<{
    kind: CreationKind;
    source_idea_id: string;
    title: string;
    description: string;
    script: string;
    notes: string;
    ficha_rapida: string;
    mapa_bloques: string;
  }> = {};
  try { body = await req.json(); } catch { /* defaults */ }

  let { title, description, script, notes } = body;
  const sourceIdeaId = body.source_idea_id ?? null;

  // Prefill desde idea si viene source_idea_id
  if (sourceIdeaId) {
    const idea = repo.getIdea(sourceIdeaId);
    if (!idea) return Response.json({ error: "Idea no encontrada" }, { status: 404 });
    title = title ?? idea.generated_title ?? idea.title;
    description = description ?? idea.generated_description ?? idea.description ?? "";
    script = script ?? idea.generated_script ?? "";
    notes = notes ?? `Originada desde idea: ${idea.source_name} · ${idea.source_url}`;
  }

  const creation = repo.createCreation({
    kind: body.kind ?? "viral",
    source_idea_id: sourceIdeaId,
    title: title ?? "",
    description: description ?? "",
    script: script ?? "",
    notes: notes ?? "",
    ficha_rapida: body.ficha_rapida ?? "",
    mapa_bloques: body.mapa_bloques ?? "",
    ref_pack: ["nate-gentile", "adrian-saenz", "juanpe-navarro", "alejavi-rivera"],
  });
  return Response.json({ creation });
}
