"use client";
/**
 * Renderiza el guion en formato bonito leyendo la convención AUTOCONT:
 *
 *   🟣 PARTE 1 — HOOK              ← cabecera de PARTE (color por emoji)
 *   ────────────────
 *   BLOQUE: El gancho              ← sub-cabecera
 *   1. [Frase resumen]             ← sección numerada
 *   Texto del guion.
 *   [CÁMARA]                        ← marca de producción
 *   [PANTALLA: descripción]
 *
 * Si no detecta el formato, hace fallback a texto plano legible.
 *
 * Si se pasa `mediaMap` (entries de media-map.ts), se activa el modo
 * "scroll-spy + preview inline + lightbox" para una guía de montaje
 * desplegable a medida que el usuario hace scroll.
 */
import * as React from "react";
import {
  Camera, Monitor, Columns2, Film, Sparkles, Type, ZoomIn, Scissors,
  Clapperboard, Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveMediaForSection,
  type MediaAssignment,
  type MediaItem,
} from "@/lib/creations/media-map";
import { MediaLightbox } from "./media-lightbox";

/* ───────────────────── Tipos ───────────────────── */

type MarkKind =
  | "CAMARA" | "PANTALLA" | "SPLIT" | "STOCK" | "MOTION"
  | "TEXTO" | "BROLL" | "ZOOM" | "CORTE" | "OTHER";

interface Mark {
  kind: MarkKind;
  label: string;
  detail?: string;
}

interface Section {
  num: number;
  summary: string;
  body: string;
  marks: Mark[];
}

interface Block {
  title: string;
  sections: Section[];
}

interface Part {
  color: "purple" | "green" | "red";
  label: string;
  number: number | null;
  blocks: Block[];
}

interface ParsedGuion {
  parts: Part[];
  outro: string[];
}

/* ───────────────────── Parser ───────────────────── */

const SEPARATOR_RE = /^(={3,}|-{5,}|─{3,}|\*{3,})$/;
const PART_RE = /^(🟣|🟢|🔴)\s*PARTE(?:\s*(\d+))?\s*[—\-:]?\s*(.+)$/;
const BLOCK_RE = /^BLOQUE(?:\s*\d+)?\s*[:.]\s*(.+)$/i;
const SECTION_RE = /^\*{0,2}(\d+)\.\s*\[(.+?)\]\*{0,2}$/;
const MARK_RE = /\[([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s\-]+?)(?::\s*([^\]]*))?\]/g;
const NOTES_HEADER_RE = /^(NOTAS|FIN DEL GUION|RESUMEN)/i;

function classifyMark(rawLabel: string): MarkKind {
  const l = rawLabel.toUpperCase().trim();
  if (l === "CÁMARA" || l === "CAMARA") return "CAMARA";
  if (l === "PANTALLA") return "PANTALLA";
  if (l === "SPLIT") return "SPLIT";
  if (l === "STOCK") return "STOCK";
  if (l === "MOTION") return "MOTION";
  if (l.startsWith("TEXTO")) return "TEXTO";
  if (l.startsWith("B-ROLL") || l === "BROLL") return "BROLL";
  if (l === "ZOOM") return "ZOOM";
  if (l === "CORTE") return "CORTE";
  return "OTHER";
}

