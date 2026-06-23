"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FolderSearch,
  Library,
  Music as MusicIcon,
  Image as ImageIcon,
  Tag,
  Trash2,
  Plus,
  X,
  Video,
  FolderOpen,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn, formatBytes } from "@/lib/utils";
import type { StockAsset, AssetKind } from "@/lib/types";
import {
  rescanLibraryAction,
  updateAssetTagsAction,
  deleteAssetAction,
} from "@/lib/actions/assets";

export function LibraryView({
  kind,
  assets,
  basePath,
  emptyHint,
}: {
  kind: AssetKind;
  assets: StockAsset[];
  basePath: string;
  emptyHint: string;
}) {
  const router = useRouter();
  const storageKey = `library-filter:${kind}`;
  const [query, setQuery] = React.useState("");
  const [activeTag, setActiveTag] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  // Restore filters from localStorage (after hydration)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { query?: string; activeTag?: string | null };
        if (saved.query) setQuery(saved.query);
        if (saved.activeTag !== undefined) setActiveTag(saved.activeTag);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify({ query, activeTag }));
  }, [query, activeTag, storageKey]);

  const isMusic = kind === "music";
  const isPhoto = kind === "stock_photo";
  const Icon = isMusic ? MusicIcon : isPhoto ? ImageIcon : Video;

  // Player modal state
  const [previewAsset, setPreviewAsset] = React.useState<StockAsset | null>(null);

  const allTags = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assets) for (const t of a.tags) map.set(t, (map.get(t) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [assets]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (activeTag && !a.tags.includes(activeTag)) return false;
      if (!q) return true;
      return (
        a.filename.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [assets, query, activeTag]);

  function rescan() {
    start(async () => {
      const res = await rescanLibraryAction(kind);
      toast.success(`Escaneo completado · ${res.added} añadidos`, {
        description: `${res.total} archivos en ${basePath}`,
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-bg-elevated px-3">
          <FolderSearch className="size-4 text-fg-subtle" />
          <Input
            className="h-9 border-0 bg-transparent p-0 focus-visible:ring-0"
            placeholder={`Buscar por nombre o etiqueta en ${isMusic ? "música" : "stock"}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button onClick={() => setQuery("")}>
              <X className="size-3.5 text-fg-subtle hover:text-fg" />
            </button>
          )}
        </div>
        <Button variant="secondary" onClick={rescan} disabled={pending}>
          <FolderSearch className="size-4" />
          {pending ? "Escaneando…" : "Rescanear carpeta"}
        </Button>
      </div>

      {/* Base path */}
      <div className="flex items-center gap-2 text-xs text-fg-subtle">
        <FolderOpen className="size-3.5" />
        <span className="font-mono">{basePath}</span>
        <span>·</span>
        <span>{assets.length} archivos indexados</span>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
            Etiquetas:
          </span>
          <button
            onClick={() => setActiveTag(null)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
              activeTag === null
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-border bg-bg-elevated text-fg-muted hover:text-fg"
            )}
          >
            Todas ({assets.length})
          </button>
          {allTags.slice(0, 20).map(([tag, count]) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                activeTag === tag
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-border bg-bg-elevated text-fg-muted hover:text-fg"
              )}
            >
              {tag} ({count})
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Library className="size-5" />}
          title={query || activeTag ? "Sin resultados" : "Biblioteca vacía"}
          description={
            query || activeTag
              ? "Ajusta la búsqueda o borra el filtro."
              : emptyHint
          }
          action={
            <Button variant="secondary" onClick={rescan} disabled={pending}>
              <FolderSearch className="size-4" /> Rescanear
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              Icon={Icon}
              onPreview={() => setPreviewAsset(a)}
            />
          ))}
        </div>
      )}

      <AssetPreviewModal
        asset={previewAsset}
        isMusic={isMusic}
        isPhoto={isPhoto}
        onClose={() => setPreviewAsset(null)}
      />
    </div>
  );
}

function AssetPreviewModal({
  asset,
  isMusic,
  isPhoto,
  onClose,
}: {
  asset: StockAsset | null;
  isMusic: boolean;
  isPhoto: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(asset)} onOpenChange={(open) => { if (!open) onClose(); }}>
      {/* Override Radix's default `grid gap-4 p-6` to a simple column so
          the media slot can own its own aspect ratio cleanly. */}
      <DialogContent
        className="w-[min(1100px,94vw)] max-w-none gap-0 overflow-hidden p-0"
      >
        {asset && (
          <>
            {/* Media slot: a 16:9 box anchored to the modal width. The
                actual video is position:absolute filling the slot with
                object-contain so videos of any aspect letterbox cleanly
                inside the black frame — never cropped, never 0×0. */}
            <div
              className="relative w-full overflow-hidden bg-black"
              style={{ aspectRatio: "16 / 9", maxHeight: "70vh" }}
            >
              {isMusic ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/asset-thumb/${asset.id}`}
                    alt=""
                    className="max-h-48 w-full object-contain opacity-80"
                  />
                  <audio
                    key={asset.id}
                    src={`/api/asset/${asset.id}`}
                    controls
                    autoPlay
                    className="w-full max-w-xl"
                  />
                </div>
              ) : isPhoto ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={asset.id}
                  src={`/api/asset/${asset.id}`}
                  alt={asset.filename}
                  className="absolute inset-0 size-full object-contain"
                />
              ) : (
                <video
                  key={asset.id}
                  src={`/api/asset/${asset.id}`}
                  controls
                  autoPlay
                  playsInline
                  preload="auto"
                  className="absolute inset-0 size-full object-contain"
                />
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-t border-border px-5 py-4">
              <DialogTitle className="truncate text-sm font-semibold text-fg">
                {asset.filename}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-subtle">
                <span className="font-mono">{formatBytes(asset.size_bytes)}</span>
                {asset.duration_sec ? (
                  <span className="font-mono">{Math.round(asset.duration_sec)}s</span>
                ) : null}
                {asset.width && asset.height ? (
                  <span className="font-mono">{asset.width}×{asset.height}</span>
                ) : null}
                <span className="truncate font-mono">{asset.path}</span>
              </DialogDescription>
              {asset.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {asset.tags.slice(0, 10).map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AssetCard({
  asset,
  Icon,
  onPreview,
}: {
  asset: StockAsset;
  Icon: typeof Video;
  onPreview: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [tags, setTags] = React.useState<string[]>(asset.tags);
  const [newTag, setNewTag] = React.useState("");
  const [pending, start] = React.useTransition();
  const [thumbFailed, setThumbFailed] = React.useState(false);

  function addTag() {
    const t = newTag.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setNewTag("");
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  function save() {
    start(async () => {
      await updateAssetTagsAction(asset.id, tags);
      toast.success("Etiquetas actualizadas");
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("¿Eliminar del índice? El archivo en disco no se borra.")) return;
    start(async () => {
      await deleteAssetAction(asset.id);
      toast.success("Eliminado del índice");
      router.refresh();
    });
  }

  return (
    <Card className="group overflow-hidden transition-colors hover:border-border-strong">
      <button
        type="button"
        onClick={onPreview}
        className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-bg-elevated text-left"
        title="Reproducir"
      >
        {thumbFailed ? (
          <Icon className="size-10 text-fg-subtle transition-colors group-hover:text-fg-muted" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/asset-thumb/${asset.id}`}
            alt={asset.filename}
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
        )}
        {/* Play overlay */}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground ring-2 ring-white/40">
            <Play className="size-5 translate-x-[1px] fill-current" />
          </span>
        </span>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 py-2 text-[11px] text-white/85">
          <span className="font-mono">{formatBytes(asset.size_bytes)}</span>
          <span>{asset.duration_sec ? `${Math.round(asset.duration_sec)}s` : "—"}</span>
        </div>
      </button>
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="truncate text-sm font-medium text-fg" title={asset.filename}>
          {asset.filename}
        </div>

        {editing ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => (
                <Badge key={t} variant="accent" className="gap-1">
                  {t}
                  <button onClick={() => removeTag(t)}>
                    <X className="size-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-1">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="añadir etiqueta…"
                className="h-7 text-xs"
              />
              <Button size="sm" variant="ghost" onClick={addTag}>
                <Plus className="size-3" />
              </Button>
            </div>
            <div className="flex gap-1">
              <Button size="sm" onClick={save} disabled={pending} className="flex-1">
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setTags(asset.tags); }}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <span className="text-xs text-fg-subtle">Sin etiquetas</span>
              ) : (
                tags.map((t) => <Badge key={t}>{t}</Badge>)
              )}
            </div>
            <div className="flex gap-1 pt-1">
              <Button size="sm" variant="ghost" className="flex-1" onClick={() => setEditing(true)}>
                <Tag className="size-3" /> Etiquetas
              </Button>
              <Button size="sm" variant="ghost" onClick={remove} disabled={pending}>
                <Trash2 className="size-3 text-danger" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
