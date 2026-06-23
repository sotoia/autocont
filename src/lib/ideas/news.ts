/**
 * RSS feed reading + article body extraction with Readability.
 *
 * Devuelve los items recientes de un feed (limit por defecto 5) con título,
 * descripción cortita y, si conseguimos extraer el cuerpo completo, lo añade
 * en raw_content para que Claude tenga contexto al generar título/guion.
 */
import Parser from "rss-parser";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const parser = new Parser({
  timeout: 15_000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 AUTOCONT-IdeasBot/1.0",
  },
});

export interface NewsItem {
  url: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  /** Cuerpo extraído con Readability si el fetch va bien. */
  body: string | null;
}

/** Pull recent items from an RSS feed. */
export async function fetchFeed(
  feedUrl: string,
  opts: { limit?: number; sinceHours?: number } = {},
): Promise<NewsItem[]> {
  const limit = opts.limit ?? 5;
  const since = opts.sinceHours ? Date.now() - opts.sinceHours * 3600_000 : 0;

  const feed = await parser.parseURL(feedUrl);
  const items = (feed.items ?? [])
    .filter((it) => {
      if (!since || !it.isoDate) return true;
      return new Date(it.isoDate).getTime() >= since;
    })
    .slice(0, limit);

  return items.map((it) => ({
    url: (it.link ?? "").trim(),
    title: (it.title ?? "Sin título").trim(),
    description: extractDescription(it),
    thumbnail_url: extractThumbnail(it),
    published_at: it.isoDate ?? it.pubDate ?? null,
    body: null,
  }));
}

function extractDescription(it: Parser.Item & Record<string, unknown>): string | null {
  const raw = (it.contentSnippet as string | undefined) ?? (it.content as string | undefined) ?? (it.summary as string | undefined);
  if (!raw) return null;
  // Strip HTML, collapse whitespace, cap at ~400 chars for the card
  const text = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > 400 ? text.slice(0, 397) + "…" : text;
}

function extractThumbnail(it: Parser.Item & Record<string, unknown>): string | null {
  const enc = it.enclosure as { url?: string; type?: string } | undefined;
  if (enc?.url && (!enc.type || enc.type.startsWith("image/"))) return enc.url;
  const mediaContent = (it as unknown as { ["media:content"]?: { $?: { url?: string } } })["media:content"];
  if (mediaContent?.$?.url) return mediaContent.$.url;
  const mediaThumb = (it as unknown as { ["media:thumbnail"]?: { $?: { url?: string } } })["media:thumbnail"];
  if (mediaThumb?.$?.url) return mediaThumb.$.url;
  // Fallback: first <img> in HTML content
  const html = (it.content as string | undefined) ?? "";
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return m?.[1] ?? null;
}

/**
 * Fetch an article URL, run Readability on it, and return the article text.
 * Soft-fails: returns null on any error (network, parsing, etc.).
 */
export async function extractArticleBody(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 AUTOCONT-IdeasBot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    if (!article?.textContent) return null;
    // Cap at 8k chars — más que suficiente contexto para un artículo medio
    // y mantiene los costes de Haiku contenidos.
    const text = article.textContent.replace(/\s+/g, " ").trim();
    return text.length > 8000 ? text.slice(0, 8000) : text;
  } catch {
    return null;
  }
}
