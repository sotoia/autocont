/**
 * Generadores IA para Creaciones: títulos, descripción, cowriter de guion.
 *
 * Todas las llamadas usan el mismo bloque de referencia ("biblia") como
 * primer turno cacheado (5 min TTL) — esto reduce el coste 10× cuando el
 * usuario hace varias llamadas seguidas en el editor.
 *
 * Modelo: Opus 4.7 para todas. Las sugerencias de calidad son críticas
 * (es la diferencia entre títulos virales y mediocres) y el cowriter
 * necesita matiz narrativo.
 */
import Anthropic from "@anthropic-ai/sdk";
import { computeCostUsd } from "@/lib/pipeline/pricing";
import { repo } from "@/lib/db";
import type { CreationKind } from "./types";
import { CREATION_KIND_DESCRIPTIONS, CREATION_DURATIONS } from "./types";
import { buildReferenceBlock } from "./reference-context";

const MODEL = "claude-opus-4-7";

interface UsageMeta {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

function trackUsage(stage: string, response: Anthropic.Message): number {
  const usage: UsageMeta = {
    input_tokens: response.usage?.input_tokens ?? 0,
    output_tokens: response.usage?.output_tokens ?? 0,
    cache_read_tokens: response.usage?.cache_read_input_tokens ?? 0,
    cache_creation_tokens: response.usage?.cache_creation_input_tokens ?? 0,
  };
  const cost = computeCostUsd(MODEL, usage);
  repo.recordUsage({
    project_id: null,
    stage,
    model: MODEL,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_tokens,
    cache_creation_tokens: usage.cache_creation_tokens,
    cost_usd: cost,
    inputs_hash: null,
    cache_hit: usage.cache_read_tokens > 0 ? 1 : 0,
    meta: null,
  });
  return cost;
}

/** Mensaje con bloque de referencia + cache_control. El segundo bloque (sin
 *  cache_control) se ajusta por turno para que el cache hit tenga match. */
function refMessage(): Anthropic.Messages.MessageParam {
  return {
    role: "user",
    content: [
      {
        type: "text",
        text: buildReferenceBlock(),
        cache_control: { type: "ephemeral" },
      },
    ],
  };
}

/** Mensaje con respuesta esperada del assistant (para que el segundo turno user pueda continuar). */
function ackMessage(): Anthropic.Messages.MessageParam {
  return { role: "assistant", content: "Entendido. Tengo contexto de los 4 vídeos referencia. ¿Qué necesitas?" };
}

// ─── 1. Sugerir títulos ───────────────────────────────────────────────

const TITLES_TOOL = {
  name: "emit_titles",
  description: "Devuelve 5 títulos sugeridos para el vídeo de YouTube en español, ordenados de más a menos viral.",
  input_schema: {
    type: "object" as const,
    required: ["titles"],
    properties: {
      titles: {
        type: "array" as const,
        items: { type: "string" as const },
        minItems: 5,
        maxItems: 5,
      },
    },
  },
};

export async function suggestTitles(input: {
  kind: CreationKind;
  currentTitle: string;
  description: string;
  scriptExcerpt: string;
  apiKey: string;
}): Promise<{ titles: string[]; cost: number }> {
  const client = new Anthropic({ apiKey: input.apiKey });
  const dur = CREATION_DURATIONS[input.kind];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system:
      "Eres un editor de YouTube en español especializado en tech, IA y desarrollo. Generas títulos que enganchan SIN ser clickbait barato. Estudias los referentes que el usuario adjunta (Nate Gentile, Adrián Sáenz, JuanPe Navarro, Alejavi Rivera) y replicas su estilo: titulares directos, primera persona cuando aplica, números cuando aporten, promesa clara. Evita emojis, MAYÚSCULAS gritonas y signos exclamativos. Máximo 80 caracteres por título.",
    tools: [TITLES_TOOL],
    tool_choice: { type: "tool", name: "emit_titles" },
    messages: [
      refMessage(),
      ackMessage(),
      {
        role: "user",
        content: `Tipo de vídeo: **${input.kind}** — ${CREATION_KIND_DESCRIPTIONS[input.kind]}
Duración objetivo: ${dur.label}.

Título actual / borrador: "${input.currentTitle || "(vacío)"}"

Descripción / ángulo:
${input.description || "(no rellenado todavía)"}

Inicio del guion (si lo hay):
${input.scriptExcerpt.slice(0, 2000) || "(guion vacío)"}

Genera 5 títulos en español al estilo de los referentes.`,
      },
    ],
  });

  const cost = trackUsage("creation-titles", response);
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude no devolvió tool_use");
  const titles = (toolUse.input as { titles: string[] }).titles ?? [];
  return { titles, cost };
}

