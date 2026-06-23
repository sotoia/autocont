export type CreationKind = "viral" | "actualidad" | "didactico";

export interface Creation {
  id: string;
  kind: CreationKind;
  /** Si nació de una idea, referencia la idea original. */
  source_idea_id: string | null;
  title: string;
  description: string;
  script: string;
  /** Versión reducida del guion para teleprompter — solo partes habladas en
   *  frases cortas, sin marcadores [B-ROLL: …] ni didascalia. Se genera con IA
   *  a partir del `script` cuando el usuario abre el modo Prompter. */
  prompter_script: string;
  /** Ficha rápida del vídeo: título, duración objetivo, gancho, promesa,
   *  palabra-clave CTA, stack. Texto multilínea (markdown ligero). */
  ficha_rapida: string;
  /** Mapa de bloques del vídeo: tabla parte / bloque / minuto / loop.
   *  Texto multilínea (markdown ligero, tabla MD). */
  mapa_bloques: string;
  /** Path relativo a la miniatura del vídeo dentro de /public
   *  (ej. "/uploads/thumbnails/<id>.jpg"). Vacío si no hay. */
  thumbnail_path: string;
  /** URL del vídeo de YouTube ya subido. Cuando está, el preview muestra
   *  un botón Play sobre la miniatura que reproduce el vídeo embebido. */
  youtube_url: string;
  notes: string;
  /** Lista de IDs de creators referencia que se usaron como contexto. */
  ref_pack: string[];
  pinned: number;
  archived: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

/** Catálogo de duraciones objetivo por tipo. */
export const CREATION_DURATIONS: Record<CreationKind, { minMin: number; maxMin: number; label: string }> = {
  viral:      { minMin: 30, maxMin: 50, label: "30 – 50 min" },
  actualidad: { minMin: 30, maxMin: 50, label: "30 – 50 min" },
  didactico:  { minMin: 40, maxMin: 90, label: "40 min – 1h 30min" },
};

export const CREATION_KIND_LABELS: Record<CreationKind, string> = {
  viral:      "Viral (apps/webs creadores)",
  actualidad: "Actualidad (IA / desarrollo)",
  didactico:  "Didáctico (curso / tutorial)",
};

export const CREATION_KIND_DESCRIPTIONS: Record<CreationKind, string> = {
  viral: "Vídeos sobre creaciones de apps o webs para creadores de contenido grandes en España. Tono de retrobúsqueda viral, narrativa de proceso.",
  actualidad: "Noticias de última hora sobre desarrollos o IA. Tono informativo con análisis y opinión personal.",
  didactico: "Tutoriales / cursos paso a paso para enseñar usos de la IA o desarrollo de apps. Tono pedagógico y estructurado.",
};
