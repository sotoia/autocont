/**
 * Catálogo de fuentes para el agregador de ideas.
 *
 * En la v0.1 OSS arranca VACÍO — cada usuario añade sus propias fuentes
 * desde /ajustes → "Fuentes de scrapeo · Ideas". Si quieres pre-popularlo
 * para tu instancia, añade entradas aquí (formato comentado más abajo).
 */
import type { IdeaSourceKind, IdeaLanguage } from "./types";

export interface SeedSource {
  kind: IdeaSourceKind;
  name: string;
  url: string;
  language: IdeaLanguage;
}

export const IDEAS_SEED_SOURCES: SeedSource[] = [
  // Vacío en v0.1 OSS. Ejemplo de cómo añadir:
  // { kind: "rss",     name: "Mi blog favorito",   url: "https://miblog.com/rss",     language: "es" },
  // { kind: "youtube", name: "Mi canal favorito",  url: "https://youtube.com/@canal", language: "es" },
];
