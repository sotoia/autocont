import fs from "node:fs";
import path from "node:path";
import type { ShotPlan } from "./shot-plan";

/**
 * Generates an FCPXML v1.11 file for DaVinci Resolve with:
 *   - V1 (spine): raw video, full length
 *   - V2 (connected clips on lane=1): stock clips overlaid at each stock segment
 *   - Markers: one per motion segment (still to be rendered in a future step)
 *
 * Stock clips are trimmed to min(clip_duration, segment_duration) starting from 0 of the source.
 */

export interface StockClipPlacement {
  name: string;
  srcAbsPath: string;
  clipDurationSec: number;
  offsetInTimelineSec: number;
  durationInTimelineSec: number;
  /** Source frame size & rate. Used to emit distinct <format> resources so DaVinci doesn't reject mixed-format clips. */
  width?: number;
  height?: number;
  fps?: number;
  hasAudio?: boolean;
  /** Uniform scale on top of DaVinci's fit-to-fit, so non-16:9 clips fill the frame. 1.0 when aspects match. */
  fillScale?: number;
  reason?: string;
  overlayText?: string;
}

/** AI-generated motion graphics MP4 placed on lane=2 (above stock on lane=1). */
export interface MotionClipPlacement {
  name: string;
  srcAbsPath: string;
  offsetInTimelineSec: number;
  durationInTimelineSec: number;
  width?: number;
  height?: number;
  fps?: number;
  reason?: string;
}

/** Music / soundtrack placed on a negative audio lane (below the spine). */
export interface MusicTrack {
  name: string;
  srcAbsPath: string;
  /** Full source file length (seconds). */
  sourceDurationSec: number;
  /** Where on the timeline the music starts. Default 0. */
  offsetInTimelineSec?: number;
  /** How long to play it on the timeline. Default = rawDurationSec - offset. */
  durationInTimelineSec?: number;
  /** 0..1 volume. Default 0.25 (background). */
  volume?: number;
}