export function parseGuion(text: string): ParsedGuion {
  const lines = text.split(/\r?\n/);
  const parts: Part[] = [];
  const outro: string[] = [];

  let currentPart: Part | null = null;
  let currentBlock: Block | null = null;
  let currentSection: Section | null = null;
  let bodyLines: string[] = [];
  let pendingParagraphBreak = false;
  let inOutro = false;

  const flushSection = () => {
    if (!currentSection) return;
    const paragraphs: string[] = [];
    let buf: string[] = [];
    for (const l of bodyLines) {
      if (l === "") {
        if (buf.length) { paragraphs.push(buf.join("\n")); buf = []; }
      } else {
        buf.push(l);
      }
    }
    if (buf.length) paragraphs.push(buf.join("\n"));
    currentSection.body = paragraphs
      .map((p) => p.replace(/[ \t]+/g, " ").replace(/[ \t]*\n[ \t]*/g, "\n").trim())
      .filter(Boolean)
      .join("\n\n");
    if (currentBlock) currentBlock.sections.push(currentSection);
    currentSection = null;
    bodyLines = [];
    pendingParagraphBreak = false;
  };
  const flushBlock = () => {
    flushSection();
    if (currentBlock && currentPart) currentPart.blocks.push(currentBlock);
    currentBlock = null;
  };
  const flushPart = () => {
    flushBlock();
    if (currentPart) parts.push(currentPart);
    currentPart = null;
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (NOTES_HEADER_RE.test(line)) {
      flushPart();
      inOutro = true;
      outro.push(line);
      continue;
    }
    if (inOutro) {
      if (line) outro.push(line);
      continue;
    }

    if (!line) {
      if (currentSection && bodyLines.length > 0) pendingParagraphBreak = true;
      continue;
    }
    if (SEPARATOR_RE.test(line)) continue;

    const pm = line.match(PART_RE);
    if (pm) {
      flushPart();
      const color = pm[1] === "🟣" ? "purple" : pm[1] === "🟢" ? "green" : "red";
      currentPart = {
        color,
        number: pm[2] ? Number(pm[2]) : null,
        label: pm[3].trim(),
        blocks: [],
      };
      continue;
    }

    const bm = line.match(BLOCK_RE);
    if (bm) {
      flushBlock();
      currentBlock = { title: bm[1].trim(), sections: [] };
      if (!currentPart) currentPart = { color: "green", number: null, label: "", blocks: [] };
      continue;
    }

    const sm = line.match(SECTION_RE);
    if (sm) {
      flushSection();
      currentSection = { num: Number(sm[1]), summary: sm[2].trim(), body: "", marks: [] };
      if (!currentBlock) {
        if (!currentPart) currentPart = { color: "green", number: null, label: "", blocks: [] };
        currentBlock = { title: "", sections: [] };
      }
      continue;
    }

    if (!currentSection) continue;

    const cleaned = line.replace(/^`+|`+$/g, "").trim();
    const matches = [...cleaned.matchAll(MARK_RE)];
    const remainder = cleaned.replace(MARK_RE, "").trim();
    if (matches.length > 0 && remainder === "") {
      for (const m of matches) {
        const label = m[1].trim();
        const detail = m[2]?.trim() || undefined;
        currentSection.marks.push({ kind: classifyMark(label), label, detail });
      }
      continue;
    }

    if (pendingParagraphBreak) {
      bodyLines.push("");
      pendingParagraphBreak = false;
    }
    bodyLines.push(cleaned);
  }
  flushPart();

  return { parts, outro };
}

/* ───────────────────── Estilos ───────────────────── */

const PART_STYLES: Record<Part["color"], {
  header: string;
  emoji: string;
  ring: string;
  numberBg: string;
  numberText: string;
  rail: string;
}> = {
  purple: {
    header: "bg-purple-500/10 border-purple-400/30 text-purple-100",
    emoji: "🟣",
    ring: "ring-purple-400/30",
    numberBg: "bg-purple-500/20 border-purple-400/40",
    numberText: "text-purple-200",
    rail: "bg-purple-400/40",
  },
  green: {
    header: "bg-emerald-500/10 border-emerald-400/30 text-emerald-100",
    emoji: "🟢",
    ring: "ring-emerald-400/30",
    numberBg: "bg-emerald-500/20 border-emerald-400/40",
    numberText: "text-emerald-200",
    rail: "bg-emerald-400/40",
  },
  red: {
    header: "bg-rose-500/10 border-rose-400/30 text-rose-100",
    emoji: "🔴",
    ring: "ring-rose-400/30",
    numberBg: "bg-rose-500/20 border-rose-400/40",
    numberText: "text-rose-200",
    rail: "bg-rose-400/40",
  },
};

