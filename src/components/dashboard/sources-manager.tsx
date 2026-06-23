"use client";
import * as React from "react";
import { Rss, Video, Plus, Trash2, Loader2, ExternalLink, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

/**
 * Sección de Ajustes para que el usuario gestione sus propias fuentes
 * de scrapeo (RSS / YouTube) para Ideas y Noticias. Sustituye los seeds
 * por defecto — la app v0.1 OSS arranca vacía y se llena con lo que el
 * usuario añada aquí.
 */

interface IdeaSource {
  id: string;
  kind: "rss" | "youtube";
  name: string;
  url: string;
  language: "es" | "en";
  enabled: number;
  last_polled_at: string | null;
}

interface NewsSource {
  id: string;
  name: string;
  url: string;
  tier: number;
  default_category: string;
  enabled: number;
  last_polled_at: string | null;
}

export function SourcesManager() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-6">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
            <Rss className="size-3.5" /> Fuentes de scrapeo
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            Define qué blogs RSS y canales de YouTube quieres que AUTOCONT
            rastree para alimentar los tableros de <strong>Ideas</strong> y{" "}
            <strong>Noticias</strong>. La app v0.1 arranca <em>vacía</em>:
            añade aquí solo las fuentes que a ti te interesan.
          </p>
        </div>
        <Separator />

        <IdeasSection />
        <Separator />
        <NewsSection />
      </CardContent>
    </Card>
  );
}

