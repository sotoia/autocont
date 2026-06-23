import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { repo } from "@/lib/db";
import type { Project } from "@/lib/types";

export const VIDEO_EXT = new Set([".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"]);

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 50) || "clip"
  );
}

function prettifyName(basename: string): string {
  return basename
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * If the configured OBS watch path doesn't exist but ~/Movies does,
 * fall back to ~/Movies so the user's video is actually seen.
 */
export function resolveWatchPath(): string {
  const settings = repo.getSettings();
  const configured = settings.obs_watch_path;
  if (configured && fs.existsSync(configured)) return configured;

  const moviesDir = path.join(os.homedir(), "Movies");
  if (fs.existsSync(moviesDir)) {
    // Auto-fix the setting so the UI reflects reality
    repo.updateSettings({ obs_watch_path: moviesDir });
    return moviesDir;
  }
  return configured;
}

/**
 * Register a video file as a project if it isn't already tracked.
 * - Creates the project folder tree (raw/ transcript/ motion/ stock-used/ timeline/ logs/)
 * - Symlinks the original video into raw/ so we never duplicate 100+ MB
 * - Inserts a row in `projects` with status="pending"
 */
export function ingestFile(filepath: string): Project | null {
  const absolute = path.resolve(filepath);
  if (!fs.existsSync(absolute)) return null;

  // Skip if already tracked
  const existing = repo.listProjects().find((p) => p.raw_path === absolute);
  if (existing) return null;

  const stat = fs.statSync(absolute);
  if (!stat.isFile()) return null;

  const ext = path.extname(absolute).toLowerCase();
  if (!VIDEO_EXT.has(ext)) return null;

  const basename = path.basename(absolute, ext);
  const settings = repo.getSettings();

  const date = new Date().toISOString().slice(0, 10);
  let folderName = `${date}_${slugify(basename)}`;
  let folder = path.join(settings.projects_path, folderName);
  // Avoid collisions
  let suffix = 2;
  while (fs.existsSync(folder)) {
    folder = path.join(settings.projects_path, `${folderName}-${suffix++}`);
    if (suffix > 20) break;
  }

  fs.mkdirSync(folder, { recursive: true });
  for (const sub of ["raw", "transcript", "motion", "stock-used", "timeline", "logs"]) {
    fs.mkdirSync(path.join(folder, sub), { recursive: true });
  }

  // Symlink original video into raw/ (cheap, no copy)
  const link = path.join(folder, "raw", path.basename(absolute));
  try {
    if (!fs.existsSync(link)) fs.symlinkSync(absolute, link);
  } catch {
    // Fallback: copy if symlink fails (e.g. cross-device)
    try {
      if (!fs.existsSync(link)) fs.copyFileSync(absolute, link);
    } catch {
      /* give up, project still useful with raw_path pointer */
    }
  }

  return repo.createProject({
    name: prettifyName(basename),
    status: "pending",
    raw_path: absolute,
    folder_path: folder,
  });
}

/**
 * One-shot scan of the OBS watch folder (top-level only).
 * Returns newly-created projects.
 */
export function scanOnce(): { created: Project[]; scanned: number; watchPath: string } {
  const watchPath = resolveWatchPath();
  if (!watchPath || !fs.existsSync(watchPath)) {
    return { created: [], scanned: 0, watchPath };
  }

  const created: Project[] = [];
  let scanned = 0;

  for (const entry of fs.readdirSync(watchPath, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith(".")) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!VIDEO_EXT.has(ext)) continue;

    scanned++;
    const fullPath = path.join(watchPath, entry.name);
    const project = ingestFile(fullPath);
    if (project) created.push(project);
  }

  return { created, scanned, watchPath };
}
