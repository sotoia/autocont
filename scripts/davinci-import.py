#!/usr/bin/env python3
"""
Abre DaVinci Resolve, crea o carga un proyecto por nombre e importa una
timeline FCPXML. Si la timeline ya existe en el proyecto, simplemente la
selecciona.

Uso: davinci-import.py "<project_name>" "<fcpxml_path>"

Salida: una línea JSON en stdout con:
  {ok, project, created, timeline, reused, error, error_kind}

error_kind posibles:
  - "not_running"       → Resolve no está abierto
  - "scripting_disabled"→ Resolve abierto, pero scripting no habilitado
  - "import_failed"     → Proyecto OK pero ImportTimelineFromFile falló
  - "unknown"
"""
import sys
import os
import json
import time
import subprocess

def emit(payload, exit_code=0):
    print(json.dumps(payload))
    sys.stdout.flush()
    sys.exit(exit_code)

def fail(error, kind="unknown"):
    emit({"ok": False, "error": error, "error_kind": kind}, exit_code=1)

def is_resolve_running() -> bool:
    try:
        result = subprocess.run(
            ["pgrep", "-f", "DaVinci Resolve.app/Contents/MacOS/Resolve"],
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0 and bool(result.stdout.strip())
    except Exception:
        return False

if len(sys.argv) < 3:
    fail("Uso: davinci-import.py <project_name> <fcpxml_path>")

project_name = sys.argv[1]
fcpxml_path = sys.argv[2]

if not os.path.exists(fcpxml_path):
    fail(f"FCPXML no existe: {fcpxml_path}")

RESOLVE_SCRIPT_API = "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting"
RESOLVE_SCRIPT_LIB = "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so"

if not os.path.exists(RESOLVE_SCRIPT_LIB):
    fail("DaVinci Resolve no parece instalado (fusionscript.so no encontrado).", "not_running")

if not is_resolve_running():
    fail(
        "DaVinci Resolve no está en ejecución. Espera a que termine de arrancar o lánzalo manualmente.",
        "not_running",
    )

os.environ["RESOLVE_SCRIPT_API"] = RESOLVE_SCRIPT_API
os.environ["RESOLVE_SCRIPT_LIB"] = RESOLVE_SCRIPT_LIB
sys.path.insert(0, os.path.join(RESOLVE_SCRIPT_API, "Modules"))

try:
    import DaVinciResolveScript as dvr_script
except ImportError as exc:
    fail(f"No se pudo cargar el módulo DaVinciResolveScript: {exc}")

# Try to connect — wait up to 60s for scripting to come online.
resolve = None
for attempt in range(60):
    try:
        resolve = dvr_script.scriptapp("Resolve")
        if resolve:
            break
    except Exception:
        pass
    time.sleep(1)

if not resolve:
    # Resolve IS running but scripting isn't answering → most likely scripting disabled.
    fail(
        "DaVinci Resolve está abierto pero el módulo de scripting no responde. "
        "Abre: Preferences → System → General → External scripting using → 'Local'. "
        "Pulsa Save y reinicia DaVinci.",
        "scripting_disabled",
    )

project_manager = resolve.GetProjectManager()
if not project_manager:
    fail("No se pudo obtener el ProjectManager.")

# Free the current project so Load/Create can take over without state conflicts.
# DaVinci silently refuses Create/Load if the current project has dirty state.
#
# NUNCA llamamos a SaveProject() — eso abre el modal "Save archive" si el
# current era un Untitled (típico tras doble-click en un FCPXML) y bloquea
# toda llamada Python posterior. Cerramos sin guardar; los cambios del
# proyecto vacío anterior se descartan a propósito.
current = project_manager.GetCurrentProject()
if current and current.GetName() != project_name:
    try:
        project_manager.CloseProject(current)
    except Exception:
        pass

created = False

# Si el current ya es el proyecto que buscamos, lo reutilizamos sin tocar nada.
if current and current.GetName() == project_name:
    project = current
else:
    project = project_manager.LoadProject(project_name)
    if not project:
        # Si LoadProject falla pero ya existe un proyecto con ese nombre,
        # significa que está en estado raro. Lo borramos y recreamos limpio.
        try:
            project_manager.DeleteProject(project_name)
        except Exception:
            pass
        project = project_manager.CreateProject(project_name)
        if not project:
            # Último recurso: cerrar lo que esté como current y reintentar.
            leftover = project_manager.GetCurrentProject()
            if leftover:
                try:
                    project_manager.CloseProject(leftover)
                except Exception:
                    pass
            project = project_manager.CreateProject(project_name)
            if not project:
                now_current = project_manager.GetCurrentProject()
                if now_current and now_current.GetName() == project_name:
                    project = now_current
                else:
                    fail(
                        f"No se pudo crear el proyecto '{project_name}'. "
                        f"Cierra DaVinci totalmente y vuelve a intentarlo."
                    )
        created = True

fcpxml_base = os.path.splitext(os.path.basename(fcpxml_path))[0]
tl_count = project.GetTimelineCount() or 0
existing_tl = None
for i in range(1, tl_count + 1):
    tl = project.GetTimelineByIndex(i)
    if tl and tl.GetName() == fcpxml_base:
        existing_tl = tl
        break

media_pool = project.GetMediaPool()
if not media_pool:
    fail("No se pudo obtener el MediaPool del proyecto.", "import_failed")

replaced = False
if existing_tl:
    # Replace semantics: delete the stale timeline so the re-import reflects the
    # latest pipeline output (new stock placements, new motion markers, etc.)
    # NOTE: DeleteTimelines lives on MediaPool, not Project.
    try:
        if media_pool.DeleteTimelines([existing_tl]):
            replaced = True
    except Exception:
        pass

# Si hay otras timelines vacías en el proyecto (resto de imports fallidos
# que dejaron el proyecto sucio), las eliminamos para que no confundan al
# usuario al abrir DaVinci.
try:
    tl_count = project.GetTimelineCount() or 0
    empty_to_delete = []
    for i in range(1, tl_count + 1):
        tl = project.GetTimelineByIndex(i)
        if not tl:
            continue
        try:
            # Una timeline vacía suele tener 0 items en V1 y 0 segundos.
            v_items = tl.GetItemListInTrack("video", 1) or []
            if len(v_items) == 0:
                empty_to_delete.append(tl)
        except Exception:
            pass
    if empty_to_delete:
        try:
            media_pool.DeleteTimelines(empty_to_delete)
        except Exception:
            pass
except Exception:
    pass

timeline = media_pool.ImportTimelineFromFile(fcpxml_path)
if not timeline:
    fail(f"ImportTimelineFromFile falló para {fcpxml_path}", "import_failed")

# Verificación: la timeline debe tener clips. Si está vacía, DaVinci aceptó
# el archivo pero no entendió su versión / formato. Reportamos error claro.
try:
    v_items = timeline.GetItemListInTrack("video", 1) or []
    if len(v_items) == 0:
        fail(
            f"DaVinci importó la timeline pero quedó vacía. "
            f"Probable causa: versión FCPXML incompatible con DaVinci Resolve {os.environ.get('RESOLVE_VERSION', '19')}. "
            f"Archivo: {fcpxml_path}",
            "import_failed",
        )
except Exception:
    # Si la API no permite verificar, asumimos OK
    pass

try:
    project.SetCurrentTimeline(timeline)
except Exception:
    pass
tl_name = None
try:
    tl_name = timeline.GetName()
except Exception:
    tl_name = fcpxml_base
emit({
    "ok": True,
    "project": project_name,
    "created": created,
    "timeline": tl_name or fcpxml_base,
    "reused": False,
    "replaced": replaced,
})
