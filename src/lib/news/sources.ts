/**
 * Catálogo curado de fuentes para detectar noticias de IA y agentes.
 *
 * Estructura tier:
 *   - tier 1 = blogs oficiales (OpenAI, Anthropic, etc.) → confianza máxima,
 *     toda entrada se considera "noticia válida" sin clasificación IA.
 *   - tier 2 = medios especializados (TechCrunch AI, VentureBeat AI, etc.) →
 *     filtrado por keywords agentes/IA antes de aceptar.
 *   - tier 3 = agregadores (Hacker News, Reddit) → score por keywords, solo
 *     entradas con suficiente señal de tema.
 */
import type { NewsCategory } from "./types";

export interface NewsSource {
  name: string;
  url: string;
  /** Categoría por defecto si no detectamos tag específico. */
  defaultCategory: NewsCategory;
  /** tier 1 = oficial, tier 2 = medio especializado, tier 3 = agregador. */
  tier: 1 | 2 | 3;
}

// Google News RSS — usado como fallback para labs sin RSS público
// (Anthropic, Meta AI, Mistral, xAI). Restringido por dominio para
// captar SOLO los posts oficiales, no la cobertura de medios.
const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

export const NEWS_SOURCES: NewsSource[] = [
  // ── Tier 1: blogs oficiales (toda entrada es relevante) ────────────
  { name: "OpenAI Blog",      url: "https://openai.com/news/rss.xml",                       defaultCategory: "openai",       tier: 1 },
  { name: "DeepMind Blog",    url: "https://deepmind.google/blog/rss.xml",                  defaultCategory: "deepmind",     tier: 1 },
  { name: "Google AI Blog",   url: "https://blog.google/technology/ai/rss/",                defaultCategory: "google-ai",    tier: 1 },
  { name: "Hugging Face",     url: "https://huggingface.co/blog/feed.xml",                  defaultCategory: "open-source",  tier: 1 },
  { name: "GitHub Blog",      url: "https://github.blog/feed/",                             defaultCategory: "github",       tier: 1 },
  { name: "GitHub Copilot",   url: "https://github.blog/category/ai-and-ml/feed/",          defaultCategory: "github",       tier: 1 },
  { name: "Cohere (GN)",      url: gnews("site:cohere.com/blog"),                           defaultCategory: "open-source",  tier: 1 },

  // Labs sin RSS oficial → Google News restringido a su dominio
  { name: "Anthropic (GN)",   url: gnews('site:anthropic.com/news OR site:anthropic.com/engineering'), defaultCategory: "anthropic", tier: 1 },
  { name: "Meta AI (GN)",     url: gnews("site:ai.meta.com/blog"),                          defaultCategory: "meta-ai",      tier: 1 },
  { name: "Mistral (GN)",     url: gnews("site:mistral.ai/news"),                           defaultCategory: "open-source",  tier: 1 },
  { name: "xAI (GN)",         url: gnews("site:x.ai/blog OR site:x.ai/news"),               defaultCategory: "industry",     tier: 1 },

  // ── Tier 2: medios especializados (filtrar por IA / agentes) ──────
  { name: "TechCrunch AI",    url: "https://techcrunch.com/category/artificial-intelligence/feed/", defaultCategory: "industry", tier: 2 },
  { name: "VentureBeat AI",   url: "https://venturebeat.com/category/ai/feed/",             defaultCategory: "industry",     tier: 2 },
  { name: "MIT Tech Rev",     url: "https://www.technologyreview.com/feed/",                defaultCategory: "research",     tier: 2 },
  { name: "The Verge AI",     url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", defaultCategory: "industry", tier: 2 },
  { name: "Ars Technica AI",  url: "https://arstechnica.com/ai/feed/",                      defaultCategory: "industry",     tier: 2 },
  { name: "The Register AI",  url: "https://www.theregister.com/software/ai_ml/headlines.atom", defaultCategory: "industry", tier: 2 },
  { name: "ML News",          url: "https://www.marktechpost.com/feed/",                    defaultCategory: "research",     tier: 2 },

  // ── Tier 3: agregadores (filtrado estricto por keywords) ───────────
  { name: "Hacker News (top)", url: "https://hnrss.org/frontpage?points=200",               defaultCategory: "industry",     tier: 3 },
  // Reddit RSS bloquea bots (403). Usamos Google News restringido al subreddit.
  { name: "r/LocalLLaMA (GN)", url: gnews("site:reddit.com/r/LocalLLaMA"),                  defaultCategory: "open-source",  tier: 3 },
  { name: "r/MachineLearn(GN)", url: gnews("site:reddit.com/r/MachineLearning"),            defaultCategory: "research",     tier: 3 },
];

/** Keywords que delatan tema relevante (IA / agentes / dev). Usadas para
 *  filtrar tier 2 y 3 — los oficiales (tier 1) entran sin filtro. */
export const NEWS_KEYWORDS = [
  // IA general
  "ai ", " ai,", " ai.", "artificial intelligence", "inteligencia artificial",
  "llm", "large language model",
  // Agentes (foco prioritario del canal)
  "agent", "agents", "agentic", "autonomous", "agente", "agentic ai",
  "tool use", "tool calling", "function calling", "computer use",
  // Modelos / labs
  "gpt-", "chatgpt", "claude", "gemini", "llama", "mistral", "deepseek",
  "openai", "anthropic", "deepmind", "cohere", "xai", "grok",
  // Dev / código
  "copilot", "cursor", "claude code", "github actions",
  "code generation", "ai coding", "programming agent",
  // Conceptos
  "rag", "retrieval", "fine-tun", "training", "inference",
  "multimodal", "vision", "voice", "speech",
  // Empresarial
  "funding", "raised", "valuation", "ipo", "acquisition",
];

/** Detecta categoría por keywords (más específica gana). */
const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: NewsCategory }> = [
  { pattern: /\b(agentic|autonomous|tool use|function calling|computer use|browser use|swe-?bench)\b/i, category: "agents" },
  { pattern: /\b(github copilot|copilot|github actions|github (release|launch))\b/i, category: "github" },
  { pattern: /\b(openai|gpt-?\d|chatgpt|sora|whisper|dall-?e)\b/i, category: "openai" },
  { pattern: /\b(anthropic|claude)\b/i, category: "anthropic" },
  { pattern: /\b(google|gemini|bard|vertex)\b/i, category: "google-ai" },
  { pattern: /\b(deepmind|alphafold|alphacode|alphazero)\b/i, category: "deepmind" },
  { pattern: /\b(meta ai|llama|pytorch|mistral|cohere|huggingface|hugging face)\b/i, category: "open-source" },
  { pattern: /\b(arxiv|paper|research|study|benchmark|fine-?tun)\b/i, category: "research" },
  { pattern: /\b(funding|raised|valuation|series [a-d]|acquisition|ipo)\b/i, category: "industry" },
];

