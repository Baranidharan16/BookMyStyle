/** Domain error with a human-readable message that is safe to show to users. */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  unauthorized: () => new AppError("UNAUTHORIZED", "Please sign in to continue.", 401),
  sessionExpired: () => new AppError("SESSION_EXPIRED", "Your session has expired. Please sign in again.", 401),
  forbidden: (msg = "You don't have permission to do that.") => new AppError("FORBIDDEN", msg, 403),
  notFound: (what = "That item") => new AppError("NOT_FOUND", `${what} could not be found.`, 404),
  validation: (msg: string, details?: unknown) => new AppError("VALIDATION", msg, 422, details),
  conflict: (code: string, msg: string, details?: unknown) => new AppError(code, msg, 409, details),
  rateLimited: () => new AppError("RATE_LIMITED", "Too many attempts. Please wait a moment and try again.", 429),
  slotTaken: () =>
    new AppError(
      "SLOT_TAKEN",
      "We couldn't confirm this booking because the selected slot was just taken. Please choose another time.",
      409,
    ),
};

/** Postgres SQLSTATE codes we translate into friendly errors. */
export const PG = {
  EXCLUSION_VIOLATION: "23P01",
  UNIQUE_VIOLATION: "23505",
  CHECK_VIOLATION: "23514",
  FOREIGN_KEY_VIOLATION: "23503",
  SERIALIZATION_FAILURE: "40001",
  DEADLOCK: "40P01",
} as const;

export function pgCode(e: unknown): string | undefined {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code ?? err?.cause?.code;
}
