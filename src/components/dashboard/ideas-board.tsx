"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Pin,
  Star,
  Trash2,
  ExternalLink,
  RefreshCw,
  Newspaper,
  Video as Youtube,
  GripVertical,
  Sparkles,
  Eye,
  ThumbsUp,
  MessageSquare,
  Languages,
} from "lucide-react";
import type { Idea, IdeaEngagement } from "@/lib/ideas/types";
import { Button } from "@/components/ui/button";
import { MarkdownLite } from "@/components/ui/markdown-lite";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface IdeasBoardProps {
  initialIdeas: Idea[];
  sourcesCount: number;
  lastPolledAt: string | null;
}

export function IdeasBoard({ initialIdeas, sourcesCount, lastPolledAt }: IdeasBoardProps) {
  const router = useRouter();
  const [ideas, setIdeas] = React.useState<Idea[]>(initialIdeas);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [polling, setPolling] = React.useState(false);
  const [pollMessage, setPollMessage] = React.useState<string | null>(null);
  // Mount flag para diferir DndContext al cliente y evitar mismatch de
  // aria-describedby (contadores internos de @dnd-kit desincronizados entre
  // SSR y render del cliente).
  const [dndReady, setDndReady] = React.useState(false);
  React.useEffect(() => { setDndReady(true); }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const openIdea = ideas.find((i) => i.id === openId) ?? null;

  // Pinned go first (within their group, order_index decides). Then unpinned.
  const sortedIdeas = React.useMemo(() => {
    return [...ideas].sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned - a.pinned;
      return a.order_index - b.order_index;
    });
  }, [ideas]);

  // Agrupar por fecha (Hoy / Ayer / Esta semana / Anteriores) excepto las
  // pinned, que tienen su propia sección arriba.
  const groupedIdeas = React.useMemo(() => groupByDate(sortedIdeas), [sortedIdeas]);

  async function handleDragEnd(ev: DragEndEvent) {
    const { active, over } = ev;
    if (!over || active.id === over.id) return;
    const oldIdx = sortedIdeas.findIndex((i) => i.id === active.id);
    const newIdx = sortedIdeas.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(sortedIdeas, oldIdx, newIdx);
    // Reasignar order_index según la nueva posición
    const withOrder = next.map((it, i) => ({ ...it, order_index: i }));
    setIdeas(withOrder);
    // Persist en background
    fetch("/api/ideas/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((i) => i.id) }),
    }).catch(() => { /* best-effort */ });
  }

  async function patchIdea(id: string, patch: Partial<Idea>) {
    setIdeas((cur) => cur.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    try {
      await fetch(`/api/ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } catch { /* swallow */ }
  }

  async function promoteToCreation(ideaId: string) {
    try {
      const res = await fetch("/api/creations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_idea_id: ideaId, kind: "actualidad" }),
      });
      const data = await res.json();
      if (!res.ok || !data.creation) throw new Error(data.error || "Fallo al crear");
      router.push(`/creaciones/${data.creation.id}`);
    } catch (err) {
      alert("No se pudo crear la creación: " + (err as Error).message);
    }
  }

  async function dismissIdea(id: string) {
    // Optimistic remove from view
    setIdeas((cur) => cur.filter((i) => i.id !== id));
    if (openId === id) setOpenId(null);
    try {
      await fetch(`/api/ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissed: 1 }),
      });
    } catch { /* swallow */ }
  }

  async function pollNow() {
    setPolling(true);
    setPollMessage("Buscando ideas en todas las fuentes…");
    try {
      const res = await fetch("/api/ideas/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limitPerSource: 3, sinceHours: 24 }),
      });
      const j = await res.json();
      if (j.error) {
        setPollMessage(`Error: ${j.error}`);
      } else {
        setPollMessage(
          `+${j.itemsNew} ideas nuevas (${j.itemsGenerated} con guion · $${(j.costUsd ?? 0).toFixed(3)})`,
        );
        router.refresh();
      }
    } catch (err) {
      setPollMessage(`Error: ${(err as Error).message}`);
    } finally {
      setPolling(false);
      setTimeout(() => setPollMessage(null), 6000);
    }
  }

  const [proposing, setProposing] = React.useState(false);
  const [translating, setTranslating] = React.useState(false);

  async function translateAll() {
    setTranslating(true);
    setPollMessage("Traduciendo histórico al español…");
    try {
      const res = await fetch("/api/ideas/translate-pending", { method: "POST" });
      const j = await res.json();
      if (j.error) {
        setPollMessage(`Error: ${j.error}`);
      } else {
        setPollMessage(`+${j.translated} traducidas · ${j.alreadySpanish} ya en es · $${(j.cost ?? 0).toFixed(3)}`);
        router.refresh();
      }
    } catch (err) {
      setPollMessage(`Error: ${(err as Error).message}`);
    } finally {
      setTranslating(false);
      setTimeout(() => setPollMessage(null), 8000);
    }
  }

  async function proposeNow() {
    setProposing(true);
    setPollMessage("Claude analiza tus ideas y propone temas nuevos…");
    try {
      const res = await fetch("/api/ideas/propose", { method: "POST" });
      const j = await res.json();
      if (j.error) {
        setPollMessage(`Error: ${j.error}`);
      } else {
        setPollMessage(`✨ +${j.inserted} propuestas IA · $${(j.cost ?? 0).toFixed(3)}`);
        router.refresh();
      }
    } catch (err) {
      setPollMessage(`Error: ${(err as Error).message}`);
    } finally {
      setProposing(false);
      setTimeout(() => setPollMessage(null), 8000);
    }
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5 text-xs text-fg-muted">
          <div className="flex items-center gap-2">
            <Sparkles className="size-3.5 text-accent" />
            <span className="font-medium text-fg">{ideas.length} ideas</span>
            <span>·</span>
            <span>{sourcesCount} fuentes activas</span>
          </div>
          <div>
            Último poll: <span className="text-fg">{lastPolledAt ? formatRel(lastPolledAt) : "nunca"}</span>
            {pollMessage && <span className="ml-2 text-accent">{pollMessage}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={translateAll} disabled={translating || polling || proposing} variant="outline" size="sm" title="Traduce al español las ideas en inglés del histórico">
            <Languages className={cn("size-4", translating && "animate-pulse")} />
            {translating ? "Traduciendo…" : "Traducir histórico"}
          </Button>
          <Button onClick={proposeNow} disabled={proposing || polling || translating || ideas.length < 5} variant="outline" size="sm" title={ideas.length < 5 ? "Necesitas al menos 5 ideas en el feed para proponer" : "Claude analiza las 20 últimas ideas y propone 5-8 vídeos nuevos"}>
            <Sparkles className={cn("size-4 text-accent", proposing && "animate-pulse")} />
            {proposing ? "Proponiendo…" : "Proponer ideas"}
          </Button>
          <Button onClick={pollNow} disabled={polling || proposing || translating} size="sm">
            <RefreshCw className={cn("size-4", polling && "animate-spin")} />
            {polling ? "Buscando…" : "Buscar ideas ahora"}
          </Button>
        </div>
      </div>

      {ideas.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-bg-elevated p-12 text-center">
          <Sparkles className="size-8 text-fg-subtle" />
          <h3 className="text-base font-semibold text-fg">Aún no hay ideas</h3>
          <p className="max-w-md text-sm text-fg-muted">
            Pulsa “Buscar ideas ahora” para hacer un primer poll de las {sourcesCount} fuentes configuradas. Tarda 1-3 minutos.
          </p>
        </div>
      ) : (
        (() => {
          const board = (
            <div className="flex flex-col gap-8">
              {groupedIdeas.map((group) => (
                <section key={group.label} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                      {group.label}
                    </h3>
                    <span className="text-[10px] text-fg-subtle">
                      {group.ideas.length} {group.ideas.length === 1 ? "tarjeta" : "tarjetas"}
                    </span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {group.ideas.map((idea) => (
                      <SortableIdeaCard
                        key={idea.id}
                        idea={idea}
                        onOpen={() => setOpenId(idea.id)}
                        onTogglePin={() => patchIdea(idea.id, { pinned: idea.pinned ? 0 : 1 })}
                        onPromote={() => promoteToCreation(idea.id)}
                        onDismiss={() => dismissIdea(idea.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          );
          return dndReady ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sortedIdeas.map((i) => i.id)} strategy={rectSortingStrategy}>
                {board}
              </SortableContext>
            </DndContext>
          ) : (
            board
          );
        })()
      )}

      <Dialog open={!!openIdea} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0">
          {openIdea && (
            <>
              <DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-6">
                <div className="mb-2 flex items-center gap-2 text-[11px]">
                  <SourceBadge idea={openIdea} />
                  <LangBadge language={openIdea.language} />
                  {openIdea.published_at && (
                    <span className="text-fg-subtle">{formatRel(openIdea.published_at)}</span>
                  )}
                </div>
                <DialogTitle className="pr-8 text-lg leading-snug">
                  {openIdea.generated_title ?? openIdea.title}
                </DialogTitle>
                {openIdea.generated_description && (
                  <DialogDescription className="leading-relaxed">
                    {openIdea.generated_description}
                  </DialogDescription>
                )}
              </DialogHeader>

              <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
                {openIdea.engagement && (
                  <div className="flex items-center gap-3 rounded-md border border-border bg-bg-elevated px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">Flujo del original</span>
                    <EngagementChips engagement={openIdea.engagement} />
                  </div>
                )}

                {openIdea.thumbnail_url && (
                  <div className="overflow-hidden rounded-md border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={openIdea.thumbnail_url}
                      alt={openIdea.title}
                      className="aspect-video w-full object-cover"
                    />
                  </div>
                )}

                {openIdea.generated_script ? (
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
                      Guion propuesto
                    </div>
                    <div className="rounded-md border border-border bg-bg-elevated p-4 text-sm leading-relaxed text-fg-muted">
                      <MarkdownLite text={openIdea.generated_script} />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-fg-subtle">
                    No se generó guion para esta idea (probablemente Claude falló al procesarla). Puedes regenerar haciendo otro poll.
                  </p>
                )}

                {openIdea.title !== openIdea.generated_title && openIdea.title && (
                  <details className="text-xs text-fg-subtle">
                    <summary className="cursor-pointer hover:text-fg-muted">Título original</summary>
                    <p className="mt-1.5 text-fg-muted">{openIdea.title}</p>
                  </details>
                )}
              </div>

              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-6 py-4">
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={openIdea.pinned ? "default" : "outline"}
                    onClick={() => patchIdea(openIdea.id, { pinned: openIdea.pinned ? 0 : 1 })}
                  >
                    <Pin className="size-3.5" />
                    {openIdea.pinned ? "Fijada" : "Fijar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => promoteToCreation(openIdea.id)}
                  >
                    <Star className="size-3.5" />
                    Convertir en Creación
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" asChild>
                    <a href={openIdea.source_url} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3.5" />
                      Abrir fuente
                    </a>
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => dismissIdea(openIdea.id)}>
                    <Trash2 className="size-3.5" />
                    Descartar
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface SortableIdeaCardProps {
  idea: Idea;
  onOpen: () => void;
  onTogglePin: () => void;
  onPromote: () => void;
  onDismiss: () => void;
}

function SortableIdeaCard({ idea, onOpen, onTogglePin, onPromote, onDismiss }: SortableIdeaCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: idea.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-bg-card text-left ring-1 transition-all",
        idea.featured ? "border-accent/40 ring-accent/20" : "border-border ring-transparent hover:border-border-strong",
        isDragging && "opacity-50",
      )}
    >
      {/* Drag handle (top-left) */}
      <button
        {...attributes}
        {...listeners}
        className="absolute left-2 top-2 z-10 grid size-6 cursor-grab place-items-center rounded bg-black/40 text-white/70 opacity-0 backdrop-blur-sm transition-opacity hover:text-white group-hover:opacity-100 active:cursor-grabbing"
        aria-label="Reordenar"
      >
        <GripVertical className="size-3.5" />
      </button>

      {/* Action icons (top-right) */}
      <div className="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <IconBtn active={!!idea.pinned} onClick={(e) => { e.stopPropagation(); onTogglePin(); }} title={idea.pinned ? "Desfijar" : "Fijar"}>
          <Pin className="size-3.5" />
        </IconBtn>
        <IconBtn onClick={(e) => { e.stopPropagation(); onPromote(); }} title="Convertir en Creación">
          <Star className="size-3.5" />
        </IconBtn>
        <IconBtn onClick={(e) => { e.stopPropagation(); onDismiss(); }} title="Descartar" danger>
          <Trash2 className="size-3.5" />
        </IconBtn>
      </div>

      {/* Pinned indicator (always visible) */}
      {!!idea.pinned && (
        <div className="absolute left-2 top-2 z-0 grid size-6 place-items-center rounded bg-accent/20 text-accent group-hover:opacity-0">
          <Pin className="size-3 fill-current" />
        </div>
      )}

      <button onClick={onOpen} className="flex flex-1 flex-col text-left">
        <div className="relative aspect-video w-full overflow-hidden bg-bg-elevated">
          {idea.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={idea.thumbnail_url}
              alt={idea.title}
              loading="lazy"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="grid size-full place-items-center text-fg-subtle">
              {idea.source_kind === "youtube" ? <Youtube className="size-10" /> : <Newspaper className="size-10" />}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <div className="flex items-center gap-1.5 text-[10px]">
            <SourceBadge idea={idea} />
            <LangBadge language={idea.language} />
          </div>
          <h3 className="line-clamp-3 text-sm font-semibold leading-snug text-fg">
            {idea.generated_title ?? idea.title}
          </h3>
          {idea.generated_description && (
            <p className="line-clamp-2 text-xs leading-relaxed text-fg-muted">
              {idea.generated_description}
            </p>
          )}
          <div className="mt-auto flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] text-fg-subtle">
              <span className="truncate">{idea.source_name}</span>
              {idea.published_at && <span className="shrink-0">{formatRel(idea.published_at)}</span>}
            </div>
            {idea.engagement && <EngagementChips engagement={idea.engagement} compact />}
          </div>
        </div>
      </button>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  active,
  danger,
  title,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  active?: boolean;
  danger?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "grid size-6 place-items-center rounded bg-black/40 backdrop-blur-sm transition-colors",
        active && !danger && "text-accent",
        !active && !danger && "text-white/70 hover:text-white",
        danger && "text-white/70 hover:bg-danger/40 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function SourceBadge({ idea }: { idea: Idea }) {
  if (idea.source_kind === "ai-meta") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
        <Sparkles className="size-3" />
        Propuesta IA
      </span>
    );
  }
  const Icon = idea.source_kind === "youtube" ? Youtube : Newspaper;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-fg-muted">
      <Icon className="size-3" />
      {idea.source_kind === "youtube" ? "Vídeo" : "Noticia"}
    </span>
  );
}

function LangBadge({ language }: { language: string }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        language === "es"
          ? "bg-accent/10 text-accent"
          : "bg-bg-elevated text-fg-subtle",
      )}
    >
      {language}
    </span>
  );
}

function EngagementChips({ engagement, compact = false }: { engagement: IdeaEngagement; compact?: boolean }) {
  const items: Array<{ icon: React.ReactNode; value: number; label: string }> = [];
  if (typeof engagement.views === "number") items.push({ icon: <Eye className="size-3" />, value: engagement.views, label: "vistas" });
  if (typeof engagement.likes === "number") items.push({ icon: <ThumbsUp className="size-3" />, value: engagement.likes, label: "likes" });
  if (typeof engagement.comments === "number") items.push({ icon: <MessageSquare className="size-3" />, value: engagement.comments, label: "comentarios" });
  if (items.length === 0) return null;
  return (
    <div className={cn("flex items-center gap-2 text-fg-subtle", compact ? "text-[10px]" : "text-xs")}>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-0.5" title={`${it.value.toLocaleString("es-ES")} ${it.label}`}>
          {it.icon}
          <span>{formatCount(it.value)}</span>
        </span>
      ))}
    </div>
  );
}

