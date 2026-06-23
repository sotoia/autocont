"use client";
/**
 * Preview "YouTube" para una creación: dropzone de miniatura arriba,
 * y cuando hay mini se renderiza estilo página de vídeo de YouTube
 * (título grande, fila de canal, acciones, card con vistas + descripción).
 *
 * Es solo VISUAL — los botones de Like/Compartir/etc. son decorativos.
 */
import * as React from "react";
import {
  Upload, ImagePlus, Trash2, Loader2, ThumbsUp, ThumbsDown, Share2,
  Bookmark, Download, MoreHorizontal, Bell, BadgeCheck, Play, Link2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  thumbnailPath: string;
  title: string;
  description: string;
  createdAt: string;
  channelName?: string;
  subscribers?: string;
  fakeViews?: string;
  /** URL del vídeo de YouTube ya subido. Si está presente se muestra un
   *  botón Play sobre la mini que abre un iframe embebido para verlo. */
  youtubeUrl?: string;
  onUpload: (file: File) => Promise<void>;
  onRemove: () => Promise<void>;
  /** Guarda el nuevo URL (o vacío para quitarlo). Lo invoca tanto cuando
   *  el usuario pega un link como cuando lo borra. */
  onChangeYoutubeUrl?: (url: string) => Promise<void>;
}

/** Extrae el video ID de una URL de YouTube en cualquiera de sus formatos:
 *  - https://youtu.be/<id>
 *  - https://www.youtube.com/watch?v=<id>
 *  - https://youtube.com/shorts/<id>
 *  - https://www.youtube.com/embed/<id>
 *  Devuelve null si no es un URL de YouTube válido. */
