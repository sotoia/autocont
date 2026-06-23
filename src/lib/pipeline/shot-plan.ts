import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import type { StockAsset } from "@/lib/types";
import type { Transcript } from "./transcribe";

export type SegmentSource = "raw" | "stock" | "motion";

export interface ShotSegment {
  start: number;
  end: number;
  source: SegmentSource;
  reason: string;
  /** When source=stock: list of filenames from the catalog to cycle through
   *  (each chunk ≤ 4s). Empty if source=raw/motion. */
  stock_filenames?: string[];
  motion_prompt?: string;
  overlay_text?: string;
}

export interface ShotPlan {
  duration_sec: number;
  music_energy: "chill" | "focus" | "upbeat" | "dramatic" | "none";
  segments: ShotSegment[];
  notes: string;
}

const SHOT_PLAN_TOOL: Anthropic.Tool = {
  name: "emit_shot_plan",
  description:
    "Emite el shot plan final: qué fuente (bruto/stock/motion graphics) aparece en cada segmento de tiempo del vídeo.",
  input_schema: {
    type: "object",
    required: ["duration_sec", "music_energy", "segments", "notes"],
    properties: {
      duration_sec: {
        type: "number",
        description: "Duración total del vídeo en segundos",
      },
      music_energy: {
        type: "string",
        enum: ["chill", "focus", "upbeat", "dramatic", "none"],
        description: "Energía de la música de fondo",
      },
      segments: {
        type: "array",
        items: {
          type: "object",
          required: ["start", "end", "source", "reason"],
          properties: {
            start: { type: "number", description: "Inicio en segundos" },
            end: { type: "number", description: "Fin en segundos" },
            source: {
              type: "string",
              enum: ["raw", "stock", "motion"],
              description:
                "raw = plano del presentador | stock = b-roll del catálogo (indica stock_filename exacto) | motion = animación motion graphics generada",
            },
            reason: {
              type: "string",
              description: "Por qué esta fuente en este momento",
            },
            stock_filenames: {
              type: "array",
              items: { type: "string" },
              description:
                "OBLIGATORIO si source=stock. Lista de 1 o MÁS nombres de archivo EXACTOS del catálogo (con extensión). Cada filename solo puede aparecer UNA VEZ en todo el plan — ni repetido dentro del mismo segmento ni en segmentos distintos. Si no quedan clips únicos con match relevante, deja el segmento como raw.",
            },
            motion_prompt: {
              type: "string",
              description:
                "Solo si source=motion. Descripción de la animación Canvas 2D que debería generar Claude Design",
            },
            overlay_text: {
              type: "string",
              description: "Opcional. Texto superpuesto al segmento (hook / destacado)",
            },
          },
        },
      },
      notes: {
        type: "string",
        description: "Notas generales: ritmo, transiciones, riesgos",
      },
    },
  },
};

export interface ShotPlanOptions {
  transcript: Transcript;
  stockCatalog: StockAsset[];
  videoDurationSec: number;
  apiKey: string;
  model: string;
}

export interface ShotPlanResult {
  plan: ShotPlan;
  inputsHash: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  } | null;
  fromCache: boolean;
}

/** Fingerprint of every input that affects the shot plan. Same fingerprint →
 *  same plan → safe to reuse. */
export function shotPlanInputsHash(opts: ShotPlanOptions): string {
  const segments = opts.transcript.segments.map((s) => [
    Number(s.start.toFixed(2)),
    Number(s.end.toFixed(2)),
    s.text,
  ]);
  const catalog = opts.stockCatalog
    .map((a) => ({ filename: a.filename, tags: [...a.tags].sort() }))
    .sort((a, b) => a.filename.localeCompare(b.filename));
  // Use dynamic import to avoid bundling node:crypto in edge paths
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { stableHash } = require("./hash") as typeof import("./hash");
  return stableHash({
    v: 2, // bump when prompt/schema changes
    model: opts.model,
    duration: Math.round(opts.videoDurationSec * 100) / 100,
    lang: opts.transcript.language,
    segments,
    catalog,
  });
}

