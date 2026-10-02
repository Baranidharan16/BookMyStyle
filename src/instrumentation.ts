/**
 * Next.js instrumentation hook: starts the in-process sweeper on Node.js
 * servers (expired checkout holds, reminders, auto no-show, outbox). Disable
 * with RUN_SWEEPER=false when running the dedicated `npm run worker`.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RUN_SWEEPER === "false") return;
  const g = globalThis as unknown as { __bmsSweeper?: NodeJS.Timeout };
  if (g.__bmsSweeper) return;
  const { runSweep } = await import("./server/jobs");
  const tick = () => runSweep().catch((e) => console.error("[sweep]", e));
  g.__bmsSweeper = setInterval(tick, 30_000);
  setTimeout(tick, 5_000);
}
