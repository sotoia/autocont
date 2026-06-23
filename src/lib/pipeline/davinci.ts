import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export interface DavinciImportResult {
  ok: boolean;
  project?: string;
  created?: boolean;
  timeline?: string;
  reused?: boolean;
  replaced?: boolean;
  error?: string;
  error_kind?: "not_running" | "scripting_disabled" | "import_failed" | "unknown";
}

function findPython(): string {
  // Prefer Homebrew Python (3.11+) — macOS system Python 3.9 can hang when loading
  // DaVinci's fusionscript.so on Apple Silicon.
  const candidates = [
    "/opt/homebrew/bin/python3",
    "/opt/homebrew/bin/python3.13",
    "/opt/homebrew/bin/python3.12",
    "/opt/homebrew/bin/python3.11",
    "/usr/local/bin/python3",
    "/usr/bin/python3",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return "python3";
}

function resolveScriptPath(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "scripts", "davinci-import.py"),
    path.resolve(process.cwd(), "dashboard", "scripts", "davinci-import.py"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export async function ensureDaVinciRunning(waitMs = 45_000): Promise<{ ok: boolean; error?: string }> {
  // Check if Resolve is running. If not, launch it and poll until the process appears.
  const isRunning = async (): Promise<boolean> => {
    return new Promise((resolve) => {
      const child = spawn("pgrep", ["-f", "DaVinci Resolve.app/Contents/MacOS/Resolve"]);
      let out = "";
      child.stdout.on("data", (c) => (out += c.toString()));
      child.on("close", (code) => resolve(code === 0 && out.trim().length > 0));
      child.on("error", () => resolve(false));
    });
  };

  if (await isRunning()) return { ok: true };

  // Launch DaVinci (without passing a file — the scripting API will do the import)
  const launch = spawn("open", ["-a", "DaVinci Resolve"]);
  let launchErr = "";
  launch.stderr.on("data", (c) => (launchErr += c.toString()));
  await new Promise<void>((resolve) => {
    launch.on("close", () => resolve());
    launch.on("error", () => resolve());
  });

  // Poll up to waitMs for the process to appear
  const start = Date.now();
  while (Date.now() - start < waitMs) {
    if (await isRunning()) return { ok: true };
    await new Promise((r) => setTimeout(r, 1000));
  }
  return {
    ok: false,
    error: launchErr.trim() || "DaVinci no arrancó en el tiempo esperado",
  };
}

export function importTimelineIntoDaVinci(
  projectName: string,
  fcpxmlPath: string,
  timeoutMs = 90_000
): Promise<DavinciImportResult> {
  return new Promise((resolve) => {
    const script = resolveScriptPath();
    if (!script) {
      resolve({ ok: false, error: "Script davinci-import.py no encontrado en /scripts" });
      return;
    }
    const python = findPython();
    const child = spawn(python, [script, projectName, fcpxmlPath], {
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill("SIGTERM");
      resolve({
        ok: false,
        error:
          "Timeout conectando con DaVinci. Abre DaVinci Resolve y activa External scripting en Preferences.",
      });
    }, timeoutMs);

    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const lastLine = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
      try {
        const parsed = JSON.parse(lastLine) as DavinciImportResult;
        resolve(parsed);
      } catch {
        resolve({
          ok: false,
          error:
            stderr.trim() ||
            stdout.trim() ||
            `python exit ${code} sin salida válida`,
        });
      }
    });
    child.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
  });
}
