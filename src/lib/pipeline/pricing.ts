/**
 * Anthropic model pricing in USD per 1M tokens.
 * Update when Anthropic publishes new rates.
 */
export interface ModelPricing {
  input: number;
  output: number;
  /** Read from a 5-minute or 1-hour cache. Typically ~10% of input. */
  cacheRead: number;
  /** Writing to cache (first time). Typically ~1.25x input for 5-min cache. */
  cacheWrite: number;
}

const PRICING_USD_PER_MTOK: Record<string, ModelPricing> = {
  // Opus family — premium
  "claude-opus-4-7": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-opus-4-6": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-opus-4-5": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },

  // Sonnet family — balanced
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },

  // Haiku family — fast + cheap
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

const FALLBACK: ModelPricing = { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 };

export function getPricing(model: string): ModelPricing {
  return PRICING_USD_PER_MTOK[model] ?? FALLBACK;
}

export interface UsageBreakdown {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

export function computeCostUsd(model: string, usage: UsageBreakdown): number {
  const p = getPricing(model);
  const m = 1_000_000;
  return (
    (usage.input_tokens * p.input) / m +
    (usage.output_tokens * p.output) / m +
    (usage.cache_read_tokens * p.cacheRead) / m +
    (usage.cache_creation_tokens * p.cacheWrite) / m
  );
}

export function usdToEur(usd: number, rate = 0.93): number {
  return usd * rate;
}
