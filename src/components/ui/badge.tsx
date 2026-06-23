import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none border",
  {
    variants: {
      variant: {
        default: "bg-bg-elevated border-border text-fg-muted",
        accent: "bg-accent/10 border-accent/30 text-accent",
        success: "bg-accent/10 border-accent/30 text-accent",
        warn: "bg-warn/10 border-warn/30 text-warn",
        danger: "bg-danger/10 border-danger/30 text-danger",
        info: "bg-info/10 border-info/30 text-info",
        outline: "border-border-strong text-fg-muted bg-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
