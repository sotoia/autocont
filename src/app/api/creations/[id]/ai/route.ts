import { NextRequest } from "next/server";
import { repo } from "@/lib/db";
import { suggestTitles, suggestDescription, continueScript, draftFullScript, autoGenerateAll, draftPrompterScript } from "@/lib/creations/ai";

export const maxDuration = 180;

/**
 * POST /api/creations/[id]/ai
 * Body: { action: "titles" | "description" | "cowriter", prompt?: string }
 *
 * - titles      → 5 títulos sugeridos
 * - description → descripción de YouTube
 * - cowriter    → añade un tramo nuevo al guion siguiendo `prompt`
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = repo.getCreation(id);
  if (!c) return Response.json({ error: "Creación no encontrada" }, { status: 404 });

  const settings = repo.getSettings();
  if (!settings.claude_api_key) {
    return Response.json({ error: "Falta claude_api_key en Ajustes" }, { status: 400 });
  }

  let body: { action?: string; prompt?: string } = {};
  try { body = await req.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }

  try {
    if (body.action === "titles") {
      const out = await suggestTitles({
        kind: c.kind,
        currentTitle: c.title,
        description: c.description,
        scriptExcerpt: c.script,
        apiKey: settings.claude_api_key,
      });
      return Response.json(out);
    }

    if (body.action === "description") {
      const out = await suggestDescription({
        kind: c.kind,
        title: c.title,
        scriptExcerpt: c.script,
        apiKey: settings.claude_api_key,
      });
      return Response.json(out);
    }

    if (body.action === "cowriter") {
      if (!body.prompt) return Response.json({ error: "Falta prompt para el cowriter" }, { status: 400 });
      const out = await continueScript({
        kind: c.kind,
        title: c.title,
        description: c.description,
        scriptSoFar: c.script,
        prompt: body.prompt,
        apiKey: settings.claude_api_key,
      });
      // Añadimos el segmento al guion automáticamente
      const newScript = c.script ? `${c.script}\n\n${out.segment}` : out.segment;
      const updated = repo.updateCreation(id, { script: newScript });
      return Response.json({ ...out, creation: updated });
    }

    if (body.action === "draft-full-script") {
      const out = await draftFullScript({
        kind: c.kind,
        title: c.title,
        description: c.description,
        notes: c.notes,
        apiKey: settings.claude_api_key,
      });
      // Sobrescribe el guion con el draft completo
      const updated = repo.updateCreation(id, { script: out.script });
      return Response.json({ ...out, creation: updated });
    }

    if (body.action === "auto-generate-all") {
      // La idea cruda se guarda en `notes` (puesto por el form al crear).
      // Si no hay nada en notes ni en title/description, no hay base para generar.
      const idea = c.notes?.trim() || c.description?.trim() || c.title?.trim();
      if (!idea) return Response.json({ error: "No hay idea base — rellena título o describe la idea." }, { status: 400 });

      const out = await autoGenerateAll({
        kind: c.kind,
        idea,
        initialTitle: c.title,
        apiKey: settings.claude_api_key,
      });
      const updated = repo.updateCreation(id, {
        title: out.title,
        description: out.description,
        script: out.script,
      });
      return Response.json({ ...out, creation: updated });
    }

    if (body.action === "prompter") {
      if (!c.script || c.script.trim().length < 100) {
        return Response.json({ error: "El guion está vacío. Genera o escribe el guion antes del modo Prompter." }, { status: 400 });
      }
      const out = await draftPrompterScript({
        script: c.script,
        apiKey: settings.claude_api_key,
      });
      const updated = repo.updateCreation(id, { prompter_script: out.prompter_script });
      return Response.json({ ...out, creation: updated });
    }

    return Response.json({ error: "action inválido" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
