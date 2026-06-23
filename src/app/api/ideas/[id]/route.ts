import { NextRequest } from "next/server";
import { repo } from "@/lib/db";

/**
 * PATCH /api/ideas/[id]
 *
 * Body con cualquier subset de:
 *   { pinned, featured, dismissed, generated_title, generated_description, generated_script, order_index }
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Whitelist solo los campos editables. pinned/featured/dismissed se
  // normalizan a 0|1 para mantener el contrato de la tabla.
  const patch: Record<string, unknown> = {};
  for (const flag of ["pinned", "featured", "dismissed"] as const) {
    if (body[flag] !== undefined) patch[flag] = body[flag] ? 1 : 0;
  }
  for (const text of ["generated_title", "generated_description", "generated_script"] as const) {
    if (typeof body[text] === "string") patch[text] = body[text];
  }
  if (typeof body.order_index === "number") patch.order_index = body.order_index;

  const updated = repo.updateIdea(id, patch);
  if (!updated) return Response.json({ error: "Idea no encontrada" }, { status: 404 });
  return Response.json({ idea: updated });
}

/** DELETE /api/ideas/[id] — elimina permanentemente. Si solo quieres ocultar usa PATCH dismissed:1. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = repo.deleteIdea(id);
  if (!ok) return Response.json({ error: "Idea no encontrada" }, { status: 404 });
  return Response.json({ ok: true });
}
