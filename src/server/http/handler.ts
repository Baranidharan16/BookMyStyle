import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { AppError, Errors, PG, pgCode } from "./errors";

export type Json = Record<string, unknown> | unknown[];

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json({ ok: false, error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const first = e.issues[0];
    const field = first?.path.join(".");
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "VALIDATION",
          message: first ? `${field ? `${humanize(field)}: ` : ""}${first.message}` : "Please check the form and try again.",
          details: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  const code = pgCode(e);
  if (code === PG.EXCLUSION_VIOLATION) return errorResponse(Errors.slotTaken());
  if (code === PG.UNIQUE_VIOLATION) return errorResponse(Errors.conflict("DUPLICATE", "That already exists."));
  if (code === PG.CHECK_VIOLATION) return errorResponse(Errors.validation("Some values are out of the allowed range."));
  console.error("[api] unhandled error", e);
  return NextResponse.json(
    { ok: false, error: { code: "INTERNAL", message: "Something went wrong on our side. Please try again in a moment." } },
    { status: 500 },
  );
}

function humanize(path: string) {
  const last = path.split(".").pop() ?? path;
  return last.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

/**
 * CSRF defence for cookie-authenticated mutations: browsers always send
 * `Origin` on cross-site POST/PUT/PATCH/DELETE. We reject any mutation whose
 * Origin doesn't match the host. (Session cookies are also SameSite=Lax.)
 */
export function assertSameOrigin(req: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser clients (curl, server-to-server) don't send Origin. They
    // can't carry a victim's cookies, so allow — auth is still enforced.
    if (req.headers.get("sec-fetch-site") === "cross-site") throw Errors.forbidden("Cross-site request blocked.");
    return;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw Errors.forbidden("Cross-site request blocked.");
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw Errors.forbidden("Cross-site request blocked.");
  }
}

type Ctx<P> = { params: Promise<P> };

/** Wrap a route handler with CSRF protection + uniform error handling. */
export function route<P = Record<string, string>>(fn: (req: NextRequest, ctx: Ctx<P>) => Promise<Response>) {
  return async (req: NextRequest, ctx: Ctx<P>) => {
    try {
      assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw Errors.validation("The request body was not valid JSON.");
  }
  return schema.parse(body);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
