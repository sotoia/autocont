"use server";
import { revalidatePath } from "next/cache";
import fs from "node:fs";
import { repo } from "@/lib/db";
import type { Settings } from "@/lib/types";

export async function updateSettingsAction(patch: Partial<Settings>) {
  // Create folders for any paths that don't exist yet
  for (const key of ["obs_watch_path", "projects_path", "stock_path", "music_path"] as const) {
    const v = patch[key];
    if (typeof v === "string" && v && !fs.existsSync(v)) {
      try {
        fs.mkdirSync(v, { recursive: true });
      } catch {
        // ignore; just persist the value
      }
    }
  }
  const s = repo.updateSettings(patch);
  revalidatePath("/ajustes");
  return s;
}
