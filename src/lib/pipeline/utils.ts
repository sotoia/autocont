import fs from "node:fs";
import path from "node:path";

export function listTimelineFiles(projectFolder: string): string[] {
  const dir = path.join(projectFolder, "timeline");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".fcpxml") || f.endsWith(".drt") || f.endsWith(".xml"))
    .map((f) => path.join(dir, f));
}