export async function generateShotPlan(opts: ShotPlanOptions): Promise<ShotPlan> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  // Format stock catalog as a clear table so Claude copies filenames literally
  const stockSummary = opts.stockCatalog.length
    ? opts.stockCatalog
        .slice(0, 120)
        .map(
          (a, i) =>
            `  ${i + 1}. "${a.filename}"  [tags: ${a.tags.join(", ") || "ninguno"}]${
              a.duration_sec ? `  (${a.duration_sec.toFixed(1)}s)` : ""
            }`
        )
        .join("\n")
    : "  (biblioteca vacía — NO uses source=stock, solo raw y motion)";

  const transcriptText =
    opts.transcript.segments.length === 0
      ? "(transcripción vacía — el vídeo no tiene voz o no se detectó)"
      : opts.transcript.segments
          .map((s) => `[${s.start.toFixed(1)}–${s.end.toFixed(1)}] ${s.text}`)
          .join("\n");

  const hasStock = opts.stockCatalog.length > 0;

  const userPrompt = `DURACIÓN TOTAL: ${opts.videoDurationSec.toFixed(1)}s
IDIOMA: ${opts.transcript.language}

TRANSCRIPCIÓN CON TIMESTAMPS:
${transcriptText}

CATÁLOGO DE STOCK DISPONIBLE (copia el filename EXACTO si eliges uno):
${stockSummary}

INSTRUCCIONES:
- Divide la duración total en segmentos continuos (no overlaps, no gaps).
- Elige source="raw" cuando el presentador diga algo importante donde ver su cara aporte.
- ${hasStock
    ? `Elige source="stock" cuando en la transcripción se hable de un concepto que tenga match claro con filenames/tags del catálogo. OBLIGATORIO: rellena stock_filenames con 1 o MÁS nombres exactos. Cada clip se muestra máximo 4s.
  · REGLA FUNDAMENTAL: cada filename del catálogo solo puede aparecer UNA VEZ en todo el shot plan. No lo repitas dentro de un segmento ni lo uses en dos segmentos distintos. Si ya lo usaste, no lo vuelvas a poner.
  · Como el catálogo tiene ${opts.stockCatalog.length} clips y cada uno dura ≤ 4s en timeline, la cobertura MÁXIMA de stock en el vídeo es ${opts.stockCatalog.length * 4}s. Reparte con cabeza: reserva los mejores clips para los momentos donde más aportan.
  · Un segmento de 4s usa 1 clip. Un segmento de 20s usa 5 clips distintos. Si no tienes 5 clips relevantes distintos, acorta el segmento o déjalo raw.`
    : `NO uses source="stock" porque la biblioteca está vacía.`}
- Elige source="motion" cuando el presentador EXPLICA algo conceptual: flujos, comparaciones,
  números / cifras impactantes, diagramas, comandos/terminales, conceptos abstractos,
  procesos paso-a-paso, o cuando dice "mira", "te enseño", "así funciona X".
  OBJETIVO: que cada 30-60s haya AL MENOS un segmento motion de 8-20s sobre un concepto.
- Evita segmentos < 3s. Busca ritmo: cambia cada 5–12s.
- REPARTO OBJETIVO (crítico, se evaluará):
    · ~60% STOCK (b-roll de la biblioteca) — OCULTAR LA CARA DEL PRESENTADOR la mayor parte del tiempo
    · ~20-25% MOTION (animaciones generadas) — para los conceptos explicados
    · ~15-20% RAW — solo cuando la cara del presentador añade algo (introducciones,
      transiciones emocionales, reveal de conclusiones). Por defecto prioriza stock/motion.
  Si la biblioteca de stock es pequeña, compensa con más motion, no con más raw.
- Si no hay transcripción (vídeo silencioso): un único segmento raw.

Llama a emit_shot_plan con el resultado.`;

  const response = await client.messages.create({
    model: opts.model,
    max_tokens: 8192,
    system:
      "Eres editor de vídeo senior especializado en YouTube tech en español (nicho: programación, IA, productividad, trabajo). Planificas qué se ve en cada momento para maximizar ritmo y claridad. Siempre devuelves la respuesta llamando a la tool emit_shot_plan. Cuando uses source=stock, el campo stock_filename debe ser el nombre EXACTO de uno de los archivos del catálogo — nunca inventes nombres.",
    tools: [SHOT_PLAN_TOOL],
    tool_choice: { type: "tool", name: "emit_shot_plan" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`Claude no devolvió tool_use. stop_reason=${response.stop_reason}`);
  }
  const plan = toolUse.input as ShotPlan;

  // Defensive coercion for same issue as in generateShotPlanWithUsage
  if (typeof (plan as unknown as { segments: unknown }).segments === "string") {
    try {
      (plan as unknown as { segments: unknown }).segments = JSON.parse(
        (plan as unknown as { segments: string }).segments
      );
    } catch {
      throw new Error("Claude devolvió segments como string inválido de JSON");
    }
  }
  if (!Array.isArray(plan.segments)) {
    throw new Error(`Claude no devolvió un array de segments`);
  }

  // Validate stock_filenames + enforce global uniqueness (each catalog file ≤1 time).
  // Supports legacy `stock_filename` scalar field.
  const catalogNames = new Set(opts.stockCatalog.map((a) => a.filename));
  const globallyUsed = new Set<string>();
  for (const seg of plan.segments) {
    if (seg.source !== "stock") continue;
    const legacyField = (seg as unknown as { stock_filename?: string }).stock_filename;
    const raw: string[] = Array.isArray(seg.stock_filenames)
      ? seg.stock_filenames
      : legacyField
      ? [legacyField]
      : [];
    // Dedupe within segment, filter by catalog, filter by global uniqueness
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const name of raw) {
      if (!catalogNames.has(name)) continue;
      if (seen.has(name) || globallyUsed.has(name)) continue;
      seen.add(name);
      kept.push(name);
    }
    if (kept.length === 0) {
      seg.source = "raw";
      seg.reason = `${seg.reason} [stock_filenames inválidos o ya usados: ${raw.join(", ") || "vacío"} → degradado a raw]`;
      delete seg.stock_filenames;
    } else {
      seg.stock_filenames = kept;
      for (const name of kept) globallyUsed.add(name);
    }
  }

  return plan;
}

