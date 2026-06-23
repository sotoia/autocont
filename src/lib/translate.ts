/**
 * Traductor EN→ES en lote para títulos + descripciones de noticias e ideas.
 *
 * - Modelo: Claude Haiku 4.5 (barato, suficiente para frases cortas).
 * - Tool use forzado: garantiza JSON estructurado, evita prosa.
 * - Batch de N items por call → ~1 llamada por poll completo.
 *
 * Diseñado para idempotencia: si un item ya parece español, lo dejamos pasar
 * sin gastar tokens.
 */
import Anthropic from "@anthropic-ai/sdk";
import { computeCostUsd } from "@/lib/pipeline/pricing";
import { repo } from "@/lib/db";

const MODEL = "claude-haiku-4-5-20251001";

const TRANSLATE_TOOL = {
  name: "emit_translations",
  description: "Devuelve cada item traducido a español natural.",
  input_schema: {
    type: "object" as const,
    required: ["items"],
    properties: {
      items: {
        type: "array" as const,
        items: {
          type: "object" as const,
          required: ["id", "title_es", "description_es"],
          properties: {
            id: { type: "string" as const },
            title_es: {
              type: "string" as const,
              description: "Título en español natural (España neutro). Conserva nombres propios y siglas. Máx 140 chars.",
            },
            description_es: {
              type: "string" as const,
              description: "Descripción en español. Conserva tono y datos. Cadena vacía si la descripción original está vacía. Máx 700 chars.",
            },
          },
        },
      },
    },
  },
};

export interface TranslateInput {
  id: string;
  title: string;
  description?: string | null;
}
export interface TranslatedItem {
  id: string;
  title_es: string;
  description_es: string;
}

const ES_HINTS = [
  " qué ", " cómo ", " para ", " del ", " que ", " está ", " es ", " porque ",
  " cuál ", " mejor ", " probé ", " así ", " esto ", " puedes ", " hacer ",
  " años ", " mejores ", " hola ", " esta ", " este ", " cuando ", " donde ",
  " una ", " uno ", " sus ", " mucho ", " menos ", " todo ", " nuevo ", " hoy ",
];

/** Heurística: si tiene tildes/eñes o ≥2 conectores españoles, asumimos ya está
 *  en español y nos saltamos la traducción. */
export function looksSpanish(text: string): boolean {
  const lower = " " + text.toLowerCase() + " ";
  if (/[áéíóúñ¿¡]/.test(lower)) return true;
  let hits = 0;
  for (const t of ES_HINTS) if (lower.includes(t)) hits++;
  return hits >= 2;
}

/** Trocea un array en chunks. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const BATCH_SIZE = 10;

export async function translateBatch(opts: {
  apiKey: string;
  items: TranslateInput[];
  domainHint?: string;
}): Promise<{ items: TranslatedItem[]; cost: number }> {
  if (opts.items.length === 0) return { items: [], cost: 0 };

  const client = new Anthropic({ apiKey: opts.apiKey });
  const allOut: TranslatedItem[] = [];
  let totalCost = 0;

  for (const batch of chunk(opts.items, BATCH_SIZE)) {
    const payload = batch.map((it) => ({
      id: it.id,
      title: (it.title ?? "").slice(0, 250),
      description: (it.description ?? "").slice(0, 900),
    }));

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: `Eres un traductor profesional EN→ES para un canal de YouTube en español sobre ${opts.domainHint ?? "tech / IA"}.

REGLAS:
- Traduce a español natural y directo (España, neutro, sin formalismos).
- Mantén nombres propios, productos y siglas tal cual (OpenAI, Claude, GPT-5, GitHub Copilot, RAG, LLM, agente, agentic…).
- Mantén números, fechas y métricas EXACTAS.
- Si el item YA parece español, devuélvelo casi igual (corrige solo si hay errores claros).
- NO inventes contenido. Si description original está vacía o es null, devuelve "".
- NO añadas frases de marketing.
- NO traduzcas literalmente: prefiere construcciones naturales en español.

Devuelve SIEMPRE TODOS los items recibidos llamando a emit_translations.`,
      tools: [TRANSLATE_TOOL],
      tool_choice: { type: "tool", name: "emit_translations" },
      messages: [
        {
          role: "user",
          content: `Traduce estos ${payload.length} items al español:\n\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    });

    const usage = {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      cache_read_tokens: response.usage?.cache_read_input_tokens ?? 0,
      cache_creation_tokens: response.usage?.cache_creation_input_tokens ?? 0,
    };
    const cost = computeCostUsd(MODEL, usage);
    totalCost += cost;
    repo.recordUsage({
      project_id: null,
      stage: "translate",
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
      throw new Error(`translate: sin tool_use (stop=${response.stop_reason})`);
    }
    const out = (toolUse.input as { items?: TranslatedItem[] }).items ?? [];
    allOut.push(...out);
  }

  return { items: allOut, cost: totalCost };
}

export interface TranslatePendingSummary {
  scanned: number;
  alreadySpanish: number;   // marcados translated=2 sin gastar tokens
  translated: number;       // marcados translated=1 vía Claude
  failed: number;
  cost: number;
}

/** Procesa todos los items pendientes de una tabla (news o ideas):
 *   - heurística: si looksSpanish() → marcar translated=2 directo.
 *   - resto → batch a Claude Haiku, sobreescribir y marcar translated=1.
 */