// ─── 2. Sugerir descripción ───────────────────────────────────────────

const DESC_TOOL = {
  name: "emit_description",
  description: "Devuelve la descripción del vídeo de YouTube en español, lista para pegar.",
  input_schema: {
    type: "object" as const,
    required: ["description"],
    properties: {
      description: {
        type: "string" as const,
        description: "Descripción de YouTube: 2-4 párrafos, opcional sección con timestamps, cierre con CTA.",
      },
    },
  },
};

export async function suggestDescription(input: {
  kind: CreationKind;
  title: string;
  scriptExcerpt: string;
  apiKey: string;
}): Promise<{ description: string; cost: number }> {
  const client = new Anthropic({ apiKey: input.apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      "Eres un editor de YouTube en español. Escribes descripciones del vídeo que enganchan en los primeros 150 caracteres (lo que se ve antes de 'mostrar más') y cierran con CTA claro (suscribirse, comentar). Replicas el estilo de los referentes que el usuario adjuntó.",
    tools: [DESC_TOOL],
    tool_choice: { type: "tool", name: "emit_description" },
    messages: [
      refMessage(),
      ackMessage(),
      {
        role: "user",
        content: `Tipo: **${input.kind}** — ${CREATION_KIND_DESCRIPTIONS[input.kind]}

Título: "${input.title}"

Inicio del guion:
${input.scriptExcerpt.slice(0, 3000) || "(vacío)"}

Genera la descripción del vídeo lista para pegar en YouTube.`,
      },
    ],
  });

  const cost = trackUsage("creation-description", response);
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude no devolvió tool_use");
  const description = (toolUse.input as { description: string }).description ?? "";
  return { description, cost };
}

// ─── 3. Borrador completo del guion ───────────────────────────────────