function parseYoutubeId(url: string): string | null {
  if (!url) return null;
  const s = url.trim();
  // youtu.be/<id>
  let m = s.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];
  // youtube.com/watch?v=<id>
  m = s.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];
  // shorts/<id> o embed/<id>
  m = s.match(/youtube\.com\/(?:shorts|embed)\/([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];
  return null;
}

const CHANNEL_DEFAULT = "Tu canal";
const SUBSCRIBERS_DEFAULT = "—";
const VIEWS_DEFAULT = "0";
const LIKE_FAKE = "—";

export function YouTubePreview({
  thumbnailPath,
  title,
  description,
  createdAt,
  channelName = CHANNEL_DEFAULT,
  subscribers = SUBSCRIBERS_DEFAULT,
  fakeViews = VIEWS_DEFAULT,
  youtubeUrl = "",
  onUpload,
  onRemove,
  onChangeYoutubeUrl,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [descExpanded, setDescExpanded] = React.useState(false);
  // Estado del input de URL (controlado localmente; se sincroniza al hacer
  // blur o pulsar Enter para no spamear al backend en cada tecla)
  const [ytInput, setYtInput] = React.useState(youtubeUrl);
  React.useEffect(() => { setYtInput(youtubeUrl); }, [youtubeUrl]);
  // Cuando hay URL válido y el usuario pulsa Play, embebemos el iframe.
  const [playing, setPlaying] = React.useState(false);
  const youtubeId = parseYoutubeId(youtubeUrl);
  const hasValidYoutube = Boolean(youtubeId);

  async function saveYoutubeUrl(value: string) {
    if (!onChangeYoutubeUrl) return;
    const v = value.trim();
    if (v === youtubeUrl.trim()) return;
    try { await onChangeYoutubeUrl(v); }
    catch (e) { setError((e as Error).message || "Error guardando URL"); }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setError("Solo imágenes");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await onUpload(file);
    } catch (e) {
      setError((e as Error).message || "Error subiendo la miniatura");
    } finally {
      setUploading(false);
    }
  }

  const hasMini = Boolean(thumbnailPath);
  const channelInitial = channelName.trim().charAt(0).toUpperCase() || "S";
  const relativeWhen = formatRelative(createdAt);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-bg-card">
      {/* MINIATURA / DROPZONE */}
      <div
        className={cn(
          "relative aspect-video w-full bg-black/40 transition-colors",
          !hasMini && "border-b border-border",
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        {playing && hasValidYoutube ? (
          // Player embebido — autoplay para que arranque tras hacer click
          <iframe
            className="absolute inset-0 size-full"
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : hasMini ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailPath}
            alt={title}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-3 transition-colors",
              dragOver
                ? "bg-accent/10 border-2 border-dashed border-accent"
                : "border-2 border-dashed border-border-strong hover:border-accent/50 hover:bg-accent/[0.04]",
            )}
          >
            <div className="grid size-14 place-items-center rounded-full bg-accent/15 text-accent">
              {uploading ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-fg">
                {uploading ? "Subiendo…" : dragOver ? "Suelta la imagen" : "Sube la miniatura"}
              </div>
              <div className="mt-0.5 text-xs text-fg-subtle">
                Arrastra una imagen o haz click · 16:9 recomendado · JPG · PNG · WEBP · max 8 MB
              </div>
            </div>
          </button>
        )}

        {/* Botón Play grande centrado — solo si hay URL y aún no se reproduce */}
        {hasValidYoutube && !playing && hasMini && (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="absolute inset-0 grid place-items-center group"
            title="Reproducir vídeo"
          >
            <div className="grid h-16 w-24 place-items-center rounded-xl bg-red-600 text-white shadow-2xl transition-all group-hover:scale-110 group-hover:bg-red-500">
              <Play className="size-8 fill-white" />
            </div>
          </button>
        )}

        {/* Acciones flotantes sobre la mini */}
        {hasMini && !playing && (
          <div className="absolute right-3 top-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-md bg-black/55 px-2.5 h-8 text-xs font-medium text-white backdrop-blur hover:bg-black/75 disabled:opacity-50"
              title="Cambiar miniatura"
            >
              {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              Cambiar
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!confirm("¿Quitar la miniatura?")) return;
                setUploading(true);
                try { await onRemove(); } finally { setUploading(false); }
              }}
              disabled={uploading}
              className="grid size-8 place-items-center rounded-md bg-black/55 text-white backdrop-blur hover:bg-rose-500/80 disabled:opacity-50"
              title="Eliminar miniatura"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
        {/* Botón Pausar (cierra el player y vuelve a mostrar la mini) */}
        {playing && (
          <button
            type="button"
            onClick={() => setPlaying(false)}
            className="absolute right-3 top-3 grid size-8 place-items-center rounded-md bg-black/55 text-white backdrop-blur hover:bg-black/75"
            title="Cerrar reproductor"
          >
            <X className="size-3.5" />
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && (
        <div className="border-b border-rose-400/30 bg-rose-500/10 px-5 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* CABECERA YOUTUBE */}
      <div className="flex flex-col gap-4 p-5">
        {/* Input para pegar el link del vídeo de YouTube ya subido.
            Cuando se guarda y es válido, aparece el botón Play sobre la mini. */}
        {onChangeYoutubeUrl && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 h-10 focus-within:border-accent">
            <Link2 className={cn("size-4 shrink-0", hasValidYoutube ? "text-red-500" : "text-fg-subtle")} />
            <input
              type="url"
              inputMode="url"
              placeholder="Pega aquí el link de YouTube (youtu.be/… o youtube.com/watch?v=…)"
              value={ytInput}
              onChange={(e) => setYtInput(e.target.value)}
              onBlur={() => saveYoutubeUrl(ytInput)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); }
                if (e.key === "Escape") { setYtInput(youtubeUrl); (e.target as HTMLInputElement).blur(); }
              }}
              className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
            />
            {ytInput && (
              <button
                type="button"
                onClick={() => { setYtInput(""); saveYoutubeUrl(""); setPlaying(false); }}
                className="grid size-6 place-items-center rounded text-fg-subtle hover:bg-bg-hover hover:text-rose-400"
                title="Quitar link"
              >
                <X className="size-3.5" />
              </button>
            )}
            {hasValidYoutube && (
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-400">
                Listo
              </span>
            )}
          </div>
        )}

        <h1 className="text-[22px] font-bold leading-tight text-fg">
          {title || <span className="italic text-fg-subtle">Sin título</span>}
        </h1>

        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Canal */}
          <div className="flex items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent/40 text-base font-bold text-accent-fg">
              {channelInitial}
            </div>
            <div className="flex flex-col leading-tight">
              <div className="flex items-center gap-1 text-sm font-semibold text-fg">
                {channelName}
                <BadgeCheck className="size-3.5 fill-fg-muted text-bg-card" />
              </div>
              <div className="text-[11px] text-fg-subtle">{subscribers} de suscriptores</div>
            </div>
            <button
              type="button"
              className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-fg px-3.5 h-9 text-xs font-semibold text-bg-card hover:bg-fg/90"
            >
              <Bell className="size-3.5" />
              Suscribirse
            </button>
          </div>

          {/* Acciones (decorativas) */}
          <div className="flex items-center gap-1.5">
            <div className="inline-flex h-9 items-stretch overflow-hidden rounded-full bg-bg-elevated">
              <button type="button" className="inline-flex items-center gap-2 pl-3.5 pr-3 text-xs font-medium text-fg hover:bg-bg-hover">
                <ThumbsUp className="size-4" />
                <span className="tabular-nums">{LIKE_FAKE}</span>
              </button>
              <div className="my-2 w-px bg-border" />
              <button type="button" className="grid w-10 place-items-center text-fg hover:bg-bg-hover">
                <ThumbsDown className="size-4" />
              </button>
            </div>
            <ActionPill icon={<Share2 className="size-4" />} label="Compartir" />
            <ActionPill icon={<Bookmark className="size-4" />} label="Guardar" />
            <ActionPill icon={<Download className="size-4" />} label="Descargar" />
            <button type="button" className="grid size-9 place-items-center rounded-full bg-bg-elevated text-fg hover:bg-bg-hover">
              <MoreHorizontal className="size-4" />
            </button>
          </div>
        </div>

        {/* Card descripción + stats */}
        <div className="rounded-xl bg-bg-elevated p-3.5">
          <div className="text-[13px] font-semibold text-fg">
            {fakeViews} visualizaciones · {relativeWhen}
          </div>
          {description ? (
            <>
              <div
                className={cn(
                  "mt-1.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg/90",
                  !descExpanded && "line-clamp-2",
                )}
              >
                {description}
              </div>
              {description.length > 140 && (
                <button
                  type="button"
                  onClick={() => setDescExpanded((x) => !x)}
                  className="mt-1.5 text-[12px] font-semibold text-fg hover:underline"
                >
                  {descExpanded ? "…menos" : "…más"}
                </button>
              )}
            </>
          ) : (
            <div className="mt-1.5 text-[13px] italic text-fg-subtle">
              Sin descripción aún. Edítala más abajo y aparecerá aquí.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-full bg-bg-elevated px-3.5 h-9 text-xs font-medium text-fg hover:bg-bg-hover"
    >
      {icon}
      {label}
    </button>
  );
}

function formatRelative(iso: string): string {
  if (!iso) return "ahora";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "ahora";
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffSec < 60) return "hace unos segundos";
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffH < 24) return `hace ${diffH} h`;
  if (diffD < 7) return `hace ${diffD} ${diffD === 1 ? "día" : "días"}`;
  const diffW = Math.floor(diffD / 7);
  if (diffW < 5) return `hace ${diffW} ${diffW === 1 ? "semana" : "semanas"}`;
  const diffMo = Math.floor(diffD / 30);
  if (diffMo < 12) return `hace ${diffMo} ${diffMo === 1 ? "mes" : "meses"}`;
  const diffY = Math.floor(diffD / 365);
  return `hace ${diffY} ${diffY === 1 ? "año" : "años"}`;
}
