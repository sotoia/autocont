"use client";
import * as React from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "dark" | "light";

const STORAGE_KEY = "autocont.theme";

function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "light" ? "light" : "dark";
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  document.documentElement.style.colorScheme = t;
  try { window.localStorage.setItem(STORAGE_KEY, t); } catch {}
}

export function ThemeToggle() {
  // mounted evita hydration mismatch: el HTML server-rendered no conoce el
  // localStorage del cliente. Renderizamos un esqueleto idéntico hasta mount.
  const [mounted, setMounted] = React.useState(false);
  const [theme, setTheme] = React.useState<Theme>("dark");

  React.useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Cambiar tema"
      title={mounted ? `Tema: ${theme === "dark" ? "oscuro" : "claro"} · click para alternar` : "Cambiar tema"}
      className={cn(
        "group relative inline-flex h-9 w-full items-center justify-between gap-2",
        "rounded-md border border-[var(--nd-border-visible)] bg-[var(--nd-surface)] px-3",
        "text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--nd-text-secondary)]",
        "transition-colors hover:border-[var(--nd-text-primary)] hover:text-[var(--nd-text-primary)]",
      )}
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <span className="inline-flex items-center gap-2">
        {mounted ? (
          theme === "dark" ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />
        ) : (
          <Moon className="size-3.5" />
        )}
        <span>{mounted ? (theme === "dark" ? "OSCURO" : "CLARO") : "TEMA"}</span>
      </span>

      {/* Indicador tipo switch a la derecha */}
      <span
        className={cn(
          "relative inline-block h-3 w-6 rounded-full transition-colors",
          mounted && theme === "light"
            ? "bg-[var(--nd-text-display)]"
            : "bg-[var(--nd-border-visible)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 inline-block size-2 rounded-full transition-all",
            mounted && theme === "light"
              ? "left-3.5 bg-[var(--nd-bg)]"
              : "left-0.5 bg-[var(--nd-text-disabled)]",
          )}
        />
      </span>
    </button>
  );
}
