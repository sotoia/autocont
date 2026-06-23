# AUTOCONT

> Sistema operativo personal para tu pipeline de YouTube — desde la idea
> hasta el timeline de DaVinci Resolve, con IA orquestando el trabajo.

**Versión:** v0.1 (open source) · [Roadmap](#roadmap)
**Stack:** Next.js · TypeScript · SQLite · Whisper · Claude AI · DaVinci Resolve

---

## Qué hace

- **Creaciones** — editor de guiones con co-writer IA (Claude). Auto-guarda
  cada 1.2s, genera títulos/descripciones/ficha rápida/mapa de bloques.
  Preview estilo YouTube. Modo prompter con teleprompter local.
- **Ideas + Noticias** — tableros auto-actualizados con noticias del nicho
  IA traducidas y propuestas de ideas para vídeos.
- **Stock pool** — vídeo, fotos y música locales (los pones tú en una carpeta
  que el sistema indexa).
- **Pipeline OBS → DaVinci** — vigila una carpeta. Cuando aparece un vídeo
  nuevo (terminaste una toma), lo transcribe con Whisper local, propone con
  Claude qué stock cuadra en cada bloque, y exporta un FCPXML que abres en
  DaVinci Resolve con el timeline montado.

## Lo que NO hay aún (v0.2+)

Esta v0.1 es lo que está **listo y seguro de usar**. Estos módulos están
en pulido y los liberaremos en versiones próximas:

- 🚧 **Motion graphics** generation (Canvas2D + IA) → v0.2
- 🚧 **Plugin DaVinci** (Workflow Integration) → v0.2
- 📋 Multi-usuario / auth → v0.3
- 📋 Tests automáticos → v0.3

---

## Instalación

### Opción A — Terminal (recomendado)

Requisitos:
- Node.js ≥ 20 ([nodejs.org](https://nodejs.org/))
- ffmpeg (`brew install ffmpeg` en macOS · `apt install ffmpeg` en Linux)
- DaVinci Resolve 18.5+ (opcional, solo para la integración Resolve)
- API key de Anthropic Claude ([console.anthropic.com](https://console.anthropic.com/))

```bash
git clone https://github.com/<tu-usuario>/autocont.git
cd autocont
npm install
npm start
```

La app arranca en `http://localhost:3000`. En el primer arranque crea
la base de datos vacía en `data/app.db`. Ve a **Ajustes** y pega tu
API key de Claude para empezar.

### Opción B — Docker

```bash
git clone https://github.com/<tu-usuario>/autocont.git
cd autocont
docker compose up -d
```

La app queda disponible en `http://localhost:3000`. La carpeta `data/`
y `public/uploads/` se montan como volúmenes (persistencia).

---

## Configuración

Todo se configura desde **Ajustes** (UI) — se guarda en `data/app.db`.

| Setting | Para qué |
|---|---|
| `ANTHROPIC_API_KEY` | Claude — co-writer, traducciones, propuestas de stock |
| Carpeta OBS vigilada | Watcher detecta nuevos vídeos aquí |
| Carpeta de proyectos | Donde la app guarda timeline + transcript |
| Carpeta de stock | Tu biblioteca local de vídeo/foto que la IA usa para montar el timeline |

> No hay `.env` requerido. Si prefieres setear las keys por entorno,
> puedes usar `.env.local` (ver `.env.example`).

---

## Cómo se usa

### 1) Setup inicial (una sola vez)

1. Arranca la app (`npm start` o `docker compose up -d`).
2. Abre `http://localhost:3000` en el navegador.
3. Ve a **Ajustes** (sidebar abajo).
4. Pega tu `ANTHROPIC_API_KEY` de Claude. Sin esto la IA no responde.
5. (Opcional) elige el modelo Claude que quieres usar:
   - **Opus 4.7** — máxima calidad, más caro
   - **Sonnet 4.6** — equilibrio (recomendado)
   - **Haiku 4.5** — más barato y rápido (bien para pruebas)
6. (Opcional) elige el modelo Whisper para transcribir local:
   - **large-v3** — mejor precisión
   - **medium / small** — más rápido en máquinas modestas
7. Define tus **rutas**:
   - **Carpeta OBS vigilada** → donde OBS guarda tus grabaciones
   - **Carpeta de proyectos** → donde la app crea `YYYY-MM-DD_nombre/`
   - **Biblioteca de stock local** → tu carpeta con `.mp4/.mov` organizados
     en subcarpetas-etiqueta (ej. `oficina/`, `código/`, `naturaleza/`)
   - **Biblioteca de música local** → tu carpeta con `.mp3/.wav/.m4a`

### 2) Flujo principal — OBS → DaVinci

1. Arranca OBS y graba como siempre. Tu archivo termina en la carpeta vigilada.
2. AUTOCONT detecta el `.mp4/.mov` y crea automáticamente un proyecto en la
   carpeta de proyectos.
3. El pipeline arranca solo (si tienes "Procesar automáticamente" activado):
   - Whisper transcribe el audio (proceso local, sin coste).
   - Claude lee el transcript y propone, para cada bloque del guion, qué
     clips de tu biblioteca de stock encajan mejor.
   - Se exporta un `.fcpxml` en la carpeta del proyecto.
4. Abre DaVinci Resolve, `File → Import → Timeline…` y selecciona el
   `.fcpxml`. Aparece el timeline montado: tu vídeo principal en V1 y los
   clips de stock superpuestos en V2 en los momentos correctos.
5. Listo para ajustar a mano y exportar.

### 3) Módulo Creaciones — pre-producción

Antes de grabar puedes trabajar el guion en **Creaciones**:

1. **Nueva creación** → eliges tipo (viral / actualidad / didáctico).
2. Escribes la idea en una línea.
3. Botón **Co-writer IA**: Claude propone título, descripción, ficha rápida
   (gancho, promesa, CTA, stack), mapa de bloques y un primer borrador del
   guion en convención AUTOCONT (PARTES → BLOQUES → secciones).
4. Editas a tu gusto. Auto-guarda cada 1.2s.
5. **Modo Prompter** para grabar leyendo del teleprompter local.
6. Cuando termines la grabación, pegas el link del vídeo de YouTube ya
   subido en la pill de YouTube preview (justo debajo de la miniatura) y
   tendrás un mini-player embebido.

### 4) Ideas y Noticias

- **Ideas board** se auto-actualiza desde un conjunto de fuentes (RSS / YouTube)
  cada pocas horas. Marca las que te interesan y promuévelas a Creaciones.
- **Noticias** hace lo mismo con feeds del nicho. Traducción automática al
  español si la fuente es inglesa.

### 5) Stock pool

- **Stock / Fotos / Música** indexan tus carpetas locales. Se respetan tus
  subcarpetas como etiquetas (ej. un clip dentro de `oficina/` queda tagueado
  con `oficina`).
- Cuando el pipeline busca un clip para un bloque, la IA busca por nombre
  + tags. Cuanto mejor organizada esté tu carpeta, mejor encaja el stock.

### 6) Cola

- **Cola** te enseña en tiempo real qué jobs hay en marcha (transcripción,
  shot plan, export FCPXML) con barra de progreso y logs.

### 7) Tips de productividad

- Mantén tu stock organizado en carpetas semánticas (`/oficina/`, `/exterior/`,
  `/tech/`) — es lo que más mejora la calidad de las propuestas de la IA.
- La transcripción Whisper es local: si tu Mac es viejo usa `small` o `medium`.
- Si vas a procesar muchos vídeos seguidos, usa **Sonnet** en vez de Opus
  para ahorrar coste (la diferencia de calidad en shot-plan es marginal).
- Cierra DaVinci antes de importar el FCPXML si la primera vez no abre el
  timeline — algunas versiones bloquean el import si Resolve está vivo.

---

## Roadmap

### v0.1 (ahora)
- ✅ Editor de creaciones + Claude co-writer
- ✅ Ideas + Noticias auto-actualizadas
- ✅ Stock pool local (vídeo · fotos · música)
- ✅ Watcher OBS → FCPXML para DaVinci

### v0.2 (en pulido)
- Motion graphics generation con Canvas2D
- Plugin Workflow Integration para DaVinci

### v0.3 (planeado)
- Multi-usuario / auth
- Tests
- Multi-OS (actualmente best on macOS)

---

## Contribuir

Issues y PRs bienvenidos en [GitHub](https://github.com/<tu-usuario>/autocont).
Mira `AGENTS.md` antes de tocar código (convenciones internas del repo).

---

## Licencia

MIT. Ver [LICENSE](./LICENSE).
