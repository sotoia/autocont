import { repo } from "@/lib/db";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

const ROADMAP = [
  { state: "✅", text: "Editor de creaciones con guion, ficha y co-writer IA" },
  { state: "✅", text: "Noticias e ideas auto-actualizadas" },
  { state: "✅", text: "Pool de stock local (vídeo · fotos · música)" },
  { state: "✅", text: "Watcher de carpeta OBS → transcripción → timeline DaVinci con stock IA" },
  { state: "🚧", text: "Motion graphics generation (Canvas2D + IA) — en pulido, llega en v0.2" },
  { state: "🚧", text: "Plugin de DaVinci Resolve (Workflow Integration) — en pulido, llega en v0.2" },
  { state: "📋", text: "Multi-usuario / auth — planeado v0.3" },
  { state: "📋", text: "Tests automáticos — planeado v0.3" },
];

export default function AjustesPage() {
  const settings = repo.getSettings();
  return (
    <>
      <PageHeader
        title="Ajustes"
        description="API keys, rutas que vigila el watcher y preferencias del pipeline. Se guardan en data/app.db."
      />

      {/* Banner v0.1 */}
      <Card className="mb-5 border-amber-500/40 bg-amber-500/5">
        <CardContent className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-500">
            ▸ AUTOCONT v0.1 — open source
          </div>
          <p className="text-sm text-fg-muted">
            Bienvenida. Esta es la primera versión open-source de AUTOCONT.
            Las piezas que están aquí <strong>funcionan y son seguras de usar</strong>;
            las que aún están en pulido las iremos liberando en versiones siguientes.
            Pega tu <code className="rounded bg-bg-elevated px-1.5 py-0.5 text-xs">ANTHROPIC_API_KEY</code> de Claude más abajo para empezar.
          </p>
          <div className="mt-1 flex flex-col gap-1.5 text-xs">
            {ROADMAP.map((r, i) => (
              <div key={i} className="flex gap-2 text-fg-muted">
                <span className="w-5 shrink-0">{r.state}</span>
                <span>{r.text}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <SettingsForm settings={settings} />
    </>
  );
}
