import crypto from "node:crypto";

/**
 * Stable SHA-256 hex digest of any JSON-serialisable input. Keys are sorted
 * recursively so that `{a:1,b:2}` and `{b:2,a:1}` produce the same hash.
 */
export function stableHash(input: unknown): string {
  const canonical = canonicalize(input);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map(
        (k) =>
          JSON.stringify(k) +
          ":" +
          canonicalize((value as Record<string, unknown>)[k])
      )
      .join(",") +
    "}"
  );
}