export function detectCategory(text: string, fallback: NewsCategory): NewsCategory {
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(text)) return category;
  }
  return fallback;
}

/** Detecta tags adicionales (modelos, productos, conceptos específicos). */
export function detectTags(text: string): string[] {
  const tags = new Set<string>();
  const lower = text.toLowerCase();
  const checks: Array<[string, RegExp]> = [
    ["agents",         /\b(agent|agentic|autonomous)\b/i],
    ["tool-use",       /\b(tool use|tool calling|function call)\b/i],
    ["computer-use",   /\b(computer use|browser use)\b/i],
    ["claude-code",    /\bclaude code\b/i],
    ["copilot",        /\bcopilot\b/i],
    ["gpt-5",          /\bgpt-5\b/i],
    ["o1", /\bo[12]\b.*?(model|reasoning)/i],
    ["claude-opus",    /\b(claude.{1,3}opus)\b/i],
    ["gemini",         /\bgemini\b/i],
    ["llama",          /\bllama\b/i],
    ["mistral",        /\bmistral\b/i],
    ["benchmark",      /\b(benchmark|swe-?bench|mmlu|gpqa)\b/i],
    ["fine-tuning",    /\bfine.?tun/i],
    ["rag",            /\brag\b|\bretrieval.?augmented/i],
    ["multimodal",     /\bmultimodal\b/i],
    ["voice",          /\b(voice|speech|tts|asr)\b/i],
    ["vision",         /\b(vision|image|video model)\b/i],
    ["funding",        /\b(funding|raised|series [a-d]|valuation)\b/i],
    ["release",        /\b(launch|launches|release|releases|releasing|debut|introducing|now available)\b/i],
  ];
  for (const [tag, re] of checks) if (re.test(lower)) tags.add(tag);
  return Array.from(tags);
}

/** Detecta importancia: anuncios oficiales y releases tienen "alta". */
export function detectImportance(text: string, sourceTier: 1 | 2 | 3): "alta" | "media" | "baja" {
  const lower = text.toLowerCase();
  if (sourceTier === 1) {
    if (/\b(introducing|launch|releas|now available|today we|debut|announce)\b/i.test(lower)) return "alta";
    return "media";
  }
  if (/\b(breaking|exclusive|just released|just launched|today.*launch)\b/i.test(lower)) return "alta";
  if (sourceTier === 2) return "media";
  return "baja";
}
