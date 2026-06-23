import { NextRequest } from "next/server";
import { repo } from "@/lib/db";

/**
 * DELETE /api/sources/news/[id]
 * PATCH  /api/sources/news/[id]   → toggle enabled / cambiar tier o category
 */

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = repo.deleteNewsSource(id);
  if (!ok) return Response.json({ error: "no encontrada" }, { status: 404 });
  return Response.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const existing = repo.listNewsSources(false).find((s) => s.id === id);
  if (!existing) return Response.json({ error: "no encontrada" }, { status: 404 });
  const updated = repo.upsertNewsSource({
    id,
    name: body.name ?? existing.name,
    url: existing.url,
    tier: body.tier ?? existing.tier,
    default_category: body.default_category ?? existing.default_category,
    enabled: body.enabled === undefined ? existing.enabled : (body.enabled ? 1 : 0),
  });
  return Response.json({ source: updated });
}
