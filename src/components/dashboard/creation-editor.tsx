"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Sparkles, Wand2, FileDown, Loader2, Pin, Archive, Trash2,
  CheckCircle2, AlertCircle, Save, Lightbulb, Copy, Eye, Pencil, Tv2, RefreshCw,
  ClipboardList, Map, Clock, Type, Target, Megaphone, MessageSquare, Code2, Hash,
} from "lucide-react";
import type { Creation, CreationKind } from "@/lib/creations/types";
import { CREATION_KIND_LABELS, CREATION_KIND_DESCRIPTIONS, CREATION_DURATIONS } from "@/lib/creations/types";
import { MarkdownLite } from "@/components/ui/markdown-lite";
import { PrompterOverlay } from "@/components/dashboard/prompter-overlay";
import { ScriptRenderer } from "@/components/dashboard/script-renderer";
import { getMediaMapForCreation } from "@/lib/creations/media-map";
import { YouTubePreview } from "@/components/dashboard/youtube-preview";
import { cn } from "@/lib/utils";

interface Props {
  initial: Creation;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function CreationEditor({ initial }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [c, setC] = React.useState<Creation>(initial);
  // Marcador para que el efecto autogen no se dispare dos veces (StrictMode + dev).
  const autogenFiredRef = React.useRef(false);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [titleSuggestions, setTitleSuggestions] = React.useState<string[] | null>(null);
  const [aiBusy, setAiBusy] = React.useState<null | "titles" | "description" | "cowriter" | "draft-full-script" | "auto-generate-all" | "prompter">(null);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [cowriterPrompt, setCowriterPrompt] = React.useState("");
  const [scriptView, setScriptView] = React.useState<"edit" | "preview">("preview");
  const [prompterOpen, setPrompterOpen] = React.useState(false);
  const [prompterBusy, setPrompterBusy] = React.useState(false);

  // Auto-save con debounce 1.2 s
  const dirtyRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = (patch: Partial<Creation>) => {
    setC((cur) => ({ ...cur, ...patch }));
    dirtyRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flushSave, 1200);
  };
  const flushSave = React.useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveState("saving");
    try {
      await fetch(`/api/creations/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: c.title, description: c.description, script: c.script, notes: c.notes, kind: c.kind,
          ficha_rapida: c.ficha_rapida, mapa_bloques: c.mapa_bloques,
        }),
      });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      setSaveState("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, c.title, c.description, c.script, c.notes, c.kind, c.ficha_rapida, c.mapa_bloques]);
  // Forzar save al desmontar
  React.useEffect(() => {
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); flushSave(); } };
  }, [flushSave]);

  // Si veníamos de /creaciones/nueva con idea rellenada, dispara la auto-
  // generación completa (título + descripción + guion) en cuanto se monta el
  // editor. Limpiamos el query param para que no se repita en recargas.
  React.useEffect(() => {
    if (autogenFiredRef.current) return;
    if (searchParams.get("autogen") !== "1") return;
    autogenFiredRef.current = true;
    callAI("auto-generate-all").finally(() => {
      router.replace(`/creaciones/${c.id}`, { scroll: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Genera (si hace falta) y abre el modo Prompter. */
  async function openPrompter({ regenerate = false }: { regenerate?: boolean } = {}) {
    if (!c.script.trim()) {
      setAiError("Genera o escribe el guion antes del modo Prompter.");
      return;
    }
    if (!regenerate && c.prompter_script && c.prompter_script.trim().length > 100) {
      setPrompterOpen(true);
      return;
    }
    setPrompterBusy(true);
    setAiBusy("prompter");
    setAiError(null);
    try {
      await flushSave();
      const res = await fetch(`/api/creations/${c.id}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prompter" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error generando prompter");
      if (data.creation) setC(data.creation);
      setPrompterOpen(true);
    } catch (err) {
      setAiError((err as Error).message);
    } finally {
      setPrompterBusy(false);
      setAiBusy(null);
    }
  }

  async function callAI(action: "titles" | "description" | "cowriter" | "draft-full-script" | "auto-generate-all", prompt?: string) {
    setAiBusy(action);
    setAiError(null);
    try {
      // Antes de llamar IA, asegurar que lo último escrito está guardado
      await flushSave();
      const res = await fetch(`/api/creations/${c.id}/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error desconocido");
      if (action === "titles") setTitleSuggestions(data.titles);
      if (action === "description") update({ description: data.description });
      if (action === "cowriter" && data.creation) setC(data.creation);
      if (action === "draft-full-script" && data.creation) setC(data.creation);
      if (action === "auto-generate-all" && data.creation) setC(data.creation);
    } catch (err) {
      setAiError((err as Error).message);
    } finally {
      setAiBusy(null);
    }
  }

  async function generateFullDraft() {
    if (!c.title.trim() && !c.description.trim()) {
      setAiError("Necesito al menos un título o descripción para generar el guion base.");
      return;
    }
    if (c.script.trim().length > 0) {
      const ok = confirm("Esto SOBRESCRIBIRÁ el guion actual. ¿Continuar?");
      if (!ok) return;
    }
    callAI("draft-full-script");
  }

  const wordCount = c.script ? c.script.trim().split(/\s+/).filter(Boolean).length : 0;
  const minutesScript = wordCount / 150;
  const dur = CREATION_DURATIONS[c.kind];
  const inRange = minutesScript >= dur.minMin && minutesScript <= dur.maxMin;

  return (
    <div className="flex flex-col gap-6">
      {prompterOpen && (
        <PrompterOverlay
          text={c.prompter_script || c.script}
          title={c.title}
          regenerating={prompterBusy}
          onRegenerate={async () => { await openPrompter({ regenerate: true }); }}
          onClose={() => setPrompterOpen(false)}
        />
      )}
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Link href="/creaciones" className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-bg-hover hover:text-fg">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Creación</div>
            <div className="text-sm font-medium text-fg">
              {c.title || <span className="italic text-fg-subtle">Sin título</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SaveIndicator state={saveState} />
          <select
            value={c.kind}
            onChange={(e) => update({ kind: e.target.value as CreationKind })}
            className="rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-xs font-medium text-fg outline-none focus:border-accent"
          >
            {(Object.keys(CREATION_KIND_LABELS) as CreationKind[]).map((k) => (
              <option key={k} value={k}>{CREATION_KIND_LABELS[k]}</option>
            ))}
          </select>
          <button
            onClick={() => fetch(`/api/creations/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: c.pinned ? 0 : 1 }) }).then(() => setC((x) => ({ ...x, pinned: x.pinned ? 0 : 1 })))}
            title={c.pinned ? "Desfijar" : "Fijar"}
            className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-bg-hover hover:text-fg"
          >
            <Pin className={cn("size-4", c.pinned && "fill-accent text-accent")} />
          </button>
          <a
            href={`/api/creations/${c.id}/export-pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3 h-9 text-sm font-medium text-accent-fg hover:bg-accent-hover"
          >
            <FileDown className="size-4" />
            Exportar PDF
          </a>
          <button
            onClick={async () => {
              if (!confirm("¿Borrar esta creación?")) return;
              await fetch(`/api/creations/${c.id}`, { method: "DELETE" });
              router.push("/creaciones");
            }}
            title="Borrar"
            className="grid size-9 place-items-center rounded-md text-fg-muted hover:bg-danger/20 hover:text-danger"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {/* PREVIEW ESTILO YOUTUBE */}
      <YouTubePreview
        thumbnailPath={c.thumbnail_path}
        title={c.title}
        description={c.description}
        createdAt={c.created_at}
        youtubeUrl={c.youtube_url || ""}
        onUpload={async (file) => {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch(`/api/creations/${c.id}/thumbnail`, { method: "POST", body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Error subiendo");
          if (data.creation) setC(data.creation);
        }}
        onRemove={async () => {
          const res = await fetch(`/api/creations/${c.id}/thumbnail`, { method: "DELETE" });
          const data = await res.json();
          if (data.creation) setC(data.creation);
        }}
        onChangeYoutubeUrl={async (url) => {
          const res = await fetch(`/api/creations/${c.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ youtube_url: url }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Error guardando link");
          if (data.creation) setC(data.creation);
        }}
      />

      {aiError && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          <AlertCircle className="mr-1 inline size-3.5" />
          {aiError}
        </div>
      )}

      {aiBusy === "auto-generate-all" && (
        <div className="flex items-start gap-3 rounded-md border border-accent/40 bg-accent/[0.06] px-4 py-3">
          <Loader2 className="size-5 shrink-0 animate-spin text-accent" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-fg">Generando creación completa…</div>
            <div className="mt-0.5 text-xs text-fg-muted leading-relaxed">
              Claude está leyendo tu idea + las transcripciones de Nate, Adrián, JuanPe y Alejavi para
              producir título, descripción y guion estructurado de la duración objetivo. Tarda 1-3 minutos.
              No cierres esta pestaña.
            </div>
          </div>
        </div>
      )}

      {/* TÍTULO */}
      <Section
        label="Título"
        helper={`Tipo: ${CREATION_KIND_LABELS[c.kind]} · Duración objetivo ${dur.label}`}
        actions={
          <button
            onClick={() => callAI("titles")}
            disabled={aiBusy !== null}
            className="inline-flex items-center gap-1.5 rounded border border-border-strong bg-bg-elevated px-2.5 h-8 text-xs font-medium text-fg hover:bg-bg-hover disabled:opacity-50"
          >
            {aiBusy === "titles" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-accent" />}
            Sugerir títulos
          </button>
        }
      >
        <input
          type="text"
          value={c.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Escribe el título o usa Sugerir títulos para que la IA proponga 5 al estilo de tus referentes…"
          className="w-full rounded-md border border-border bg-bg-elevated px-4 py-3 text-lg font-medium text-fg outline-none focus:border-accent"
          maxLength={120}
        />
        {titleSuggestions && titleSuggestions.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Sugerencias IA</div>
            {titleSuggestions.map((t, i) => (
              <button
                key={i}
                onClick={() => { update({ title: t }); setTitleSuggestions(null); }}
                className="group flex items-center justify-between gap-2 rounded-md border border-border bg-bg-elevated px-3 py-2 text-left text-sm text-fg-muted hover:border-accent/40 hover:bg-accent/5 hover:text-fg"
              >
                <span className="line-clamp-1">{t}</span>
                <Copy className="size-3.5 shrink-0 text-fg-subtle group-hover:text-accent" />
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* DESCRIPCIÓN */}
      <Section
        label="Descripción del vídeo"
        helper="Lo que pondrías en YouTube. Engancha en los primeros 150 chars y cierra con CTA."
        actions={
          <button
            onClick={() => callAI("description")}
            disabled={aiBusy !== null}
            className="inline-flex items-center gap-1.5 rounded border border-border-strong bg-bg-elevated px-2.5 h-8 text-xs font-medium text-fg hover:bg-bg-hover disabled:opacity-50"
          >
            {aiBusy === "description" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-accent" />}
            Sugerir descripción
          </button>
        }
      >
        <textarea
          value={c.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Sinopsis del vídeo, ángulo principal, CTA…"
          rows={6}
          className="w-full rounded-md border border-border bg-bg-elevated px-4 py-3 text-sm leading-relaxed text-fg outline-none focus:border-accent resize-y"
        />
      </Section>

      {/* FICHA RÁPIDA */}
      <Section
        label="Ficha rápida"
        helper="Datos clave del vídeo en una hojeada: título, duración, gancho, promesa, palabra-clave CTA, stack que aparece."
        icon={<ClipboardList className="size-3.5 text-accent" />}
      >
        <FichaRapidaField
          value={c.ficha_rapida}
          onChange={(v) => update({ ficha_rapida: v })}
        />
      </Section>

      {/* MAPA DE BLOQUES */}
      <Section
        label="Mapa de bloques"
        helper="Estructura visual del vídeo: parte, bloque, minutos aprox y loop que deja abierto al cerrar."
        icon={<Map className="size-3.5 text-accent" />}
      >
        <MapaBloquesField
          value={c.mapa_bloques}
          onChange={(v) => update({ mapa_bloques: v })}
        />
      </Section>

      {/* GUION */}
      <Section
        label="Guion"
        helper={
          <span>
            <span className="font-medium text-fg-muted">{wordCount.toLocaleString("es-ES")}</span> palabras ·{" "}
            <span className={cn("font-medium", inRange ? "text-accent" : minutesScript > 0 ? "text-amber-400" : "text-fg-muted")}>
              ~{minutesScript.toFixed(1)} min
            </span>
            <span className="text-fg-subtle"> de objetivo {dur.label}</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-1.5">
            {c.script.trim().length > 0 && (
              <div className="inline-flex h-8 items-center gap-0.5 rounded border border-border bg-bg-elevated p-0.5">
                <button
                  onClick={() => setScriptView("preview")}
                  title="Vista renderizada (Markdown)"
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-medium transition-colors",
                    scriptView === "preview"
                      ? "bg-accent/15 text-accent"
                      : "text-fg-muted hover:text-fg",
                  )}
                >
                  <Eye className="size-3.5" />
                  Vista
                </button>
                <button
                  onClick={() => setScriptView("edit")}
                  title="Edición Markdown crudo"
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-medium transition-colors",
                    scriptView === "edit"
                      ? "bg-accent/15 text-accent"
                      : "text-fg-muted hover:text-fg",
                  )}
                >
                  <Pencil className="size-3.5" />
                  Editar
                </button>
              </div>
            )}
            {c.script.trim().length > 0 && (
              <div className="inline-flex h-8 items-stretch overflow-hidden rounded border border-emerald-400/40 bg-emerald-400/10 text-emerald-300">
                <button
                  onClick={() => openPrompter()}
                  disabled={aiBusy !== null}
                  title={c.prompter_script ? "Abrir prompter" : "Generar versión prompter del guion y abrirlo"}
                  className="inline-flex items-center gap-1.5 px-2.5 text-xs font-medium hover:bg-emerald-400/20 disabled:opacity-50"
                >
                  {prompterBusy && aiBusy === "prompter" ? <Loader2 className="size-3.5 animate-spin" /> : <Tv2 className="size-3.5" />}
                  {prompterBusy && aiBusy === "prompter" ? "Generando prompter…" : c.prompter_script ? "Abrir prompter" : "Modo prompter"}
                </button>
                {c.prompter_script.trim().length > 0 && (
                  <button
                    onClick={() => openPrompter({ regenerate: true })}
                    disabled={aiBusy !== null}
                    title="Regenerar prompter desde el guion actual"
                    className="grid w-8 place-items-center border-l border-emerald-400/30 hover:bg-emerald-400/20 disabled:opacity-50"
                  >
                    <RefreshCw className={cn("size-3.5", prompterBusy && "animate-spin")} />
                  </button>
                )}
              </div>
            )}
            <button
              onClick={generateFullDraft}
              disabled={aiBusy !== null}
              title="Genera un guion base completo de la duración objetivo, replicando el estilo de los referentes"
              className="inline-flex items-center gap-1.5 rounded border border-accent/40 bg-accent/10 px-2.5 h-8 text-xs font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
            >
              {aiBusy === "draft-full-script" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {aiBusy === "draft-full-script" ? "Generando guion completo (1-3 min)…" : "Generar guion base completo"}
            </button>
          </div>
        }
      >
        {scriptView === "preview" && c.script.trim().length > 0 ? (
          <div
            onDoubleClick={() => setScriptView("edit")}
            title="Doble click para editar"
            className="min-h-[480px] w-full cursor-default rounded-md border border-border bg-bg-elevated px-6 py-6"
          >
            <ScriptRenderer text={c.script} mediaMap={getMediaMapForCreation(c.id)} />
          </div>
        ) : (
          <textarea
            value={c.script}
            onChange={(e) => update({ script: e.target.value })}
            placeholder="Empieza a escribir el guion o usa el cowriter para que la IA continue donde necesites…"
            rows={20}
            className="w-full rounded-md border border-border bg-bg-elevated px-4 py-3 font-serif text-[15px] leading-7 text-fg outline-none focus:border-accent resize-y"
            spellCheck
          />
        )}

        {/* COWRITER */}
        <div className="mt-4 rounded-md border border-accent/30 bg-accent/[0.04] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-fg">
            <Wand2 className="size-3.5 text-accent" />
            Cowriter — continuar guion con pauta
          </div>
          <textarea
            value={cowriterPrompt}
            onChange={(e) => setCowriterPrompt(e.target.value)}
            placeholder='Ej: "Ahora explica con calma qué es Claude Code y cómo se diferencia de Cursor, en 3 párrafos. Da un ejemplo concreto de un workflow real."'
            rows={3}
            className="w-full rounded border border-border bg-bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-accent resize-y"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] text-fg-subtle">
              <Lightbulb className="size-3" />
              La IA sigue tu pauta + el estilo de Nate Gentile, Adrián Sáenz, JuanPe Navarro y Alejavi Rivera.
            </div>
            <button
              onClick={() => { if (cowriterPrompt.trim()) { callAI("cowriter", cowriterPrompt.trim()); setCowriterPrompt(""); } }}
              disabled={aiBusy !== null || !cowriterPrompt.trim()}
              className="inline-flex items-center gap-1.5 rounded bg-accent px-3 h-8 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              {aiBusy === "cowriter" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              Continuar guion
            </button>
          </div>
        </div>
      </Section>

      {/* NOTAS */}
      <Section label="Notas" helper="Apuntes para ti, no se usan en el PDF si lo prefieres limpio.">
        <textarea
          value={c.notes}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder="Referencias, ideas sueltas, links útiles…"
          rows={4}
          className="w-full rounded-md border border-border bg-bg-elevated px-4 py-3 text-sm leading-relaxed text-fg outline-none focus:border-accent resize-y"
        />
      </Section>

      <div className="rounded-md bg-bg-elevated/50 p-3 text-[11px] leading-relaxed text-fg-subtle">
        <strong className="text-fg-muted">Tipo seleccionado:</strong> {CREATION_KIND_DESCRIPTIONS[c.kind]}
      </div>
    </div>
  );
}

function Section({ label, helper, actions, icon, children }: { label: string; helper?: React.ReactNode; actions?: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            {icon}
            {label}
          </h2>
          {helper && <p className="mt-0.5 text-xs text-fg-subtle">{helper}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* ───────────────────────── FICHA RÁPIDA ─────────────────────────
 * Parsea texto "Campo: valor" línea a línea y muestra tarjetas con
 * icono y color por campo conocido. Toggle a textarea para editar. */

type FichaField = {
  key: string;
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "accent" | "info" | "warn" | "success" | "danger" | "neutral";
  big?: boolean; // ocupa columna completa
};

const FICHA_META: Record<string, { label: string; icon: React.ReactNode; tone: FichaField["tone"]; big?: boolean }> = {
  titulo:      { label: "Título",          icon: <Type className="size-3.5" />,          tone: "accent",  big: true },
  duracion:    { label: "Duración",        icon: <Clock className="size-3.5" />,         tone: "info" },
  gancho:      { label: "Gancho central",  icon: <Target className="size-3.5" />,        tone: "warn",    big: true },
  promesa:     { label: "Promesa",         icon: <Megaphone className="size-3.5" />,     tone: "success", big: true },
  cta:         { label: "Palabra-clave CTA", icon: <MessageSquare className="size-3.5" />, tone: "danger" },
  "cta-palabra": { label: "Palabra-clave CTA", icon: <MessageSquare className="size-3.5" />, tone: "danger" },
  stack:       { label: "Stack",           icon: <Code2 className="size-3.5" />,         tone: "neutral", big: true },
};

const TONE_STYLES: Record<FichaField["tone"], string> = {
  accent:  "border-accent/30 bg-accent/[0.06] text-accent",
  info:    "border-sky-400/30 bg-sky-400/[0.06] text-sky-300",
  warn:    "border-amber-400/30 bg-amber-400/[0.06] text-amber-300",
  success: "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-300",
  danger:  "border-rose-400/30 bg-rose-400/[0.06] text-rose-300",
  neutral: "border-border bg-bg-elevated text-fg-muted",
};

function normalizeFichaKey(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // sin tildes
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function parseFicha(value: string): FichaField[] {
  const lines = value.split(/\r?\n/);
  const out: FichaField[] = [];
  let current: FichaField | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (current) { out.push(current); current = null; }
      continue;
    }
    const m = line.match(/^([\wáéíóúüñÁÉÍÓÚÜÑ\s/-]+?):\s*(.*)$/);
    if (m) {
      if (current) out.push(current);
      const key = normalizeFichaKey(m[1]);
      const meta = FICHA_META[key] ?? { label: m[1].trim(), icon: <Hash className="size-3.5" />, tone: "neutral" as const };
      current = { key, label: meta.label, value: m[2].trim(), icon: meta.icon, tone: meta.tone, big: meta.big };
    } else if (current) {
      // línea de continuación
      current.value = current.value ? `${current.value} ${line}` : line;
    }
  }
  if (current) out.push(current);
  return out;
}

function FichaRapidaField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [mode, setMode] = React.useState<"view" | "edit">(value.trim() ? "view" : "edit");
  const hasContent = value.trim().length > 0;
  const fields = React.useMemo(() => parseFicha(value), [value]);

  return (
    <div className="flex flex-col gap-2">
      {hasContent && (
        <ModeToggle mode={mode} onChange={setMode} />
      )}
      {mode === "view" && hasContent ? (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 cursor-pointer"
          onDoubleClick={() => setMode("edit")}
          title="Doble click para editar en texto"
        >
          {fields.map((f, i) => (
            <div
              key={`${f.key}-${i}`}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3.5 transition-colors hover:brightness-110",
                TONE_STYLES[f.tone],
                f.big && "sm:col-span-2",
              )}
            >
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-80">
                {f.icon}
                <span>{f.label}</span>
              </div>
              <div className="text-sm font-medium leading-snug text-fg">
                {f.value || <span className="italic opacity-60">—</span>}
              </div>
            </div>
          ))}
          {fields.length === 0 && (
            <div className="col-span-full rounded-md border border-dashed border-border bg-bg-elevated p-4 text-center text-xs text-fg-subtle">
              Aún no hay campos. Cambia a Editar y escribe líneas estilo <code>Campo: valor</code>.
            </div>
          )}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Título: ...\nDuración: ~19 min\nGancho: ...\nPromesa: ...\nCTA-palabra: ...\nStack: ...`}
          rows={8}
          className="w-full rounded-md border border-border bg-bg-elevated px-4 py-3 font-mono text-[13px] leading-relaxed text-fg outline-none focus:border-accent resize-y"
          spellCheck={false}
        />
      )}
    </div>
  );
}

/* ───────────────────────── MAPA DE BLOQUES ─────────────────────────
 * Parsea tabla Markdown estilo:
 *   | Parte | Bloque | Min | Loop |
 *   |---|---|---|---|
 *   | 🟣 HOOK | El gancho | 0:00 – 1:30 | "..." |
 * y muestra fila por fila con pill colorido por parte. */

type BloqueRow = {
  parte: string;
  parteColor: "purple" | "green" | "red" | "neutral";
  bloque: string;
  minutos: string;
  loop?: string;
};

function classifyParte(raw: string): BloqueRow["parteColor"] {
  const t = raw.toLowerCase();
  if (t.includes("🟣") || t.includes("hook")) return "purple";
  if (t.includes("🟢") || t.includes("asunto") || t.includes("desarrollo")) return "green";
  if (t.includes("🔴") || t.includes("cta") || t.includes("cierre")) return "red";
  return "neutral";
}

const PARTE_PILL_STYLES: Record<BloqueRow["parteColor"], string> = {
  purple:  "border-purple-400/40 bg-purple-400/15 text-purple-200",
  green:   "border-emerald-400/40 bg-emerald-400/15 text-emerald-200",
  red:     "border-rose-400/40 bg-rose-400/15 text-rose-200",
  neutral: "border-border bg-bg-elevated text-fg-muted",
};

function parseMapaBloques(value: string): BloqueRow[] {
  const rows: BloqueRow[] = [];
  for (const raw of value.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    // Salta cabeceras/separadores
    if (/^\|\s*-+\s*\|/.test(line)) continue;
    const cells = line.split("|").map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 2) continue;
    // Detección heurística: ¿es la fila de cabecera?
    const lower = cells.map((c) => c.toLowerCase());
    if (lower.some((c) => c === "parte" || c === "bloque" || c.includes("min "))) continue;

    const [parte = "", bloque = "", minutos = "", loop] = cells;
    rows.push({
      parte,
      parteColor: classifyParte(parte),
      bloque,
      minutos,
      loop: loop?.replace(/^"|"$/g, "").trim() || undefined,
    });
  }
  return rows;
}

function MapaBloquesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [mode, setMode] = React.useState<"view" | "edit">(value.trim() ? "view" : "edit");
  const hasContent = value.trim().length > 0;
  const rows = React.useMemo(() => parseMapaBloques(value), [value]);

  return (
    <div className="flex flex-col gap-2">
      {hasContent && (
        <ModeToggle mode={mode} onChange={setMode} />
      )}
      {mode === "view" && hasContent ? (
        <div
          className="flex flex-col gap-2 cursor-pointer"
          onDoubleClick={() => setMode("edit")}
          title="Doble click para editar en texto"
        >
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-bg-elevated p-4 text-center text-xs text-fg-subtle">
              No se detectó tabla. Cambia a Editar y pega una tabla Markdown estilo <code>| Parte | Bloque | Min | Loop |</code>.
            </div>
          ) : (
            rows.map((r, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg-elevated p-3 transition-colors hover:border-border-strong"
              >
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider",
                    PARTE_PILL_STYLES[r.parteColor],
                  )}
                >
                  {r.parte}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-fg truncate">{r.bloque}</div>
                  {r.loop && (
                    <div className="mt-0.5 truncate text-[11px] italic text-fg-subtle">
                      loop ↪ {r.loop}
                    </div>
                  )}
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 rounded border border-border bg-bg-card px-2 py-1 font-mono text-[11px] tabular-nums text-fg-muted">
                  <Clock className="size-3" />
                  {r.minutos}
                </span>
              </div>
            ))
          )}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`| Parte | Bloque | Min aprox | Loop al cerrar |\n|---|---|---|---|\n| 🟣 HOOK | El gancho | 0:00 – 1:30 | "la quinta es la más bestia" |\n| 🟢 ASUNTO | 1. ... | 1:30 – 4:30 | ... |`}
          rows={10}
          className="w-full rounded-md border border-border bg-bg-elevated px-4 py-3 font-mono text-[13px] leading-relaxed text-fg outline-none focus:border-accent resize-y"
          spellCheck={false}
        />
      )}
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: "view" | "edit"; onChange: (m: "view" | "edit") => void }) {
  return (
    <div className="flex items-center justify-end">
      <div className="inline-flex h-7 items-center gap-0.5 rounded border border-border bg-bg-elevated p-0.5">
        <button
          onClick={() => onChange("view")}
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded px-2 text-[10px] font-medium transition-colors",
            mode === "view" ? "bg-accent/15 text-accent" : "text-fg-muted hover:text-fg",
          )}
        >
          <Eye className="size-3" />
          Vista
        </button>
        <button
          onClick={() => onChange("edit")}
          className={cn(
            "inline-flex h-5 items-center gap-1 rounded px-2 text-[10px] font-medium transition-colors",
            mode === "edit" ? "bg-accent/15 text-accent" : "text-fg-muted hover:text-fg",
          )}
        >
          <Pencil className="size-3" />
          Editar
        </button>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "saving") return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
      <Loader2 className="size-3.5 animate-spin" />
      Guardando…
    </span>
  );
  if (state === "saved") return (
    <span className="inline-flex items-center gap-1.5 text-xs text-accent">
      <CheckCircle2 className="size-3.5" />
      Guardado
    </span>
  );
  if (state === "error") return (
    <span className="inline-flex items-center gap-1.5 text-xs text-danger">
      <AlertCircle className="size-3.5" />
      Error al guardar
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
      <Save className="size-3.5" />
      Auto-guardado activo
    </span>
  );
}
