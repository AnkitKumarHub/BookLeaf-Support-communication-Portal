// Model prices in US dollars per 1 million tokens, from the provider's pricing
// page. Cost is always worked out from stored token counts, so editing this
// table re-prices history. A model missing here is reported with cost null.
export const MODEL_PRICES_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

const DEFAULT_USD_TO_INR = 85;

// A fixed rate from the env (USD_TO_INR); live exchange rates would be overkill here.
export function usdToInr(): number {
  const rate = Number(process.env.USD_TO_INR);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_USD_TO_INR;
}

// Cost in rupees for a token count on one model, or null for an unpriced model.
export function costInr(model: string, inputTokens: number, outputTokens: number): number | null {
  const price = MODEL_PRICES_USD_PER_MILLION[model];
  if (!price) return null;
  const usd = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return usd * usdToInr();
}