export async function translatePending(opts: {
  apiKey: string;
  kind: "news" | "ideas";
  domainHint?: string;
  limit?: number;
}): Promise<TranslatePendingSummary> {
  const limit = opts.limit ?? 200;
  const summary: TranslatePendingSummary = {
    scanned: 0,
    alreadySpanish: 0,
    translated: 0,
    failed: 0,
    cost: 0,
  };

  const list = opts.kind === "news"
    ? repo.listUntranslatedNews(limit)
    : repo.listUntranslatedIdeas(limit);

  summary.scanned = list.length;
  if (list.length === 0) return summary;

  const apply = opts.kind === "news"
    ? (id: string, t: string, d: string | null, s: 1 | 2) => repo.applyNewsTranslation(id, t, d, s)
    : (id: string, t: string, d: string | null, s: 1 | 2) => repo.applyIdeaTranslation(id, t, d, s);

  // Heurística: marcar como "ya en español" sin gastar tokens.
  const needsTranslation: TranslateInput[] = [];
  for (const it of list) {
    const combined = `${it.title} ${it.description ?? ""}`;
    if (looksSpanish(combined)) {
      apply(it.id, it.title, it.description, 2);
      summary.alreadySpanish++;
    } else {
      needsTranslation.push({ id: it.id, title: it.title, description: it.description });
    }
  }

  if (needsTranslation.length === 0) return summary;

  // Pasada batch
  try {
    const { items, cost } = await translateBatch({
      apiKey: opts.apiKey,
      items: needsTranslation,
      domainHint: opts.domainHint,
    });
    summary.cost += cost;
    const byId = new Map(items.map((t) => [t.id.trim(), t]));
    const stillMissing: TranslateInput[] = [];
    for (const it of needsTranslation) {
      const t = byId.get(it.id.trim());
      if (!t) { stillMissing.push(it); continue; }
      const desc = (t.description_es ?? "").trim() || null;
      apply(it.id, t.title_es, desc, 1);
      summary.translated++;
    }

    // Fallback: items que el batch dejó fuera → reintento uno a uno con
    // batch_size=1 (Haiku suele acertar siempre con un solo item).
    if (stillMissing.length > 0) {
      console.warn(`[translate ${opts.kind}] ${stillMissing.length} items sin match en batch, reintentando uno a uno`);
      for (const miss of stillMissing) {
        try {
          const single = await translateBatch({
            apiKey: opts.apiKey,
            items: [miss],
            domainHint: opts.domainHint,
          });
          summary.cost += single.cost;
          const t = single.items.find((x) => x.id.trim() === miss.id.trim()) ?? single.items[0];
          if (!t) { summary.failed++; continue; }
          const desc = (t.description_es ?? "").trim() || null;
          apply(miss.id, t.title_es, desc, 1);
          summary.translated++;
        } catch (err) {
          console.warn(`[translate ${opts.kind}] retry single failed for ${miss.id}: ${(err as Error).message}`);
          summary.failed++;
        }
      }
    }
  } catch (err) {
    summary.failed = needsTranslation.length;
    throw new Error(`translatePending(${opts.kind}): ${(err as Error).message}`);
  }

  return summary;
}

