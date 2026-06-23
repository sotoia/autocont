import { repo } from "@/lib/db";
import { PageHeader } from "@/components/dashboard/page-header";
import { LibraryView } from "@/components/dashboard/library-view";

export const dynamic = "force-dynamic";


export default function MusicaPage() {
  const assets = repo.listAssets("music");
  const settings = repo.getSettings();
  return (
    <>
      <PageHeader
        title="Música de stock"
        description="Pistas de fondo disponibles para el pipeline. La IA baja volumen automáticamente en los momentos de voz."
      />
      <LibraryView
        kind="music"
        assets={assets}
        basePath={settings.music_path}
        emptyHint="Coloca tus MP3/WAV en subcarpetas por género o energía y pulsa «Rescanear»."
      />
    </>
  );
}