const MARK_STYLES: Record<MarkKind, { icon: React.ReactNode; cls: string }> = {
  CAMARA:   { icon: <Camera className="size-3" />,       cls: "border-sky-400/40 bg-sky-400/10 text-sky-200" },
  PANTALLA: { icon: <Monitor className="size-3" />,      cls: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" },
  SPLIT:    { icon: <Columns2 className="size-3" />,     cls: "border-violet-400/40 bg-violet-400/10 text-violet-200" },
  STOCK:    { icon: <Film className="size-3" />,         cls: "border-amber-400/40 bg-amber-400/10 text-amber-200" },
  MOTION:   { icon: <Sparkles className="size-3" />,     cls: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200" },
  TEXTO:    { icon: <Type className="size-3" />,         cls: "border-blue-400/40 bg-blue-400/10 text-blue-200" },
  BROLL:    { icon: <Clapperboard className="size-3" />, cls: "border-orange-400/40 bg-orange-400/10 text-orange-200" },
  ZOOM:     { icon: <ZoomIn className="size-3" />,       cls: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" },
  CORTE:    { icon: <Scissors className="size-3" />,     cls: "border-rose-400/40 bg-rose-400/10 text-rose-200" },
  OTHER:    { icon: <Tag className="size-3" />,          cls: "border-border bg-bg-elevated text-fg-muted" },
};

/* ───────────────────── Context para scroll-spy ───────────────────── */

interface ActiveCtx {
  activeNum: number | null;
  setActive: (n: number) => void;
}
const ActiveContext = React.createContext<ActiveCtx>({
  activeNum: null,
  setActive: () => {},
});

/* ───────────────────── Componente raíz ───────────────────── */

interface Props {
  text: string;
  /** Si se pasa, activa scroll-spy + preview inline + lightbox al clicar marcas. */
  mediaMap?: MediaAssignment[];
}

export function ScriptRenderer({ text, mediaMap }: Props) {
  const guion = React.useMemo(() => parseGuion(text), [text]);
  const enhanced = !!mediaMap && mediaMap.length > 0;
  const [activeNum, setActiveNum] = React.useState<number | null>(null);
  const [lightboxItems, setLightboxItems] = React.useState<MediaItem[] | null>(null);

  const setActive = React.useCallback((n: number) => {
    setActiveNum((cur) => (cur === n ? cur : n));
  }, []);

  function openLightbox(items: MediaItem[]) {
    if (!items || items.length === 0) return;
    setLightboxItems(items);
  }

  // Si no detectó NINGUNA parte, mostramos el texto como párrafos serif (fallback).
  const hasStructure = guion.parts.some((p) => p.blocks.some((b) => b.sections.length > 0));
  if (!hasStructure) {
    return (
      <div className="whitespace-pre-wrap font-serif text-[15px] leading-7 text-fg">
        {text}
      </div>
    );
  }

  return (
    <ActiveContext.Provider value={{ activeNum, setActive }}>
      <div className="flex flex-col gap-10">
        {guion.parts.map((part, pi) => {
          const styles = PART_STYLES[part.color];
          return (
            <section key={pi} className="flex flex-col gap-5">
              <header
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border px-4 py-3",
                  styles.header,
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg leading-none">{styles.emoji}</span>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-75">
                      {part.number != null ? `Parte ${part.number}` : "Parte"}
                    </div>
                    <div className="text-base font-bold uppercase tracking-wide">
                      {part.label}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:block text-[10px] uppercase tracking-wider opacity-60">
                  {part.blocks.length} {part.blocks.length === 1 ? "bloque" : "bloques"} ·{" "}
                  {part.blocks.reduce((acc, b) => acc + b.sections.length, 0)} secciones
                </div>
              </header>

              <div className="flex flex-col gap-7 pl-1">
                {part.blocks.map((block, bi) => (
                  <div key={bi} className="flex flex-col gap-4">
                    {block.title && (
                      <div className="flex items-center gap-3">
                        <div className={cn("h-px flex-1", styles.rail)} />
                        <h4 className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-fg-muted">
                          {block.title}
                        </h4>
                        <div className={cn("h-px flex-1", styles.rail)} />
                      </div>
                    )}

                    <ol className="flex flex-col gap-5">
                      {block.sections.map((s) => (
                        <SectionRow
                          key={s.num}
                          section={s}
                          partColor={part.color}
                          enhanced={enhanced}
                          mediaMap={mediaMap}
                          onOpenLightbox={openLightbox}
                        />
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {guion.outro.length > 0 && (
          <section className="rounded-md border border-dashed border-border bg-bg-elevated/50 p-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-subtle">
              Notas de producción
            </div>
            <div className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-fg-muted">
              {guion.outro.join("\n")}
            </div>
          </section>
        )}
      </div>

      {lightboxItems && (
        <MediaLightbox
          items={lightboxItems}
          startIndex={0}
          onClose={() => setLightboxItems(null)}
        />
      )}
    </ActiveContext.Provider>
  );
}

/* ───────────────────── Section row con scroll-spy ───────────────────── */

interface RowProps {
  section: Section;
  partColor: Part["color"];
  enhanced: boolean;
  mediaMap?: MediaAssignment[];
  onOpenLightbox: (items: MediaItem[]) => void;
}

function SectionRow({ section: s, partColor, enhanced, mediaMap, onOpenLightbox }: RowProps) {
  const styles = PART_STYLES[partColor];
  const liRef = React.useRef<HTMLLIElement>(null);
  const { activeNum, setActive } = React.useContext(ActiveContext);

  const mediaByMark = React.useMemo(() => {
    if (!enhanced || !mediaMap) return s.marks.map(() => [] as MediaItem[]);
    return resolveMediaForSection(mediaMap, s.num, s.marks);
  }, [enhanced, mediaMap, s.num, s.marks]);

  React.useEffect(() => {
    if (!enhanced) return;
    const el = liRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(s.num);
        }
      },
      { rootMargin: "-25% 0px -55% 0px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [enhanced, s.num, setActive]);

  const primaryIdx = React.useMemo(
    () => mediaByMark.findIndex((arr) => arr.length > 0),
    [mediaByMark],
  );
  const hasPreview = enhanced && primaryIdx >= 0;
  const isActive = enhanced && activeNum === s.num;

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    if (isActive) {
      setMounted(true);
    } else {
      const t = setTimeout(() => setMounted(false), 240);
      return () => clearTimeout(t);
    }
  }, [isActive]);

  return (
    <li
      ref={liRef}
      className={cn(
        "flex gap-4 transition-opacity duration-200",
        enhanced && !isActive && "opacity-70",
      )}
    >
      <div
        className={cn(
          "shrink-0 grid place-items-center size-9 rounded-full border font-bold text-sm tabular-nums",
          styles.numberBg,
          styles.numberText,
        )}
      >
        {s.num}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        <h5 className="text-[15px] font-semibold leading-snug text-fg">{s.summary}</h5>

        {s.body && (
          <div className="flex flex-col gap-2.5">
            {s.body.split(/\n{2,}/).map((para, pi) => (
              <p
                key={pi}
                className="font-serif text-[15.5px] leading-[1.75] text-fg/95 whitespace-pre-line"
              >
                {para}
              </p>
            ))}
          </div>
        )}

        {s.marks.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {s.marks.map((m, mi) => {
              const items = mediaByMark[mi];
              const has = enhanced && items.length > 0;
              const onlyCreator = has && items.every((it) => it.source === "creator");
              const ms = MARK_STYLES[m.kind];
              return (
                <button
                  key={mi}
                  className={cn(
                    "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-shadow",
                    ms.cls,
                    has && "cursor-pointer hover:brightness-125",
                    !has && "cursor-default",
                    mi === primaryIdx && isActive && "ring-2 ring-accent/40 ring-offset-1 ring-offset-bg",
                  )}
                  onClick={has ? () => onOpenLightbox(items) : undefined}
                  disabled={!has}
                  type="button"
                  title={
                    has
                      ? "Click para abrir grande · Se autodespliega al hacer scroll"
                      : enhanced
                        ? "Sin material asociado todavía"
                        : ""
                  }
                >
                  <span className="shrink-0">{ms.icon}</span>
                  <span className="font-bold uppercase tracking-wider">{m.label}</span>
                  {m.detail && (
                    <span className="opacity-80 truncate">· {m.detail}</span>
                  )}
                  {has && (
                    <span
                      className={cn(
                        "ml-1 shrink-0 rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider",
                        onlyCreator
                          ? "bg-emerald-400/15 text-emerald-300"
                          : "bg-accent/20 text-accent",
                      )}
                    >
                      {items.length > 1 ? items.length : onlyCreator ? "B-roll" : "Elgato"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {hasPreview && (
          <div
            className={cn(
              "overflow-hidden transition-all duration-300 ease-out",
              isActive ? "max-h-[520px] opacity-100 mt-2" : "max-h-0 opacity-0 mt-0",
            )}
            aria-hidden={!isActive}
          >
            {mounted && (
              <SectionPreview
                mark={s.marks[primaryIdx]}
                items={mediaByMark[primaryIdx]}
                visible={isActive}
                onClickOpen={() => onOpenLightbox(mediaByMark[primaryIdx])}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function SectionPreview({
  mark,
  items,
  visible,
  onClickOpen,
}: {
  mark: Mark;
  items: MediaItem[];
  visible: boolean;
  onClickOpen: () => void;
}) {
  const first = items.find((it) => it.src) ?? items[0];
  const isCreator = first.source === "creator" || !first.src;
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (visible) {
      const p = v.play();
      if (p && typeof p.then === "function") p.catch(() => { /* iOS bloquea sin user gesture, ignoramos */ });
    } else {
      v.pause();
    }
  }, [visible]);

  return (
    <div className="flex max-w-[560px] flex-col overflow-hidden rounded-lg border border-border-strong bg-bg-elevated shadow-xl">
      <div className="grid max-h-[340px] place-items-center overflow-hidden bg-black">
        {isCreator ? (
          <div className="flex w-full flex-col items-center gap-1.5 px-5 py-7 text-center text-fg-subtle">
            <div className="text-xs font-bold uppercase tracking-wider text-fg">
              B-roll a grabar por ti
            </div>
            <div className="max-w-[380px] text-[12.5px] leading-snug">
              {first.caption}
            </div>
          </div>
        ) : first.kind === "video" ? (
          <video
            ref={videoRef}
            key={first.src}
            src={first.src}
            autoPlay
            loop
            muted
            playsInline
            className="block max-h-[340px] max-w-full object-contain"
          />
        ) : (
          <img
            key={first.src}
            src={first.src}
            alt={first.caption}
            className="block max-h-[340px] max-w-full object-contain"
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-bg-card px-3.5 py-2.5">
        <div className="flex-1 min-w-0 text-xs text-fg-muted">
          <span
            className={cn(
              "mr-1.5 inline-block rounded-full px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-wider",
              isCreator
                ? "bg-emerald-400/15 text-emerald-300"
                : "bg-accent/20 text-accent",
            )}
          >
            {isCreator ? "B-roll creator" : "Material Elgato"}
          </span>
          <strong className="text-fg text-[11.5px] font-bold uppercase tracking-wider">
            {mark.label}
          </strong>
          {mark.detail && <span className="opacity-70"> · {mark.detail}</span>}
        </div>
        <button
          onClick={onClickOpen}
          className="shrink-0 rounded border border-border-strong bg-bg-hover px-2.5 py-1 text-[11px] font-medium text-fg hover:bg-accent hover:text-accent-fg"
          type="button"
        >
          Abrir →
        </button>
      </div>
    </div>
  );
}