/** Compact number formatter — 1234 → "1,2k", 1500000 → "1,5M". */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(".", ",")}k`;
  }
  const m = n / 1_000_000;
  return m >= 100 ? `${Math.round(m)}M` : `${m.toFixed(1).replace(".", ",")}M`;
}

interface IdeaGroup {
  label: string;
  ideas: Idea[];
}

/** Agrupa por fecha de publicación (fallback created_at) en buckets:
 *  Fijadas (siempre arriba) → Hoy → Ayer → Esta semana → Anteriores. */
function groupByDate(ideas: Idea[]): IdeaGroup[] {
  const pinned: Idea[] = [];
  const today: Idea[] = [];
  const yesterday: Idea[] = [];
  const thisWeek: Idea[] = [];
  const older: Idea[] = [];

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const nowDay = startOfDay(now);
  const oneDay = 86_400_000;

  for (const idea of ideas) {
    if (idea.pinned) {
      pinned.push(idea);
      continue;
    }
    const ref = idea.published_at ?? idea.created_at;
    if (!ref) {
      older.push(idea);
      continue;
    }
    const ideaDate = new Date(ref);
    if (Number.isNaN(ideaDate.getTime())) {
      older.push(idea);
      continue;
    }
    const ideaDay = startOfDay(ideaDate);
    const diffDays = (nowDay - ideaDay) / oneDay;
    if (diffDays <= 0) today.push(idea);
    else if (diffDays === 1) yesterday.push(idea);
    else if (diffDays < 7) thisWeek.push(idea);
    else older.push(idea);
  }

  const groups: IdeaGroup[] = [];
  if (pinned.length) groups.push({ label: "Fijadas", ideas: pinned });
  if (today.length) groups.push({ label: "Hoy", ideas: today });
  if (yesterday.length) groups.push({ label: "Ayer", ideas: yesterday });
  if (thisWeek.length) groups.push({ label: "Esta semana", ideas: thisWeek });
  if (older.length) groups.push({ label: "Anteriores", ideas: older });
  return groups;
}

/** Cheap relative time formatter — avoids pulling Intl.RelativeTimeFormat across SSR/CSR. */
function formatRel(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
