import { NextRequest } from "next/server";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { repo } from "@/lib/db";

/**
 * GET /api/thumb/<projectId>
 *
 * Returns a JPEG thumbnail extracted from the project's raw video. Cached
 * at <project.folder_path>/thumb.jpg so subsequent calls are instant.
 * Returns 404 if the project has no raw_path on disk.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = repo.getProject(id);
  if (!project || !project.raw_path) {
    return new Response("No raw video for this project", { status: 404 });
  }

  // Raw may be a symlink into /raw/; resolve it so ffmpeg gets a real path.
  let rawReal: string;
  try {
    rawReal = fs.realpathSync(project.raw_path);
  } catch {
    return new Response("Raw video not found on disk", { status: 404 });
  }
  if (!fs.existsSync(rawReal)) {
    return new Response("Raw video not found on disk", { status: 404 });
  }

  const thumbPath = path.join(project.folder_path, "thumb.jpg");

  // Regenerate thumb if missing or stale (raw newer than thumb).
  const needsRegen = (() => {
    if (!fs.existsSync(thumbPath)) return true;
    try {
      const thumbStat = fs.statSync(thumbPath);
      const rawStat = fs.statSync(rawReal);
      return rawStat.mtimeMs > thumbStat.mtimeMs;
    } catch {
      return true;
    }
  })();

  if (needsRegen) {
    try {
      await extractFrame(rawReal, thumbPath);
    } catch (err) {
      return new Response(`ffmpeg failed: ${(err as Error).message}`, { status: 500 });
    }
  }

  try {
    const buf = fs.readFileSync(thumbPath);
    // ArrayBuffer-backed view so fetch Response accepts it cleanly
    const body = new Uint8Array(buf);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=60, must-revalidate",
      },
    });
  } catch (err) {
    return new Response(`Read thumb failed: ${(err as Error).message}`, { status: 500 });
  }
}

/**
 * Extracts a single JPEG frame ~3 seconds into the clip (to skip black
 * intro frames) and scales it to 640px wide preserving aspect ratio.
 *
 * Requires ffmpeg on PATH — the rest of the pipeline already relies on it.
 */
function extractFrame(rawPath: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // `-ss` before `-i` = fast seek (input-level). Accurate enough for
    // thumbnailing and avoids ffmpeg decoding from t=0.
    const args = [
      "-hide_banner",
      "-loglevel", "error",
      "-ss", "3",
      "-i", rawPath,
      "-frames:v", "1",
      "-vf", "scale=640:-2",
      "-q:v", "4",
      "-y",
      outPath,
    ];
    const ff = spawn("ffmpeg", args);
    let stderr = "";
    ff.stderr.on("data", (c) => { stderr += c.toString(); });
    ff.on("error", (err) => reject(err));
    ff.on("close", (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve();
      else reject(new Error(`exit ${code}: ${stderr.slice(-300)}`));
    });
  });
}
