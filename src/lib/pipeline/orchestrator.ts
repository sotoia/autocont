import path from "node:path";
import fs from "node:fs";
import { repo } from "@/lib/db";
import type { JobKind, StockAsset } from "@/lib/types";
import { transcribeVideo } from "./transcribe";
import {
  generateShotPlanWithUsage,
  saveShotPlan,
  loadCachedShotPlan,
  shotPlanInputsHash,
  type ShotPlan,
  type ShotPlanOptions,
} from "./shot-plan";
import { saveFcpxml, type StockClipPlacement, type MusicTrack } from "./fcpxml";
import { probeVideo } from "./ffprobe";
import { recordApiCall, recordCacheHit } from "./usage";

function now(): string {
  return new Date().toISOString();
}

function logProject(projectId: string, msg: string) {
  const project = repo.getProject(projectId);
  if (!project) return;
  const logFile = path.join(project.folder_path, "logs", "pipeline.log");
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, `[${now()}] ${msg}\n`);
  console.log(`[pipeline:${projectId.slice(0, 8)}] ${msg}`);
}

interface StepContext {
  projectId: string;
  kind: JobKind;
  fn: (update: (p: number) => void) => Promise<unknown>;
}

async function runStep<T>(ctx: StepContext): Promise<T> {
  const job = repo.createJob({
    project_id: ctx.projectId,
    kind: ctx.kind,
    status: "running",
    progress: 0,
    started_at: now(),
    ended_at: null,
    error: null,
    payload: null,
  });

  const update = (p: number) => {
    const clamped = Math.max(0, Math.min(1, p));
    repo.updateJob(job.id, { progress: clamped });
  };

  try {
    const result = await ctx.fn(update);
    repo.updateJob(job.id, {
      status: "done",
      progress: 1,
      ended_at: now(),
    });
    return result as T;
  } catch (err) {
    const message = (err as Error).message;
    repo.updateJob(job.id, {
      status: "error",
      ended_at: now(),
      error: message,
    });
    throw err;
  }
}

interface StockResolution {
  asset: StockAsset;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  durationSec: number;
}

async function probeStockOnce(
  asset: StockAsset,
  cache: Map<string, StockResolution>
): Promise<StockResolution> {
  const cached = cache.get(asset.path);
  if (cached) return cached;

  let duration = asset.duration_sec ?? 0;
  let width: number | undefined;
  let height: number | undefined;
  let fps: number | undefined;
  let hasAudio = false;
  try {
    const meta = await probeVideo(asset.path);
    duration = meta.duration_sec || duration;
    width = meta.width;
    height = meta.height;
    fps = meta.fps;
    try {
      const { hasAudioStream } = await import("./ffprobe");
      hasAudio = await hasAudioStream(asset.path);
    } catch {
      hasAudio = false;
    }
  } catch {
    /* keep defaults; we'll fall back to segment duration later */
  }

  const res: StockResolution = {
    asset,
    width,
    height,
    fps,
    hasAudio,
    durationSec: duration > 0 ? duration : 0,
  };
  cache.set(asset.path, res);
  return res;
}

/**
 * Compute the uniform scale needed so a clip (clipW×clipH) fills a target
 * frame (tlW×tlH) on top of DaVinci's default fit-to-fit scaling. Returns 1.0
 * when the aspect ratios match. For 2048×1080 in 1920×1080 → ~1.067.
 */
function computeFillScale(
  clipW: number | undefined,
  clipH: number | undefined,
  tlW: number,
  tlH: number
): number {
  if (!clipW || !clipH || clipW <= 0 || clipH <= 0) return 1;
  const clipAspect = clipW / clipH;
  const tlAspect = tlW / tlH;
  const ratio = Math.max(clipAspect / tlAspect, tlAspect / clipAspect);
  // Clamp noisy values. If aspect matches within 0.5% just return 1.
  if (Math.abs(ratio - 1) < 0.005) return 1;
  return Math.round(ratio * 1000) / 1000;
}

