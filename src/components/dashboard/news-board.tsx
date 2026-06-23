"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  RefreshCw, Newspaper, ExternalLink, Trash2, Star, Flame, Clock, Languages,
} from "lucide-react";
import type { NewsItem, NewsCategory } from "@/lib/news/types";
import { NEWS_CATEGORY_LABELS, NEWS_CATEGORY_COLORS } from "@/lib/news/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  initialNews: NewsItem[];
}

const IMPORTANCE_BADGE: Record<NewsItem["importance"], string> = {
  alta: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  media: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  baja: "bg-slate-500/10 text-slate-400 border-slate-500/30",
};

export function NewsBoard({ initialNews }: Props) {
  const router = useRouter();
  const [news, setNews] = React.useState<NewsItem[]>(initialNews);
  const [polling, setPolling] = React.useState(false);
  const [translating, setTranslating] = React.useState(false);
  const [pollMessage, setPollMessage] = React.useState<string | null>(null);
  const [filterCategory, setFilterCategory] = React.useState<NewsCategory | "all">("all");
  const [filterSource, setFilterSource] = React.useState<string>("all");
  const [onlyHighImportance, setOnlyHighImportance] = React.useState(false);

  const allSources = React.useMemo(() => {
    const set = new Set<string>();
    for (const n of news) set.add(n.source_name);
    return [...set].sort();
  }, [news]);

  const filtered = news.filter((n) => {
    if (filterCategory !== "all" && n.category !== filterCategory) return false;
    if (filterSource !== "all" && n.source_name !== filterSource) return false;
    if (onlyHighImportance && n.importance !== "alta") return false;
    return true;
  });

  const groups = React.useMemo(() => groupByRecency(filtered), [filtered]);

  async function refetchNews() {
    try {
      const res = await fetch("/api/news");
      const j = await res.json();
      if (Array.isArray(j.news)) setNews(j.news);
    } catch { /* swallow */ }
  }

  async function pollNow() {
    setPolling(true);
    setPollMessage("Rastreando blogs oficiales y medios IA…");
    try {
      const res = await fetch("/api/news/poll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinceHours: 72 }),
      });
      const j = await res.json();
      if (j.error) {
        setPollMessage(`Error: ${j.error}`);
      } else {
        const errs = j.errors?.length ? ` · ${j.errors.length} fuentes con error` : "";
        setPollMessage(`+${j.inserted} noticias · ${j.duplicates} dup · ${j.filtered} filtradas${errs}`);
        await refetchNews();
      }
    } catch (err) {
      setPollMessage(`Error: ${(err as Error).message}`);
    } finally {
      setPolling(false);
      setTimeout(() => setPollMessage(null), 8000);
    }
  }

  async function translateAll() {
    setTranslating(true);
    setPollMessage("Traduciendo histórico al español…");
    try {
      const res = await fetch("/api/news/translate-pending", { method: "POST" });
      const j = await res.json();
      if (j.error) {
        setPollMessage(`Error: ${j.error}`);
      } else {
        setPollMessage(`+${j.translated} traducidas · ${j.alreadySpanish} ya en es · $${(j.cost ?? 0).toFixed(3)}`);
        await refetchNews();
      }
    } catch (err) {
      setPollMessage(`Error: ${(err as Error).message}`);
    } finally {
      setTranslating(false);
      setTimeout(() => setPollMessage(null), 8000);
    }
  }

  async function dismiss(id: string) {
    setNews((cur) => cur.filter((n) => n.id !== id));
    await fetch(`/api/news/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissed: 1 }),
    }).catch(() => {});
  }

  async function promote(id: string) {
    try {
      const res = await fetch(`/api/news/${id}/promote`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.creation) throw new Error(data.error || "Fallo al promover");
      router.push(`/creaciones/${data.creation.id}`);
    } catch (err) {
      alert("No se pudo crear la Creación: " + (err as Error).message);
    }
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as NewsCategory | "all")}
            className="rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
          >
            <option value="all">Todas las categorías ({news.length})</option>
            {(Object.keys(NEWS_CATEGORY_LABELS) as NewsCategory[]).map((k) => {
              const count = news.filter((n) => n.category === k).length;
              if (count === 0) return null;
              return (
                <option key={k} value={k}>{NEWS_CATEGORY_LABELS[k]} ({count})</option>
              );
            })}
          </select>
          {allSources.length > 0 && (
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-xs text-fg outline-none focus:border-accent"
            >
              <option value="all">Todas las fuentes</option>
              {allSources.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setOnlyHighImportance((s) => !s)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs transition-colors",
              onlyHighImportance
                ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                : "border-border bg-bg-elevated text-fg-muted hover:text-fg",
            )}
          >
            <Flame className="size-3.5" />
            Solo breaking
          </button>
          {pollMessage && <span className="text-xs text-accent">{pollMessage}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={translateAll}
            disabled={translating || polling}
            size="sm"
            variant="outline"
            title="Traduce el histórico de noticias en inglés al español"
          >
            <Languages className={cn("size-4", translating && "animate-pulse")} />
            {translating ? "Traduciendo…" : "Traducir histórico"}
          </Button>
          <Button onClick={pollNow} disabled={polling || translating} size="sm">
            <RefreshCw className={cn("size-4", polling && "animate-spin")} />
            {polling ? "Rastreando…" : "Buscar noticias ahora"}
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-bg-elevated p-12 text-center">
          <Newspaper className="size-8 text-fg-subtle" />
          <h3 className="text-base font-semibold text-fg">Aún no hay noticias</h3>
          <p className="max-w-md text-sm text-fg-muted">
            Pulsa <strong>“Buscar noticias ahora”</strong> para rastrear los blogs oficiales (OpenAI, Anthropic, DeepMind, Google AI, Meta AI, Mistral, HF, GitHub…) y los medios especializados de IA. Tarda menos de un minuto.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((g) => (
            <section key={g.label} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{g.label}</h3>
                <span className="text-[10px] text-fg-subtle">{g.items.length} {g.items.length === 1 ? "noticia" : "noticias"}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((n) => (
                  <NewsCard
                    key={n.id}
                    item={n}
                    onDismiss={() => dismiss(n.id)}
                    onPromote={() => promote(n.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

interface NewsCardProps {
  item: NewsItem;
  onDismiss: () => void;
  onPromote: () => void;
}

function NewsCard({ item, onDismiss, onPromote }: NewsCardProps) {
  const published = item.published_at ? new Date(item.published_at) : null;
  const ageHours = published ? (Date.now() - published.getTime()) / 3_600_000 : null;
  return (
    <div className={cn(
      "group relative flex flex-col overflow-hidden rounded-lg border bg-bg-card text-left transition-all",
      item.importance === "alta" ? "border-rose-500/30 ring-1 ring-rose-500/10" : "border-border",
    )}>
      {item.thumbnail_url && (
        <div className="aspect-video w-full overflow-hidden bg-bg-elevated">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.thumbnail_url} alt={item.title} loading="lazy" className="size-full object-cover" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", NEWS_CATEGORY_COLORS[item.category])}>
            {NEWS_CATEGORY_LABELS[item.category]}
          </span>
          <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider", IMPORTANCE_BADGE[item.importance])}>
            {item.importance === "alta" && <Flame className="size-3" />}
            {item.importance}
          </span>
          {ageHours !== null && (
            <span className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
              ageHours < 6 ? "bg-emerald-500/10 text-emerald-400" :
              ageHours < 24 ? "bg-sky-500/10 text-sky-400" :
              ageHours < 72 ? "bg-amber-500/10 text-amber-400" : "bg-slate-500/10 text-slate-400",
            )}>
              <Clock className="size-3" />
              {formatAge(ageHours)}
            </span>
          )}
        </div>
        <h3 className="line-clamp-3 text-base font-semibold leading-snug text-fg">{item.title}</h3>
        {item.description && (
          <p className="line-clamp-3 text-xs leading-relaxed text-fg-muted">{item.description}</p>
        )}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            {item.tags.slice(0, 5).map((t) => (
              <span key={t} className="rounded bg-bg-elevated px-1.5 py-0.5 text-fg-muted">{t}</span>
            ))}
            {item.tags.length > 5 && <span className="text-fg-subtle">+{item.tags.length - 5}</span>}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-1 text-[10px] text-fg-subtle">
            <span>{item.source_name}</span>
            {published && (
              <span> · {published.toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-1 border-t border-border bg-bg-elevated/40 px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
        <a
          href={item.source_url}
          target="_blank"
          rel="noreferrer"
          title="Abrir artículo"
          className="grid size-7 place-items-center rounded text-fg-muted hover:bg-bg-hover hover:text-fg"
        >
          <ExternalLink className="size-3.5" />
        </a>
        <button
          onClick={onPromote}
          title="Convertir en Creación"
          className="grid size-7 place-items-center rounded text-fg-muted hover:bg-accent/20 hover:text-accent"
        >
          <Star className="size-3.5" />
        </button>
        <button
          onClick={onDismiss}
          title="Descartar"
          className="grid size-7 place-items-center rounded text-fg-muted hover:bg-danger/20 hover:text-danger"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function formatAge(hours: number): string {
  if (hours < 1) return `hace ${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 24) return `hace ${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

interface Group {
  label: string;
  items: NewsItem[];
}

function groupByRecency(items: NewsItem[]): Group[] {
  const breaking: NewsItem[] = [];
  const today: NewsItem[] = [];
  const yesterday: NewsItem[] = [];
  const thisWeek: NewsItem[] = [];
  const older: NewsItem[] = [];

  const now = Date.now();
  const hour = 3_600_000;

  const sorted = [...items].sort((a, b) => {
    const ta = a.published_at ? new Date(a.published_at).getTime() : new Date(a.fetched_at).getTime();
    const tb = b.published_at ? new Date(b.published_at).getTime() : new Date(b.fetched_at).getTime();
    return tb - ta;
  });

  for (const n of sorted) {
    const ts = n.published_at ? new Date(n.published_at).getTime() : new Date(n.fetched_at).getTime();
    const ageHours = (now - ts) / hour;
    if (ageHours < 6) breaking.push(n);
    else if (ageHours < 24) today.push(n);
    else if (ageHours < 48) yesterday.push(n);
    else if (ageHours < 168) thisWeek.push(n);
    else older.push(n);
  }

  const groups: Group[] = [];
  if (breaking.length) groups.push({ label: "Última hora (≤6h)", items: breaking });
  if (today.length) groups.push({ label: "Hoy", items: today });
  if (yesterday.length) groups.push({ label: "Ayer", items: yesterday });
  if (thisWeek.length) groups.push({ label: "Esta semana", items: thisWeek });
  if (older.length) groups.push({ label: "Más antiguas", items: older });
  return groups;
}
