import { NextRequest } from "next/server";
import { repo } from "@/lib/db";
import { randomUUID } from "node:crypto";

/**
 * GET  /api/sources/ideas         → listar todas las fuentes de Ideas
 * POST /api/sources/ideas         → añadir nueva fuente
 *
 * Body POST: { kind: "rss"|"youtube", name, url, language?: "es"|"en", enabled?: 0|1 }
 */

export async function GET() {
  const sources = repo.listIdeaSources(false);
  return Response.json({ sources });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { kind, name, url, language, enabled } = body ?? {};

    if (!kind || !["rss", "youtube"].includes(kind)) {
      return Response.json({ error: "kind debe ser 'rss' o 'youtube'" }, { status: 400 });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return Response.json({ error: "name requerido" }, { status: 400 });
    }
    if (!url || typeof url !== "string" || !/^https?:\/\//.test(url)) {
      return Response.json({ error: "url debe empezar por http:// o https://" }, { status: 400 });
    }

    const created = repo.upsertIdeaSource({
      id: randomUUID(),
      kind,
      name: name.trim(),
      url: url.trim(),
      language: language === "en" ? "en" : "es",
      enabled: enabled === 0 ? 0 : 1,
    });

    return Response.json({ source: created });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