interface BuildOptions {
  projectName: string;
  rawVideoPath: string;
  rawDurationSec: number;
  frameRate?: number;
  width?: number;
  height?: number;
  plan: ShotPlan;
  stockPlacements?: StockClipPlacement[];
  motionPlacements?: MotionClipPlacement[];
  music?: MusicTrack | null;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function timebaseForFps(fps: number): number {
  if (Math.abs(fps - Math.round(fps)) < 0.01) return Math.round(fps) * 1000;
  if (Math.abs(fps - 23.976) < 0.05) return 24000;
  if (Math.abs(fps - 29.97) < 0.05) return 30000;
  if (Math.abs(fps - 59.94) < 0.05) return 60000;
  return Math.round(fps * 1000);
}

function frameDurationFor(fps: number): string {
  if (Math.abs(fps - 23.976) < 0.05) return "1001/24000s";
  if (Math.abs(fps - 29.97) < 0.05) return "1001/30000s";
  if (Math.abs(fps - 59.94) < 0.05) return "1001/60000s";
  return `1000/${Math.round(fps) * 1000}s`;
}

function secondsToRational(sec: number, fps: number): string {
  const frames = Math.max(1, Math.round(sec * fps));
  const tb = timebaseForFps(fps);
  return `${Math.round((frames * tb) / fps)}/${tb}s`;
}

/**
 * DaVinci Resolve 19 falla al importar archivos `.mov` ProRes (Standard,
 * con tracks PCM o tmcd) vía FCPXML — cae a su parser "Fallback" y no
 * resuelve los paths. Pero los `.mov.proxy.mp4` (H.264 720p generados por
 * el pipeline) sí los importa sin problema. Si el path apunta a un .mov
 * y existe el proxy MP4 al lado, devolvemos la URL del proxy.
 */
function fileUrl(abs: string): string {
  if (abs.toLowerCase().endsWith(".mov")) {
    const proxy = `${abs}.proxy.mp4`;
    if (fs.existsSync(proxy)) return `file://${encodeURI(proxy)}`;
  }
  return `file://${encodeURI(abs)}`;
}

export function buildFcpxml(opts: BuildOptions): string {
  const fps = opts.frameRate ?? 25;
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const totalDurRational = secondsToRational(opts.rawDurationSec, fps);

  const stock = opts.stockPlacements ?? [];

  // ---- Build <format> resources ----
  // Deduplicate by (width,height,fps). Sequence uses "r_seq".
  const formatKey = (w: number, h: number, f: number) =>
    `${w}x${h}p${(Math.round(f * 100) / 100).toString().replace(".", "_")}`;
  const formatId = new Map<string, string>();
  let nextFmt = 1;
  const formatResources: string[] = [];

  function registerFormat(w: number, h: number, f: number): string {
    const key = formatKey(w, h, f);
    if (formatId.has(key)) return formatId.get(key)!;
    const id = `r_fmt${nextFmt++}`;
    formatId.set(key, id);
    formatResources.push(
      `    <format id="${id}" name="FFVideoFormat${w}x${h}p${Math.round(
        f
      )}" frameDuration="${frameDurationFor(f)}" width="${w}" height="${h}" colorSpace="1-1-1 (Rec. 709)"/>`
    );
    return id;
  }

  const seqFormatId = registerFormat(width, height, fps);

  // ---- Assets ----
  const rawName = path.basename(opts.rawVideoPath);
  const assetResources: string[] = [];
  assetResources.push(
    `    <asset id="r_raw" name="${escapeXml(rawName)}" src="${escapeXml(
      fileUrl(opts.rawVideoPath)
    )}" start="0s" duration="${totalDurRational}" hasVideo="1" hasAudio="1" format="${seqFormatId}" audioSources="1" audioChannels="2" audioRate="48000"/>`
  );

  const stockAssetId = new Map<string, string>();
  let nextAsset = 1;
  for (const s of stock) {
    if (stockAssetId.has(s.srcAbsPath)) continue;
    const id = `r_stk${nextAsset++}`;
    stockAssetId.set(s.srcAbsPath, id);
    const stW = s.width ?? width;
    const stH = s.height ?? height;
    const stFps = s.fps ?? fps;
    const stFmtId = registerFormat(stW, stH, stFps);
    const stFps2 = stFps;
    const assetDur = secondsToRational(Math.max(0.1, s.clipDurationSec), stFps2);
    const hasAudioAttr = s.hasAudio ? "1" : "0";
    const audioAttrs = s.hasAudio ? ` audioSources="1" audioChannels="2" audioRate="48000"` : "";
    assetResources.push(
      `    <asset id="${id}" name="${escapeXml(s.name)}" src="${escapeXml(
        fileUrl(s.srcAbsPath)
      )}" start="0s" duration="${assetDur}" hasVideo="1" hasAudio="${hasAudioAttr}" format="${stFmtId}"${audioAttrs}/>`
    );
  }

  // Music track (audio-only asset placed on a negative lane below spine)
  const musicAssetXml: string[] = [];
  let musicClipXml = "";
  if (opts.music && fs.existsSync(opts.music.srcAbsPath)) {
    const mus = opts.music;
    const musName = path.basename(mus.srcAbsPath);
    const musId = `r_mus1`;
    const musSourceDur = Math.max(0.5, mus.sourceDurationSec);
    const musSourceDurRat = secondsToRational(musSourceDur, fps);
    musicAssetXml.push(
      `    <asset id="${musId}" name="${escapeXml(musName)}" src="${escapeXml(
        fileUrl(mus.srcAbsPath),
      )}" start="0s" duration="${musSourceDurRat}" hasVideo="0" hasAudio="1" audioSources="1" audioChannels="2" audioRate="44100"/>`,
    );
    const offsetSec = Math.max(0, mus.offsetInTimelineSec ?? 0);
    const remaining = Math.max(0, opts.rawDurationSec - offsetSec);
    const wantDur = Math.min(mus.durationInTimelineSec ?? remaining, remaining, musSourceDur);
    if (wantDur > 0) {
      const offset = secondsToRational(offsetSec, fps);
      const duration = secondsToRational(wantDur, fps);
      const vol = Math.max(0, Math.min(1, mus.volume ?? 0.25));
      // Audio-only asset clip on lane=-1 (below the main spine audio).
      // <adjust-volume amount="..."/> reduces the track so dialogue stays clear.
      musicClipXml =
        `              <asset-clip name="${escapeXml(mus.name)}" ref="${musId}" offset="${offset}" duration="${duration}" start="0s" lane="-1" audioRole="music">
                <adjust-volume amount="${vol.toFixed(3)}"/>
              </asset-clip>`;
    }
  }

  // Motion clips (MP4s rendered from AI-generated canvas scenes)
  const motion = opts.motionPlacements ?? [];
  const motionAssetId = new Map<string, string>();
  let nextMotion = 1;
  for (const m of motion) {
    if (motionAssetId.has(m.srcAbsPath)) continue;
    const id = `r_mot${nextMotion++}`;
    motionAssetId.set(m.srcAbsPath, id);
    const mW = m.width ?? width;
    const mH = m.height ?? height;
    const mFps = m.fps ?? fps;
    const mFmtId = registerFormat(mW, mH, mFps);
    const assetDur = secondsToRational(Math.max(0.1, m.durationInTimelineSec), mFps);
    assetResources.push(
      `    <asset id="${id}" name="${escapeXml(m.name)}" src="${escapeXml(
        fileUrl(m.srcAbsPath)
      )}" start="0s" duration="${assetDur}" hasVideo="1" hasAudio="0" format="${mFmtId}"/>`
    );
  }

  // ---- Connected clips on lane=1 ----
  const connectedClips = stock
    .map((s) => {
      const ref = stockAssetId.get(s.srcAbsPath)!;
      const usedDur = Math.min(s.clipDurationSec, s.durationInTimelineSec);
      if (usedDur <= 0) return "";
      const offset = secondsToRational(Math.max(0, s.offsetInTimelineSec), fps);
      const duration = secondsToRational(usedDur, fps);
      const needsScale = s.fillScale && Math.abs(s.fillScale - 1) > 0.001;
      if (needsScale) {
        const sf = (s.fillScale ?? 1).toFixed(3);
        return `              <asset-clip name="${escapeXml(
          s.name
        )}" ref="${ref}" offset="${offset}" duration="${duration}" start="0s" lane="1">
                <adjust-transform scale="${sf} ${sf}"/>
              </asset-clip>`;
      }
      return `              <asset-clip name="${escapeXml(
        s.name
      )}" ref="${ref}" offset="${offset}" duration="${duration}" start="0s" lane="1"/>`;
    })
    .filter(Boolean)
    .join("\n");

  // Rendered motion clips on lane=2 (above stock)
  const renderedMotionFilenames = new Set(motion.map((m) => m.name));
  const motionClips = motion
    .map((m) => {
      const ref = motionAssetId.get(m.srcAbsPath)!;
      const offset = secondsToRational(Math.max(0, m.offsetInTimelineSec), fps);
      const duration = secondsToRational(m.durationInTimelineSec, fps);
      return `              <asset-clip name="${escapeXml(
        m.name
      )}" ref="${ref}" offset="${offset}" duration="${duration}" start="0s" lane="2"/>`;
    })
    .join("\n");

  // Markers only for motion segments that haven't been rendered yet.
  const motionMarkers = opts.plan.segments
    .filter((s) => s.source === "motion")
    .filter((s) => {
      // Skip if there's a rendered clip that already covers this segment
      return !motion.some(
        (m) =>
          Math.abs(m.offsetInTimelineSec - s.start) < 0.5 &&
          Math.abs(m.durationInTimelineSec - (s.end - s.start)) < 1
      );
    })
    .map((s) => {
      const markerStart = secondsToRational(s.start, fps);
      const markerDur = secondsToRational(Math.max(0.04, s.end - s.start), fps);
      const parts: string[] = ["[MOTION]"];
      if (s.motion_prompt) parts.push(s.motion_prompt);
      if (s.overlay_text) parts.push(`texto: "${s.overlay_text}"`);
      if (s.reason) parts.push(`— ${s.reason}`);
      const note = parts.join(" | ");
      const value = parts.join(" ").slice(0, 200);
      return `              <marker start="${markerStart}" duration="${markerDur}" value="${escapeXml(
        value
      )}" note="${escapeXml(note)}" completed="0"/>`;
    })
    .join("\n");
  // avoid unused warning
  void renderedMotionFilenames;

  const innerChildren = [connectedClips, motionClips, musicClipXml, motionMarkers].filter(Boolean).join("\n");

  // FCPXML 1.10 — DaVinci Resolve 19 acepta esta versión sin problemas;
  // 1.11 abre la timeline vacía silenciosamente (DaVinci 20 sí lo soporta).
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
${formatResources.join("\n")}
${assetResources.concat(musicAssetXml).join("\n")}
  </resources>
  <library>
    <event name="${escapeXml(opts.projectName)}">
      <project name="${escapeXml(opts.projectName)}">
        <sequence format="${seqFormatId}" duration="${totalDurRational}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            <asset-clip name="${escapeXml(
              rawName
            )}" offset="0s" ref="r_raw" duration="${totalDurRational}" format="${seqFormatId}" tcFormat="NDF" audioRole="dialogue">
${innerChildren}
            </asset-clip>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
  return xml;
}

export function saveFcpxml(opts: BuildOptions & { outDir: string }): string {
  fs.mkdirSync(opts.outDir, { recursive: true });
  const xml = buildFcpxml(opts);
  const safeName = opts.projectName.replace(/[/\\:]/g, "-").slice(0, 60);
  const outPath = path.join(opts.outDir, `${safeName}.fcpxml`);
  fs.writeFileSync(outPath, xml, "utf8");
  return outPath;
}
