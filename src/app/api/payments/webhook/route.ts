import type { NextRequest } from "next/server";
import { errorResponse, ok } from "@/server/http/handler";
import { handleWebhook } from "@/server/payments/service";

/**
 * POST /api/payments/webhook — provider → server. Authenticated by HMAC
 * signature over the raw body (not by cookies), so no CSRF wrapper here.
 */
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text();
    const res = await handleWebhook(raw, req.headers);
    return ok(res);
  } catch (e) {
    return errorResponse(e);
  }
}
