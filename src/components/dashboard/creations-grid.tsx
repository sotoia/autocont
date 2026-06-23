"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pin, Archive, Trash2, Sparkles, MoreVertical, BadgeCheck, Image as ImageIcon,
} from "lucide-react";
import type { Creation } from "@/lib/creations/types";
import { CREATION_KIND_LABELS } from "@/lib/creations/types";
import { cn } from "@/lib/utils";

interface Props {
  initialCreations: Creation[];
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat("es-ES", { numeric: "auto" });
function timeAgo(iso: string): string {
  const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return RELATIVE_TIME.format(diffSec, "second");
  if (abs < 3600) return RELATIVE_TIME.format(Math.round(diffSec / 60), "minute");
  if (abs < 86_400) return RELATIVE_TIME.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86_400 * 30) return RELATIVE_TIME.format(Math.round(diffSec / 86_400), "day");
  if (abs < 86_400 * 365) return RELATIVE_TIME.format(Math.round(diffSec / (86_400 * 30)), "month");
  return RELATIVE_TIME.format(Math.round(diffSec / (86_400 * 365)), "year");
}

export function CreationsGrid({ initialCreations }: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState(initialCreations);
  const [menuOpen, setMenuOpen] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpen]);

  async function patch(id: string, body: Partial<Creation>) {
    setItems((cur) => cur.map((c) => (c.id === id ? { ...c, ...body } : c)));
    await fetch(`/api/creations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => { /* noop */ });
  }

  async function remove(id: string) {
    if (!confirm("¿Borrar esta creación?")) return;
    setItems((cur) => cur.filter((c) => c.id !== id));
    await fetch(`/api/creations/${id}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-bg-elevated p-12 text-center">
        <Sparkles className="size-8 text-fg-subtle" />
        <h3 className="text-base font-semibold text-fg">Aún no hay creaciones</h3>
        <p className="max-w-md text-sm text-fg-muted">
          Crea una desde cero o promueve una idea desde la pestaña Ideas (icono ⭐ en cada tarjeta).
        </p>
        <Link href="/creaciones/nueva" className="mt-2 rounded-md bg-accent px-4 h-9 text-sm font-medium text-accent-fg hover:bg-accent-hover inline-flex items-center">
          + Nueva creación
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c) => {
        const wordCount = c.script ? c.script.trim().split(/\s+/).filter(Boolean).length : 0;
        const minutesScript = Math.round(wordCount / 150);
        const durationLabel = minutesScript > 0 ? `~${minutesScript} min` : null;
        const kindLabel = CREATION_KIND_LABELS[c.kind].split(" (")[0];

        return (
          <div key={c.id} className="group flex flex-col gap-3">
            <Link
              href={`/creaciones/${c.id}`}
              className="relative block aspect-video overflow-hidden rounded-xl bg-bg-elevated"
            >
              {c.thumbnail_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.thumbnail_path}
                  alt={c.title || "Miniatura"}
                  loading="lazy"
                  className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-bg-elevated via-bg-card to-bg">
                  <ImageIcon className="size-10 text-fg-subtle/40" />
                </div>
              )}
              {durationLabel && (
                <span className="absolute bottom-2 right-2 rounded-md bg-black/85 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {durationLabel}
                </span>
              )}
              {c.pinned ? (
                <span className="absolute top-2 left-2 grid size-6 place-items-center rounded-full bg-black/70 text-white">
                  <Pin className="size-3 fill-current" />
                </span>
              ) : null}
            </Link>

            <div className="flex gap-3">
              <Link href={`/creaciones/${c.id}`} className="shrink-0">
                <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-accent to-accent/40 text-[13px] font-bold text-accent-fg">
                  TU
                </div>
              </Link>

              <div className="min-w-0 flex-1">
                <Link href={`/creaciones/${c.id}`} className="block">
                  <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-fg">
                    {c.title || <span className="italic text-fg-subtle">(sin título)</span>}
                  </h3>
                  <div className="mt-1 flex items-center gap-1 text-[13px] text-fg-muted">
                    <span>Tu canal</span>
                    <BadgeCheck className="size-3.5 text-fg-subtle" />
                  </div>
                  <div className="text-[13px] text-fg-muted">
                    <span>{kindLabel}</span>
                    <span className="mx-1">·</span>
                    <span>{wordCount.toLocaleString("es-ES")} palabras</span>
                    <span className="mx-1">·</span>
                    <span>{timeAgo(c.updated_at)}</span>
                  </div>
                </Link>
              </div>

              <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setMenuOpen(menuOpen === c.id ? null : c.id)}
                  aria-label="Más opciones"
                  className="grid size-8 place-items-center rounded-full text-fg-muted opacity-0 transition-opacity hover:bg-bg-hover hover:text-fg group-hover:opacity-100 data-[open=true]:opacity-100"
                  data-open={menuOpen === c.id}
                >
                  <MoreVertical className="size-4" />
                </button>
                {menuOpen === c.id && (
                  <div className="absolute right-0 top-9 z-10 min-w-[160px] rounded-md border border-border bg-bg-card py-1 shadow-lg">
                    <button
                      type="button"
                      onClick={() => { patch(c.id, { pinned: c.pinned ? 0 : 1 }); setMenuOpen(null); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-fg hover:bg-bg-hover"
                    >
                      <Pin className={cn("size-3.5", c.pinned && "fill-current text-accent")} />
                      {c.pinned ? "Desfijar" : "Fijar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { patch(c.id, { archived: c.archived ? 0 : 1 }); setMenuOpen(null); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-fg hover:bg-bg-hover"
                    >
                      <Archive className="size-3.5" />
                      {c.archived ? "Desarchivar" : "Archivar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { remove(c.id); setMenuOpen(null); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-danger hover:bg-danger/10"
                    >
                      <Trash2 className="size-3.5" />
                      Borrar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
