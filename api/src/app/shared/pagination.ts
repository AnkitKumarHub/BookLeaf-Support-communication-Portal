import { AppError } from "./errors.js";

const MAX_LIMIT = 100;

export type PageLimit = {
  page: number;
  limit: number;
};

export function parsePagination(input: {
  page?: unknown;
  limit?: unknown;
}): PageLimit {
  return {
    page: parseBound(input.page, "page", 1, Number.MAX_SAFE_INTEGER),
    limit: parseBound(input.limit, "limit", 20, MAX_LIMIT),
  };
}

export function optionalFilter(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw AppError.validation("Please correct the highlighted fields.", {
      [field]: "Enter a single text value.",
    });
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseBound(
  value: unknown,
  field: string,
  fallback: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "string") {
    throw boundError(field);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return fallback;
  if (!/^\d+$/.test(trimmed) || trimmed.length > 15) {
    throw boundError(field);
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
    throw boundError(field);
  }
  return parsed;
}

function boundError(field: string) {
  const message =
    field === "limit"
      ? "Use a limit between 1 and 100."
      : "Use a page of 1 or greater.";
  return AppError.validation("Please correct the highlighted fields.", {
    [field]: message,
  });
}
