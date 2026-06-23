import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { repo } from "@/lib/db";
import { hasAudioStream } from "./ffprobe";

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  language: string;
  duration_sec: number;
  text: string;
  segments: TranscriptSegment[];
  words?: TranscriptWord[];
}

function findBinary(...candidates: string[]): string | null {
  for (const name of candidates) {
    const common = [
      `/opt/homebrew/bin/${name}`,
      `/usr/local/bin/${name}`,
      `/usr/bin/${name}`,
    ];
    for (const c of common) {
      if (fs.existsSync(c)) return c;
    }
  }
  return null;
}

function findWhisperBinary(): string {
  const bin = findBinary("whisper-cli", "whisper-cpp", "main", "whisper");
  if (!bin) {
    throw new Error(
      "whisper-cpp no encontrado. Instala con: brew install whisper-cpp"
    );
  }
  return bin;
}

function findFfmpegBinary(): string {
  const bin = findBinary("ffmpeg");
  if (!bin) throw new Error("ffmpeg no encontrado. Instala con: brew install ffmpeg");
  return bin;
}

function findModel(modelName: string): string {
  // Tries common install dirs
  const homeDir = os.homedir();
  const candidates = [
    path.join(homeDir, "whisper-models", `ggml-${modelName}.bin`),
    path.join(homeDir, ".whisper", `ggml-${modelName}.bin`),
    `/opt/homebrew/share/whisper-cpp/ggml-${modelName}.bin`,
    `/usr/local/share/whisper-cpp/ggml-${modelName}.bin`,
    path.join(homeDir, "whisper-models", `${modelName}.bin`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    `Modelo Whisper "${modelName}" no encontrado. Se busca en ~/whisper-models/ggml-${modelName}.bin`
  );
}

export async function extractAudio(
  videoPath: string,
  outputWav: string,
  onProgress?: (p: number) => void
): Promise<void> {
  const ffmpeg = findFfmpegBinary();
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      outputWav,
    ];
    const proc = spawn(ffmpeg, args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      const s = chunk.toString();
      stderr += s;
      // ffmpeg prints time=HH:MM:SS.ms — we don't have total duration here, so just indicate activity
      onProgress?.(0.5);
    });
    proc.on("close", (code) => {
      if (code === 0) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-500)}`));
      }
    });
    proc.on("error", reject);
  });
}

export async function runWhisper(
  wavPath: string,
  outputDir: string,
  options: { language?: string; model?: string } = {},
  onProgress?: (p: number) => void
): Promise<Transcript> {
  const whisper = findWhisperBinary();
  const model = findModel(options.model ?? repo.getSettings().whisper_model ?? "large-v3-turbo");
  const language = options.language ?? "es";

  const outputBase = path.join(outputDir, "whisper");

  const args = [
    "-m",
    model,
    "-f",
    wavPath,
    "-l",
    language,
    "-of",
    outputBase,
    "-oj", // JSON output
    "--output-srt",
    "--print-progress",
    "-t",
    String(Math.max(2, Math.floor((os.cpus().length ?? 4) - 1))),
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(whisper, args);
    let stderr = "";
    let lastProgress = 0;

    const parseProgress = (s: string) => {
      // whisper-cpp: "whisper_print_progress_callback: progress =  15%"
      const matches = s.matchAll(/progress\s*=\s*(\d+)\s*%/gi);
      for (const m of matches) {
        const p = Number(m[1]) / 100;
        if (p > lastProgress) {
          lastProgress = p;
          onProgress?.(p);
        }
      }
    };

    proc.stdout.on("data", (chunk) => parseProgress(chunk.toString()));
    proc.stderr.on("data", (chunk) => {
      const s = chunk.toString();
      stderr += s;
      parseProgress(s);
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`whisper exit ${code}: ${stderr.slice(-500)}`));
        return;
      }
      const jsonPath = `${outputBase}.json`;
      if (!fs.existsSync(jsonPath)) {
        reject(new Error(`No se generó ${jsonPath}`));
        return;
      }
      try {
        const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
        const transcript = normalizeWhisperJson(raw, language);
        resolve(transcript);
      } catch (err) {
        reject(err);
      }
    });
    proc.on("error", reject);
  });
}

function normalizeWhisperJson(raw: unknown, language: string): Transcript {
  type WhisperRaw = {
    result?: { language?: string };
    transcription?: Array<{
      offsets?: { from: number; to: number };
      timestamps?: { from: string; to: string };
      text?: string;
    }>;
  };
  const r = raw as WhisperRaw;
  const segments: TranscriptSegment[] = [];
  let text = "";
  let duration = 0;

  const items = r.transcription ?? [];
  items.forEach((s, i) => {
    const startMs = s.offsets?.from ?? 0;
    const endMs = s.offsets?.to ?? 0;
    const startSec = startMs / 1000;
    const endSec = endMs / 1000;
    const segText = (s.text ?? "").trim();
    segments.push({ id: i, start: startSec, end: endSec, text: segText });
    if (segText) text += (text ? " " : "") + segText;
    duration = Math.max(duration, endSec);
  });

  return {
    language: r.result?.language ?? language,
    duration_sec: duration,
    text,
    segments,
  };
}

export interface TranscribeOptions {
  videoPath: string;
  outputDir: string;
  onProgress?: (p: number, stage: "ffmpeg" | "whisper") => void;
}

export async function transcribeVideo(opts: TranscribeOptions): Promise<{
  transcriptPath: string;
  transcript: Transcript;
  wavPath: string | null;
}> {
  fs.mkdirSync(opts.outputDir, { recursive: true });

  // Cache: if a valid transcript.json already exists AND is newer than the video, reuse it
  const transcriptPath = path.join(opts.outputDir, "transcript.json");
  if (fs.existsSync(transcriptPath)) {
    try {
      const transcriptStat = fs.statSync(transcriptPath);
      const videoStat = fs.statSync(opts.videoPath);
      if (transcriptStat.mtimeMs > videoStat.mtimeMs) {
        const cached: Transcript = JSON.parse(fs.readFileSync(transcriptPath, "utf8"));
        opts.onProgress?.(1, "whisper");
        return {
          transcriptPath,
          transcript: cached,
          wavPath: fs.existsSync(path.join(opts.outputDir, "audio.wav"))
            ? path.join(opts.outputDir, "audio.wav")
            : null,
        };
      }
    } catch {
      /* corrupt — fall through and re-transcribe */
    }
  }

  // Skip transcription entirely if the video has no audio track (b-roll / silent stock)
  const hasAudio = await hasAudioStream(opts.videoPath);
  if (!hasAudio) {
    const empty: Transcript = {
      language: "none",
      duration_sec: 0,
      text: "",
      segments: [],
    };
    fs.writeFileSync(transcriptPath, JSON.stringify(empty, null, 2));
    opts.onProgress?.(1, "whisper");
    return { transcriptPath, transcript: empty, wavPath: null };
  }

  const wavPath = path.join(opts.outputDir, "audio.wav");
  await extractAudio(opts.videoPath, wavPath, (p) =>
    opts.onProgress?.(p * 0.15, "ffmpeg")
  );
  const transcript = await runWhisper(wavPath, opts.outputDir, {}, (p) =>
    opts.onProgress?.(0.15 + p * 0.85, "whisper")
  );

  fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2));
  return { transcriptPath, transcript, wavPath };
}
