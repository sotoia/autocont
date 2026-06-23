/**
 * Genera "ideas meta" — propuestas de vídeo inferidas a partir del cluster
 * de ideas recientes. La IA mira las 20 últimas (qué se está hablando ahora
 * en IA / tech) y propone 5-8 conceptos de vídeo que podrían funcionar en
 * YouTube agrupando varias noticias relacionadas, identificando tendencias,
 * o sugiriendo formatos novedosos.
 *
 * Las propuestas se persisten como filas nuevas en `ideas` con
 * source_kind="ai-meta" para distinguirlas y mostrarlas con badge especial.
 */
import Anthropic from "@anthropic-ai/sdk";
import { repo } from "@/lib/db";
import { computeCostUsd } from "@/lib/pipeline/pricing";
import { randomUUID } from "node:crypto";

const MODEL = "claude-opus-4-7";

const PROPOSE_TOOL = {
  name: "emit_video_ideas",
  description: "Devuelve 5-8 propuestas de vídeo de YouTube en español inferidas desde el cluster de ideas recientes.",
  input_schema: {
    type: "object" as const,
    required: ["ideas"],
    properties: {
      ideas: {
        type: "array" as const,
        minItems: 5,
        maxItems: 10,
        items: {
          type: "object" as const,
          required: ["title", "angle", "rationale"],
          properties: {
            title: {
              type: "string" as const,
              description: "Título de YouTube (máx 80 chars). Estilo Nate Gentile / Adrián Sáenz: directo, primera persona si aplica, números si aportan, sin clickbait barato.",
            },
            angle: {
              type: "string" as const,
              description: "Ángulo / descripción 2-3 líneas: qué se cuenta, qué promesa al espectador, por qué ahora.",
            },
            rationale: {
              type: "string" as const,
              description: "Por qué esta propuesta funcionaría AHORA según las ideas/noticias adjuntas. Cita 2-3 fuentes concretas (creator/medio).",
            },
            timeliness: {
              type: "string" as const,
              enum: ["urgente", "esta-semana", "evergreen"],
              description: "urgente: hay que grabarlo en 1-2 días por relevancia. esta-semana: aprovechar la ola. evergreen: tema que aguanta.",
            },
          },
        },
      },
    },
  },
};

interface ProposedIdea {
  title: string;
  angle: string;
  rationale: string;
  timeliness?: "urgente" | "esta-semana" | "evergreen";
}

