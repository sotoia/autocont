import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { repo } from "@/lib/db";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".m4v": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * GET /api/asset/<assetId>
 * Streams the asset file with HTTP Range support so the browser video/audio
 * player can scrub freely.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const asset = repo.getAsset(id);
  if (!asset) return new Response("Asset not found", { status: 404 });

  let realPath: string;
  try {
    realPath = fs.realpathSync(asset.path);
  } catch {
    return new Response("Asset file not found", { status: 404 });
  }
  if (!fs.existsSync(realPath)) {
    return new Response("Asset file not found", { status: 404 });
  }

  // For videos we ship a lightweight H.264 720p proxy at `<master>.proxy.mp4`
  // next to the master (generated at download time). The browser can always
  // decode the proxy even when the master is 4K ProRes or HEVC 10-bit.
  // DaVinci imports the master directly via its filesystem path, so it
  // doesn't care about this indirection.
  if (asset.kind === "stock_video") {
    const proxyPath = realPath + ".proxy.mp4";
    if (fs.existsSync(proxyPath)) realPath = proxyPath;
  }

  const stat = fs.statSync(realPath);
  const total = stat.size;
  const ext = path.extname(realPath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  const rangeHeader = request.headers.get("range");

  if (rangeHeader) {
    // Parse "bytes=<start>-<end?>"
    const m = /^bytes=(\d+)-(\d+)?$/.exec(rangeHeader);
    if (!m) {
      return new Response("Malformed Range header", { status: 416 });
    }
    const start = parseInt(m[1], 10);
    const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
    if (start >= total || end < start) {
      return new Response("Requested range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${total}` },
      });
    }
    const chunkSize = end - start + 1;
    const nodeStream = fs.createReadStream(realPath, { start, end });
    const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
    return new Response(webStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=60",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // No Range header: stream the whole file.
  const nodeStream = fs.createReadStream(realPath);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>;
  return new Response(webStream, {
    status: 200,
    headers: {
      "Content-Length": String(total),
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Silence unused warning for NodeWebReadableStream — kept for future typing
void (null as unknown as NodeWebReadableStream);
