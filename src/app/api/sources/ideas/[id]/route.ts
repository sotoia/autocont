import { NextRequest } from "next/server";
import { repo } from "@/lib/db";

/**
 * DELETE /api/sources/ideas/[id]  → eliminar fuente de Ideas
 * PATCH  /api/sources/ideas/[id]  → cambiar enabled (toggle on/off)
 */

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = repo.deleteIdeaSource(id);
  if (!ok) return Response.json({ error: "no encontrada" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const existing = repo.listIdeaSources(false).find((s) => s.id === id);
  if (!existing) return Response.json({ error: "no encontrada" }, { status: 404 });
  const updated = repo.upsertIdeaSource({
    id,
    kind: body.kind ?? existing.kind,
    name: body.name ?? existing.name,
    url: existing.url,
    language: body.language ?? existing.language,
    enabled: body.enabled === undefined ? existing.enabled : (body.enabled ? 1 : 0),
  });
  return Response.json({ source: updated });
}
