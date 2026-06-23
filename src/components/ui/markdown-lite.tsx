/**
 * Mini renderizador de Markdown para guiones y propuestas IA.
 *
 * Soporta:
 *   - "## Título"  → <h2>
 *   - "### Título" → <h3>
 *   - "**negrita**", "*cursiva*", "_cursiva_"
 *   - "- " / "* " bullets
 *   - "1. " ordered list (renderizada como bullets numerados)
 *   - "> " bloque cita
 *   - líneas vacías → separación de párrafos
 *   - Marcadores de producción [B-ROLL: …], [VISUAL: …], [PAUSA], [CORTE]
 *     se pintan como chips en su propia línea.
 *
 * No es react-markdown — pesaría 50kB que no necesitamos. La heurística
 * cubre el 95% de lo que Claude devuelve para guiones y la presentación
 * queda legible y consistente con el tema oscuro del dashboard.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

interface Props {
  text: string;
  className?: string;
}

const PRODUCTION_TAG = /^\[(B-?ROLL|VISUAL|PAUSA|PAUSA DRAMATICA|PAUSA DRAMÁTICA|CORTE|MUSIC|MÚSICA|SFX)(?::\s*([^\]]*))?\]$/i;

export function MarkdownLite({ text, className }: Props) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];

  let bulletGroup: { ordered: boolean; items: string[] } | null = null;
  let quoteGroup: string[] = [];

  function flushBullets() {
    if (!bulletGroup || bulletGroup.items.length === 0) return;
    const Tag = bulletGroup.ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={`list-${blocks.length}`}
        className={cn(
          "ml-1 flex flex-col gap-1.5",
          bulletGroup.ordered ? "list-decimal pl-5 text-fg" : "list-none",
        )}
      >
        {bulletGroup.items.map((b, i) => (
          <li
            key={i}
            className={cn(
              bulletGroup!.ordered ? "marker:text-fg-subtle" : "flex gap-2",
            )}
          >
            {!bulletGroup!.ordered && (
              <span className="mt-[9px] inline-block size-1 shrink-0 rounded-full bg-accent" />
            )}
            <span className="flex-1">{renderInline(b)}</span>
          </li>
        ))}
      </Tag>,
    );
    bulletGroup = null;
  }

  function flushQuote() {
    if (quoteGroup.length === 0) return;
    blocks.push(
      <blockquote
        key={`q-${blocks.length}`}
        className="border-l-2 border-accent/60 bg-accent/[0.05] px-3 py-2 text-fg italic"
      >
        {quoteGroup.map((q, i) => (
          <p key={i} className="leading-relaxed">{renderInline(q)}</p>
        ))}
      </blockquote>,
    );
    quoteGroup = [];
  }

  function flushAll() {
    flushBullets();
    flushQuote();
  }

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flushAll();
      continue;
    }

    // Marcadores de producción [B-ROLL: …]
    const tagMatch = line.match(PRODUCTION_TAG);
    if (tagMatch) {
      flushAll();
      const kind = tagMatch[1].toUpperCase().replace(/\s+/g, "-");
      const detail = (tagMatch[2] ?? "").trim();
      blocks.push(
        <div
          key={`tag-${blocks.length}`}
          className="flex items-baseline gap-2 text-xs"
        >
          <span className="rounded border border-accent/30 bg-accent/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent">
            {kind}
          </span>
          {detail && (
            <span className="text-fg-muted">{renderInline(detail)}</span>
          )}
        </div>,
      );
      continue;
    }

    // Encabezados
    if (line.startsWith("### ")) {
      flushAll();
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="mt-2 text-sm font-semibold tracking-tight text-fg">
          {renderInline(line.slice(4))}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushAll();
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="mt-4 border-b border-border/60 pb-1 text-base font-semibold tracking-tight text-fg">
          {renderInline(line.slice(3))}
        </h2>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushAll();
      blocks.push(
        <h2 key={`h1-${blocks.length}`} className="mt-4 text-lg font-bold tracking-tight text-fg">
          {renderInline(line.slice(2))}
        </h2>,
      );
      continue;
    }

    // Bloque cita
    if (line.startsWith("> ")) {
      flushBullets();
      quoteGroup.push(line.slice(2));
      continue;
    }

    // Bullets
    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushQuote();
      if (!bulletGroup || bulletGroup.ordered) {
        flushBullets();
        bulletGroup = { ordered: false, items: [] };
      }
      bulletGroup.items.push(bulletMatch[1]);
      continue;
    }
    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushQuote();
      if (!bulletGroup || !bulletGroup.ordered) {
        flushBullets();
        bulletGroup = { ordered: true, items: [] };
      }
      bulletGroup.items.push(orderedMatch[1]);
      continue;
    }

    // Párrafo normal
    flushAll();
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-relaxed text-fg/95">
        {renderInline(line)}
      </p>,
    );
  }

  flushAll();

  return <div className={cn("flex flex-col gap-3", className)}>{blocks}</div>;
}

/** Inline parser. Convierte **bold**, *italic* / _italic_, `code` y enlaces
 *  [texto](url) en nodos React. Procesa de izq a derecha buscando el match
 *  más cercano para no anidar regex caóticamente. */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < text.length) {
    // **bold**
    const boldMatch = /\*\*([^*]+)\*\*/.exec(text.slice(i));
    // *italic* (no comerse **)
    const italicMatch = /(^|[^*])\*([^*\n]+)\*(?!\*)/.exec(text.slice(i));
    // _italic_
    const underMatch = /(^|[^_\w])_([^_\n]+)_(?!\w)/.exec(text.slice(i));
    // `code`
    const codeMatch = /`([^`]+)`/.exec(text.slice(i));
    // [texto](url)
    const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(text.slice(i));

    const candidates: Array<{ idx: number; type: "bold" | "italic" | "under" | "code" | "link"; m: RegExpExecArray }> = [];
    if (boldMatch) candidates.push({ idx: boldMatch.index, type: "bold", m: boldMatch });
    if (italicMatch) candidates.push({ idx: italicMatch.index + (italicMatch[1] ? italicMatch[1].length : 0), type: "italic", m: italicMatch });
    if (underMatch) candidates.push({ idx: underMatch.index + (underMatch[1] ? underMatch[1].length : 0), type: "under", m: underMatch });
    if (codeMatch) candidates.push({ idx: codeMatch.index, type: "code", m: codeMatch });
    if (linkMatch) candidates.push({ idx: linkMatch.index, type: "link", m: linkMatch });

    if (candidates.length === 0) {
      parts.push(text.slice(i));
      break;
    }

    candidates.sort((a, b) => a.idx - b.idx);
    const next = candidates[0];

    if (next.idx > 0) parts.push(text.slice(i, i + next.idx));

    if (next.type === "bold") {
      parts.push(<strong key={key++} className="font-semibold text-fg">{next.m[1]}</strong>);
      i = i + next.idx + next.m[0].length;
    } else if (next.type === "italic") {
      parts.push(<em key={key++} className="italic text-fg">{next.m[2]}</em>);
      i = i + next.idx + next.m[0].length - (next.m[1] ? next.m[1].length : 0);
    } else if (next.type === "under") {
      parts.push(<em key={key++} className="italic text-fg">{next.m[2]}</em>);
      i = i + next.idx + next.m[0].length - (next.m[1] ? next.m[1].length : 0);
    } else if (next.type === "code") {
      parts.push(
        <code key={key++} className="rounded bg-bg-elevated px-1 py-px font-mono text-[0.9em] text-accent">
          {next.m[1]}
        </code>,
      );
      i = i + next.idx + next.m[0].length;
    } else if (next.type === "link") {
      parts.push(
        <a
          key={key++}
          href={next.m[2]}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline-offset-2 hover:underline"
        >
          {next.m[1]}
        </a>,
      );
      i = i + next.idx + next.m[0].length;
    }
  }

  return parts;
}
