/**
 * YouTube channel scraping via yt-dlp.
 *
 * No API key needed. yt-dlp parses YouTube's HTML and JSON endpoints, which
 * is more resilient than the Data API for our use case (we only need titles,
 * descriptions and subtitles — no auth or quotas).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

export interface YoutubeVideo {
  id: string;
  url: string;
  title: string;
  description: string | null;
  thumbnail_url: string;
  published_at: string | null;
  duration_sec: number | null;
}

interface YtDlpFlatItem {
  id: string;
  title: string;
  upload_date?: string;
  timestamp?: number;
  duration?: number;
  description?: string;
}

/** List the most recent videos on a YouTube channel (by handle URL or @handle). */
export async function listChannelVideos(
  channelUrl: string,
  limit = 5,
): Promise<YoutubeVideo[]> {
  // /videos forces yt-dlp to enumerate the uploads tab in publish-date order
  // (newest first), which the bare channel URL doesn't always do.
  const target = channelUrl.replace(/\/$/, "") + "/videos";
  const args = [
    "--flat-playlist",
    "--playlist-end", String(limit),
    "--dump-single-json",
    "--no-warnings",
    target,
  ];

  const out = await runYtDlp(args, 30_000);
  if (!out) return [];

  let parsed: { entries?: YtDlpFlatItem[] };
  try {
    parsed = JSON.parse(out);
  } catch {
    return [];
  }

  const entries = (parsed.entries ?? []).slice(0, limit);
  return entries.map((e) => {
    const published = e.upload_date
      ? `${e.upload_date.slice(0, 4)}-${e.upload_date.slice(4, 6)}-${e.upload_date.slice(6, 8)}`
      : e.timestamp
        ? new Date(e.timestamp * 1000).toISOString()
        : null;
    return {
      id: e.id,
      url: `https://www.youtube.com/watch?v=${e.id}`,
      title: (e.title ?? "Sin título").trim(),
      description: e.description?.trim() || null,
      thumbnail_url: `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg`,
      published_at: published,
      duration_sec: e.duration ?? null,
    };
  });
}

interface VideoDetails {
  description: string | null;
  thumbnail_url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
}

/** Fetch full description + engagement metrics (the flat-playlist call doesn't return them). */
export async function fetchVideoDetails(videoUrl: string): Promise<VideoDetails | null> {
  const args = [
    "--dump-single-json",
    "--skip-download",
    "--no-warnings",
    "--no-playlist",
    videoUrl,
  ];
  const out = await runYtDlp(args, 30_000);
  if (!out) return null;
  try {
    const j = JSON.parse(out) as {
      description?: string;
      thumbnail?: string;
      view_count?: number;
      like_count?: number;
      comment_count?: number;
    };
    return {
      description: j.description?.trim() || null,
      thumbnail_url: j.thumbnail || null,
      views: typeof j.view_count === "number" ? j.view_count : null,
      likes: typeof j.like_count === "number" ? j.like_count : null,
      comments: typeof j.comment_count === "number" ? j.comment_count : null,
    };
  } catch {
    return null;
  }
}

/**
 * Download auto-generated subtitles in Spanish or English (whichever is
 * available first) and return the merged plain-text transcript. Returns null
 * if no subtitles are available — that's normal for newly-uploaded videos.
 */
export async function fetchTranscript(videoUrl: string): Promise<string | null> {
  const tmpDir = path.join(os.tmpdir(), `autocont-yt-${randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  try {
    const args = [
      "--write-auto-subs",
      "--write-subs",
      "--sub-langs", "es.*,en.*",
      "--skip-download",
      "--sub-format", "vtt",
      "--no-playlist",
      "--no-warnings",
      "-o", path.join(tmpDir, "%(id)s.%(ext)s"),
      videoUrl,
    ];
    await runYtDlp(args, 45_000);

    const files = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".vtt"));
    if (files.length === 0) return null;

    // Prefer Spanish if both exist
    files.sort((a, b) => (a.includes(".es") ? -1 : b.includes(".es") ? 1 : 0));
    const vtt = fs.readFileSync(path.join(tmpDir, files[0]), "utf8");
    return vttToText(vtt);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

/** Strip VTT cue markers and dedupe consecutive identical lines. */
function vttToText(vtt: string): string {
  const lines: string[] = [];
  let prev = "";
  for (const raw of vtt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("WEBVTT") || line.startsWith("Kind:") || line.startsWith("Language:")) continue;
    if (/^\d+$/.test(line)) continue; // cue index
    if (line.includes("-->")) continue; // timestamp
    // Strip <c>, <00:00:01.000> and similar inline tags
    const clean = line.replace(/<[^>]+>/g, "").trim();
    if (!clean) continue;
    if (clean === prev) continue;
    lines.push(clean);
    prev = clean;
  }
  const text = lines.join(" ").replace(/\s+/g, " ").trim();
  // Cap at 12k chars
  return text.length > 12000 ? text.slice(0, 12000) : text;
}

function runYtDlp(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn("yt-dlp", args, { env: { ...process.env, PATH: `${process.env.PATH}:/opt/homebrew/bin:/usr/local/bin` } });
    let out = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
    }, timeoutMs);
    proc.stdout.on("data", (c) => { out += c.toString(); });
    proc.on("close", () => {
      clearTimeout(timer);
      if (killed) resolve("");
      else resolve(out);
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });
  });
}