// ─── IDEAS ──────────────────────────────────────────────────────────────
function IdeasSection() {
  const [sources, setSources] = React.useState<IdeaSource[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [draft, setDraft] = React.useState({
    kind: "rss" as "rss" | "youtube",
    name: "",
    url: "",
    language: "es" as "es" | "en",
  });

  React.useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const res = await fetch("/api/sources/ideas");
    const data = await res.json();
    setSources(data.sources ?? []);
  }

  async function add() {
    if (!draft.name.trim() || !draft.url.trim()) {
      toast.error("Nombre y URL son obligatorios");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sources/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error añadiendo");
      toast.success(`Añadido: ${draft.name}`);
      setDraft({ kind: "rss", name: "", url: "", language: "es" });
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    const res = await fetch(`/api/sources/ideas/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Eliminada");
      await refresh();
    } else {
      toast.error("Error eliminando");
    }
  }

  async function toggle(id: string, currentEnabled: number) {
    const res = await fetch(`/api/sources/ideas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: currentEnabled === 1 ? 0 : 1 }),
    });
    if (res.ok) await refresh();
    else toast.error("Error cambiando estado");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-fg">Ideas — RSS y canales YouTube</h3>
        {sources && <span className="text-xs text-fg-subtle">({sources.length})</span>}
      </div>

      {/* Formulario añadir */}
      <div className="grid grid-cols-[120px_1fr_1fr_120px_auto] items-end gap-2 rounded-md border border-border bg-bg-elevated p-3">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-fg-subtle">Tipo</Label>
          <Select
            value={draft.kind}
            onValueChange={(v) => setDraft({ ...draft, kind: v as "rss" | "youtube" })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rss">RSS</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-fg-subtle">Nombre</Label>
          <Input
            placeholder="Mi blog favorito"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-fg-subtle">URL</Label>
          <Input
            placeholder={draft.kind === "rss" ? "https://miblog.com/rss" : "https://youtube.com/@canal"}
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            className="font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-fg-subtle">Idioma</Label>
          <Select
            value={draft.language}
            onValueChange={(v) => setDraft({ ...draft, language: v as "es" | "en" })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="en">Inglés</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={add} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Añadir
        </Button>
      </div>

      {/* Lista */}
      <div className="flex flex-col gap-1.5">
        {sources === null && (
          <div className="flex items-center gap-2 text-xs text-fg-subtle">
            <Loader2 className="size-3 animate-spin" /> Cargando…
          </div>
        )}
        {sources && sources.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-fg-subtle">
            Aún no has añadido ninguna fuente. Usa el formulario de arriba.
          </div>
        )}
        {sources && sources.map((s) => (
          <div
            key={s.id}
            className={`grid grid-cols-[24px_120px_1fr_60px_auto_auto] items-center gap-3 rounded-md border border-border bg-bg-card px-3 py-2 ${s.enabled ? "" : "opacity-50"}`}
          >
            {s.kind === "rss"
              ? <Rss className="size-4 text-fg-subtle" />
              : <Video className="size-4 text-fg-subtle" />}
            <span className="truncate text-sm font-medium text-fg">{s.name}</span>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 truncate font-mono text-[11px] text-fg-subtle hover:text-accent"
            >
              <ExternalLink className="size-3 shrink-0" />
              <span className="truncate">{s.url}</span>
            </a>
            <span className="text-[10px] uppercase text-fg-subtle">{s.language}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggle(s.id, s.enabled)}
              title={s.enabled ? "Desactivar" : "Activar"}
            >
              {s.enabled ? <Power className="size-3.5 text-accent" /> : <PowerOff className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => remove(s.id, s.name)}
              title="Eliminar"
            >
              <Trash2 className="size-3.5 text-rose-400" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── NEWS ───────────────────────────────────────────────────────────────
const NEWS_CATEGORIES = ["openai", "anthropic", "google-ai", "deepmind", "meta-ai", "agents", "github", "open-source", "research", "industry", "other"];

function NewsSection() {
  const [sources, setSources] = React.useState<NewsSource[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [draft, setDraft] = React.useState({
    name: "",
    url: "",
    tier: 2 as 1 | 2 | 3,
    default_category: "industry",
  });

  React.useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const res = await fetch("/api/sources/news");
    const data = await res.json();
    setSources(data.sources ?? []);
  }

  async function add() {
    if (!draft.name.trim() || !draft.url.trim()) {
      toast.error("Nombre y URL son obligatorios");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sources/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error añadiendo");
      toast.success(`Añadido: ${draft.name}`);
      setDraft({ name: "", url: "", tier: 2, default_category: "industry" });
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    const res = await fetch(`/api/sources/news/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Eliminada");
      await refresh();
    } else {
      toast.error("Error eliminando");
    }
  }

  async function toggle(id: string, currentEnabled: number) {
    const res = await fetch(`/api/sources/news/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: currentEnabled === 1 ? 0 : 1 }),
    });
    if (res.ok) await refresh();
    else toast.error("Error cambiando estado");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-fg">Noticias — Feeds RSS</h3>
        {sources && <span className="text-xs text-fg-subtle">({sources.length})</span>}
      </div>
      <p className="text-xs text-fg-subtle">
        <strong>Tier 1</strong> = fuente oficial (todo entra sin filtrar). {" "}
        <strong>Tier 2</strong> = medio especializado (se filtra por keywords IA/dev). {" "}
        <strong>Tier 3</strong> = agregador (filtro estricto por keywords).
      </p>

      {/* Form añadir */}
      <div className="grid grid-cols-[1fr_1fr_70px_140px_auto] items-end gap-2 rounded-md border border-border bg-bg-elevated p-3">
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-fg-subtle">Nombre</Label>
          <Input
            placeholder="OpenAI Blog"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-fg-subtle">URL del feed RSS</Label>
          <Input
            placeholder="https://example.com/feed.xml"
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
            className="font-mono text-xs"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-fg-subtle">Tier</Label>
          <Select
            value={String(draft.tier)}
            onValueChange={(v) => setDraft({ ...draft, tier: Number(v) as 1 | 2 | 3 })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 · Oficial</SelectItem>
              <SelectItem value="2">2 · Medio</SelectItem>
              <SelectItem value="3">3 · Agregador</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-wider text-fg-subtle">Categoría</Label>
          <Select
            value={draft.default_category}
            onValueChange={(v) => setDraft({ ...draft, default_category: v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {NEWS_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={add} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Añadir
        </Button>
      </div>

      {/* Lista */}
      <div className="flex flex-col gap-1.5">
        {sources === null && (
          <div className="flex items-center gap-2 text-xs text-fg-subtle">
            <Loader2 className="size-3 animate-spin" /> Cargando…
          </div>
        )}
        {sources && sources.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-fg-subtle">
            Aún no has añadido ningún feed de noticias.
          </div>
        )}
        {sources && sources.map((s) => (
          <div
            key={s.id}
            className={`grid grid-cols-[24px_1fr_1fr_60px_100px_auto_auto] items-center gap-3 rounded-md border border-border bg-bg-card px-3 py-2 ${s.enabled ? "" : "opacity-50"}`}
          >
            <Rss className="size-4 text-fg-subtle" />
            <span className="truncate text-sm font-medium text-fg">{s.name}</span>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 truncate font-mono text-[11px] text-fg-subtle hover:text-accent"
            >
              <ExternalLink className="size-3 shrink-0" />
              <span className="truncate">{s.url}</span>
            </a>
            <span className="text-[10px] font-semibold uppercase text-accent">T{s.tier}</span>
            <span className="truncate text-[10px] uppercase text-fg-subtle">{s.default_category}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggle(s.id, s.enabled)}
              title={s.enabled ? "Desactivar" : "Activar"}
            >
              {s.enabled ? <Power className="size-3.5 text-accent" /> : <PowerOff className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => remove(s.id, s.name)}
              title="Eliminar"
            >
              <Trash2 className="size-3.5 text-rose-400" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
