import { NextRequest } from "next/server";
import { repo } from "@/lib/db";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = repo.getCreation(id);
  if (!c) return Response.json({ error: "Creación no encontrada" }, { status: 404 });
  return Response.json({ creation: c });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return Response.json({ error: "JSON inválido" }, { status: 400 }); }

  const patch: Record<string, unknown> = {};
  for (const k of ["kind", "title", "description", "script", "notes", "order_index", "ficha_rapida", "mapa_bloques"] as const) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  for (const flag of ["pinned", "archived"] as const) {
    if (body[flag] !== undefined) patch[flag] = body[flag] ? 1 : 0;
  }

  const updated = repo.updateCreation(id, patch);
  if (!updated) return Response.json({ error: "Creación no encontrada" }, { status: 404 });
  return Response.json({ creation: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = repo.deleteCreation(id);
  if (!ok) return Response.json({ error: "Creación no encontrada" }, { status: 404 });
  return Response.json({ ok: true });
}
