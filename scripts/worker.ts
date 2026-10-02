/** Dedicated background worker (alternative to the in-process sweeper). */
import "dotenv/config";
import { runSweep } from "../src/server/jobs";

async function loop() {
  for (;;) {
    const res = await runSweep();
    if (Object.values(res).some((v) => v > 0)) console.log(new Date().toISOString(), res);
    await new Promise((r) => setTimeout(r, 30_000));
  }
}
loop();
