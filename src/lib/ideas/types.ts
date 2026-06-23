export type IdeaSourceKind = "rss" | "youtube" | "ai-meta";
export type IdeaLanguage = "es" | "en";

export interface IdeaSource {
  id: string;
  kind: IdeaSourceKind;
  name: string;
  /** RSS feed URL for `kind=rss`, or YouTube channel URL/handle for `kind=youtube` (e.g. "@midudev") */
  url: string;
  language: IdeaLanguage;
  enabled: number;
  last_polled_at: string | null;
}

export interface IdeaEngagement {
  /** YouTube views, post pageviews if scraped, etc. */
  views?: number;
  /** YouTube likes, news article reactions/upvotes, etc. */
  likes?: number;
  /** YouTube comments, news article comment count, etc. */
  comments?: number;
  /** Shares (cuando esté disponible). */
  shares?: number;
}

export interface Idea {
  id: string;
  source_id: string;
  source_name: string;
  source_kind: IdeaSourceKind;
  /** URL canónica del artículo o vídeo, también clave de dedupe. */
  source_url: string;
  /** Título original del item (artículo o vídeo). */
  title: string;
  /** Descripción / extracto original (resumen del feed o descripción del vídeo). */
  description: string | null;
  thumbnail_url: string | null;
  /** Cuerpo completo (artículo extraído con Readability o transcripción + descripción YouTube). */
  raw_content: string | null;
  /** Título reescrito por Claude para usar como vídeo. */
  generated_title: string | null;
  /** Descripción de 2-3 líneas reescrita por Claude. */
  generated_description: string | null;
  /** Guion resumido en bullets generado por Claude. */
  generated_script: string | null;
  language: IdeaLanguage;
  pinned: number;
  featured: number;
  dismissed: number;
  order_index: number;
  /** Fecha de publicación original (del feed o vídeo). */
  published_at: string | null;
  /** Métricas de engagement (views, likes, comments). JSON serializado. */
  engagement: IdeaEngagement | null;
  created_at: string;
}