const DRAFT_TOOL = {
  name: "emit_full_script",
  description: "Genera un guion completo de YouTube en español en convención AUTOCONT (PARTES con emoji + BLOQUES + secciones numeradas con frase ancla + marcas de producción). Listo para renderizar visualmente en el dashboard.",
  input_schema: {
    type: "object" as const,
    required: ["script"],
    properties: {
      script: {
        type: "string" as const,
        description: `Guion completo en CONVENCIÓN AUTOCONT (formato visual del dashboard). NO Markdown. NO prosa plana. Estructura OBLIGATORIA:

🟣 PARTE 1 — HOOK
==========================================================================

────────────────────────────────────────────
BLOQUE: <título corto del bloque>
────────────────────────────────────────────

1. [Frase ancla en corchetes — resumen de la sección de una línea]
Texto del guion, en párrafos cortos, primera persona, voz conversacional.
Las marcas de producción van DESPUÉS del texto, cada una en su propia línea.
[CÁMARA]
[STOCK: descripción del clip de stock]
[MOTION: idea del motion graphic]
[TEXTO EN PANTALLA: "frase clave del rótulo"]

2. [Siguiente frase ancla]
Texto…
[PANTALLA: descripción de la pantalla a grabar]
[ZOOM]

🟢 PARTE 2 — ASUNTO
==========================================================================

────────────────────────────────────────────
BLOQUE: <título del bloque>
────────────────────────────────────────────

5. [Frase ancla]
Texto…
[CÁMARA]
[B-ROLL: descripción del plano de apoyo]

(varios bloques dentro de PARTE 2, secciones numeradas correlativas sin reiniciar)

🔴 PARTE 3 — CIERRE / CTA
==========================================================================

────────────────────────────────────────────
BLOQUE: Cierre + CTA
────────────────────────────────────────────

N. [Frase ancla del cierre]
Texto del CTA / cierre del vídeo…
[CÁMARA]
[TEXTO EN PANTALLA: "comenta X"]
[CORTE A NEGRO]

REGLAS DE FORMATO ESTRICTAS:
- Cabecera de PARTE: emoji + " PARTE N — TÍTULO" en línea propia, seguida de "=" repetidos. Emojis válidos: 🟣 HOOK, 🟢 ASUNTO, 🔴 CTA/CIERRE.
- Cabecera de BLOQUE: "BLOQUE: <nombre>" rodeado por "─" repetidos.
- Cada sección empieza por "N. [Frase ancla]" en línea propia, donde N es número correlativo a TODO el guion (no reinicia por bloque).
- Texto del guion en párrafos. Una línea en blanco = nuevo párrafo.
- Marcas en líneas propias, entre corchetes. Vocabulario válido (úsalo siempre): CÁMARA, PANTALLA, SPLIT, STOCK, MOTION, TEXTO EN PANTALLA, B-ROLL, ZOOM, CORTE. Para STOCK / MOTION / TEXTO EN PANTALLA / B-ROLL / PANTALLA usa formato "[TIPO: descripción]". Para CÁMARA / SPLIT / ZOOM / CORTE no hace falta detalle.
- Tono: primera persona, conversacional, ritmo variado.
- NO uses Markdown: nada de "##", "**", "*", "- ", "> ".
- Mínimo 3 partes (🟣 HOOK, 🟢 ASUNTO, 🔴 CIERRE). HOOK 1 bloque, ASUNTO 3-6 bloques, CIERRE 1 bloque.`,
      },
      structure_summary: {
        type: "string" as const,
        description: "Resumen breve (3-5 líneas) de la estructura elegida y por qué encaja con el estilo de los referentes.",
      },
    },
  },
};

