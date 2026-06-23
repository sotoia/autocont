import { NextRequest } from "next/server";
import { repo } from "@/lib/db";

/** POST /api/news/[id]/promote — convierte la noticia en una Creación
 *  pre-rellenando notes con la info de la noticia. */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = repo.getNews(id);
  if (!n) return Response.json({ error: "Noticia no encontrada" }, { status: 404 });

  const ideaText = `NOTICIA: ${n.title}
${n.description ? `\n${n.description}` : ""}
Fuente: ${n.source_name} · ${n.source_url}
Categoría: ${n.category}
Tags: ${n.tags.join(", ")}
Importancia detectada: ${n.importance}`;

  const creation = repo.createCreation({
    kind: "actualidad",
    title: n.title,
    description: n.description ?? "",
    notes: ideaText,
    ref_pack: ["nate-gentile", "adrian-saenz", "juanpe-navarro", "alejavi-rivera"],
  });
  repo.updateNews(id, { promoted_creation_id: creation.id });
  return Response.json({ creation });
}
