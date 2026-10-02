import "server-only";
import type { Executor } from "./db";
import { auditLogs } from "./db/schema";

export type AuditEntry = {
  actorId?: string | null;
  salonId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
};

/** Append-only audit trail. Call inside the same transaction as the change. */
export async function audit(ex: Executor, e: AuditEntry) {
  await ex.insert(auditLogs).values({
    actorId: e.actorId ?? null,
    salonId: e.salonId ?? null,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    oldValue: (e.oldValue ?? null) as never,
    newValue: (e.newValue ?? null) as never,
    ip: e.ip ?? null,
  });
}