export async function draftFullScript(input: {
  kind: CreationKind;
  title: string;
  description: string;
  notes: string;
  apiKey: string;
}): Promise<{ script: string; structure_summary: string; cost: number }> {
  const client = new Anthropic({ apiKey: input.apiKey });
  const dur = CREATION_DURATIONS[input.kind];
  // Palabras objetivo según duración (150 wpm)
  const targetMinutes = Math.round((dur.minMin + dur.maxMin) / 2);
  const targetWords = targetMinutes * 150;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16384,
    system: `Eres co-guionista de un canal de YouTube en español sobre tech, IA y desarrollo. Has estudiado los 4 vídeos referencia adjuntos (Nate Gentile, Adrián Sáenz, JuanPe Navarro, Alejavi Rivera) y vas a generar una BASE COMPLETA de guion replicando su estilo narrativo.

FORMATO DE SALIDA — CONVENCIÓN AUTOCONT OBLIGATORIA (NO Markdown):

El guion se renderiza visualmente en el dashboard parseando esta convención:
1. Cabeceras de PARTE con emoji: "🟣 PARTE 1 — HOOK", "🟢 PARTE 2 — ASUNTO", "🔴 PARTE 3 — CIERRE" o "🔴 PARTE 3 — CTA". Después de la línea de PARTE pon una fila de "=" (40+ caracteres) para separar visualmente.
2. Cabeceras de BLOQUE: "BLOQUE: <nombre corto>", rodeada arriba y abajo por una fila de "─" (40+ caracteres).
3. Secciones numeradas correlativas a TODO el guion (no se reinicia por bloque): "N. [Frase ancla resumen en corchetes]" en línea propia.
4. Después del numerado, el texto del guion en párrafos cortos. Línea en blanco entre párrafos.
5. Marcas de producción en líneas propias, entre corchetes. Vocabulario válido: CÁMARA, PANTALLA, SPLIT, STOCK, MOTION, TEXTO EN PANTALLA, B-ROLL, ZOOM, CORTE. Con detalle usar formato "[TIPO: descripción]" (ej. "[STOCK: persona frustrada delante de cámara]"). Sin detalle: "[CÁMARA]", "[ZOOM]", "[CORTE]".

EJEMPLO MÍNIMO REAL:

🟣 PARTE 1 — HOOK
==========================================================================

────────────────────────────────────────────
BLOQUE: El gancho
────────────────────────────────────────────

1. [Frase ancla — una línea que resume la sección]
Aquí va el primer párrafo del guion, voz primera persona, conversacional.

Aquí va un segundo párrafo si hace falta separar ideas.
[CÁMARA]
[STOCK: imagen de apoyo concreta]
[TEXTO EN PANTALLA: "frase del rótulo"]

2. [Siguiente frase ancla]
Texto de la sección 2…
[PANTALLA: descripción de lo que se ve en pantalla]
[ZOOM]

ESTRUCTURA OBLIGATORIA:
- 🟣 PARTE 1 — HOOK: 1 bloque, 3-5 secciones. Apertura directa, promesa clara, transición fluida.
- 🟢 PARTE 2 — ASUNTO: 3-6 bloques, cada bloque 2-5 secciones. Núcleo del vídeo. Cada bloque con micro-hook, desarrollo y bisagra al siguiente.
- 🔴 PARTE 3 — CIERRE / CTA: 1 bloque, 2-3 secciones. Recap + CTA con gancho memorable.

REGLAS ESTRICTAS:
- NO uses Markdown. Nada de "##", "**", "*", "- ", "> ".
- NO emojis fuera de las cabeceras de PARTE.
- Primera persona singular. Conversacional. Empieza con el hook directo, sin "Hola amigos".
- Ritmo variado: frase corta + frase larga. Preguntas retóricas.
- Las frases ancla entre corchetes deben ser memorables y resumir la sección de un vistazo.

LONGITUD OBJETIVO: ${targetWords} palabras (~${targetMinutes} min a 150 wpm). Tipo: ${input.kind} (${dur.label}).

DEVUELVES UN GUION REAL EN CONVENCIÓN AUTOCONT, NO UN OUTLINE. Es la base de la que el usuario partirá para editar.`,
    tools: [DRAFT_TOOL],
    tool_choice: { type: "tool", name: "emit_full_script" },
    messages: [
      refMessage(),
      ackMessage(),
      {
        role: "user",
        content: `TEMA DEL VÍDEO

Título: "${input.title || "(sin definir, infiérelo del resto)"}"

Descripción / ángulo:
${input.description || "(sin descripción)"}

${input.notes ? `Notas del autor:\n${input.notes}` : ""}

Genera el guion completo siguiendo la estructura del system prompt. ${targetWords} palabras aprox.`,
      },
    ],
  });

  const cost = trackUsage("creation-draft-full", response);
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude no devolvió tool_use");
  const out = toolUse.input as { script?: string; structure_summary?: string };
  const script = (out.script ?? "").trim();
  if (script.length < 400) {
    throw new Error(
      `Guion vacío o demasiado corto (${script.length} chars, stop_reason=${response.stop_reason}). ` +
      `Probable truncado de tokens; sube max_tokens o reintenta.`,
    );
  }
  return {
    script,
    structure_summary: out.structure_summary ?? "",
    cost,
  };
}

// ─── 4. Auto-generación COMPLETA desde idea ───────────────────────────

