import { repo } from "@/lib/db";
import { computeCostUsd } from "./pricing";

interface AnthropicUsageShape {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * Record a real API call (not a cache hit) using the `usage` block returned by
 * the Anthropic SDK. Computes cost with current pricing.
 */
export function recordApiCall(opts: {
  projectId: string | null;
  stage: string;
  model: string;
  usage: AnthropicUsageShape;
  inputsHash?: string | null;
  meta?: Record<string, unknown>;
}): number {
  const breakdown = {
    input_tokens: opts.usage.input_tokens ?? 0,
    output_tokens: opts.usage.output_tokens ?? 0,
    cache_read_tokens: opts.usage.cache_read_input_tokens ?? 0,
    cache_creation_tokens: opts.usage.cache_creation_input_tokens ?? 0,
  };
  const costUsd = computeCostUsd(opts.model, breakdown);
  repo.recordUsage({
    project_id: opts.projectId,
    stage: opts.stage,
    model: opts.model,
    input_tokens: breakdown.input_tokens,
    output_tokens: breakdown.output_tokens,
    cache_read_tokens: breakdown.cache_read_tokens,
    cache_creation_tokens: breakdown.cache_creation_tokens,
    cost_usd: costUsd,
    inputs_hash: opts.inputsHash ?? null,
    cache_hit: 0,
    meta: opts.meta ?? null,
  });
  return costUsd;
}

/**
 * Record a cache hit — no tokens, no cost, but we keep a row so the UI can
 * show "N calls cached, zero cost" per stage.
 */
export function recordCacheHit(opts: {
  projectId: string | null;
  stage: string;
  model: string;
  inputsHash: string;
  meta?: Record<string, unknown>;
}): void {
  repo.recordUsage({
    project_id: opts.projectId,
    stage: opts.stage,
    model: opts.model,
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    cost_usd: 0,
    inputs_hash: opts.inputsHash,
    cache_hit: 1,
    meta: opts.meta ?? null,
  });
}
