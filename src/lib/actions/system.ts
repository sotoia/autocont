"use server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export async function openInFinderAction(targetPath: string): Promise<{ ok: boolean; error?: string }> {
  if (!targetPath || typeof targetPath !== "string") {
    return { ok: false, error: "Ruta inválida" };
  }
  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, error: "La ruta no existe" };
  }
  try {
    const child = spawn("open", [resolved], { detached: true, stdio: "ignore" });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Launch `open -a <appName> <file>` and wait briefly for the handoff to
 * Launch Services. Returns ok=false if the app isn't installed.
 */
export async function openWithAppAction(
  targetPath: string,
  appName: string
): Promise<{ ok: boolean; error?: string }> {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return { ok: false, error: "El archivo no existe" };
  }
  return new Promise((resolve) => {
    const child = spawn("open", ["-a", appName, targetPath]);
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve({ ok: true });
      else resolve({ ok: false, error: stderr.trim() || `open -a exit ${code}` });
    });
    child.on("error", (err) => resolve({ ok: false, error: err.message }));
  });
}

/**
 * Reveal a specific file in Finder (highlighted), without opening it.
 */
export async function revealInFinderAction(
  targetPath: string
): Promise<{ ok: boolean; error?: string }> {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return { ok: false, error: "La ruta no existe" };
  }
  try {
    const child = spawn("open", ["-R", targetPath], { detached: true, stdio: "ignore" });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function createFolderAction(
  parentPath: string,
  name: string
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const safe = name.trim().replace(/[/\\]/g, "-");
  if (!safe) return { ok: false, error: "Nombre inválido" };
  const target = path.resolve(parentPath, safe);
  try {
    fs.mkdirSync(target, { recursive: false });
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