const AUTOGEN_TOOL = {
  name: "emit_full_creation",
  description: "Genera título óptimo + descripción YouTube + guion completo de YouTube en español, todo coherente y listo para publicar tras edición.",
  input_schema: {
    type: "object" as const,
    required: ["title", "description", "script"],
    properties: {
      title: {
        type: "string" as const,
        description: "Título de YouTube en español, atractivo, máx 80 chars. Sin clickbait barato. Estilo Nate/Adrián/JuanPe/Alejavi.",
      },
      description: {
        type: "string" as const,
        description: "Descripción YouTube: 2-4 párrafos, engancha en los primeros 150 chars, cierre con CTA. Sin emojis.",
      },
      script: {
        type: "string" as const,
        description: `Guion completo en CONVENCIÓN AUTOCONT (NO Markdown). Estructura: "🟣 PARTE 1 — HOOK" / "🟢 PARTE 2 — ASUNTO" / "🔴 PARTE 3 — CIERRE", cada PARTE seguida por "=" repetidos. Dentro: "BLOQUE: <nombre>" rodeado por "─" repetidos. Dentro: secciones "N. [Frase ancla]" numeradas correlativas a todo el guion. Texto en párrafos. Marcas de producción en líneas propias: [CÁMARA], [PANTALLA: …], [SPLIT], [STOCK: …], [MOTION: …], [TEXTO EN PANTALLA: "…"], [B-ROLL: …], [ZOOM], [CORTE]. Primera persona, conversacional. NO uses "##", "**", "- ", "> ". Longitud según system prompt.`,
      },
    },
  },
};

export async function autoGenerateAll(input: {
  kind: CreationKind;
  idea: string;
  initialTitle?: string;
  apiKey: string;
}): Promise<{ title: string; description: string; script: string; cost: number }> {
  const client = new Anthropic({ apiKey: input.apiKey });
  const dur = CREATION_DURATIONS[input.kind];
  const targetMinutes = Math.round((dur.minMin + dur.maxMin) / 2);
  const targetWords = targetMinutes * 150;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16384,
    system: `Eres co-guionista y editor de YouTube en español sobre tech, IA y desarrollo. Has estudiado los 4 vídeos referencia (Nate Gentile, Adrián Sáenz, JuanPe Navarro, Alejavi Rivera) y vas a generar TÍTULO + DESCRIPCIÓN + GUION COMPLETO a partir de una idea cruda del usuario.

PRINCIPIO: el output debe ser tan bueno que el usuario solo tenga que pulir, no rehacer.

TÍTULO:
- Estilo de los referentes: directo, primera persona cuando aplica, números si aportan, promesa clara.
- Sin emojis, sin MAYÚSCULAS gritonas, máx 80 caracteres.

DESCRIPCIÓN:
- Engancha en los primeros 150 chars (lo que se ve antes de "mostrar más").
- 2-4 párrafos, cierre con CTA (suscribirse / comentar).
- Sin emojis, sin "Hola amigos".

GUION — CONVENCIÓN AUTOCONT OBLIGATORIA (NO Markdown):

El guion se renderiza visualmente en el dashboard parseando esta convención exacta:

🟣 PARTE 1 — HOOK
==========================================================================

────────────────────────────────────────────
BLOQUE: <nombre corto del bloque>
────────────────────────────────────────────

1. [Frase ancla — resumen de la sección en corchetes, una línea]
Texto del guion en párrafos cortos. Voz primera persona, conversacional.

Línea en blanco entre párrafos para que se respiren.
[CÁMARA]
[STOCK: descripción concreta del clip de stock]
[MOTION: idea del motion graphic]
[TEXTO EN PANTALLA: "frase clave del rótulo"]

2. [Siguiente frase ancla]
Texto…
[PANTALLA: descripción de lo que se ve en pantalla]
[ZOOM]

🟢 PARTE 2 — ASUNTO
==========================================================================

(varios bloques dentro, secciones numeradas correlativas SIN reiniciar)

🔴 PARTE 3 — CIERRE / CTA
==========================================================================

────────────────────────────────────────────
BLOQUE: Cierre + CTA
────────────────────────────────────────────

N. [Frase ancla del cierre]
Texto del CTA…
[CÁMARA]
[TEXTO EN PANTALLA: "comenta X"]
[CORTE A NEGRO]

REGLAS ESTRICTAS:
- Cabecera de PARTE: emoji + " PARTE N — TÍTULO", luego línea de "=" (40+ caracteres).
- Cabecera de BLOQUE: línea de "─" (40+ caracteres), "BLOQUE: <nombre>", otra línea de "─".
- Secciones: "N. [Frase ancla]" en línea propia. N correlativo a TODO el guion, no reinicia.
- Marcas válidas (úsalas siempre): CÁMARA, PANTALLA, SPLIT, STOCK, MOTION, TEXTO EN PANTALLA, B-ROLL, ZOOM, CORTE. Para STOCK/MOTION/TEXTO EN PANTALLA/B-ROLL/PANTALLA usa "[TIPO: descripción]". Para CÁMARA/SPLIT/ZOOM/CORTE sin detalle.
- NADA de Markdown ("##", "**", "*", "- ", "> ").
- HOOK: 1 bloque, 3-5 secciones. ASUNTO: 3-6 bloques, 2-5 secciones cada uno. CIERRE: 1 bloque, 2-3 secciones.

REGLAS DE TONO:
- Primera persona singular. Conversacional.
- Empieza con el hook directo. Sin "Hola amigos de YouTube". Sin disclaimers.
- Frases cortas alternadas con largas. Preguntas retóricas.

LONGITUD GUION: ${targetWords} palabras (~${targetMinutes} min a 150 wpm). Tipo: ${input.kind} (${dur.label}).

DEVUELVES UN GUION REAL EN CONVENCIÓN AUTOCONT, completo, no un outline. El usuario solo lo edita.`,
    tools: [AUTOGEN_TOOL],
    tool_choice: { type: "tool", name: "emit_full_creation" },
    messages: [
      refMessage(),
      ackMessage(),
      {
        role: "user",
        content: `IDEA DEL VÍDEO (descripción cruda del usuario):
${input.idea}

${input.initialTitle ? `Título inicial sugerido por el usuario (puedes mejorarlo o ignorarlo): "${input.initialTitle}"` : ""}

Genera título óptimo + descripción YouTube + guion completo siguiendo la estructura del system prompt y replicando el estilo de los referentes.`,
      },
    ],
  });

  const cost = trackUsage("creation-autogen-all", response);
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude no devolvió tool_use");
  const out = toolUse.input as { title?: string; description?: string; script?: string };
  const script = (out.script ?? "").trim();
  if (script.length < 400) {
    throw new Error(
      `Guion vacío o demasiado corto (${script.length} chars, stop_reason=${response.stop_reason}). ` +
      `El JSON del tool probablemente se truncó al rebasar max_tokens — reintenta.`,
    );
  }
  return {
    title: out.title ?? "",
    description: out.description ?? "",
    script,
    cost,
  };
}

