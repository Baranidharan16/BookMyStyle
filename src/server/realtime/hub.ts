import "server-only";
import { EventEmitter } from "node:events";
import { Client } from "pg";
import { REALTIME_PG_CHANNEL, type RealtimeEvent } from "./publish";

/**
 * One LISTEN connection per server process fans Postgres notifications out
 * to all SSE subscribers in that process. Every app instance runs its own
 * hub, so this scales horizontally without a separate message broker.
 */
class RealtimeHub {
  private emitter = new EventEmitter();
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  private async connect() {
    if (this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      client.on("notification", (msg) => {
        if (!msg.payload) return;
        try {
          const event = JSON.parse(msg.payload) as RealtimeEvent;
          this.emitter.emit(event.ch, event);
        } catch {
          /* ignore malformed payloads */
        }
      });
      client.on("error", (err) => {
        console.error("[realtime] listener error, reconnecting", err.message);
        this.client = null;
        setTimeout(() => this.connect().catch(() => {}), 2000);
      });
      await client.connect();
      await client.query(`LISTEN ${REALTIME_PG_CHANNEL}`);
      this.client = client;
    })().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async subscribe(channel: string, fn: (e: RealtimeEvent) => void) {
    await this.connect();
    this.emitter.on(channel, fn);
    return () => this.emitter.off(channel, fn);
  }
}

const g = globalThis as unknown as { __bmsHub?: RealtimeHub };
export const hub = g.__bmsHub ?? (g.__bmsHub = new RealtimeHub());
