export type ErrorCode =
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "AI_UNAVAILABLE"
  | "UPLOAD_FAILED";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly fields?: Record<string, string> | undefined;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    if (fields !== undefined) {
      this.fields = fields;
    }
  }

  static validation(
    message = "Please correct the highlighted fields.",
    fields: Record<string, string> = {},
  ) {
    return new AppError(400, "VALIDATION_ERROR", message, fields);
  }

  static badRequest(message: string) {
    return new AppError(400, "BAD_REQUEST", message);
  }

  static unauthenticated(message = "Invalid email or password.") {
    return new AppError(401, "UNAUTHENTICATED", message);
  }

  static forbidden(message = "Forbidden.") {
    return new AppError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Not found.") {
    return new AppError(404, "NOT_FOUND", message);
  }

  static conflict(message: string, fields?: Record<string, string>) {
    return new AppError(409, "CONFLICT", message, fields);
  }

  static rateLimited(message = "Too many attempts. Try again later.") {
    return new AppError(429, "RATE_LIMITED", message);
  }

  static internal() {
    return new AppError(
      500,
      "INTERNAL",
      "Something went wrong. Please try again later.",
    );
  }
}
