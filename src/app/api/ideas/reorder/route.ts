import { NextRequest } from "next/server";
import { repo } from "@/lib/db";

/**
 * POST /api/ideas/reorder
 *
 * Body: { ids: string[] }  — orden visual completo de las ideas no descartadas.
 * Escribimos order_index = posición en la lista.
 */
export async function POST(req: NextRequest) {
  let body: { ids?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return Response.json({ error: "Falta ids[]" }, { status: 400 });
  }
  repo.reorderIdeas(body.ids);
  return Response.json({ ok: true, count: body.ids.length });
}
