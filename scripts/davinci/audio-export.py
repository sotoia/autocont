#!/usr/bin/env python3
"""Renderiza el rango [inFrame, outFrame] de la timeline activa a un WAV.

Uso:
    python3 audio-export.py <inFrame> <outFrame> <outputWavPath>

Devuelve exit 0 + path al WAV. Exit 1 con mensaje a stderr si falla.

Notas técnicas:
- Usa el módulo DaVinciResolveScript.py que viene con Resolve.
- Carga el preset "Audio Only" (factory). Si no existe, falla con instrucción.
- Override de SetRenderSettings con MarkIn/MarkOut + TargetDir + CustomName.
- StartRendering(jobId, True) BLOQUEA hasta que termine — devolvemos solo
  cuando el WAV ya está en disco.
"""
import os
import sys
import time

# El módulo de scripting de Resolve necesita esta env. Lo ponemos por si
# acaso no estaba (cuando se llama desde un shell limpio).
SCRIPTING_DIR = "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting"
os.environ.setdefault("RESOLVE_SCRIPT_API", SCRIPTING_DIR)
os.environ.setdefault("RESOLVE_SCRIPT_LIB",
    "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so")
sys.path.insert(0, os.path.join(SCRIPTING_DIR, "Modules"))

try:
    import DaVinciResolveScript as dvr_script
except Exception as e:
    print(f"ERROR importando DaVinciResolveScript: {e}", file=sys.stderr)
    sys.exit(1)


