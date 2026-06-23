export type NewsCategory =
  | "openai"
  | "anthropic"
  | "google-ai"
  | "deepmind"
  | "meta-ai"
  | "agents"      // ai agents, autonomous systems, agentic AI
  | "github"     // GitHub blog, releases, copilot
  | "open-source" // hugging face, mistral, llama, etc.
  | "research"   // papers, arxiv, deepmind research
  | "industry"   // funding, startups, acquisitions
  | "other";

export interface NewsItem {
  id: string;
  title: string;
  description: string | null;
  /** URL canónica del artículo. */
  source_url: string;
  /** Nombre legible de la fuente (OpenAI Blog, Anthropic, Hacker News, etc.). */
  source_name: string;
  /** Bucket temático principal — para filtros UI. */
  category: NewsCategory;
  /** Lista de tags adicionales (regex match: "agents", "claude-code", "gpt-5", "open-source", etc.) */
  tags: string[];
  /** Cuándo se publicó originalmente. */
  published_at: string | null;
  /** Cuándo lo recogió el poller. */
  fetched_at: string;
  thumbnail_url: string | null;
  /** Cuerpo si lo extrajimos para context. */
  raw_content: string | null;
  /** Importancia detectada (alta = anuncio oficial / breaking / release). */
  importance: "alta" | "media" | "baja";
  /** Marca por usuario para no volver a verlo. */
  dismissed: number;
  /** Si se convirtió en Creación, su id. */
  promoted_creation_id: string | null;
  created_at: string;
}

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  "google-ai": "Google AI",
  deepmind: "DeepMind",
  "meta-ai": "Meta AI",
  agents: "Agentes IA",
  github: "GitHub / Copilot",
  "open-source": "Open Source",
  research: "Research / Papers",
  industry: "Industria / Funding",
  other: "Otros",
};

export const NEWS_CATEGORY_COLORS: Record<NewsCategory, string> = {
  openai: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  anthropic: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  "google-ai": "bg-sky-500/10 text-sky-400 border-sky-500/30",
  deepmind: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  "meta-ai": "bg-blue-500/10 text-blue-400 border-blue-500/30",
  agents: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30",
  github: "bg-slate-500/10 text-slate-300 border-slate-500/30",
  "open-source": "bg-orange-500/10 text-orange-400 border-orange-500/30",
  research: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
  industry: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  other: "bg-gray-500/10 text-gray-400 border-gray-500/30",
};
