import { NextRequest } from "next/server";
import { repo } from "@/lib/db";
import { randomUUID } from "node:crypto";

/**
 * GET  /api/sources/news    → listar fuentes de Noticias
 * POST /api/sources/news    → añadir nueva fuente RSS de noticias
 *
 * Body POST: { name, url, tier?: 1|2|3, default_category?, enabled?: 0|1 }
 */

const VALID_CATEGORIES = [
  "openai", "anthropic", "google-ai", "deepmind", "meta-ai",
  "agents", "github", "open-source", "research", "industry", "other",
];

export async function GET() {
  const sources = repo.listNewsSources(false);
  return Response.json({ sources });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, url, tier, default_category, enabled } = body ?? {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "name requerido" }, { status: 400 });
    }
    if (!url || typeof url !== "string" || !/^https?:\/\//.test(url)) {
      return Response.json({ error: "url debe empezar por http:// o https://" }, { status: 400 });
    }
    const t = Number(tier);
    if (![1, 2, 3].includes(t)) {
      return Response.json({ error: "tier debe ser 1, 2 o 3" }, { status: 400 });
    }
    const cat = String(default_category ?? "industry");
    if (!VALID_CATEGORIES.includes(cat)) {
      return Response.json({ error: `default_category inválida (${VALID_CATEGORIES.join(", ")})` }, { status: 400 });
    }

    const created = repo.upsertNewsSource({
      id: randomUUID(),
      name: name.trim(),
      url: url.trim(),
      tier: t,
      default_category: cat,
      enabled: enabled === 0 ? 0 : 1,
    });

    return Response.json({ source: created });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
