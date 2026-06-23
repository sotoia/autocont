import { repo } from "@/lib/db";
import { proposeMetaIdeas } from "@/lib/ideas/propose";

export const maxDuration = 120;

/** POST /api/ideas/propose — Claude analiza las 20 ideas más recientes y
 *  propone 5-8 ideas de vídeo nuevas, marcadas como ai-meta. */
export async function POST() {
  const settings = repo.getSettings();
  if (!settings.claude_api_key) {
    return Response.json({ error: "Falta claude_api_key en Ajustes" }, { status: 400 });
  }
  try {
    const result = await proposeMetaIdeas({ apiKey: settings.claude_api_key });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
