/**
 * Orquestador del feed de noticias IA.
 *
 * Pipeline:
 *   1. Para cada fuente, fetch RSS.
 *   2. Tier 1 (oficiales): toda entrada se acepta.
 *      Tier 2/3: filtrado por keywords IA/agentes.
 *   3. Detectar categoría + tags + importancia heurísticamente (sin Claude).
 *   4. Dedupe por URL en DB.
 *   5. Insert en `news`.
 *
 * Diferencia con `ideas/poll`: aquí NO usamos Claude para clasificar — las
 * fuentes son curadas, blog oficial = noticia válida sin gastar tokens. Solo
 * hace falta IA si quieres reescribir títulos en español, pero por defecto
 * dejamos los originales.
 */
import Parser from "rss-parser";
import { repo } from "@/lib/db";
import { translatePending } from "@/lib/translate";
import { NEWS_KEYWORDS, detectCategory, detectTags, detectImportance } from "./sources";

const parser = new Parser({
  timeout: 15_000,
  headers: { "User-Agent": "AUTOCONT-NewsBot/1.0" },
});

export interface NewsPollSummary {
  startedAt: string;
  finishedAt: string;
  fetched: number;
  inserted: number;
  filtered: number;          // tier 2/3 que no pasaron filtro keyword
  duplicates: number;        // ya estaban en DB
  errors: Array<{ source: string; message: string }>;
  translated?: number;
  alreadySpanish?: number;
  translateCost?: number;
}

function passesKeywordFilter(text: string): boolean {
  const lower = text.toLowerCase();
  return NEWS_KEYWORDS.some((kw) => lower.includes(kw));
}

function extractRssThumb(it: Parser.Item & Record<string, unknown>): string | null {
  const enc = it.enclosure as { url?: string; type?: string } | undefined;
  if (enc?.url && (!enc.type || enc.type.startsWith("image/"))) return enc.url;
  const mediaContent = (it as unknown as { ["media:content"]?: { $?: { url?: string } } })["media:content"];
  if (mediaContent?.$?.url) return mediaContent.$.url;
  const mediaThumb = (it as unknown as { ["media:thumbnail"]?: { $?: { url?: string } } })["media:thumbnail"];
  if (mediaThumb?.$?.url) return mediaThumb.$.url;
  const html = (it.content as string | undefined) ?? "";
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return m?.[1] ?? null;
}

export async function pollNews(opts: { sinceHours?: number } = {}): Promise<NewsPollSummary> {
  const sinceMs = opts.sinceHours ? Date.now() - opts.sinceHours * 3600_000 : 0;

  const summary: NewsPollSummary = {
    startedAt: new Date().toISOString(),
    finishedAt: "",
    fetched: 0,
    inserted: 0,
    filtered: 0,
    duplicates: 0,
    errors: [],
  };

  // Fuentes desde DB (gestionadas en /ajustes). Si el usuario aún no añadió
  // ninguna, el array está vacío y simplemente no se hace nada.
  const sources = repo.listNewsSources(true);

  // Procesamos fuentes en paralelo (todas son RSS, sin tope de rate limit)
  await Promise.allSettled(
    sources.map(async (src) => {
      try {
        const feed = await parser.parseURL(src.url);
        for (const it of feed.items ?? []) {
          summary.fetched++;
          const url = (it.link ?? "").trim();
          if (!url) continue;

          // Filtro por fecha — descarta noticias muy antiguas
          if (sinceMs > 0 && it.isoDate && new Date(it.isoDate).getTime() < sinceMs) continue;

          // Dedupe DB
          if (repo.hasNewsForUrl(url)) {
            summary.duplicates++;
            continue;
          }

          const title = (it.title ?? "").trim();
          const rawDesc = (it.contentSnippet ?? it.content ?? it.summary ?? "").toString();
          const cleanDesc = rawDesc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          const combined = `${title} ${cleanDesc}`;

          // Tier 2/3 deben pasar filtro keyword
          if (src.tier !== 1 && !passesKeywordFilter(combined)) {
            summary.filtered++;
            continue;
          }

          const category = detectCategory(combined, src.default_category);
          const tags = detectTags(combined);
          const importance = detectImportance(combined, src.tier as 1 | 2 | 3);

          repo.createNews({
            title: title || "Sin título",
            description: cleanDesc.slice(0, 800) || null,
            source_url: url,
            source_name: src.name,
            category,
            tags,
            published_at: it.isoDate ?? it.pubDate ?? null,
            thumbnail_url: extractRssThumb(it),
            raw_content: null,
            importance,
            dismissed: 0,
            promoted_creation_id: null,
          });
          summary.inserted++;
        }
      } catch (err) {
        summary.errors.push({ source: src.name, message: (err as Error).message });
      }
    }),
  );

  // Traducción automática EN→ES de las nuevas — el canal es en español, así
  // que sobreescribimos title/description con la versión traducida. Heurística
  // primero (no gastar tokens en posts que ya estén en español).
  const apiKey = repo.getSettings().claude_api_key;
  if (apiKey && summary.inserted > 0) {
    try {
      const t = await translatePending({
        apiKey,
        kind: "news",
        domainHint: "noticias de IA, agentes y desarrollo",
        limit: summary.inserted + 50,
      });
      summary.translated = t.translated;
      summary.alreadySpanish = t.alreadySpanish;
      summary.translateCost = t.cost;
    } catch (err) {
      summary.errors.push({ source: "translate", message: (err as Error).message });
    }
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}
