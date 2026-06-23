import { redirect } from "next/navigation";
import { repo } from "@/lib/db";
import type { CreationKind } from "@/lib/creations/types";
import { CREATION_KIND_LABELS, CREATION_KIND_DESCRIPTIONS } from "@/lib/creations/types";

export const dynamic = "force-dynamic";

async function createAction(formData: FormData) {
  "use server";
  const kind = (formData.get("kind") as CreationKind) || "viral";
  const title = (formData.get("title") as string) || "";
  const idea = ((formData.get("idea") as string) || "").trim();

  // La idea cruda se guarda en `notes` para que el endpoint de auto-generate
  // la use como base. El usuario puede borrarla luego desde el editor.
  const c = repo.createCreation({
    kind,
    title,
    notes: idea,
    ref_pack: ["nate-gentile", "adrian-saenz", "juanpe-navarro", "alejavi-rivera"],
  });

  // Si hay idea, redirigimos con flag para que el editor dispare auto-generación
  // (título + descripción + guion completos) en cuanto se cargue la página.
  if (idea.length > 0) {
    redirect(`/creaciones/${c.id}?autogen=1`);
  }
  redirect(`/creaciones/${c.id}`);
}

export default function NuevaCreacionPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold text-fg mb-1">Nueva creación</h1>
      <p className="text-sm text-fg-muted mb-6">
        Cuanto más detalle des en la idea, mejor será el guion que la IA generará al estilo de tus referentes.
      </p>

      <form action={createAction} className="flex flex-col gap-5">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            Tipo de vídeo
          </label>
          <div className="flex flex-col gap-2">
            {(Object.keys(CREATION_KIND_LABELS) as CreationKind[]).map((k, i) => (
              <label
                key={k}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-bg-elevated p-3 text-sm hover:border-border-strong has-[:checked]:border-accent has-[:checked]:bg-accent/5"
              >
                <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-fg">{CREATION_KIND_LABELS[k]}</div>
                  <div className="text-xs text-fg-muted leading-relaxed">
                    {CREATION_KIND_DESCRIPTIONS[k]}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            Título inicial (opcional)
          </label>
          <input
            type="text"
            name="title"
            placeholder="Lo afinarás luego o lo generará la IA desde la idea"
            className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            <span>Describe la idea del vídeo</span>
            <span className="font-normal normal-case tracking-normal text-[10px] text-accent">
              ✨ Si rellenas esto, la IA generará TODO automáticamente
            </span>
          </label>
          <textarea
            name="idea"
            rows={6}
            placeholder='Ej: "Quiero hacer un vídeo donde explico cómo construí un agente de IA que automatiza la edición de mis vídeos de YouTube. Mostrar cómo funciona Claude Code + las herramientas que usé, los problemas que tuve con DaVinci, y cómo al final monté un sistema que ahorra 5 horas por vídeo. Tono: proceso real, sin filtros, mostrando los fallos."'
            className="w-full rounded-md border border-border bg-bg-elevated px-3 py-3 text-sm leading-relaxed text-fg outline-none focus:border-accent resize-y"
          />
          <p className="mt-2 text-xs text-fg-subtle">
            La IA usará esta descripción + las pautas de Nate Gentile, Adrián Sáenz, JuanPe Navarro y Alejavi Rivera
            para generar título óptimo, descripción de YouTube y guion completo de la duración objetivo del tipo elegido.
            Tarda 1-3 minutos. Coste estimado: ~$0.50-0.70.
          </p>
        </div>

        <button
          type="submit"
          className="rounded-md bg-accent px-4 h-10 text-sm font-medium text-accent-fg hover:bg-accent-hover"
        >
          Crear y abrir editor →
        </button>
      </form>
    </div>
  );
}
