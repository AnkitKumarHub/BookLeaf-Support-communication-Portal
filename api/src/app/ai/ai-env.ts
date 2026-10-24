export type AiEnv = {
  apiKey: string;
  model: string;
  requestTimeoutMs: number;
  maxInputChars: number;
  maxOutputTokens: number;
};

export function loadAiEnv(source: NodeJS.ProcessEnv = process.env): AiEnv {
  return {
    apiKey: source.OPENAI_API_KEY ?? "",
    model: source.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    requestTimeoutMs: positiveInt(source.AI_REQUEST_TIMEOUT_MS, 20_000),
    maxInputChars: positiveInt(source.AI_MAX_INPUT_CHARS, 12_000),
    maxOutputTokens: positiveInt(source.AI_MAX_OUTPUT_TOKENS, 700),
  };
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}
