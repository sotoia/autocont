import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";
import fs from "node:fs";
import { ingestFile, resolveWatchPath, VIDEO_EXT } from "./ingest";
import { repo } from "@/lib/db";

let activeWatcher: FSWatcher | null = null;
let activePath: string | null = null;

function logLine(msg: string) {
  console.log(`[watcher] ${msg}`);
}

export function startWatcher(): { watching: string | null } {
  const target = resolveWatchPath();
  if (!target || !fs.existsSync(target)) {
    logLine(`ruta no existe, skip: ${target}`);
    return { watching: null };
  }

  if (activeWatcher && activePath === target) return { watching: target };
  if (activeWatcher) {
    activeWatcher.close();
    activeWatcher = null;
  }

  activeWatcher = chokidar.watch(target, {
    depth: 0,
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 3000,
      pollInterval: 500,
    },
    ignored: (p) => {
      const name = path.basename(p);
      return name.startsWith(".");
    },
  });

  activeWatcher.on("add", (filepath) => {
    const ext = path.extname(filepath).toLowerCase();
    if (!VIDEO_EXT.has(ext)) return;
    logLine(`nuevo archivo detectado: ${filepath}`);
    try {
      const project = ingestFile(filepath);
      if (!project) return;
      logLine(`proyecto creado: ${project.name} (${project.id})`);

      // Auto-trigger the full pipeline when the user has auto_process enabled
      // in settings. Dynamic import avoids a module-init cycle between
      // watcher → orchestrator → db.
      const settings = repo.getSettings();
      if (settings.auto_process === 1) {
        logLine(`auto_process=on → lanzando pipeline para ${project.id}`);
        import("./orchestrator")
          .then(({ runPipelineDetached }) => runPipelineDetached(project.id))
          .catch((err) => logLine(`error lanzando pipeline: ${(err as Error).message}`));
      }
    } catch (err) {
      logLine(`error ingestando ${filepath}: ${(err as Error).message}`);
    }
  });

  activeWatcher.on("error", (err) => {
    logLine(`error: ${(err as Error).message}`);
  });

  activePath = target;
  logLine(`vigilando ${target}`);
  return { watching: target };
}

export function stopWatcher() {
  if (activeWatcher) {
    activeWatcher.close();
    activeWatcher = null;
    activePath = null;
  }
}

export function watcherStatus(): { watching: string | null } {
  return { watching: activePath };
}