export async function proposeMetaIdeas(opts: {
  apiKey: string;
  recentLimit?: number;
}): Promise<{ inserted: number; cost: number; proposals: ProposedIdea[] }> {
  const limit = opts.recentLimit ?? 20;
  const recent = repo.listIdeas().slice(0, limit);

  if (recent.length === 0) {
    return { inserted: 0, cost: 0, proposals: [] };
  }

  // Limitamos a 15 ideas y campos cortos: tool_use con muchas ideas y descripciones
  // largas hacía que Claude se perdiera y devolviera array vacío. Menos contexto = más foco.
  const tight = recent.slice(0, 15);
  const context = tight
    .map((i, idx) => {
      const date = i.published_at ? new Date(i.published_at).toLocaleDateString("es-ES") : "?";
      const t = (i.generated_title ?? i.title ?? "").slice(0, 100);
      const d = (i.generated_description ?? i.description ?? "").slice(0, 150);
      return `${idx + 1}. [${i.source_name} · ${date}] ${t}\n   ${d}`;
    })
    .join("\n");

  const client = new Anthropic({ apiKey: opts.apiKey });

  // Volvemos a tool_use con max_tokens grande y prompt MUY explícito. El
  // prefill no es compatible con Opus 4.7. tool_use suele funcionar; el
  // problema antes era max_tokens insuficiente + falta de presión en prompt.
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 6144,
    system: `Eres un editor jefe de un canal de YouTube en español sobre tech, IA y desarrollo.

Tu trabajo: leer un puñado de noticias/vídeos recientes del sector y proponer EXACTAMENTE 5 ideas de vídeo concretas para el canal.

CRITERIOS de buena propuesta:
- Combina varias fuentes en una narrativa única (no es noticia plana).
- Ángulo único: opinión, comparativa, "yo probé X", proceso real.
- Timing oportuno (urgente/esta-semana/evergreen).
- Formato YouTube: hook claro, promesa de valor.

EVITA: propuestas genéricas, política, gaming, lifestyle.

REGLA INVIOLABLE: SIEMPRE devuelves 5 propuestas. Aunque el feed te parezca repetitivo, encuentras 5 ángulos distintos. Si vieras todo lo mismo, propones perspectivas alternativas (análisis, comparativa, predicción, retrospectiva, tutorial inspirado).

Cada propuesta:
- title: máx 80 chars
- angle: 1-2 frases
- rationale: 1 frase citando fuentes concretas
- timeliness: "urgente" | "esta-semana" | "evergreen"`,
    tools: [PROPOSE_TOOL],
    tool_choice: { type: "tool", name: "emit_video_ideas" },
    messages: [
      {
        role: "user",
        content: `Feed reciente (15 ideas):

==========
${context}
==========

Llama a emit_video_ideas con 5 propuestas. Recuerda: NUNCA array vacío.`,
      },
    ],
  });

  // Trackear coste
  const usage = {
    input_tokens: response.usage?.input_tokens ?? 0,
    output_tokens: response.usage?.output_tokens ?? 0,
    cache_read_tokens: response.usage?.cache_read_input_tokens ?? 0,
    cache_creation_tokens: response.usage?.cache_creation_input_tokens ?? 0,
  };
  const cost = computeCostUsd(MODEL, usage);
  repo.recordUsage({
    project_id: null,
    stage: "ideas-propose-meta",
    model: MODEL,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_tokens,
    cache_creation_tokens: usage.cache_creation_tokens,
    cost_usd: cost,
    inputs_hash: null,
    cache_hit: 0,
    meta: null,
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`Claude no devolvió tool_use. stop_reason=${response.stop_reason}`);
  }
  const proposals: ProposedIdea[] = (toolUse.input as { ideas?: ProposedIdea[] }).ideas ?? [];

  if (proposals.length === 0) {
    throw new Error(`Claude devolvió ideas: [] (stop_reason=${response.stop_reason}, output_tokens=${response.usage?.output_tokens}). Esto suele ser un fallo del modelo, reintenta — si sigue, sube max_tokens o reduce el contexto.`);
  }

  // `ideas.source_id` tiene FK a `idea_sources(id)`, así que necesitamos
  // garantizar que la fuente virtual "ai-meta" existe antes de insertar.
  repo.upsertIdeaSource({
    id: "ai-meta",
    kind: "ai-meta",
    name: "Propuesta IA",
    url: "internal://ai-meta",
    language: "es",
    enabled: 1,
  });

  // Persistimos como filas nuevas en `ideas` con marcador ai-meta.
  // El feed se ordena `pinned DESC, order_index ASC, created_at DESC` —
  // si usáramos max+1 las propuestas quedarían enterradas al final del scroll
  // (el usuario no las vería). En su lugar las metemos con order_index
  // negativo en orden creciente, para que aparezcan ARRIBA del todo.
  const minOrder = repo.minIdeaOrderIndex();
  let baseOrder = Math.min(0, minOrder) - proposals.length;
  let inserted = 0;
  const now = new Date().toISOString();
  const sessionId = randomUUID().slice(0, 8);

  for (let idx = 0; idx < proposals.length; idx++) {
    const p = proposals[idx];
    // Sufijo del idx del loop, no de `inserted` (que solo avanza al insertar
    // y podría dejar URLs duplicadas si una falla).
    const internalUrl = `internal://ai-meta/${sessionId}/${idx}`;
    if (repo.hasIdeaForUrl(internalUrl)) continue;
    try {
      repo.createIdea({
        source_id: "ai-meta",
        source_name: "Propuesta IA",
        source_kind: "ai-meta",
        source_url: internalUrl,
        title: p.title,
        description: p.angle,
        thumbnail_url: null,
        raw_content: p.rationale + (p.timeliness ? `\n\n[timeliness: ${p.timeliness}]` : ""),
        generated_title: p.title,
        generated_description: p.angle,
        generated_script: `**Por qué ahora**: ${p.rationale}${p.timeliness ? `\n\n**Timing**: ${p.timeliness}` : ""}`,
        language: "es",
        pinned: 0,
        featured: p.timeliness === "urgente" ? 1 : 0,
        dismissed: 0,
        order_index: baseOrder++,
        published_at: now,
        engagement: null,
      });
      inserted++;
    } catch (err) {
      console.warn("[propose-meta] insert error:", (err as Error).message);
    }
  }

  return { inserted, cost, proposals };
}
