/**
 * Catálogo curado de fuentes para el agregador de ideas.
 * Se siembra en la DB la primera vez que se accede a /ideas.
 * El usuario puede luego habilitar/deshabilitar cada una desde Ajustes
 * o directamente en la propia tabla `idea_sources`.
 */
import type { IdeaSourceKind, IdeaLanguage } from "./types";

export interface SeedSource {
  kind: IdeaSourceKind;
  name: string;
  url: string;
  language: IdeaLanguage;
}

export const IDEAS_SEED_SOURCES: SeedSource[] = [
  // ─── Noticias hispanohablantes ───────────────────────────────────────
  { kind: "rss", name: "Xataka",            url: "https://www.xataka.com/index.xml",        language: "es" },
  { kind: "rss", name: "Hipertextual",      url: "https://hipertextual.com/feed",           language: "es" },
  { kind: "rss", name: "Genbeta",           url: "https://www.genbeta.com/index.xml",       language: "es" },
  { kind: "rss", name: "Wwwhatsnew",        url: "https://wwwhatsnew.com/feed/",            language: "es" },
  { kind: "rss", name: "DPL News",          url: "https://dplnews.com/feed/",               language: "es" },
  { kind: "rss", name: "Infobae Tecno",     url: "https://www.infobae.com/feeds/rss/sections/tecno/",   language: "es" },
  { kind: "rss", name: "Maldita Tecnología",url: "https://maldita.es/malditatecnologia/feed/", language: "es" },

  // ─── Noticias americanas / inglés ────────────────────────────────────
  { kind: "rss", name: "TechCrunch",         url: "https://techcrunch.com/feed/",                language: "en" },
  { kind: "rss", name: "The Verge",          url: "https://www.theverge.com/rss/index.xml",      language: "en" },
  { kind: "rss", name: "Ars Technica",       url: "https://feeds.arstechnica.com/arstechnica/index", language: "en" },
  { kind: "rss", name: "Wired",              url: "https://www.wired.com/feed/rss",              language: "en" },
  { kind: "rss", name: "MIT Technology Review", url: "https://www.technologyreview.com/feed/",   language: "en" },
  { kind: "rss", name: "VentureBeat AI",     url: "https://venturebeat.com/category/ai/feed/",   language: "en" },
  { kind: "rss", name: "Anthropic Blog",     url: "https://www.anthropic.com/news/rss.xml",      language: "en" },
  { kind: "rss", name: "OpenAI Blog",        url: "https://openai.com/news/rss.xml",             language: "en" },
  { kind: "rss", name: "DeepMind Blog",      url: "https://deepmind.google/blog/rss.xml",        language: "en" },
  { kind: "rss", name: "Axios AI",           url: "https://api.axios.com/feed/technology",       language: "en" },

  // ─── YouTube hispanohablante ─────────────────────────────────────────
  { kind: "youtube", name: "Dot CSV",                  url: "https://www.youtube.com/@DotCSV",              language: "es" },
  { kind: "youtube", name: "Xavier Mitjana",           url: "https://www.youtube.com/@XavierMitjana",       language: "es" },
  { kind: "youtube", name: "La Hora Maker",            url: "https://www.youtube.com/@LaHoraMaker",         language: "es" },
  { kind: "youtube", name: "Romualdo",                 url: "https://www.youtube.com/@elromualdo",          language: "es" },
  { kind: "youtube", name: "Platzi",                   url: "https://www.youtube.com/@Platzi",              language: "es" },
  { kind: "youtube", name: "Chema Alonso",             url: "https://www.youtube.com/@chemaalonso",         language: "es" },
  { kind: "youtube", name: "MoneyTalks Tech",          url: "https://www.youtube.com/@MoneyTalksES",        language: "es" },
  { kind: "youtube", name: "midudev",                  url: "https://www.youtube.com/@midudev",             language: "es" },
  { kind: "youtube", name: "Jon Hernández IA",         url: "https://www.youtube.com/@JonHernandezIA",      language: "es" },
  { kind: "youtube", name: "LógicamenteAclarado",      url: "https://www.youtube.com/@LogicamenteAclarado", language: "es" },
  { kind: "youtube", name: "Juan Pe Navarro IA",       url: "https://www.youtube.com/@juanpenavarro",       language: "es" },
  { kind: "youtube", name: "Alejavi Rivera",           url: "https://www.youtube.com/@AlejaviRivera",       language: "es" },

  // ─── YouTube americano ───────────────────────────────────────────────
  { kind: "youtube", name: "Two Minute Papers",        url: "https://www.youtube.com/@TwoMinutePapers",     language: "en" },
  { kind: "youtube", name: "AI Explained",             url: "https://www.youtube.com/@aiexplained-official",language: "en" },
  { kind: "youtube", name: "Matt Wolfe",               url: "https://www.youtube.com/@mreflow",             language: "en" },
  { kind: "youtube", name: "MattVidPro AI",            url: "https://www.youtube.com/@MattVidPro",          language: "en" },
  { kind: "youtube", name: "The AI Advantage",         url: "https://www.youtube.com/@aiadvantage",         language: "en" },
  { kind: "youtube", name: "WesRoth",                  url: "https://www.youtube.com/@WesRoth",             language: "en" },
  { kind: "youtube", name: "bycloud",                  url: "https://www.youtube.com/@bycloudAI",           language: "en" },
  { kind: "youtube", name: "Lex Fridman",              url: "https://www.youtube.com/@lexfridman",          language: "en" },
  { kind: "youtube", name: "Fireship",                 url: "https://www.youtube.com/@Fireship",            language: "en" },
];
