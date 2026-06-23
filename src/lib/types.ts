export type ProjectStatus =
  | "pending"
  | "transcribing"
  | "planning"
  | "assembling"
  | "ready"
  | "failed";

export type JobStatus = "queued" | "running" | "done" | "error";

export type JobKind =
  | "transcribe"
  | "shot_plan"
  | "stock_match"
  | "timeline_export";

export type AssetKind = "stock_video" | "stock_photo" | "music" | "raw";

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  raw_path: string | null;
  duration_sec: number | null;
  folder_path: string;
  created_at: string;
  updated_at: string;
  thumbnail: string | null;
  notes: string | null;
}

export interface StockAsset {
  id: string;
  kind: AssetKind;
  path: string;
  filename: string;
  tags: string[];
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  size_bytes: number;
  notes: string | null;
  created_at: string;
}

export interface Job {
  id: string;
  project_id: string | null;
  kind: JobKind;
  status: JobStatus;
  progress: number;
  started_at: string | null;
  ended_at: string | null;
  error: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface ApiUsage {
  id: string;
  project_id: string | null;
  stage: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_usd: number;
  inputs_hash: string | null;
  cache_hit: number;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface ProjectCostSummary {
  totalUsd: number;
  byStage: Record<string, { callsReal: number; callsCached: number; costUsd: number }>;
  lastUpdate: string | null;
}

export interface Settings {
  obs_watch_path: string;
  projects_path: string;
  stock_path: string;
  music_path: string;
  claude_api_key: string;
  claude_model: string;
  whisper_model: string;
  auto_process: number;
  davinci_export: number;
}
