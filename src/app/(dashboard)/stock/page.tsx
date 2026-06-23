import { repo } from "@/lib/db";
import { PageHeader } from "@/components/dashboard/page-header";
import { LibraryView } from "@/components/dashboard/library-view";

export const dynamic = "force-dynamic";


export default function StockPage() {
  const assets = repo.listAssets("stock_video");
  const settings = repo.getSettings();
  return (
    <>
      <PageHeader
        title="Biblioteca de vídeo stock"
        description="Clips etiquetados por tema. La IA matchea con la transcripción para elegir qué aparece en cada segmento."
      />
      <LibraryView
        kind="stock_video"
        assets={assets}
        basePath={settings.stock_path}
        emptyHint="Organiza subcarpetas por tema (programación, IA, trabajo...) y pulsa «Rescanear»."
      />
    </>
  );
}
