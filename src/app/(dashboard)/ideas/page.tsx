import { repo } from "@/lib/db";
import { PageHeader } from "@/components/dashboard/page-header";
import { IdeasBoard } from "@/components/dashboard/ideas-board";

export const dynamic = "force-dynamic";

export default function IdeasPage() {
  // raw_content (transcripciones / artículos de hasta 8 KB) no se muestra en
  // la UI. Lo eliminamos del payload del listado para no inflar el HTML
  // inicial — bajamos el bundle del SSR a la mitad y la primera pintada
  // se acelera notablemente con muchas tarjetas.
  const ideas = repo.listIdeas().map((i) => ({ ...i, raw_content: null }));
  const sources = repo.listIdeaSources(true);
  const lastPolled = sources
    .map((s) => s.last_polled_at)
    .filter((d): d is string => !!d)
    .sort()
    .pop() ?? null;

  return (
    <>
      <PageHeader
        title="Ideas"
        description="Tarjetas de ideas de vídeo generadas a partir de noticias y vídeos recientes de IA, tech y negocio. Se actualiza cada 5h. Pincha una tarjeta para ver el guion propuesto."
      />
      <IdeasBoard
        initialIdeas={ideas}
        sourcesCount={sources.length}
        lastPolledAt={lastPolled}
      />
    </>
  );
}
