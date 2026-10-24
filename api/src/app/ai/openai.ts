import { NonRetriableError } from "inngest";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "openai";
import { loadAiEnv } from "./ai-env.js";
import { DRAFT_SYSTEM } from "./draft.js";
import { TRIAGE_JSON_SCHEMA, TRIAGE_SYSTEM } from "./triage.js";

export type AiErrorCode =
  | "config"
  | "timeout"
  | "rate_limit"
  | "provider"
  | "invalid_output";

export class AiFailure extends NonRetriableError {
  readonly errorCode: AiErrorCode;

  constructor(errorCode: AiErrorCode) {
    super(errorCode);
    this.errorCode = errorCode;
  }
}

export class AiRetry extends Error {
  readonly errorCode: AiErrorCode;

  constructor(errorCode: AiErrorCode) {
    super(errorCode);
    this.name = "AiRetry";
    this.errorCode = errorCode;
  }
}

export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export function mapProviderError(err: unknown): {
  errorCode: AiErrorCode;
  retriable: boolean;
} {
  if (err instanceof AiFailure) {
    return { errorCode: err.errorCode, retriable: false };
  }
  if (err instanceof AiRetry) {
    return { errorCode: err.errorCode, retriable: true };
  }
  if (err instanceof APIConnectionTimeoutError) {
    return { errorCode: "timeout", retriable: true };
  }
  if (err instanceof APIError && typeof err.status === "number") {
    if (err.status === 401 || err.status === 403) {
      return { errorCode: "config", retriable: false };
    }
    if (err.status === 429) return { errorCode: "rate_limit", retriable: true };
    if (err.status >= 500) return { errorCode: "provider", retriable: true };
  }
  if (err instanceof APIConnectionError) {
    return { errorCode: "provider", retriable: true };
  }
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return { errorCode: "timeout", retriable: true };
  }
  return { errorCode: "provider", retriable: true };
}

export function throwMapped(err: unknown, ticketId: string): never {
  const mapped = mapProviderError(err);
  console.error("openai call failed", { ticketId, errorCode: mapped.errorCode });
  if (!mapped.retriable) throw new AiFailure(mapped.errorCode);
  throw new AiRetry(mapped.errorCode);
}

export async function completeTriage(input: {
  ticketId: string;
  user: string;
}): Promise<
  {
    category: string;
    priority: string;
    confidence: number;
    rationale: string;
  } & TokenUsage
> {
  const completion = await chat(input.ticketId, {
    temperature: 0,
    messages: [
      { role: "system", content: TRIAGE_SYSTEM },
      { role: "user", content: input.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "bookleaf_triage",
        strict: true,
        schema: TRIAGE_JSON_SCHEMA,
      },
    },
  });
  const content = completion.choices[0]?.message.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AiFailure("invalid_output");
  }
  if (!isRecord(parsed)) throw new AiFailure("invalid_output");
  return {
    category: typeof parsed.category === "string" ? parsed.category : "",
    priority: typeof parsed.priority === "string" ? parsed.priority : "",
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : Number.NaN,
    rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
    ...usage(completion.usage),
  };
}

export async function completeDraft(input: {
  ticketId: string;
  user: string;
}): Promise<{ text: string } & TokenUsage> {
  const env = loadAiEnv();
  const completion = await chat(input.ticketId, {
    temperature: 0.3,
    max_tokens: env.maxOutputTokens,
    messages: [
      { role: "system", content: DRAFT_SYSTEM },
      { role: "user", content: input.user },
    ],
  });
  return {
    text: completion.choices[0]?.message.content ?? "",
    ...usage(completion.usage),
  };
}

async function chat(
  ticketId: string,
  body: Omit<OpenAI.Chat.ChatCompletionCreateParamsNonStreaming, "model">,
) {
  const env = loadAiEnv();
  if (!env.apiKey) {
    console.error("openai call failed", { ticketId, errorCode: "config" });
    throw new AiFailure("config");
  }
  const client = new OpenAI({ apiKey: env.apiKey, timeout: env.requestTimeoutMs });
  try {
    return await client.chat.completions.create({ model: env.model, ...body });
  } catch (err) {
    throwMapped(err, ticketId);
  }
}

function usage(value: OpenAI.CompletionUsage | undefined): TokenUsage {
  return {
    inputTokens: value?.prompt_tokens ?? null,
    outputTokens: value?.completion_tokens ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