async function resolveStockPlacements(
  plan: ShotPlan,
  projectFolder: string,
  stockCatalog: StockAsset[],
  timeline: { width: number; height: number },
  maxChunkSec = 4
): Promise<StockClipPlacement[]> {
  const byName = new Map(stockCatalog.map((a) => [a.filename, a]));
  const stockUsedDir = path.join(projectFolder, "stock-used");
  fs.mkdirSync(stockUsedDir, { recursive: true });

  // Purge stale entries: symlinks whose target doesn't exist, or any entry that
  // isn't referenced by the current plan.
  const plannedFilenames = new Set<string>();
  for (const seg of plan.segments) {
    if (seg.source === "stock" && seg.stock_filenames) {
      for (const fn of seg.stock_filenames) plannedFilenames.add(fn);
    }
  }
  for (const entry of fs.readdirSync(stockUsedDir)) {
    if (entry.startsWith(".")) continue;
    const p = path.join(stockUsedDir, entry);
    const lst = fs.lstatSync(p);
    const isOrphanLink = lst.isSymbolicLink() && !fs.existsSync(p);
    const notPlanned = !plannedFilenames.has(entry);
    if (isOrphanLink || notPlanned) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }

  const cache = new Map<string, StockResolution>();
  const placements: StockClipPlacement[] = [];
  // Safety-belt: enforce global uniqueness at chunk level too, in case the shot
  // plan validator let something slip through.
  const globallyUsed = new Set<string>();

  for (const seg of plan.segments) {
    if (seg.source !== "stock" || !seg.stock_filenames?.length) continue;

    // Chunk the segment into pieces ≤ maxChunkSec.
    const segDur = seg.end - seg.start;
    if (segDur <= 0) continue;
    const numChunks = Math.max(1, Math.ceil(segDur / maxChunkSec));
    const chunkDur = segDur / numChunks;

    for (let i = 0; i < numChunks; i++) {
      // Find next unique filename from this segment's preferences (in order).
      const filename = seg.stock_filenames.find(
        (fn) => !globallyUsed.has(fn) && byName.has(fn)
      );
      if (!filename) break; // ran out of unique clips — rest of segment shows raw

      globallyUsed.add(filename);
      const asset = byName.get(filename)!;
      const res = await probeStockOnce(asset, cache);

      // Symlink into stock-used/ (idempotent)
      const link = path.join(stockUsedDir, asset.filename);
      try {
        if (!fs.existsSync(link)) fs.symlinkSync(asset.path, link);
      } catch {
        /* ignore */
      }

      const chunkOffset = seg.start + i * chunkDur;
      const clipAvailable = res.durationSec > 0 ? res.durationSec : chunkDur;
      const shownDur = Math.min(chunkDur, clipAvailable);
      if (shownDur <= 0.04) continue;

      placements.push({
        name: res.asset.filename,
        srcAbsPath: res.asset.path,
        clipDurationSec: res.durationSec > 0 ? res.durationSec : shownDur,
        offsetInTimelineSec: chunkOffset,
        durationInTimelineSec: shownDur,
        width: res.width,
        height: res.height,
        fps: res.fps,
        hasAudio: res.hasAudio,
        fillScale: computeFillScale(res.width, res.height, timeline.width, timeline.height),
        reason: seg.reason,
        overlayText: seg.overlay_text,
      });
    }
  }

  return placements;
}

export interface PipelineResult {
  projectId: string;
  fcpxmlPath: string;
  transcriptPath: string;
  shotPlanPath: string;
  stockUsed: number;
}

/**
 * Pick a music track from the indexed library whose tags overlap with the
 * shot plan's declared `music_energy`. Falls back to any track, or `null`
 * if the library is empty. Stable per-project via a seeded random so
 * re-running doesn't swap music unnecessarily.
 */
