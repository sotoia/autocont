import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  /** Etiqueta opcional sobre el título (ALL CAPS Space Mono). */
  eyebrow?: string;
}

/** Cabecera de página estilo Nothing:
 *    - eyebrow ALL CAPS Space Mono (opcional)
 *    - título grande Space Grotesk light, tracking apretado
 *    - descripción gris secundaria
 *  Sin border-bottom — la separación viene del espacio. */
export function PageHeader({ title, description, actions, className, eyebrow }: PageHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-6 pb-8", className)}>
      <div className="flex max-w-3xl flex-col gap-2">
        {eyebrow && (
          <span
            className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--nd-text-disabled)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            — {eyebrow}
          </span>
        )}
        <h1 className="text-[32px] font-light leading-[1.1] tracking-[-0.02em] text-[var(--nd-text-display)]">
          {title}
        </h1>
        {description && (
          <p className="text-sm leading-relaxed text-[var(--nd-text-secondary)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
