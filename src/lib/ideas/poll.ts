/**
 * Orquestador del agregador de ideas.
 *
 * Recorre todas las fuentes habilitadas (RSS + YouTube), descarga los items
 * recientes que aún no están en la DB, los procesa con Claude Haiku para
 * generar título + descripción + guion, y los inserta en `ideas`.
 *
 * Idempotente — el dedupe se hace por `source_url` (UNIQUE en la tabla).
 * Pensado para llamarse cada 5h vía launchd.
 */
import { repo } from "@/lib/db";
import { translatePending } from "@/lib/translate";
import type { IdeaEngagement, IdeaSource } from "./types";
import { fetchFeed, extractArticleBody } from "./news";
import { listChannelVideos, fetchVideoDetails, fetchTranscript } from "./youtube";
import { generateIdea } from "./generate";
import { classifyTech, isTechOnlySource } from "./tech-filter";

export interface PollSummary {
  startedAt: string;
  finishedAt: string;
  totalSources: number;
  itemsFound: number;
  itemsNew: number;
  itemsGenerated: number;
  /** Items que el filtro tech descartó antes de procesar. */
  itemsFilteredOut: number;
  errors: Array<{ source: string; message: string }>;
  costUsd: number;
  translated?: number;
  alreadySpanish?: number;
  translateCost?: number;
}

/** Default per-source caps. Tweakable from the endpoint payload. */
const DEFAULT_LIMIT_PER_SOURCE = 3;
const DEFAULT_SINCE_HOURS = 24;
const CONCURRENCY = 4;

export interface PollOptions {
  limitPerSource?: number;
  /** Only consider items published in the last N hours. */
  sinceHours?: number;
  /** Run only this single source id (for ad-hoc testing). */
  onlySourceId?: string;
}

export async function pollAllSources(opts: PollOptions = {}): Promise<PollSummary> {
  const settings = repo.getSettings();
  if (!settings.claude_api_key) {
    throw new Error("Falta claude_api_key en settings");
  }

  const limit = opts.limitPerSource ?? DEFAULT_LIMIT_PER_SOURCE;
  const sinceHours = opts.sinceHours ?? DEFAULT_SINCE_HOURS;

  let sources = repo.listIdeaSources(true);
  if (opts.onlySourceId) sources = sources.filter((s) => s.id === opts.onlySourceId);

  const summary: PollSummary = {
    startedAt: new Date().toISOString(),
    finishedAt: "",
    totalSources: sources.length,
    itemsFound: 0,
    itemsNew: 0,
    itemsGenerated: 0,
    itemsFilteredOut: 0,
    errors: [],
    costUsd: 0,
  };

  let baseOrder = repo.maxIdeaOrderIndex() + 1;

  // Process sources in parallel batches to keep wall-time reasonable.
  for (let i = 0; i < sources.length; i += CONCURRENCY) {
    const batch = sources.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((s) =>
        processSource(s, { limit, sinceHours, apiKey: settings.claude_api_key, baseOrder: baseOrder + i * limit })
          .catch((err) => ({
            sourceName: s.name,
            found: 0,
            inserted: 0,
            generated: 0,
            filteredOut: 0,
            cost: 0,
            error: (err as Error).message,
          })),
      ),
    );
    for (const r of results) {
      summary.itemsFound += r.found;
      summary.itemsNew += r.inserted;
      summary.itemsGenerated += r.generated;
      summary.itemsFilteredOut += r.filteredOut;
      summary.costUsd += r.cost;
      if ("error" in r && r.error) summary.errors.push({ source: r.sourceName, message: r.error });
    }
    baseOrder += batch.length * limit;
  }

  // Traducción automática EN→ES de las nuevas ideas. La heurística decide
  // cuáles ya están en español (Nate Gentile, Adrián Sáenz, Midudev…) y se
  // saltan sin gastar tokens.
  if (summary.itemsNew > 0) {
    try {
      const t = await translatePending({
        apiKey: settings.claude_api_key,
        kind: "ideas",
        domainHint: "vídeos de YouTube y noticias de tech / IA",
        limit: summary.itemsNew + 100,
      });
      summary.translated = t.translated;
      summary.alreadySpanish = t.alreadySpanish;
      summary.translateCost = t.cost;
      summary.costUsd += t.cost;
    } catch (err) {
      summary.errors.push({ source: "translate", message: (err as Error).message });
    }
  }

  summary.finishedAt = new Date().toISOString();
  return summary;
}

