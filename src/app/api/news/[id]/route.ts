import { NextRequest } from "next/server";
import { repo } from "@/lib/db";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }
  const patch: Record<string, unknown> = {};
  for (const k of ["title", "description", "category", "importance"] as const) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  if (body.dismissed !== undefined) patch.dismissed = body.dismissed ? 1 : 0;
  const updated = repo.updateNews(id, patch);
  if (!updated) return Response.json({ error: "Noticia no encontrada" }, { status: 404 });
  return Response.json({ news: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = repo.deleteNews(id);
  if (!ok) return Response.json({ error: "Noticia no encontrada" }, { status: 404 });
  return Response.json({ ok: true });
}
