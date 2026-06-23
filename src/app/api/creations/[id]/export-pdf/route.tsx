import { NextRequest } from "next/server";
import { repo } from "@/lib/db";
import { renderToStream } from "@react-pdf/renderer";
import { CreationPdf } from "@/lib/creations/pdf";

export const maxDuration = 60;

/** GET /api/creations/[id]/export-pdf — devuelve el PDF descargable del guion. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = repo.getCreation(id);
  if (!c) return Response.json({ error: "Creación no encontrada" }, { status: 404 });

  const stream = await renderToStream(<CreationPdf creation={c} />);
  // Convertir Node ReadableStream a Web ReadableStream para Response
  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      stream.on("end", () => controller.close());
      stream.on("error", (err: Error) => controller.error(err));
    },
  });

  const filename = (c.title || "creacion").replace(/[^\w\s.\-]/g, " ").replace(/\s+/g, "_").slice(0, 80) || "creacion";
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    },
  });
}