function pickMusicTrack(projectId: string, plan: ShotPlan): MusicTrack | null {
  if (plan.music_energy === "none") return null;
  const all = repo.listAssets("music");
  if (all.length === 0) return null;

  // Preferred tag = music_energy; also accept common Spanish synonyms.
  const energy = plan.music_energy;
  const synonyms: Record<string, string[]> = {
    chill: ["chill", "ambient", "calma", "calm", "lofi", "lo-fi", "downtempo"],
    focus: ["focus", "concentracion", "concentración", "study", "minimal"],
    upbeat: ["upbeat", "energetic", "energético", "energetico", "happy", "vlog"],
    dramatic: ["dramatic", "cinematic", "epic", "tension", "tenso"],
  };
  const wanted = new Set((synonyms[energy] ?? [energy]).map((t) => t.toLowerCase()));

  const matching = all.filter((a) =>
    a.tags.some((t) => wanted.has(t.toLowerCase())),
  );
  const pool = matching.length > 0 ? matching : all;

  // Deterministic pick so regenerations reuse the same track.
  let h = 0;
  for (let i = 0; i < projectId.length; i++) h = (h * 31 + projectId.charCodeAt(i)) >>> 0;
  const picked = pool[h % pool.length];

  return {
    name: picked.filename,
    srcAbsPath: picked.path,
    sourceDurationSec: picked.duration_sec ?? 0,
    offsetInTimelineSec: 0,
    volume: 0.22, // subtle under dialogue
  };
}

