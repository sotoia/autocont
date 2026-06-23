export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { scanOnce } = await import("@/lib/pipeline/ingest");
    const { startWatcher } = await import("@/lib/pipeline/watcher");

    // Pick up anything already present when the server boots
    const result = scanOnce();
    if (result.created.length > 0) {
      console.log(
        `[boot] scan inicial: ${result.created.length} proyecto(s) creado(s) en ${result.watchPath}`
      );
    } else {
      console.log(`[boot] scan inicial: sin novedades en ${result.watchPath}`);
    }

    // Start live watcher for future files
    startWatcher();
  } catch (err) {
    console.error(`[boot] error iniciando pipeline: ${(err as Error).message}`);
  }
}
