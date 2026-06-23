import { repo } from "@/lib/db";
import { PageHeader } from "@/components/dashboard/page-header";
import { NewsBoard } from "@/components/dashboard/news-board";

export const dynamic = "force-dynamic";

export default function NoticiasPage() {
  const news = repo.listNews();
  return (
    <>
      <PageHeader
        title="Noticias"
        description="Últimas novedades de IA, agentes y GitHub. Blogs oficiales (OpenAI, Anthropic, DeepMind, Google AI, Meta AI, Mistral, HF, GitHub) + medios especializados + agregadores. Refresca cada 1h. Convierte cualquier noticia en Creación con un click."
      />
      <NewsBoard initialNews={news} />
    </>
  );
}