export async function runPipeline(projectId: string): Promise<PipelineResult> {
  const project = repo.getProject(projectId);
  if (!project) throw new Error(`Proyecto no encontrado: ${projectId}`);
  if (!project.raw_path || !fs.existsSync(project.raw_path)) {
    throw new Error(`El proyecto no tiene un archivo raw accesible: ${project.raw_path}`);
  }

  logProject(projectId, `comienzo del pipeline (${project.raw_path})`);
  repo.updateProject(projectId, { status: "transcribing" });

  // 1. Probe video metadata
  const meta = await probeVideo(project.raw_path);
  repo.updateProject(projectId, { duration_sec: meta.duration_sec });
  logProject(
    projectId,
    `metadatos: ${meta.width}x${meta.height} @ ${meta.fps.toFixed(2)}fps, ${meta.duration_sec.toFixed(1)}s`
  );

  // 2. Transcribe
  const transcriptOutDir = path.join(project.folder_path, "transcript");
  const { transcript, transcriptPath } = await runStep<{
    transcript: import("./transcribe").Transcript;
    transcriptPath: string;
  }>({
    projectId,
    kind: "transcribe",
    fn: async (update) => {
      return await transcribeVideo({
        videoPath: project.raw_path!,
        outputDir: transcriptOutDir,
        onProgress: (p, stage) => {
          update(p);
          if (p === 1 || (stage === "whisper" && p >= 0.95)) {
            logProject(projectId, `transcripción ${stage} completada`);
          }
        },
      });
    },
  });
  logProject(
    projectId,
    `transcrito: ${transcript.segments.length} segmentos, "${transcript.text.slice(0, 80)}..."`
  );

  const settings = repo.getSettings();
  if (!settings.claude_api_key) {
    throw new Error("Falta la Anthropic API key en Ajustes.");
  }

  // 3. Shot plan via Claude (usa solo el catálogo de stock LOCAL del usuario)
  repo.updateProject(projectId, { status: "planning" });

  const stockCatalog = repo.listAssets("stock_video").concat(repo.listAssets("stock_photo"));

  const model = settings.claude_model || "claude-opus-4-7";
  const shotPlanOpts: ShotPlanOptions = {
    transcript,
    stockCatalog,
    videoDurationSec: meta.duration_sec,
    apiKey: settings.claude_api_key,
    model,
  };
  const expectedHash = shotPlanInputsHash(shotPlanOpts);

  const plan = await runStep<ShotPlan>({
    projectId,
    kind: "shot_plan",
    fn: async (update) => {
      update(0.1);
      // Cache hit: same inputs as a previous run → reuse shot plan, zero cost.
      const cached = loadCachedShotPlan(project.folder_path, expectedHash);
      if (cached) {
        recordCacheHit({ projectId, stage: "shot_plan", model, inputsHash: expectedHash });
        update(1);
        logProject(projectId, "shot plan: CACHE HIT (inputs sin cambios, €0)");
        return cached;
      }
      const result = await generateShotPlanWithUsage(shotPlanOpts);
      if (result.usage) {
        const cost = recordApiCall({
          projectId,
          stage: "shot_plan",
          model,
          usage: result.usage,
          inputsHash: expectedHash,
          meta: { segments: result.plan.segments.length },
        });
        logProject(projectId, `shot plan API: $${cost.toFixed(4)} (in ${result.usage.input_tokens} / out ${result.usage.output_tokens} tok)`);
      }
      update(1);
      return result.plan;
    },
  });
  const shotPlanPath = saveShotPlan(project.folder_path, plan, expectedHash);
  logProject(
    projectId,
    `shot plan: ${plan.segments.length} segmentos (${
      plan.segments.filter((s) => s.source === "motion").length
    } motion (sin renderizar en v0.1), ${plan.segments.filter((s) => s.source === "stock").length} stock, ${
      plan.segments.filter((s) => s.source === "raw").length
    } raw)`
  );

  // 5. Resolve stock clips (symlink into stock-used/, prepare placements)
  repo.updateProject(projectId, { status: "assembling" });
  const stockPlacements = await runStep<StockClipPlacement[]>({
    projectId,
    kind: "stock_match",
    fn: async (update) => {
      update(0.2);
      const placements = await resolveStockPlacements(
        plan,
        project.folder_path,
        stockCatalog,
        { width: meta.width, height: meta.height }
      );
      update(1);
      return placements;
    },
  });
  logProject(
    projectId,
    `stock resuelto: ${stockPlacements.length} clip(s) symlinkeados a stock-used/`
  );

  // 6. Pick a music track based on plan.music_energy. Soft-fails if the
  //    library has no audio assets (the timeline still renders without music).
  const music = pickMusicTrack(projectId, plan);
  if (music) {
    logProject(
      projectId,
      `música elegida: "${music.name}" (energy=${plan.music_energy}) — volumen ${(music.volume ?? 0.22).toFixed(2)}`,
    );
  } else if (plan.music_energy !== "none") {
    logProject(projectId, `música: no hay pistas indexadas para energy=${plan.music_energy}`);
  }

  // 7. Export FCPXML (multi-track: raw on spine, stock on lane=1, music on lane=-1)
  //    Motion segments are emitted as markers only — motion render lives outside OSS v0.1.
  const fcpxmlPath = await runStep<string>({
    projectId,
    kind: "timeline_export",
    fn: async (update) => {
      update(0.3);
      const outPath = saveFcpxml({
        projectName: project.name,
        rawVideoPath: project.raw_path!,
        rawDurationSec: meta.duration_sec,
        frameRate: meta.fps,
        width: meta.width,
        height: meta.height,
        plan,
        stockPlacements,
        music,
        outDir: path.join(project.folder_path, "timeline"),
      });
      update(1);
      return outPath;
    },
  });
  logProject(
    projectId,
    `FCPXML listo: ${fcpxmlPath} (v1 raw + v2 ${stockPlacements.length} stock${music ? " + audio música" : ""})`
  );

  repo.updateProject(projectId, { status: "ready" });
  return {
    projectId,
    fcpxmlPath,
    transcriptPath,
    shotPlanPath,
    stockUsed: stockPlacements.length,
  };
}

export async function runPipelineDetached(projectId: string): Promise<void> {
  runPipeline(projectId).catch((err) => {
    const project = repo.getProject(projectId);
    const msg = (err as Error).message;
    if (project) logProject(projectId, `ERROR: ${msg}`);
    repo.updateProject(projectId, { status: "failed", notes: msg });
  });
}
