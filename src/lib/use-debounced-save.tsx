"use client";
import * as React from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface Options<T> {
  value: T;
  initial: T;
  save: (value: T) => Promise<void>;
  delay?: number;
  enabled?: boolean;
}

export function useDebouncedSave<T>({
  value,
  initial,
  save,
  delay = 600,
  enabled = true,
}: Options<T>) {
  const [status, setStatus] = React.useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const skipRef = React.useRef(true);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const valueRef = React.useRef(value);

  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  React.useEffect(() => {
    if (skipRef.current) {
      skipRef.current = false;
      return;
    }
    if (!enabled) return;

    // Nothing changed since initial load
    if (JSON.stringify(value) === JSON.stringify(initial)) {
      setStatus("idle");
      return;
    }

    setStatus("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await save(valueRef.current);
        setStatus("saved");
        setLastSavedAt(Date.now());
        setError(null);
      } catch (err) {
        setStatus("error");
        setError((err as Error).message);
      }
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), enabled, delay]);

  return { status, lastSavedAt, error };
}

export function SaveStatusIndicator({
  status,
  lastSavedAt,
  error,
}: {
  status: SaveStatus;
  lastSavedAt: number | null;
  error: string | null;
}) {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
        <span className="pulse-dot size-1.5 rounded-full bg-warn" />
        Guardando…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-danger">
        <span className="size-1.5 rounded-full bg-danger" />
        Error: {error ?? "desconocido"}
      </span>
    );
  }
  if (status === "saved" && lastSavedAt) {
    const secs = Math.floor((Date.now() - lastSavedAt) / 1000);
    const label =
      secs < 5 ? "ahora" : secs < 60 ? `hace ${secs}s` : `hace ${Math.floor(secs / 60)} min`;
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
        <span className="size-1.5 rounded-full bg-accent" />
        Autoguardado {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
      <span className="size-1.5 rounded-full bg-fg-subtle/50" />
      Autoguardado activo
    </span>
  );
}
