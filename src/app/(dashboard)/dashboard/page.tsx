import { repo } from "@/lib/db";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { Wand2, Lightbulb, Newspaper, Library, ListChecks, Settings } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * Home del dashboard v0.1 — landing simple con accesos directos a los
 * módulos disponibles y stats básicas (counts de creaciones, ideas, etc).
 */
export default async function DashboardPage() {
  const creationsCount = repo.listCreations().length;
  const ideasCount = repo.listIdeas().length;
  const newsCount = repo.listNews().length;

  const cards = [
    { href: "/creaciones", label: "Creaciones", icon: Wand2, count: creationsCount, hint: "Editor de vídeos con IA cowriter" },
    { href: "/ideas",      label: "Ideas",      icon: Lightbulb, count: ideasCount, hint: "Tablero de ideas auto-actualizado" },
    { href: "/noticias",   label: "Noticias",   icon: Newspaper, count: newsCount,  hint: "Noticias del nicho IA" },
    { href: "/stock",      label: "Stock",      icon: Library,   count: null,       hint: "Vídeo · fotos · música" },
    { href: "/cola",       label: "Cola",       icon: ListChecks, count: null,      hint: "Jobs del pipeline" },
    { href: "/ajustes",    label: "Ajustes",    icon: Settings,  count: null,       hint: "API key Claude · carpeta watch" },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader title="Dashboard" description="Bienvenido a AUTOCONT" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href}>
              <Card className="transition-colors hover:border-border-strong hover:bg-bg-hover">
                <CardContent className="flex flex-col gap-2 p-5">
                  <div className="flex items-center justify-between">
                    <Icon className="size-5 text-fg-subtle" strokeWidth={1.5} />
                    {c.count != null && (
                      <span className="text-2xl font-bold tabular-nums text-fg">{c.count}</span>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-fg">{c.label}</div>
                    <div className="mt-0.5 text-xs text-fg-subtle">{c.hint}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-500">
            ▸ AUTOCONT v0.1
          </div>
          <div className="text-sm text-fg-muted">
            Esta es la primera versión open-source de AUTOCONT. Iremos liberando módulos
            (motion graphics, edición avanzada, multi-tenant) según los vayamos puliendo.
            Mira <Link href="/ajustes" className="text-accent hover:underline">Ajustes</Link>
            {" "}para el roadmap completo.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
