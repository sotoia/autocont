"use client";
import * as React from "react";
import { X, Play, Pause, Type, Gauge, RotateCcw, ChevronDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  text: string;
  title?: string;
  onClose: () => void;
  /** Opcional: si se pasa, se muestra botón "Regenerar" en el header. */
  onRegenerate?: () => Promise<void> | void;
  /** Para deshabilitar el botón mientras se está regenerando. */
  regenerating?: boolean;
}

const FONT_MIN = 32;
const FONT_MAX = 120;
const FONT_DEFAULT = 64;

const SPEED_MIN = 20;        // px / s — lectura cómoda lenta
const SPEED_MAX = 320;
const SPEED_DEFAULT = 90;

const STORAGE_KEY = "autocont.prompter.prefs";

interface Prefs { fontPx: number; speedPxs: number }

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return { fontPx: FONT_DEFAULT, speedPxs: SPEED_DEFAULT };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { fontPx: FONT_DEFAULT, speedPxs: SPEED_DEFAULT };
    const j = JSON.parse(raw);
    return {
      fontPx: clamp(Number(j.fontPx) || FONT_DEFAULT, FONT_MIN, FONT_MAX),
      speedPxs: clamp(Number(j.speedPxs) || SPEED_DEFAULT, SPEED_MIN, SPEED_MAX),
    };
  } catch { return { fontPx: FONT_DEFAULT, speedPxs: SPEED_DEFAULT }; }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function PrompterOverlay({ text, title, onClose, onRegenerate, regenerating }: Props) {
  const [prefs, setPrefs] = React.useState<Prefs>(() => ({ fontPx: FONT_DEFAULT, speedPxs: SPEED_DEFAULT }));
  const [playing, setPlaying] = React.useState(false);

  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const progressBarRef = React.useRef<HTMLDivElement>(null);

  // RAF state — se mantiene fuera de React state para evitar re-render por
  // frame. Sin esto, el setProgress(scrollTop) re-renderizaba el componente
  // entero 60 veces/segundo y provocaba trompicones al cambiar velocidad.
  const playingRef = React.useRef(false);
  const speedRef = React.useRef(SPEED_DEFAULT);
  const lastTickRef = React.useRef<number | null>(null);
  const scrollPosRef = React.useRef(0);        // posición fraccional acumulada
  const rafRef = React.useRef<number | null>(null);

  // Cargar prefs en mount (cliente). Evita hydration mismatch.
  React.useEffect(() => {
    const p = loadPrefs();
    setPrefs(p);
    speedRef.current = p.speedPxs;
  }, []);

  // Persistir prefs. speedRef se actualiza SÍNCRONO con onChange del slider
  // (más abajo), así que aquí solo guardamos.
  React.useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch {}
  }, [prefs]);

  React.useEffect(() => { playingRef.current = playing; }, [playing]);

  // Si cambia el texto (regeneración), reset
  React.useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    scrollPosRef.current = 0;
    if (progressBarRef.current) progressBarRef.current.style.width = "0%";
    lastTickRef.current = null;
    playingRef.current = false;
    setPlaying(false);
  }, [text]);

  // Atajos de teclado
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.code === "Escape") {
        onClose();
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        setPrefs((p) => ({ ...p, fontPx: clamp(p.fontPx + 4, FONT_MIN, FONT_MAX) }));
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        setPrefs((p) => ({ ...p, fontPx: clamp(p.fontPx - 4, FONT_MIN, FONT_MAX) }));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        setPrefs((p) => {
          const next = clamp(p.speedPxs + 15, SPEED_MIN, SPEED_MAX);
          speedRef.current = next;
          return { ...p, speedPxs: next };
        });
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        setPrefs((p) => {
          const next = clamp(p.speedPxs - 15, SPEED_MIN, SPEED_MAX);
          speedRef.current = next;
          return { ...p, speedPxs: next };
        });
      } else if (e.code === "KeyR") {
        if (scrollerRef.current) {
          scrollerRef.current.scrollTop = 0;
          scrollPosRef.current = 0;
          if (progressBarRef.current) progressBarRef.current.style.width = "0%";
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Loop de animación con RAF — totalmente independiente del estado de
  // React. La barra de progreso se actualiza vía ref (estilo inline) en vez
  // de setState, así no provocamos re-render por cada frame.
  React.useEffect(() => {
    function tick(now: number) {
      const sc = scrollerRef.current;
      if (sc && playingRef.current) {
        if (lastTickRef.current === null) {
          // Primer frame después de un play. Sincronizamos posición real.
          scrollPosRef.current = sc.scrollTop;
        } else {
          const dt = (now - lastTickRef.current) / 1000;
          // Acumulamos en float para que velocidades bajas no se pierdan
          // por redondeo. scrollTop solo acepta ints.
          scrollPosRef.current += speedRef.current * dt;
          sc.scrollTop = scrollPosRef.current;
          if (progressBarRef.current) {
            const max = sc.scrollHeight - sc.clientHeight;
            const pct = max > 0 ? Math.min(100, (sc.scrollTop / max) * 100) : 0;
            progressBarRef.current.style.width = `${pct}%`;
          }
          if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) {
            playingRef.current = false;
            setPlaying(false);
          }
        }
        lastTickRef.current = now;
      } else {
        lastTickRef.current = null;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // Si el usuario hace scroll manual (rueda, drag), resincronizamos la
  // posición fraccional para no dar saltos al volver a play.
  function onManualScroll() {
    if (!playingRef.current && scrollerRef.current) {
      scrollPosRef.current = scrollerRef.current.scrollTop;
      if (progressBarRef.current) {
        const max = scrollerRef.current.scrollHeight - scrollerRef.current.clientHeight;
        const pct = max > 0 ? Math.min(100, (scrollerRef.current.scrollTop / max) * 100) : 0;
        progressBarRef.current.style.width = `${pct}%`;
      }
    }
  }

  function reset() {
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    scrollPosRef.current = 0;
    if (progressBarRef.current) progressBarRef.current.style.width = "0%";
    setPlaying(false);
  }

  // Slider de velocidad: ref se actualiza SÍNCRONO en el onChange para que
  // el cambio aplique en el siguiente frame de RAF sin esperar al re-render.
  function onSpeedChange(v: number) {
    speedRef.current = v;
    setPrefs((p) => ({ ...p, speedPxs: v }));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-black/80 px-4 py-2.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-7 place-items-center rounded bg-accent/15 text-accent">
            <ChevronDown className="size-4" />
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">Prompter</span>
            <span className="truncate text-sm font-medium text-white">{title ?? "Guion"}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tamaño */}
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5">
            <Type className="size-3.5 text-white/60" />
            <input
              type="range" min={FONT_MIN} max={FONT_MAX} step={2}
              value={prefs.fontPx}
              onChange={(e) => setPrefs((p) => ({ ...p, fontPx: Number(e.target.value) }))}
              className="h-1 w-28 accent-emerald-400"
            />
            <span className="w-9 text-right font-mono text-[11px] tabular-nums text-white/80">{prefs.fontPx}px</span>
          </div>

          {/* Velocidad */}
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5">
            <Gauge className="size-3.5 text-white/60" />
            <input
              type="range" min={SPEED_MIN} max={SPEED_MAX} step={5}
              value={prefs.speedPxs}
              onChange={(e) => onSpeedChange(Number(e.target.value))}
              className="h-1 w-28 accent-emerald-400"
            />
            <span className="w-12 text-right font-mono text-[11px] tabular-nums text-white/80">{prefs.speedPxs} px/s</span>
          </div>

          {onRegenerate && (
            <button
              onClick={() => onRegenerate()}
              disabled={!!regenerating}
              title="Regenerar prompter desde el guion actual"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 text-xs text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
              {regenerating ? "Regenerando…" : "Regenerar"}
            </button>
          )}

          <button
            onClick={reset}
            title="Reiniciar (R)"
            className="grid size-9 place-items-center rounded-md border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="size-4" />
          </button>

          <button
            onClick={() => setPlaying((p) => !p)}
            title={playing ? "Pausar (Espacio)" : "Reproducir (Espacio)"}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
              playing
                ? "bg-emerald-400 text-black hover:bg-emerald-300"
                : "border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20",
            )}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {playing ? "Pausa" : "Play"}
          </button>

          <button
            onClick={onClose}
            title="Cerrar (Esc)"
            className="grid size-9 place-items-center rounded-md border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Barra de progreso — actualizada vía ref, NO via setState */}
      <div className="h-0.5 w-full bg-white/5">
        <div
          ref={progressBarRef}
          className="h-full bg-emerald-400"
          style={{ width: "0%" }}
        />
      </div>

      {/* Línea guía central */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 -translate-y-1/2">
        <div className="mx-auto h-[2px] w-[80%] bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent" />
      </div>

      {/* Scroller del texto — SIN scroll-smooth: CSS smooth interpola cada
          scrollTop que escribimos y eso producía el "lento y a trompicones"
          al reanudar tras cambiar velocidad. */}
      <div
        ref={scrollerRef}
        onClick={() => setPlaying((p) => !p)}
        onScroll={onManualScroll}
        className="flex-1 cursor-pointer overflow-y-auto"
        style={{ scrollbarWidth: "thin" }}
      >
        <div
          ref={innerRef}
          className="mx-auto max-w-5xl px-10 text-white"
          style={{
            fontSize: `${prefs.fontPx}px`,
            lineHeight: 1.4,
            // Padding superior e inferior generoso para que la primera y
            // última línea puedan llegar a la línea guía central.
            paddingTop: "50vh",
            paddingBottom: "55vh",
            fontWeight: 400,
            letterSpacing: "-0.005em",
          }}
        >
          {text.split("\n").map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={i} style={{ height: `${prefs.fontPx * 0.8}px` }} />;
            return (
              <p key={i} className="mb-[0.55em]">{trimmed}</p>
            );
          })}
        </div>
      </div>

      {/* Footer hint */}
      <div className="flex items-center justify-center gap-4 border-t border-white/10 bg-black/80 px-4 py-2 text-[11px] text-white/50">
        <Hint kbd="Espacio">Play / Pausa</Hint>
        <Hint kbd="↑ / ↓">Tamaño</Hint>
        <Hint kbd="← / →">Velocidad</Hint>
        <Hint kbd="R">Reiniciar</Hint>
        <Hint kbd="Esc">Cerrar</Hint>
      </div>
    </div>
  );
}

function Hint({ kbd, children }: { kbd: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
        {kbd}
      </kbd>
      <span>{children}</span>
    </span>
  );
}