// ─── 5. Prompter — guion reducido para teleprompter ───────────────────

const PROMPTER_TOOL = {
  name: "emit_prompter_script",
  description:
    "Devuelve la versión reducida del guion para usar como teleprompter / guía: solo partes habladas, frases cortas, sin marcadores ni didascalia.",
  input_schema: {
    type: "object" as const,
    required: ["prompter_script"],
    properties: {
      prompter_script: {
        type: "string" as const,
        description: `Versión PROMPTER del guion. Reglas estrictas:

1. Conserva SOLO el texto que el creador va a DECIR. Borra:
   - Marcadores [B-ROLL: …], [VISUAL: …], [PAUSA], [CORTE], [MUSIC], etc.
   - Encabezados ## / ### de sección.
   - Cualquier instrucción de cámara o producción.

2. Trocea las frases largas en frases más cortas (máx ~14 palabras), cortando
   en pausas naturales (comas, conectores). NO inventes contenido nuevo. NO
   resumas — el sentido completo de cada frase original debe conservarse.

3. Una frase por línea. Línea en blanco entre bloques temáticos para que
   marquen un descanso natural.

4. Mantén números, nombres propios, datos exactos. Mantén las palabras ancla
   importantes. Mantén el tono y la primera persona.

5. NO uses Markdown. Texto plano, sin negritas ni listas. Es para leer, no
   para mostrar formato.

OBJETIVO: que el creador pueda leer en voz alta el prompter y seguir el hilo
del vídeo, dejándole espacio para improvisar entre frases. Es una guía, no
un dictado palabra-por-palabra.`,
      },
    },
  },
};