interface SourceResult {
  sourceName: string;
  found: number;
  inserted: number;
  generated: number;
  filteredOut: number;
  cost: number;
  error?: string;
}

async function processSource(
  source: IdeaSource,
  opts: { limit: number; sinceHours: number; apiKey: string; baseOrder: number },
): Promise<SourceResult> {
  const result: SourceResult = {
    sourceName: source.name,
    found: 0,
    inserted: 0,
    generated: 0,
    filteredOut: 0,
    cost: 0,
  };
  const skipFilter = isTechOnlySource(source.name);

  // 1. Listar items recientes
  const items = source.kind === "rss"
    ? (await fetchFeed(source.url, { limit: opts.limit, sinceHours: opts.sinceHours })).map((it) => ({
        url: it.url,
        title: it.title,
        description: it.description,
        thumbnail_url: it.thumbnail_url,
        published_at: it.published_at,
      }))
    : (await listChannelVideos(source.url, opts.limit)).map((v) => ({
        url: v.url,
        title: v.title,
        description: v.description,
        thumbnail_url: v.thumbnail_url,
        published_at: v.published_at,
      }));
  result.found = items.length;

  let order = opts.baseOrder;
  for (const item of items) {
    if (!item.url) continue;
    if (repo.hasIdeaForUrl(item.url)) continue;

    // 1.5. Filtro tech: si la fuente no es tech-only, pre-clasificamos por
    //      el TÍTULO únicamente. La descripción suele traer ruido (sponsors,
    //      bumpers de podcasts, etc.) que mete en cualquier item. El título
    //      es lo que define de qué va el contenido.
    if (!skipFilter) {
      const verdict = classifyTech(item.title);
      if (!verdict.isTech) {
        result.filteredOut++;
        continue;
      }
    }

    // 2. Enriquecer: extraer cuerpo / transcripción según tipo
    let raw: string | null = null;
    let description = item.description;
    let thumbnail = item.thumbnail_url;
    let engagement: IdeaEngagement | null = null;
    if (source.kind === "rss") {
      raw = await extractArticleBody(item.url);
    } else {
      const details = await fetchVideoDetails(item.url);
      if (details) {
        description = description ?? details.description;
        thumbnail = thumbnail ?? details.thumbnail_url;
        engagement = {
          ...(details.views !== null ? { views: details.views } : {}),
          ...(details.likes !== null ? { likes: details.likes } : {}),
          ...(details.comments !== null ? { comments: details.comments } : {}),
        };
        if (Object.keys(engagement).length === 0) engagement = null;
      }
      const transcript = await fetchTranscript(item.url);
      raw = [details?.description, transcript].filter(Boolean).join("\n\n") || null;
    }

    // 3. Generar con Claude (continúa aunque falle)
    let gen: { titulo: string; descripcion: string; guion: string } | null = null;
    try {
      const out = await generateIdea({
        sourceTitle: item.title,
        sourceDescription: description,
        rawContent: raw,
        language: source.language,
        apiKey: opts.apiKey,
      });
      gen = out;
      result.cost += out.cost_usd;
      result.generated++;
    } catch (err) {
      // Insertamos igualmente sin generated_* — el usuario puede regenerar más tarde
      console.warn(`[ideas] generate failed for ${item.url}: ${(err as Error).message}`);
    }

    // 4. Insertar
    try {
      repo.createIdea({
        source_id: source.id,
        source_name: source.name,
        source_kind: source.kind,
        source_url: item.url,
        title: item.title,
        description: description,
        thumbnail_url: thumbnail,
        raw_content: raw,
        generated_title: gen?.titulo ?? null,
        generated_description: gen?.descripcion ?? null,
        generated_script: gen?.guion ?? null,
        language: source.language,
        pinned: 0,
        featured: 0,
        dismissed: 0,
        order_index: order++,
        published_at: item.published_at,
        engagement,
      });
      result.inserted++;
    } catch (err) {
      // UNIQUE constraint race — ignoramos silenciosamente
      console.warn(`[ideas] insert failed for ${item.url}: ${(err as Error).message}`);
    }
  }

  repo.markSourcePolled(source.id);
  return result;
}
