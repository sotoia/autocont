import { repo } from "@/lib/db";
import { PageHeader } from "@/components/dashboard/page-header";
import { LibraryView } from "@/components/dashboard/library-view";

export const dynamic = "force-dynamic";

export default function FotosPage() {
  const assets = repo.listAssets("stock_photo");
  const settings = repo.getSettings();
  return (
    <>
      <PageHeader
        title="Biblioteca de fotos"
        description="Imágenes estáticas que se pueden insertar como cutaways o b-roll de 3-5 segundos. La IA las matchea con la transcripción igual que los vídeos stock."
      />
      <LibraryView
        kind="stock_photo"
        assets={assets}
        basePath={settings.stock_path}
        emptyHint="Organiza tus fotos en subcarpetas dentro de la biblioteca de stock (.jpg/.png) y rescanea para indexarlas."
      />
    </>
  );
}
