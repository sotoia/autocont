/**
 * Reescribe un item (artículo o vídeo) como idea de vídeo en español.
 * Devuelve título atractivo, descripción 2-3 líneas y guion resumido.
 */
import Anthropic from "@anthropic-ai/sdk";
import { computeCostUsd } from "@/lib/pipeline/pricing";
import { repo } from "@/lib/db";

const MODEL = "claude-haiku-4-5-20251001";

const IDEA_TOOL = {
  name: "emit_idea",
  description: "Devuelve un título atractivo, descripción y guion resumido para un vídeo de YouTube en español.",
  input_schema: {
    type: "object" as const,
    required: ["titulo", "descripcion", "guion"],
    properties: {
      titulo: {
        type: "string" as const,
        description: "Título de vídeo en español, atractivo, máximo 80 caracteres. Sin clickbait barato.",
      },
      descripcion: {
        type: "string" as const,
        description: "Descripción de 2-3 líneas (máx 280 chars) explicando el ángulo del vídeo en español.",
      },
      guion: {
        type: "string" as const,
        description: "Guion resumido en formato markdown con 4-6 viñetas: gancho de apertura, 2-3 puntos centrales y cierre / call-to-action.",
      },
    },
  },
};

export interface GeneratedIdea {
  titulo: string;
  descripcion: string;
  guion: string;
  cost_usd: number;
}

export async function generateIdea(input: {
  sourceTitle: string;
  sourceDescription: string | null;
  rawContent: string | null;
  language: "es" | "en";
  apiKey: string;
}): Promise<GeneratedIdea> {
  const client = new Anthropic({ apiKey: input.apiKey });

  const context = [
    `Título original: ${input.sourceTitle}`,
    input.sourceDescription ? `Descripción: ${input.sourceDescription}` : null,
    input.rawContent ? `Contenido completo:\n${input.rawContent.slice(0, 8000)}` : null,
  ].filter(Boolean).join("\n\n");

  const langNote = input.language === "en"
    ? "El contenido fuente está en inglés. TRADUCE y reformula a español."
    : "El contenido fuente está en español.";

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `Eres un guionista de un canal de YouTube en español sobre IA, tecnología y negocio. Te paso noticias o transcripciones de otros vídeos y conviertes cada item en una propuesta concreta de vídeo. Tu trabajo: extraer el ángulo más interesante para mi audiencia (gente curiosa por IA y tech), proponer un título que enganche sin ser clickbait, y bosquejar el guion. ${langNote}`,
    tools: [IDEA_TOOL],
    tool_choice: { type: "tool", name: "emit_idea" },
    messages: [{ role: "user", content: context }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(`Claude no devolvió tool_use. stop_reason=${response.stop_reason}`);
  }
  const payload = toolUse.input as { titulo: string; descripcion: string; guion: string };

  const usage = {
    input_tokens: response.usage?.input_tokens ?? 0,
    output_tokens: response.usage?.output_tokens ?? 0,
    cache_read_tokens: response.usage?.cache_read_input_tokens ?? 0,
    cache_creation_tokens: response.usage?.cache_creation_input_tokens ?? 0,
  };
  const cost = computeCostUsd(MODEL, usage);

  // Track cost in api_usage so the dashboard reflects the spend
  repo.recordUsage({
    project_id: null,
    stage: "ideas-generate",
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

  return {
    titulo: payload.titulo.trim(),
    descripcion: payload.descripcion.trim(),
    guion: payload.guion.trim(),
    cost_usd: cost,
  };
}
