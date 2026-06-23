import { NextRequest } from "next/server";
import { pollAllSources } from "@/lib/ideas/poll";

/**
 * POST /api/ideas/poll
 *
 * Body opcional:
 *   { limitPerSource?: number, sinceHours?: number, onlySourceId?: string }
 *
 * Recorre todas las fuentes habilitadas, descarga lo nuevo, lo procesa con
 * Claude Haiku, y devuelve un resumen. Pensado para ser llamado cada 5h
 * desde launchd o manualmente con el botón "Buscar ideas".
 *
 * El timeout del runtime es alto a propósito — un poll completo de las ~40
 * fuentes con 3 items cada una puede tardar 1-3 minutos.
 */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { limitPerSource?: number; sinceHours?: number; onlySourceId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — fall through to defaults
  }

  try {
    const summary = await pollAllSources(body);
    return Response.json(summary);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
