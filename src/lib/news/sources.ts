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

/**
 * Seed por defecto del catálogo de fuentes de noticias.
 *
 * En la v0.1 OSS arranca VACÍO — cada usuario añade sus propias fuentes
 * RSS desde /ajustes → "Fuentes de scrapeo · Noticias". Si quieres
 * pre-popularlo para tu instancia, añade entradas aquí.
 *
 * tier:
 *   1 = blog oficial / fuente de confianza (todo lo que publican es relevante)
 *   2 = medio especializado (se filtra por NEWS_KEYWORDS antes de aceptar)
 *   3 = agregador (filtro estricto por NEWS_KEYWORDS)
 */
export const NEWS_SOURCES: NewsSource[] = [
  // Vacío en v0.1 OSS. Ejemplo de cómo añadir:
  // { name: "Anthropic Blog",  url: "https://www.anthropic.com/news/rss.xml", defaultCategory: "anthropic", tier: 1 },
  // { name: "TechCrunch AI",   url: "https://techcrunch.com/category/artificial-intelligence/feed/", defaultCategory: "industry", tier: 2 },
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
