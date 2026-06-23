/**
 * Contexto persistente que Claude usa como "biblia" cuando sugiere títulos,
 * descripciones o continúa el guion. Cargamos los 4 vídeos de referencia que
 * el usuario eligió como modelo (Nate Gentile, Adrián Sáenz, JuanPe Navarro,
 * Alejavi Rivera) — sus transcripciones y metadata se descargaron una vez
 * con yt-dlp y se persisten en `dashboard/data/reference-transcripts/consolidated.json`.
 *
 * Usamos prompt caching de Anthropic: el bloque de referencia es estable
 * entre llamadas, así que se cachea (5 min) y solo paga el delta de input.
 */
import fs from "node:fs";
import path from "node:path";

export interface ReferenceVideo {
  creator: string;
  url: string;
  title: string;
  description: string;
  duration_sec: number | null;
  view_count: number | null;
  like_count: number | null;
  tags: string[];
  transcript_excerpt: string;
}

let cached: ReferenceVideo[] | null = null;

export function loadReferences(): ReferenceVideo[] {
  if (cached) return cached;
  const file = path.resolve(process.cwd(), "data", "reference-transcripts", "consolidated.json");
  if (!fs.existsSync(file)) {
    console.warn("[creations] referencias no encontradas en", file);
    cached = [];
    return cached;
  }
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as { references: ReferenceVideo[] };
    cached = json.references ?? [];
  } catch (err) {
    console.warn("[creations] no se pudo leer consolidated.json:", (err as Error).message);
    cached = [];
  }
  return cached;
}

/** Bloque de texto compacto que se inyecta como `system` o como user prompt
 *  cuando pedimos sugerencias a Claude. Diseñado para ser cacheable: contenido
 *  estable, encabezado claro, sin variables del request actual. */
export function buildReferenceBlock(): string {
  const refs = loadReferences();
  if (refs.length === 0) return "";

  const lines: string[] = [
    "# BIBLIA DE REFERENCIA — vídeos modelo del canal",
    "",
    "Estos son los 4 vídeos en español que el usuario tiene como referencia",
    "para tono, estructura, ritmo, longitud y enfoque. Cuando sugieras títulos,",
    "descripciones o continues guion, INSPÍRATE en ellos: cómo abren, cómo enganchan,",
    "cómo estructuran la información, qué tipo de promesa hacen al espectador.",
    "",
  ];

  for (const r of refs) {
    lines.push(`## ${r.creator}`);
    lines.push(`Título: ${r.title}`);
    if (r.duration_sec) lines.push(`Duración: ${Math.round(r.duration_sec / 60)} min`);
    if (r.view_count) lines.push(`Vistas: ${r.view_count.toLocaleString("es-ES")}`);
    if (r.tags?.length) lines.push(`Tags: ${r.tags.slice(0, 8).join(", ")}`);
    if (r.description) {
      lines.push(`Descripción (primeros 800 chars):`);
      lines.push(r.description.slice(0, 800));
    }
    lines.push("");
    lines.push(`Transcripción inicial (primeros 8000 chars):`);
    lines.push(r.transcript_excerpt);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}