export async function draftPrompterScript(input: {
  script: string;
  apiKey: string;
}): Promise<{ prompter_script: string; cost: number }> {
  const client = new Anthropic({ apiKey: input.apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16384,
    system: `Eres editor de teleprompter para un canal de YouTube en español. Coges un guion completo (con marcadores de producción, encabezados de sección, párrafos largos) y lo conviertes en una versión PROMPTER: una sola columna de frases cortas que el creador puede leer fluido sin ahogarse, dejando aire para improvisar entre líneas.

NO RESUMES. NO INVENTAS. SOLO DESTILAS Y TROCEAS.`,
    tools: [PROMPTER_TOOL],
    tool_choice: { type: "tool", name: "emit_prompter_script" },
    messages: [
      {
        role: "user",
        content: `GUION COMPLETO ORIGINAL:

${input.script}

Genera la versión PROMPTER siguiendo las reglas del schema.`,
      },
    ],
  });

  const cost = trackUsage("creation-prompter", response);
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude no devolvió tool_use");
  const out = toolUse.input as { prompter_script?: string };
  const prompter_script = (out.prompter_script ?? "").trim();
  if (prompter_script.length < 100) {
    throw new Error(
      `Prompter vacío o demasiado corto (${prompter_script.length} chars, stop_reason=${response.stop_reason}). Reintenta.`,
    );
  }
  return { prompter_script, cost };
}

// ─── 6. Cowriter del guion ────────────────────────────────────────────

const SCRIPT_TOOL = {
  name: "emit_script_segment",
  description: "Devuelve un nuevo tramo del guion para añadir a continuación del existente. NO repite lo que ya está escrito.",
  input_schema: {
    type: "object" as const,
    required: ["segment"],
    properties: {
      segment: {
        type: "string" as const,
        description: "Texto a añadir al final del guion. En español, primera persona, conversacional. Entre 200 y 1000 palabras según la pauta.",
      },
      summary: {
        type: "string" as const,
        description: "Resumen breve (1-2 líneas) de qué se añadió, para feedback al usuario.",
      },
    },
  },
};

export async function continueScript(input: {
  kind: CreationKind;
  title: string;
  description: string;
  scriptSoFar: string;
  prompt: string; // pauta del usuario para qué continuar
  apiKey: string;
}): Promise<{ segment: string; summary: string; cost: number }> {
  const client = new Anthropic({ apiKey: input.apiKey });
  const dur = CREATION_DURATIONS[input.kind];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: `Eres co-guionista de un canal de YouTube en español sobre tech, IA y desarrollo. Escribes en primera persona, tono conversacional, ritmo fluido. Replicas el estilo de los referentes adjuntos: Nate Gentile (narrativa de proceso, retrobúsqueda viral), Adrián Sáenz (claridad pedagógica), JuanPe Navarro (IA aplicada, automatización), Alejavi Rivera (análisis IA actual).

Reglas:
- Continúas EXACTAMENTE donde dejó el guion. No repitas lo escrito.
- Sigues la PAUTA del usuario al pie de la letra. Si pide "ahora explica X", explicas X.
- Tipo de vídeo: ${input.kind} (${dur.label} duración total → calcula ritmo proporcional).
- No inventes datos técnicos que no estén verificados; si te falta info, redacta de forma genérica.
- Sin emojis, sin disclaimers, sin "Claro, aquí tienes". Solo el guion.`,
    tools: [SCRIPT_TOOL],
    tool_choice: { type: "tool", name: "emit_script_segment" },
    messages: [
      refMessage(),
      ackMessage(),
      {
        role: "user",
        content: `Título del vídeo: "${input.title}"
Descripción: ${input.description || "(no escrita)"}

GUION ESCRITO HASTA AHORA:
${input.scriptSoFar || "(vacío — esto es el inicio del guion)"}

PAUTA del usuario para continuar:
${input.prompt}

Continúa el guion siguiendo la pauta. Devuelve solo el nuevo tramo, no repitas lo anterior.`,
      },
    ],
  });

  const cost = trackUsage("creation-cowriter", response);
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Claude no devolvió tool_use");
  const out = toolUse.input as { segment: string; summary?: string };
  return {
    segment: out.segment ?? "",
    summary: out.summary ?? "",
    cost,
  };
}