def main():
    if len(sys.argv) != 4:
        print("Uso: audio-export.py <inFrame> <outFrame> <outputWavPath>", file=sys.stderr)
        sys.exit(2)

    in_frame = int(sys.argv[1])
    out_frame = int(sys.argv[2])
    output_wav = sys.argv[3]
    target_dir = os.path.dirname(output_wav)
    custom_name = os.path.splitext(os.path.basename(output_wav))[0]
    os.makedirs(target_dir, exist_ok=True)

    resolve = dvr_script.scriptapp("Resolve")
    if not resolve:
        print("ERROR: no se pudo conectar con Resolve (¿está abierto?)", file=sys.stderr)
        sys.exit(1)

    # IMPORTANTE: AddRenderJob/StartRendering solo arrancan si Resolve está en
    # la página Deliver. Si está en Edit/Color/Fairlight, el job queda en Ready
    # sin moverse. Guardamos la página actual para restaurarla al final.
    saved_page = resolve.GetCurrentPage()
    if saved_page != "deliver":
        resolve.OpenPage("deliver")
        time.sleep(0.6)  # darle tiempo a UI a estabilizarse

    pm = resolve.GetProjectManager()
    project = pm.GetCurrentProject()
    if not project:
        print("ERROR: no hay proyecto abierto en Resolve", file=sys.stderr)
        sys.exit(1)

    timeline = project.GetCurrentTimeline()
    if not timeline:
        print("ERROR: no hay timeline activa", file=sys.stderr)
        sys.exit(1)

    print(f"[audio] timeline: {timeline.GetName()}")
    print(f"[audio] rango: frames {in_frame} → {out_frame}")
    print(f"[audio] output: {output_wav}")

    # Cargar preset Audio Only (factory de Resolve). Si el usuario lo borró,
    # intentamos crear settings desde cero con ExportVideo=False.
    presets = project.GetRenderPresetList() or []
    audio_preset = None
    for p in presets:
        if p.lower() in ("audio only", "audio_only", "audio"):
            audio_preset = p
            break

    if audio_preset:
        ok = project.LoadRenderPreset(audio_preset)
        print(f"[audio] preset cargado: {audio_preset} (ok={ok})")
    else:
        # Sin preset Audio Only — usar overrides puros
        print("[audio] preset 'Audio Only' no encontrado, usando overrides")

    # MÍNIMO: el preset Audio Only ya define ExportVideo=False/ExportAudio=True/
    # codec/sampleRate. Solo le sobrescribimos el destino, nombre y el rango.
    # Resolve rechaza claves desconocidas, así que cuanto menos mejor.
    settings = {
        "TargetDir": target_dir,
        "CustomName": custom_name,
        "MarkIn": in_frame,
        "MarkOut": out_frame,
    }
    ok = project.SetRenderSettings(settings)
    if not ok:
        # Si falla por algún motivo, lo loggeamos pero seguimos — a veces
        # devuelve false aunque el render funcione.
        print("WARN: SetRenderSettings devolvió false (sigo de todos modos)")

    # Limpiar jobs zombies de intentos anteriores que pueden estar atascando
    # la cola (status "Ready" pero ya obsoletos).
    try:
        old_jobs = project.GetRenderJobList() or []
        for j in old_jobs:
            jid = j.get("JobId") if isinstance(j, dict) else None
            if jid:
                project.DeleteRenderJob(jid)
        if old_jobs:
            print(f"[audio] cola limpiada ({len(old_jobs)} jobs viejos)")
    except Exception as e:
        print(f"[audio] no se pudo limpiar la cola: {e}")

    job_id = project.AddRenderJob()
    if not job_id:
        print("ERROR: AddRenderJob falló", file=sys.stderr)
        sys.exit(1)
    print(f"[audio] job añadido: {job_id}")

    # StartRendering: el segundo arg es isInteractiveMode (modal UI), no
    # waitForCompletion. Llamamos en modo no-interactivo y POLEAMOS
    # IsRenderingInProgress hasta que termine.
    started = project.StartRendering(job_id, False)
    print(f"[audio] StartRendering → {started}")
    if not started:
        # Algunos builds devuelven False pero igual ponen el job a renderizar.
        # Comprobamos si está en progreso antes de dar por perdido.
        if not project.IsRenderingInProgress():
            print("ERROR: rendering no arrancó", file=sys.stderr)
            try:
                status = project.GetRenderJobStatus(job_id) or {}
                print(f"  job status: {status}", file=sys.stderr)
            except Exception:
                pass
            sys.exit(1)
    # Polling hasta que termine
    max_wait_s = 60
    waited = 0
    while project.IsRenderingInProgress():
        time.sleep(0.5)
        waited += 0.5
        if waited >= max_wait_s:
            print(f"ERROR: render no terminó en {max_wait_s}s, abortando", file=sys.stderr)
            project.StopRendering()
            sys.exit(1)
    print(f"[audio] render terminó ({waited:.1f}s)")
    try:
        status = project.GetRenderJobStatus(job_id) or {}
        print(f"  job status final: {status}")
    except Exception:
        pass

    # Resolve guarda el output con CustomName + extensión del preset
    # (puede ser .wav, .aac, .m4a, .mov con audio). Buscamos cualquier
    # archivo que empiece por custom_name y se haya creado tras AddRenderJob.
    AUDIO_EXTS = (".wav", ".aac", ".m4a", ".mp3", ".mov", ".mp4", ".aif", ".aiff")
    found = None
    for _ in range(80):  # hasta ~16s
        try:
            entries = os.listdir(target_dir)
        except Exception:
            entries = []
        for f in entries:
            if f.startswith(custom_name) and f.lower().endswith(AUDIO_EXTS):
                p = os.path.join(target_dir, f)
                if os.path.getsize(p) > 0:
                    found = p
                    break
        if found:
            break
        time.sleep(0.2)

    if not found:
        print(f"ERROR: render terminó pero no se encuentra el output en {target_dir}", file=sys.stderr)
        try:
            print(f"  contenidos: {os.listdir(target_dir)}", file=sys.stderr)
        except Exception:
            pass
        sys.exit(1)

    # Si no es .wav, lo convertimos con ffmpeg a WAV mono 16kHz para que
    # whisper-cli lo procese sin sorpresas.
    if not found.lower().endswith(".wav"):
        import subprocess
        print(f"[audio] convirtiendo {os.path.basename(found)} → WAV mono 16kHz")
        try:
            subprocess.run([
                "/opt/homebrew/bin/ffmpeg", "-y", "-i", found,
                "-ac", "1", "-ar", "16000", "-acodec", "pcm_s16le",
                output_wav,
            ], check=True, capture_output=True)
            os.remove(found)
            found = output_wav
        except subprocess.CalledProcessError as e:
            print(f"WARN: ffmpeg falló convirtiendo: {e.stderr.decode()[:300]}", file=sys.stderr)
            # Aún así dejamos el archivo original y Whisper se las arregla
    elif found != output_wav:
        try:
            os.rename(found, output_wav)
            found = output_wav
        except Exception as e:
            print(f"[audio] (no se pudo renombrar a {output_wav}: {e})")

    size_kb = os.path.getsize(found) // 1024
    print(f"[audio] ✓ WAV listo: {found} ({size_kb}KB)")

    # Devolver Resolve a la página original
    if saved_page and saved_page != "deliver":
        try: resolve.OpenPage(saved_page)
        except Exception: pass

    # Imprimir el path final como ÚLTIMA línea para que el shell pueda capturarla
    print(found)


if __name__ == "__main__":
    main()
