import { notFound } from "next/navigation";
import { repo } from "@/lib/db";
import { CreationEditor } from "@/components/dashboard/creation-editor";

export const dynamic = "force-dynamic";

export default async function CreacionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const creation = repo.getCreation(id);
  if (!creation) notFound();
  return <CreationEditor initial={creation} />;
}
