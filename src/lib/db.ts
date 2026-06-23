import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import type {
  Project,
  StockAsset,
  Job,
  Settings,
  ApiUsage,
} from "./types";
import type { Idea, IdeaSource } from "./ideas/types";
import { IDEAS_SEED_SOURCES } from "./ideas/sources-seed";
import type { Creation } from "./creations/types";
import type { NewsItem, NewsCategory } from "./news/types";

// Carpeta de datos: por defecto `<cwd>/data`. Se puede sobreescribir con
// AUTOCONT_DATA_DIR (lo usa el wrapper Electron para apuntar a app.getPath('userData')).
const DB_DIR = process.env.AUTOCONT_DATA_DIR
  ? path.resolve(process.env.AUTOCONT_DATA_DIR)
  : path.resolve(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "app.db");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  migrate(_db);
  seedDefaults(_db);
  return _db;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      raw_path TEXT,
      duration_sec REAL,
      folder_path TEXT NOT NULL,
      thumbnail TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      filename TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      duration_sec REAL,
      width INTEGER,
      height INTEGER,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      progress REAL NOT NULL DEFAULT 0,
      started_at TEXT,
      ended_at TEXT,
      error TEXT,
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_usage (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      stage TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      inputs_hash TEXT,
      cache_hit INTEGER NOT NULL DEFAULT 0,
      meta TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS idea_sources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      language TEXT NOT NULL DEFAULT 'es',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_polled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS news_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      tier INTEGER NOT NULL DEFAULT 2,
      default_category TEXT NOT NULL DEFAULT 'industry',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_polled_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ideas (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      source_url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      thumbnail_url TEXT,
      raw_content TEXT,
      generated_title TEXT,
      generated_description TEXT,
      generated_script TEXT,
      language TEXT NOT NULL DEFAULT 'es',
      pinned INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0,
      dismissed INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL DEFAULT 0,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES idea_sources(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ideas_dismissed ON ideas(dismissed);
    CREATE INDEX IF NOT EXISTS idx_ideas_pinned ON ideas(pinned);
    CREATE INDEX IF NOT EXISTS idx_ideas_order ON ideas(order_index);

    CREATE TABLE IF NOT EXISTS creations (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'viral',
      source_idea_id TEXT,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      script TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      ref_pack TEXT NOT NULL DEFAULT '[]',
      pinned INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_creations_archived ON creations(archived);
    CREATE INDEX IF NOT EXISTS idx_creations_pinned ON creations(pinned);
    CREATE INDEX IF NOT EXISTS idx_creations_order ON creations(order_index);

    CREATE TABLE IF NOT EXISTS news (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      source_url TEXT NOT NULL UNIQUE,
      source_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      tags TEXT NOT NULL DEFAULT '[]',
      published_at TEXT,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      thumbnail_url TEXT,
      raw_content TEXT,
      importance TEXT NOT NULL DEFAULT 'media',
      dismissed INTEGER NOT NULL DEFAULT 0,
      promoted_creation_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_news_dismissed ON news(dismissed);
    CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at);
    CREATE INDEX IF NOT EXISTS idx_news_category ON news(category);

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(kind);
    CREATE INDEX IF NOT EXISTS idx_api_usage_project ON api_usage(project_id);
    CREATE INDEX IF NOT EXISTS idx_api_usage_stage ON api_usage(stage);
  `);

  // Idempotent ALTER for engagement column (added after first ideas release)
  try {
    d.exec(`ALTER TABLE ideas ADD COLUMN engagement TEXT`);
  } catch {
    // column already exists
  }

  // Idempotent ALTER for translation flag — marca si título/descripción ya
  // están traducidos al español (0 = pendiente, 1 = OK, 2 = ya estaba en es).
  try {
    d.exec(`ALTER TABLE ideas ADD COLUMN translated INTEGER NOT NULL DEFAULT 0`);
  } catch { /* exists */ }
  try {
    d.exec(`ALTER TABLE news ADD COLUMN translated INTEGER NOT NULL DEFAULT 0`);
  } catch { /* exists */ }

  // Idempotent ALTER for prompter_script — versión reducida del guion para
  // teleprompter (solo partes habladas, frases cortas, sin marcadores).
  try {
    d.exec(`ALTER TABLE creations ADD COLUMN prompter_script TEXT NOT NULL DEFAULT ''`);
  } catch { /* exists */ }
  // Idempotent ALTERs for ficha rápida + mapa de bloques (plan de vídeo).
  try {
    d.exec(`ALTER TABLE creations ADD COLUMN ficha_rapida TEXT NOT NULL DEFAULT ''`);
  } catch { /* exists */ }
  try {
    d.exec(`ALTER TABLE creations ADD COLUMN mapa_bloques TEXT NOT NULL DEFAULT ''`);
  } catch { /* exists */ }
  // Miniatura del vídeo (path relativo dentro de /public, ej. "/uploads/thumbnails/<id>.jpg").
  try {
    d.exec(`ALTER TABLE creations ADD COLUMN thumbnail_path TEXT NOT NULL DEFAULT ''`);
  } catch { /* exists */ }
  // Link de YouTube del vídeo subido. Cuando hay URL, el preview muestra
  // un botón Play sobre la mini que reproduce el vídeo embebido.
  try {
    d.exec(`ALTER TABLE creations ADD COLUMN youtube_url TEXT NOT NULL DEFAULT ''`);
  } catch { /* exists */ }
}

function seedDefaults(d: Database.Database) {
  const settingsCount = d.prepare("SELECT COUNT(*) as c FROM settings").get() as { c: number };
  if (settingsCount.c === 0) {
    const home = process.env.HOME ?? "";
    const root = path.resolve(process.cwd(), "..");
    const defaults: Settings = {
      obs_watch_path: path.join(home, "Movies", "OBS"),
      projects_path: path.join(root, "proyectos"),
      stock_path: path.join(root, "stock"),
      music_path: path.join(root, "musica"),
      claude_api_key: "",
      claude_model: "claude-opus-4-7",
      whisper_model: "large-v3",
      auto_process: 1,
      davinci_export: 1,
    };
    const ins = d.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    for (const [k, v] of Object.entries(defaults)) ins.run(k, String(v));
  }

  // Seed idea sources catalog (idempotent — INSERT OR IGNORE on URL UNIQUE)
  const seedStmt = d.prepare(
    `INSERT OR IGNORE INTO idea_sources (id, kind, name, url, language) VALUES (?, ?, ?, ?, ?)`
  );
  for (const s of IDEAS_SEED_SOURCES) {
    seedStmt.run(randomUUID(), s.kind, s.name, s.url, s.language);
  }
}

function parseEngagement(row: Omit<Idea, "engagement"> & { engagement: string | null }): Idea {
  let engagement: Idea["engagement"] = null;
  if (row.engagement) {
    try { engagement = JSON.parse(row.engagement); } catch { /* ignore */ }
  }
  return { ...row, engagement };
}

function parseJsonArray(s: string): string[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const repo = {
  // Projects (internal pipeline job context — no UI module in v0.1)
  listProjects(): Project[] {
    return db()
      .prepare("SELECT * FROM projects ORDER BY created_at DESC")
      .all() as Project[];
  },
  getProject(id: string): Project | null {
    return (db().prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project) ?? null;
  },
  createProject(data: Partial<Project> & { name: string; folder_path: string }): Project {
    const id = randomUUID();
    db()
      .prepare(
        `INSERT INTO projects (id, name, status, raw_path, duration_sec, folder_path, thumbnail, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.name,
        data.status ?? "pending",
        data.raw_path ?? null,
        data.duration_sec ?? null,
        data.folder_path,
        data.thumbnail ?? null,
        data.notes ?? null
      );
    return this.getProject(id)!;
  },
  updateProject(id: string, patch: Partial<Project>): Project | null {
    const current = this.getProject(id);
    if (!current) return null;
    const merged = { ...current, ...patch };
    db()
      .prepare(
        `UPDATE projects SET name=?, status=?, raw_path=?, duration_sec=?, folder_path=?, thumbnail=?, notes=?, updated_at=datetime('now')
         WHERE id = ?`
      )
      .run(
        merged.name,
        merged.status,
        merged.raw_path,
        merged.duration_sec,
        merged.folder_path,
        merged.thumbnail,
        merged.notes,
        id
      );
    return this.getProject(id);
  },
  deleteProject(id: string): boolean {
    const r = db().prepare("DELETE FROM projects WHERE id = ?").run(id);
    return r.changes > 0;
  },

  // Assets
  listAssets(kind?: StockAsset["kind"]): StockAsset[] {
    const rows = kind
      ? (db().prepare("SELECT * FROM assets WHERE kind = ? ORDER BY created_at DESC").all(kind) as Array<
          Omit<StockAsset, "tags"> & { tags: string }
        >)
      : (db().prepare("SELECT * FROM assets ORDER BY created_at DESC").all() as Array<
          Omit<StockAsset, "tags"> & { tags: string }
        >);
    return rows.map((r) => ({ ...r, tags: JSON.parse(r.tags) as string[] }));
  },
  createAsset(a: Omit<StockAsset, "id" | "created_at">): StockAsset {
    const id = randomUUID();
    db()
      .prepare(
        `INSERT INTO assets (id, kind, path, filename, tags, duration_sec, width, height, size_bytes, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        a.kind,
        a.path,
        a.filename,
        JSON.stringify(a.tags),
        a.duration_sec,
        a.width,
        a.height,
        a.size_bytes,
        a.notes
      );
    return (this.listAssets().find((x) => x.id === id) as StockAsset);
  },
  getAsset(id: string): StockAsset | null {
    const r = db()
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(id) as (Omit<StockAsset, "tags"> & { tags: string }) | undefined;
    return r ? { ...r, tags: JSON.parse(r.tags) as string[] } : null;
  },
  updateAssetTags(id: string, tags: string[]): void {
    db().prepare("UPDATE assets SET tags = ? WHERE id = ?").run(JSON.stringify(tags), id);
  },
  deleteAsset(id: string): boolean {
    const r = db().prepare("DELETE FROM assets WHERE id = ?").run(id);
    return r.changes > 0;
  },

  // Jobs
  listJobs(limit = 100): Job[] {
    const rows = db()
      .prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?")
      .all(limit) as Array<Omit<Job, "payload"> & { payload: string | null }>;
    return rows.map((r) => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : null }));
  },
  createJob(j: Omit<Job, "id" | "created_at">): Job {
    const id = randomUUID();
    db()
      .prepare(
        `INSERT INTO jobs (id, project_id, kind, status, progress, started_at, ended_at, error, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        j.project_id,
        j.kind,
        j.status,
        j.progress,
        j.started_at,
        j.ended_at,
        j.error,
        j.payload ? JSON.stringify(j.payload) : null
      );
    return this.listJobs().find((x) => x.id === id)!;
  },
  updateJob(id: string, patch: Partial<Job>): Job | null {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of ["status", "progress", "started_at", "ended_at", "error"] as const) {
      if (patch[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(patch[key]);
      }
    }
    if (patch.payload !== undefined) {
      fields.push("payload = ?");
      values.push(patch.payload ? JSON.stringify(patch.payload) : null);
    }
    if (fields.length === 0) return this.listJobs().find((j) => j.id === id) ?? null;
    values.push(id);
    db()
      .prepare(`UPDATE jobs SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);
    return this.listJobs().find((j) => j.id === id) ?? null;
  },
  listJobsForProject(projectId: string): Job[] {
    const rows = db()
      .prepare("SELECT * FROM jobs WHERE project_id = ? ORDER BY created_at ASC")
      .all(projectId) as Array<Omit<Job, "payload"> & { payload: string | null }>;
    return rows.map((r) => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : null }));
  },

  // Settings
  getSettings(): Settings {
    const rows = db().prepare("SELECT key, value FROM settings").all() as Array<{
      key: string;
      value: string;
    }>;
    const obj = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      obs_watch_path: obj.obs_watch_path ?? "",
      projects_path: obj.projects_path ?? "",
      stock_path: obj.stock_path ?? "",
      music_path: obj.music_path ?? "",
      claude_api_key: obj.claude_api_key ?? "",
      claude_model: obj.claude_model ?? "claude-opus-4-7",
      whisper_model: obj.whisper_model ?? "large-v3",
      auto_process: Number(obj.auto_process ?? 1),
      davinci_export: Number(obj.davinci_export ?? 1),
    };
  },
  updateSettings(patch: Partial<Settings>): Settings {
    const stmt = db().prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
    );
    for (const [k, v] of Object.entries(patch)) stmt.run(k, String(v ?? ""));
    return this.getSettings();
  },

  // API usage tracking
  recordUsage(u: Omit<ApiUsage, "id" | "created_at">): ApiUsage {
    const id = randomUUID();
    db()
      .prepare(
        `INSERT INTO api_usage (id, project_id, stage, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, cost_usd, inputs_hash, cache_hit, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        u.project_id,
        u.stage,
        u.model,
        u.input_tokens,
        u.output_tokens,
        u.cache_read_tokens,
        u.cache_creation_tokens,
        u.cost_usd,
        u.inputs_hash,
        u.cache_hit ? 1 : 0,
        u.meta ? JSON.stringify(u.meta) : null
      );
    return {
      id,
      created_at: new Date().toISOString(),
      ...u,
    };
  },

  // ── Ideas ─────────────────────────────────────────────────────────────
  listIdeaSources(onlyEnabled = false): IdeaSource[] {
    const sql = onlyEnabled
      ? "SELECT * FROM idea_sources WHERE enabled = 1 ORDER BY language ASC, name ASC"
      : "SELECT * FROM idea_sources ORDER BY language ASC, name ASC";
    return db().prepare(sql).all() as IdeaSource[];
  },
  upsertIdeaSource(s: Omit<IdeaSource, "id" | "last_polled_at"> & { id?: string }): IdeaSource {
    const id = s.id ?? randomUUID();
    db()
      .prepare(
        `INSERT INTO idea_sources (id, kind, name, url, language, enabled)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(url) DO UPDATE SET kind = excluded.kind, name = excluded.name, language = excluded.language, enabled = excluded.enabled`,
      )
      .run(id, s.kind, s.name, s.url, s.language, s.enabled);
    return (db().prepare("SELECT * FROM idea_sources WHERE url = ?").get(s.url) as IdeaSource);
  },
  markSourcePolled(sourceId: string) {
    db()
      .prepare("UPDATE idea_sources SET last_polled_at = datetime('now') WHERE id = ?")
      .run(sourceId);
  },
  deleteIdeaSource(id: string): boolean {
    return db().prepare("DELETE FROM idea_sources WHERE id = ?").run(id).changes > 0;
  },

  // ── News sources ──────────────────────────────────────────────────────
  listNewsSources(onlyEnabled = false): import("./news/types").NewsSourceRow[] {
    const sql = onlyEnabled
      ? "SELECT * FROM news_sources WHERE enabled = 1 ORDER BY tier ASC, name ASC"
      : "SELECT * FROM news_sources ORDER BY tier ASC, name ASC";
    return db().prepare(sql).all() as import("./news/types").NewsSourceRow[];
  },
  upsertNewsSource(s: { id?: string; name: string; url: string; tier: number; default_category: string; enabled: number }): import("./news/types").NewsSourceRow {
    const id = s.id ?? randomUUID();
    db()
      .prepare(
        `INSERT INTO news_sources (id, name, url, tier, default_category, enabled)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(url) DO UPDATE SET name = excluded.name, tier = excluded.tier, default_category = excluded.default_category, enabled = excluded.enabled`,
      )
      .run(id, s.name, s.url, s.tier, s.default_category, s.enabled);
    return (db().prepare("SELECT * FROM news_sources WHERE url = ?").get(s.url) as import("./news/types").NewsSourceRow);
  },
  deleteNewsSource(id: string): boolean {
    return db().prepare("DELETE FROM news_sources WHERE id = ?").run(id).changes > 0;
  },
  markNewsSourcePolled(id: string) {
    db()
      .prepare("UPDATE news_sources SET last_polled_at = datetime('now') WHERE id = ?")
      .run(id);
  },

  listIdeas(opts: { includeDismissed?: boolean } = {}): Idea[] {
    const where = opts.includeDismissed ? "" : "WHERE dismissed = 0";
    const rows = db()
      .prepare(
        `SELECT * FROM ideas ${where}
         ORDER BY pinned DESC, order_index ASC, created_at DESC`,
      )
      .all() as Array<Omit<Idea, "engagement"> & { engagement: string | null }>;
    return rows.map(parseEngagement);
  },
  getIdea(id: string): Idea | null {
    const r = db().prepare("SELECT * FROM ideas WHERE id = ?").get(id) as
      | (Omit<Idea, "engagement"> & { engagement: string | null })
      | undefined;
    return r ? parseEngagement(r) : null;
  },
  /** Has this URL already been ingested? Used for dedup before any expensive fetch. */
  hasIdeaForUrl(url: string): boolean {
    return !!db().prepare("SELECT 1 FROM ideas WHERE source_url = ? LIMIT 1").get(url);
  },
  createIdea(i: Omit<Idea, "id" | "created_at">): Idea {
    const id = randomUUID();
    db()
      .prepare(
        `INSERT INTO ideas (id, source_id, source_name, source_kind, source_url, title, description, thumbnail_url, raw_content, generated_title, generated_description, generated_script, language, pinned, featured, dismissed, order_index, published_at, engagement)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        i.source_id,
        i.source_name,
        i.source_kind,
        i.source_url,
        i.title,
        i.description,
        i.thumbnail_url,
        i.raw_content,
        i.generated_title,
        i.generated_description,
        i.generated_script,
        i.language,
        i.pinned,
        i.featured,
        i.dismissed,
        i.order_index,
        i.published_at,
        i.engagement ? JSON.stringify(i.engagement) : null,
      );
    return this.getIdea(id)!;
  },
  updateIdea(id: string, patch: Partial<Idea>): Idea | null {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of [
      "title", "description", "thumbnail_url", "raw_content",
      "generated_title", "generated_description", "generated_script",
      "pinned", "featured", "dismissed", "order_index",
    ] as const) {
      if (patch[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(patch[key]);
      }
    }
    if (fields.length === 0) return this.getIdea(id);
    values.push(id);
    db().prepare(`UPDATE ideas SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.getIdea(id);
  },
  /** Bulk reorder: caller passes ids in the new visual order; we write
   *  order_index = position. Pinned items are reordered within their group too. */
  reorderIdeas(orderedIds: string[]): void {
    const stmt = db().prepare("UPDATE ideas SET order_index = ? WHERE id = ?");
    const tx = db().transaction((ids: string[]) => {
      ids.forEach((id, i) => stmt.run(i, id));
    });
    tx(orderedIds);
  },
  deleteIdea(id: string): boolean {
    const r = db().prepare("DELETE FROM ideas WHERE id = ?").run(id);
    return r.changes > 0;
  },
  /** Largest order_index currently in use, for placing new items at the end. */
  maxIdeaOrderIndex(): number {
    const r = db().prepare("SELECT MAX(order_index) as m FROM ideas").get() as { m: number | null };
    return r.m ?? 0;
  },
  minIdeaOrderIndex(): number {
    const r = db().prepare("SELECT MIN(order_index) as m FROM ideas").get() as { m: number | null };
    return r.m ?? 0;
  },

  // ── Creations ─────────────────────────────────────────────────────────
  listCreations(opts: { includeArchived?: boolean } = {}): Creation[] {
    const where = opts.includeArchived ? "" : "WHERE archived = 0";
    const rows = db()
      .prepare(`SELECT * FROM creations ${where} ORDER BY pinned DESC, order_index ASC, updated_at DESC`)
      .all() as Array<Omit<Creation, "ref_pack"> & { ref_pack: string }>;
    return rows.map((r) => ({ ...r, ref_pack: parseJsonArray(r.ref_pack) }));
  },
  getCreation(id: string): Creation | null {
    const r = db().prepare("SELECT * FROM creations WHERE id = ?").get(id) as
      | (Omit<Creation, "ref_pack"> & { ref_pack: string })
      | undefined;
    return r ? { ...r, ref_pack: parseJsonArray(r.ref_pack) } : null;
  },
  createCreation(c: Partial<Creation> & { kind: Creation["kind"] }): Creation {
    const id = randomUUID();
    const maxOrder = (db().prepare("SELECT MAX(order_index) as m FROM creations").get() as { m: number | null }).m ?? 0;
    db()
      .prepare(
        `INSERT INTO creations (id, kind, source_idea_id, title, description, script, notes, ref_pack, pinned, archived, order_index, ficha_rapida, mapa_bloques)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        c.kind,
        c.source_idea_id ?? null,
        c.title ?? "",
        c.description ?? "",
        c.script ?? "",
        c.notes ?? "",
        JSON.stringify(c.ref_pack ?? []),
        c.pinned ?? 0,
        c.archived ?? 0,
        maxOrder + 1,
        c.ficha_rapida ?? "",
        c.mapa_bloques ?? "",
      );
    return this.getCreation(id)!;
  },
  updateCreation(id: string, patch: Partial<Creation>): Creation | null {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const key of [
      "kind", "title", "description", "script", "prompter_script", "notes",
      "pinned", "archived", "order_index",
      "ficha_rapida", "mapa_bloques", "thumbnail_path", "youtube_url",
    ] as const) {
      if (patch[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(patch[key]);
      }
    }
    if (patch.ref_pack !== undefined) {
      fields.push("ref_pack = ?");
      values.push(JSON.stringify(patch.ref_pack));
    }
    if (fields.length === 0) return this.getCreation(id);
    fields.push("updated_at = datetime('now')");
    values.push(id);
    db().prepare(`UPDATE creations SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.getCreation(id);
  },
  deleteCreation(id: string): boolean {
    const r = db().prepare("DELETE FROM creations WHERE id = ?").run(id);
    return r.changes > 0;
  },

  // ── News ──────────────────────────────────────────────────────────────
  listNews(opts: { includeDismissed?: boolean; category?: NewsCategory } = {}): NewsItem[] {
    const where: string[] = [];
    if (!opts.includeDismissed) where.push("dismissed = 0");
    if (opts.category) where.push(`category = '${opts.category}'`);
    const sql = `SELECT * FROM news ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY
      CASE WHEN published_at IS NULL THEN 1 ELSE 0 END,
      published_at DESC, fetched_at DESC LIMIT 200`;
    const rows = db().prepare(sql).all() as Array<Omit<NewsItem, "tags"> & { tags: string }>;
    return rows.map((r) => ({ ...r, tags: parseJsonArray(r.tags) }));
  },
  getNews(id: string): NewsItem | null {
    const r = db().prepare("SELECT * FROM news WHERE id = ?").get(id) as
      | (Omit<NewsItem, "tags"> & { tags: string })
      | undefined;
    return r ? { ...r, tags: parseJsonArray(r.tags) } : null;
  },
  hasNewsForUrl(url: string): boolean {
    return !!db().prepare("SELECT 1 FROM news WHERE source_url = ? LIMIT 1").get(url);
  },
  createNews(n: Omit<NewsItem, "id" | "fetched_at" | "created_at">): NewsItem {
    const id = randomUUID();
    db()
      .prepare(
        `INSERT INTO news (id, title, description, source_url, source_name, category, tags, published_at, thumbnail_url, raw_content, importance, dismissed, promoted_creation_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id, n.title, n.description, n.source_url, n.source_name, n.category,
        JSON.stringify(n.tags), n.published_at, n.thumbnail_url, n.raw_content,
        n.importance, n.dismissed ?? 0, n.promoted_creation_id,
      );
    return this.getNews(id)!;
  },
  updateNews(id: string, patch: Partial<NewsItem>): NewsItem | null {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const k of ["title", "description", "category", "importance", "promoted_creation_id"] as const) {
      if (patch[k] !== undefined) { fields.push(`${k} = ?`); values.push(patch[k]); }
    }
    if (patch.dismissed !== undefined) { fields.push("dismissed = ?"); values.push(patch.dismissed ? 1 : 0); }
    if (patch.tags !== undefined) { fields.push("tags = ?"); values.push(JSON.stringify(patch.tags)); }
    if (fields.length === 0) return this.getNews(id);
    values.push(id);
    db().prepare(`UPDATE news SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return this.getNews(id);
  },
  deleteNews(id: string): boolean {
    const r = db().prepare("DELETE FROM news WHERE id = ?").run(id);
    return r.changes > 0;
  },

  // ── Translation helpers (compartidos por news + ideas) ─────────────────
  /** Lista noticias con `translated = 0`. Devuelve solo lo necesario para el batch. */
  listUntranslatedNews(limit = 200): Array<{ id: string; title: string; description: string | null }> {
    return db()
      .prepare(
        `SELECT id, title, description FROM news
         WHERE translated = 0 AND dismissed = 0
         ORDER BY fetched_at DESC LIMIT ?`,
      )
      .all(limit) as Array<{ id: string; title: string; description: string | null }>;
  },
  /** Aplica una traducción en news. translated=1 (traducido) o 2 (era ya español). */
  applyNewsTranslation(id: string, title: string, description: string | null, status: 1 | 2): void {
    db()
      .prepare(`UPDATE news SET title = ?, description = ?, translated = ? WHERE id = ?`)
      .run(title, description, status, id);
  },
  /** Lista ideas con `translated = 0`. */
  listUntranslatedIdeas(limit = 200): Array<{ id: string; title: string; description: string | null }> {
    return db()
      .prepare(
        `SELECT id, title, description FROM ideas
         WHERE translated = 0 AND dismissed = 0
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(limit) as Array<{ id: string; title: string; description: string | null }>;
  },
  /** Aplica traducción en ideas — sobreescribe también generated_title /
   *  generated_description si coincidían con los originales (común tras polling
   *  cuando aún no se ha generado contenido por IA). */
  applyIdeaTranslation(id: string, title: string, description: string | null, status: 1 | 2): void {
    const cur = db()
      .prepare(`SELECT title, description, generated_title, generated_description FROM ideas WHERE id = ?`)
      .get(id) as { title: string; description: string | null; generated_title: string | null; generated_description: string | null } | undefined;
    if (!cur) return;
    const newGenTitle = cur.generated_title === cur.title ? title : cur.generated_title;
    const newGenDesc = cur.generated_description === cur.description ? description : cur.generated_description;
    db()
      .prepare(
        `UPDATE ideas
         SET title = ?, description = ?, generated_title = ?, generated_description = ?, translated = ?
         WHERE id = ?`,
      )
      .run(title, description, newGenTitle, newGenDesc, status, id);
  },
};
