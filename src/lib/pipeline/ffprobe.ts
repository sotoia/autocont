import { spawn } from "node:child_process";
import fs from "node:fs";

function findFfprobe(): string {
  for (const c of ["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe", "/usr/bin/ffprobe"]) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error("ffprobe no encontrado. Instala con: brew install ffmpeg");
}

export interface VideoMeta {
  duration_sec: number;
  width: number;
  height: number;
  fps: number;
}

export async function hasAudioStream(videoPath: string): Promise<boolean> {
  const ffprobe = findFfprobe();
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      videoPath,
    ];
    const proc = spawn(ffprobe, args);
    let out = "";
    proc.stdout.on("data", (c) => (out += c.toString()));
    proc.on("close", () => resolve(out.trim() === "audio"));
    proc.on("error", reject);
  });
}

export async function probeVideo(videoPath: string): Promise<VideoMeta> {
  const ffprobe = findFfprobe();
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,r_frame_rate",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      videoPath,
    ];
    const proc = spawn(ffprobe, args);
    let out = "";
    let err = "";
    proc.stdout.on("data", (c) => (out += c.toString()));
    proc.stderr.on("data", (c) => (err += c.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exit ${code}: ${err.slice(-500)}`));
      try {
        const data = JSON.parse(out) as {
          format: { duration: string };
          streams: Array<{ width: number; height: number; r_frame_rate: string }>;
        };
        const v = data.streams[0];
        const [num, den] = v.r_frame_rate.split("/").map(Number);
        resolve({
          duration_sec: Number(data.format.duration),
          width: v.width,
          height: v.height,
          fps: den ? num / den : 25,
        });
      } catch (e) {
        reject(e);
      }
    });
    proc.on("error", reject);
  });
}