/**
 * Wrapper that returns the plan + raw usage + whether it came from cache.
 * Caller is responsible for recording usage via `recordApiCall` /
 * `recordCacheHit`. Keeping this split lets us run fully pure here.
 */
export async function generateShotPlanWithUsage(
  opts: ShotPlanOptions
): Promise<ShotPlanResult> {
  const client = new (await import("@anthropic-ai/sdk")).default({ apiKey: opts.apiKey });

  const inputsHash = shotPlanInputsHash(opts);

  // Re-run the full prompt builder (code below duplicates generateShotPlan so we
  // can capture the response object with `usage` — TypeScript refactor cost too high
  // otherwise).
  const stockSummary = opts.stockCatalog.length
    ? opts.stockCatalog
        .slice(0, 120)
        .map(
          (a, i) =>
            `  ${i + 1}. "${a.filename}"  [tags: ${a.tags.join(", ") || "ninguno"}]${
              a.duration_sec ? `  (${a.duration_sec.toFixed(1)}s)` : ""
            }`
        )
        .join("\n")
    : "  (biblioteca vacía — NO uses source=stock, solo raw y motion)";

  const transcriptText =
    opts.transcript.segments.length === 0
      ? "(transcripción vacía — el vídeo no tiene voz o no se detectó)"
      : opts.transcript.segments
          .map((s) => `[${s.start.toFixed(1)}–${s.end.toFixed(1)}] ${s.text}`)
          .join("\n");

  const hasStock = opts.stockCatalog.length > 0;

  const userPrompt = `DURACIÓN TOTAL: ${opts.videoDurationSec.toFixed(1)}s
IDIOMA: ${opts.transcript.language}

TRANSCRIPCIÓN CON TIMESTAMPS:
${transcriptText}

CATÁLOGO DE STOCK DISPONIBLE (copia el filename EXACTO si eliges uno):
${stockSummary}

INSTRUCCIONES:
- Divide la duración total en segmentos continuos (no overlaps, no gaps).
- Elige source="raw" cuando el presentador diga algo importante donde ver su cara aporte.
- ${hasStock
    ? `Elige source="stock" cuando en la transcripción se hable de un concepto que tenga match claro con filenames/tags del catálogo. OBLIGATORIO: rellena stock_filenames con 1 o MÁS nombres exactos. Cada clip se muestra máximo 4s.
  · REGLA FUNDAMENTAL: cada filename del catálogo solo puede aparecer UNA VEZ en todo el shot plan. No lo repitas dentro de un segmento ni lo uses en dos segmentos distintos. Si ya lo usaste, no lo vuelvas a poner.
  · Como el catálogo tiene ${opts.stockCatalog.length} clips y cada uno dura ≤ 4s en timeline, la cobertura MÁXIMA de stock en el vídeo es ${opts.stockCatalog.length * 4}s. Reparte con cabeza: reserva los mejores clips para los momentos donde más aportan.
  · Un segmento de 4s usa 1 clip. Un segmento de 20s usa 5 clips distintos. Si no tienes 5 clips relevantes distintos, acorta el segmento o déjalo raw.`
    : `NO uses source="stock" porque la biblioteca está vacía.`}
- Elige source="motion" cuando el presentador EXPLICA algo conceptual: flujos, comparaciones,
  números / cifras impactantes, diagramas, comandos/terminales, conceptos abstractos,
  procesos paso-a-paso, o cuando dice "mira", "te enseño", "así funciona X".
  OBJETIVO: que cada 30-60s haya AL MENOS un segmento motion de 8-20s sobre un concepto.
- Evita segmentos < 3s. Busca ritmo: cambia cada 5–12s.
- REPARTO OBJETIVO (crítico, se evaluará):
    · ~60% STOCK (b-roll de la biblioteca) — OCULTAR LA CARA DEL PRESENTADOR la mayor parte del tiempo
    · ~20-25% MOTION (animaciones generadas) — para los conceptos explicados
    · ~15-20% RAW — solo cuando la cara del presentador añade algo (introducciones,
      transiciones emocionales, reveal de conclusiones). Por defecto prioriza stock/motion.
  Si la biblioteca de stock es pequeña, compensa con más motion, no con más raw.
- Si no hay transcripción (vídeo silencioso): un único segmento raw.

Llama a emit_shot_plan con el resultado.`;

  const response = await client.messages.create({
    model: opts.model,
    max_tokens: 8192,
    system:
      "Eres editor de vídeo senior especializado en YouTube tech en español (nicho: programación, IA, productividad, trabajo). Planificas qué se ve en cada momento para maximizar ritmo y claridad. Siempre devuelves la respuesta llamando a la tool emit_shot_plan. Cuando uses source=stock, el campo stock_filenames debe contener nombres EXACTOS de archivos del catálogo — nunca inventes nombres.",
    tools: [SHOT_PLAN_TOOL],
    tool_choice: { type: "tool", name: "emit_shot_plan" },
    messages: [{ role: "user", content: userPrompt }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`Claude no devolvió tool_use. stop_reason=${response.stop_reason}`);
  }
  const plan = toolUse.input as ShotPlan;

  // Defensive: sometimes Claude returns `segments` as a JSON-stringified array
  // instead of a real array. Coerce if that happens.
  if (typeof (plan as unknown as { segments: unknown }).segments === "string") {
    try {
      (plan as unknown as { segments: unknown }).segments = JSON.parse(
        (plan as unknown as { segments: string }).segments
      );
    } catch {
      throw new Error("Claude devolvió segments como string inválido de JSON");
    }
  }
  if (!Array.isArray(plan.segments)) {
    throw new Error(`Claude no devolvió un array de segments (type: ${typeof plan.segments})`);
  }

  const catalogNames = new Set(opts.stockCatalog.map((a) => a.filename));
  const globallyUsed = new Set<string>();
  for (const seg of plan.segments) {
    if (seg.source !== "stock") continue;
    const legacyField = (seg as unknown as { stock_filename?: string }).stock_filename;
    const raw: string[] = Array.isArray(seg.stock_filenames)
      ? seg.stock_filenames
      : legacyField
      ? [legacyField]
      : [];
    const seen = new Set<string>();
    const kept: string[] = [];
    for (const name of raw) {
      if (!catalogNames.has(name)) continue;
      if (seen.has(name) || globallyUsed.has(name)) continue;
      seen.add(name);
      kept.push(name);
    }
    if (kept.length === 0) {
      seg.source = "raw";
      seg.reason = `${seg.reason} [stock_filenames inválidos o ya usados: ${raw.join(", ") || "vacío"} → degradado a raw]`;
      delete seg.stock_filenames;
    } else {
      seg.stock_filenames = kept;
      for (const name of kept) globallyUsed.add(name);
    }
  }

  return {
    plan,
    inputsHash,
    usage: {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      cache_read_input_tokens: response.usage?.cache_read_input_tokens ?? null,
      cache_creation_input_tokens: response.usage?.cache_creation_input_tokens ?? null,
    },
    fromCache: false,
  };
}

export function saveShotPlan(projectFolder: string, plan: ShotPlan, inputsHash?: string): string {
  const target = path.join(projectFolder, "shot-plan.json");
  const payload = inputsHash ? { ...plan, _inputs_hash: inputsHash } : plan;
  fs.writeFileSync(target, JSON.stringify(payload, null, 2));
  return target;
}

/** Load a previously-saved shot plan if its inputs hash matches. */
export function loadCachedShotPlan(
  projectFolder: string,
  expectedHash: string
): ShotPlan | null {
  const target = path.join(projectFolder, "shot-plan.json");
  if (!fs.existsSync(target)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(target, "utf8"));
    if (raw._inputs_hash !== expectedHash) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _inputs_hash, ...plan } = raw;
    return plan as ShotPlan;
  } catch {
    return null;
  }
}
