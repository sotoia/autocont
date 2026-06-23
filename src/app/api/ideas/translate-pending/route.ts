import { repo } from "@/lib/db";
import { translatePending } from "@/lib/translate";

export const maxDuration = 300;

/** POST /api/ideas/translate-pending — traduce todas las ideas con
 *  translated=0 al español. */
export async function POST() {
  const settings = repo.getSettings();
  if (!settings.claude_api_key) {
    return Response.json({ error: "Falta claude_api_key en Ajustes" }, { status: 400 });
  }
  try {
    const summary = await translatePending({
      apiKey: settings.claude_api_key,
      kind: "ideas",
      domainHint: "vídeos de YouTube y noticias de tech / IA",
      limit: 500,
    });
    return Response.json(summary);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
