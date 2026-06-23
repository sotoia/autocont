"use client";
import * as React from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { MediaItem } from "@/lib/creations/media-map";
import { cn } from "@/lib/utils";

interface Props {
  items: MediaItem[];
  startIndex?: number;
  onClose: () => void;
}

export function MediaLightbox({ items, startIndex = 0, onClose }: Props) {
  const [idx, setIdx] = React.useState(startIndex);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % items.length);
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + items.length) % items.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length, onClose]);

  if (items.length === 0) return null;
  const current = items[idx];
  const isCreator = current.source === "creator" || !current.src;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] grid place-items-center bg-black/85 backdrop-blur-sm p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[90vh] w-[min(1100px,92vw)] flex-col overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-2xl"
      >
        <div className="grid min-h-[320px] flex-1 place-items-center overflow-hidden bg-black">
          {isCreator ? (
            <div className="flex flex-col items-center gap-3 px-12 py-20 text-center text-fg-subtle">
              <div className="text-sm font-bold uppercase tracking-wider text-fg">
                B-roll a grabar por ti
              </div>
              <div className="max-w-md text-[13px] leading-relaxed">{current.caption}</div>
            </div>
          ) : current.kind === "video" ? (
            <video
              key={current.src}
              src={current.src}
              autoPlay
              controls
              loop
              playsInline
              className="block max-h-[calc(90vh-120px)] max-w-full object-contain"
            />
          ) : (
            <img
              key={current.src}
              src={current.src}
              alt={current.caption}
              className="block max-h-[calc(90vh-120px)] max-w-full object-contain"
            />
          )}
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border bg-bg-card px-4 py-3">
          <div className="flex-1 text-xs text-fg-muted">
            <span
              className={cn(
                "mr-2 inline-block rounded-full px-2 py-[1px] text-[10px] font-bold uppercase tracking-wider",
                isCreator ? "bg-emerald-400/15 text-emerald-300" : "bg-accent/15 text-accent",
              )}
            >
              {isCreator ? "B-roll creator" : "Material Elgato"}
            </span>
            {current.caption}
          </div>
          <div className="flex items-center gap-1.5">
            {items.length > 1 && (
              <>
                <button
                  onClick={() => setIdx((i) => (i - 1 + items.length) % items.length)}
                  className="grid size-7 place-items-center rounded border border-border-strong bg-bg-hover text-fg hover:bg-accent hover:text-accent-fg"
                  aria-label="Anterior"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-[11px] tabular-nums text-fg-subtle">
                  {idx + 1} / {items.length}
                </span>
                <button
                  onClick={() => setIdx((i) => (i + 1) % items.length)}
                  className="grid size-7 place-items-center rounded border border-border-strong bg-bg-hover text-fg hover:bg-accent hover:text-accent-fg"
                  aria-label="Siguiente"
                >
                  <ChevronRight className="size-4" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded border border-border-strong bg-bg-hover px-2.5 py-1 text-xs font-medium text-fg hover:bg-accent hover:text-accent-fg"
            >
              <X className="size-3.5" />
              Esc
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
