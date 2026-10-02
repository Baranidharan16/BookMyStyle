/** Browser API client: unwraps { ok, data } envelopes and surfaces friendly error messages. */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("NETWORK", "You appear to be offline. Check your connection and try again.", 0);
  }
  let json: { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } | null = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || !json?.ok) {
    if (res.status === 401 && typeof window !== "undefined" && json?.error?.code === "UNAUTHORIZED") {
      // session expired mid-flow
    }
    throw new ApiError(json?.error?.code ?? "HTTP_" + res.status, json?.error?.message ?? "Something went wrong. Please try again.", res.status, json?.error?.details);
  }
  return json.data as T;
}

export const api = {
  get: <T,>(url: string) => request<T>("GET", url),
  post: <T,>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T,>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T,>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  del: <T,>(url: string, body?: unknown) => request<T>("DELETE", url, body ?? {}),
};

export function qs(params: Record<string, string | number | boolean | null | undefined | string[]>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    sp.set(k, Array.isArray(v) ? v.join(",") : String(v === true ? 1 : v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong.";
}
