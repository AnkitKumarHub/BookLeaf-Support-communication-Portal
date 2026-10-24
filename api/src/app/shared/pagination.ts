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

export function parseDateRange(input: {
  from?: unknown;
  to?: unknown;
}): { from?: Date; to?: Date } {
  const from = parseDay(input.from, "from", false);
  const to = parseDay(input.to, "to", true);
  if (from && to && from.getTime() > to.getTime()) {
    throw AppError.validation("Please correct the highlighted fields.", {
      from: "Use a from date on or before to.",
    });
  }
  const range: { from?: Date; to?: Date } = {};
  if (from) range.from = from;
  if (to) range.to = to;
  return range;
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

function parseDay(
  value: unknown,
  field: string,
  endOfDay: boolean,
): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw dateError(field);
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) throw dateError(field);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ),
  );
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw dateError(field);
  }
  return date;
}

function dateError(field: string) {
  return AppError.validation("Please correct the highlighted fields.", {
    [field]: "Use a date as YYYY-MM-DD.",
  });
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
