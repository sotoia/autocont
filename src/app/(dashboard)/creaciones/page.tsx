import Link from "next/link";
import { repo } from "@/lib/db";
import { PageHeader } from "@/components/dashboard/page-header";
import { CreationsGrid } from "@/components/dashboard/creations-grid";

export const dynamic = "force-dynamic";

export default function CreacionesPage() {
  const creations = repo.listCreations();
  return (
    <>
      <PageHeader
        title="Creaciones"
        description="Tus vídeos en desarrollo. Cada tarjeta abre un editor en pantalla completa con título, descripción y guion. La IA sugiere títulos, escribe descripciones y co-escribe el guion siguiendo el estilo de tus referentes (Nate Gentile, Adrián Sáenz, JuanPe Navarro, Alejavi Rivera)."
        actions={
          <Link
            href="/creaciones/nueva"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-3 h-9 text-sm font-medium text-accent-fg hover:bg-accent-hover"
          >
            + Nueva creación
          </Link>
        }
      />
      <CreationsGrid initialCreations={creations} />
    </>
  );
}
