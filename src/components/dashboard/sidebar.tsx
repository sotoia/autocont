"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Library,
  Image as ImageIcon,
  Music,
  ListChecks,
  Settings,
  Activity,
  Lightbulb,
  Wand2,
  Newspaper,
} from "lucide-react";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { cn } from "@/lib/utils";

type NavGroup = {
  title: string;
  items: Array<{
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  }>;
};

const groups: NavGroup[] = [
  {
    title: "Visión",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/ideas", label: "Ideas", icon: Lightbulb },
      { href: "/noticias", label: "Noticias", icon: Newspaper },
      { href: "/creaciones", label: "Creaciones", icon: Wand2 },
    ],
  },
  {
    title: "Biblioteca",
    items: [
      { href: "/stock", label: "Stock", icon: Library },
      { href: "/fotos", label: "Fotos", icon: ImageIcon },
      { href: "/musica", label: "Música", icon: Music },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/cola", label: "Cola", icon: ListChecks },
      { href: "/ajustes", label: "Ajustes", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-[var(--nd-border)] bg-[var(--nd-surface)]"
    >
      {/* Brand — Doto (dot-matrix) */}
      <div className="flex h-16 items-center gap-3 border-b border-[var(--nd-border)] px-5">
        <BrandMark />
        <div className="flex min-w-0 flex-col leading-none">
          <span
            className="truncate text-[18px] font-bold tracking-[-0.02em] text-[var(--nd-text-display)]"
            style={{ fontFamily: "var(--font-doto)" }}
          >
            AUTOCONT
          </span>
          <span
            className="mt-1 text-[9px] font-medium uppercase tracking-[0.22em] text-[var(--nd-text-secondary)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            PIPELINE / IA
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <div
                className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--nd-text-disabled)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                — {group.title}
              </div>
              <ul className="flex flex-col gap-px">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "group relative flex items-center gap-3 px-3 py-2 text-[13px] transition-colors",
                          active
                            ? "text-[var(--nd-text-display)]"
                            : "text-[var(--nd-text-secondary)] hover:text-[var(--nd-text-primary)]",
                        )}
                      >
                        {/* Marker izquierda — barra fina cuando activo */}
                        <span
                          className={cn(
                            "absolute left-0 top-1/2 inline-block h-3.5 w-px -translate-y-1/2 transition-colors",
                            active ? "bg-[var(--nd-accent)]" : "bg-transparent",
                          )}
                        />
                        <Icon
                          className={cn(
                            "size-[15px] shrink-0 transition-colors",
                            active
                              ? "text-[var(--nd-text-display)]"
                              : "text-[var(--nd-text-disabled)] group-hover:text-[var(--nd-text-secondary)]",
                          )}
                          strokeWidth={1.5}
                        />
                        <span className="flex-1 truncate">
                          {item.label}
                        </span>
                        {active && (
                          <span
                            className="text-[9px] uppercase tracking-[0.2em] text-[var(--nd-text-disabled)]"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            ●
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* Theme toggle + status */}
      <div className="flex flex-col gap-3 border-t border-[var(--nd-border)] p-3">
        <ThemeToggle />

        <div className="flex items-center gap-2.5 border border-[var(--nd-border-visible)] bg-[var(--nd-bg)] px-3 py-2">
          <span className="relative flex size-2 shrink-0 items-center justify-center">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--nd-success)] opacity-40" />
            <span className="relative inline-flex size-1.5 rounded-full bg-[var(--nd-success)]" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span
              className="text-[9px] uppercase tracking-[0.18em] text-[var(--nd-text-disabled)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              SYSTEM
            </span>
            <span className="truncate text-[11px] text-[var(--nd-text-primary)]">
              Pipeline OK
            </span>
          </div>
          <Activity className="size-3.5 shrink-0 text-[var(--nd-text-disabled)]" strokeWidth={1.5} />
        </div>
      </div>
    </aside>
  );
}

/** Marca AC monoespacial estilo Nothing — bordes finos, sin gradiente */
function BrandMark() {
  return (
    <div
      className="grid size-9 shrink-0 place-items-center border border-[var(--nd-border-visible)] bg-[var(--nd-bg)]"
    >
      <span
        className="text-[11px] font-bold tracking-tighter text-[var(--nd-text-display)]"
        style={{ fontFamily: "var(--font-doto)" }}
      >
        AC
      </span>
    </div>
  );
}
