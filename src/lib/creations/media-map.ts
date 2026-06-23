/**
 * Media map por creación — asocia marcas `[STOCK: ...]` o `[B-ROLL: ...]`
 * dentro del guion con archivos de media concretos (foto/vídeo) para mostrar
 * en el lightbox del editor de creaciones.
 *
 * En la v0.1 OSS este mapping arranca vacío. Personalízalo tú según los
 * proyectos que tengas. Ejemplo:
 *
 *   const MEDIA_MAPS_BY_CREATION_ID: Record<string, MediaAssignment[]> = {
 *     "<creation-id>": [
 *       { sectionNum: 1, match: "logo",  media: { kind: "image", src: "/uploads/logo.png", caption: "Logo de mi canal", source: "creator" } },
 *       { sectionNum: 3, match: "intro", media: { kind: "video", src: "/uploads/intro.mp4", caption: "Cortina de entrada", source: "creator" } },
 *     ],
 *   };
 *
 * - sectionNum: número de la sección del guion (correlativo a TODO el guion).
 * - match: substring (case-insensitive) que debe aparecer en el `label` o
 *          `detail` de la marca para que aplique. Si "" coincide con
 *          cualquier marca de esa sección que aún no tenga media asignado.
 * - media: imagen o vídeo a mostrar en el lightbox.
 * - source: "official" (proporcionado por sponsor) o "creator" (a grabar
 *           por el usuario).
 */

export interface MediaItem {
  kind: "image" | "video";
  src: string;
  caption: string;
  source: "official" | "creator";
}

export interface MediaAssignment {
  sectionNum: number;
  /** Substring (case-insensitive) que debe matchear con `label`/`detail`
   *  de la marca del guion. "" = match cualquier marca libre de la sección. */
  match: string;
  media: MediaItem;
}

const MEDIA_MAPS_BY_CREATION_ID: Record<string, MediaAssignment[]> = {
  // Vacío en v0.1 OSS — personalízalo según tus proyectos.
};

export function getMediaMapForCreation(creationId: string): MediaAssignment[] {
  return MEDIA_MAPS_BY_CREATION_ID[creationId] ?? [];
}

/**
 * Resuelve qué items van a cada marca de una sección. Soporta carrusel:
 * varias entries con el mismo `match` se acumulan bajo la misma marca.
 */
export function resolveMediaForSection(
  map: MediaAssignment[],
  sectionNum: number,
  marks: { label: string; detail?: string }[],
): MediaItem[][] {
  const consumed = new Set<number>();
  const haystacks = marks.map((m) => `${m.label} ${m.detail ?? ""}`.toLowerCase());
  const result: MediaItem[][] = marks.map(() => []);

  for (let i = 0; i < map.length; i++) {
    const a = map[i];
    if (a.sectionNum !== sectionNum) continue;
    if (consumed.has(i)) continue;

    const matchLower = a.match.toLowerCase();
    let targetIdx = -1;

    if (matchLower !== "") {
      targetIdx = haystacks.findIndex(
        (h, idx) => h.includes(matchLower) && result[idx].length > 0,
      );
      if (targetIdx < 0) {
        targetIdx = haystacks.findIndex(
          (h, idx) => h.includes(matchLower) && result[idx].length === 0,
        );
      }
    }
    if (targetIdx < 0) {
      targetIdx = result.findIndex((arr) => arr.length === 0);
    }
    if (targetIdx >= 0) {
      result[targetIdx].push(a.media);
      consumed.add(i);
    }
  }
  return result;
}
