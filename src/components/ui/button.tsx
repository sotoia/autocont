import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/* Botones Nothing:
 *   - Tipografía Space Mono, ALL CAPS, letter-spacing 0.06em
 *   - Primary = fondo invertido (texto display sobre bg de pantalla)
 *   - Secondary = transparente con borde, hover oscurece borde
 *   - Sin sombras, sin gradientes — flat
 *   - Pill (rounded-full) por defecto. Variante "technical" con rounded-md.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium uppercase tracking-[0.06em]",
    "transition-colors duration-200 ease-out",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--nd-text-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--nd-bg)]",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          // Primary: fondo display, texto bg — invertido. Hover opacity.
          "bg-[var(--nd-text-display)] text-[var(--nd-bg)] hover:opacity-85 rounded-full",
        secondary:
          "bg-transparent text-[var(--nd-text-primary)] border border-[var(--nd-border-visible)] hover:border-[var(--nd-text-primary)] rounded-full",
        outline:
          "bg-transparent text-[var(--nd-text-primary)] border border-[var(--nd-border-visible)] hover:border-[var(--nd-text-primary)] rounded-full",
        ghost:
          "bg-transparent text-[var(--nd-text-secondary)] hover:text-[var(--nd-text-primary)] hover:bg-[var(--nd-surface-raised)] rounded-md",
        danger:
          "bg-transparent text-[var(--nd-accent)] border border-[var(--nd-accent)] hover:bg-[var(--nd-accent-subtle)] rounded-full",
        link:
          "bg-transparent text-[var(--nd-interactive)] underline-offset-4 hover:underline normal-case tracking-normal",
        technical:
          // Variante "panel de instrumentos" — rectangular, fino, mono
          "bg-transparent text-[var(--nd-text-primary)] border border-[var(--nd-border-visible)] hover:border-[var(--nd-text-primary)] rounded-md",
      },
      size: {
        default: "h-10 px-5 text-[12px]",
        sm: "h-8 px-3 text-[11px]",
        lg: "h-11 px-6 text-[13px]",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        style={{ fontFamily: "var(--font-mono)", ...style }}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
export { buttonVariants };
