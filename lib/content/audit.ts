import fs from "node:fs";
import path from "node:path";
import { CONTENT_ROOT } from "./paths";

/**
 * Best-effort append-only audit log.
 *
 * One JSON object per line at `content/.history/audit.log` (gitignored). Every
 * content/media write funnels through `write.ts`, which records the file and
 * the hash before/after; API routes add the actor (admin email) where known.
 *
 * Logging must never fail a save: all errors are swallowed.
 */

export const AUDIT_LOG = path.join(CONTENT_ROOT, ".history", "audit.log");

export interface AuditEntry {
  /** ISO timestamp; defaults to now. */
  ts?: string;
  /** Admin email when the request carried a session. */
  actor?: string;
  /** e.g. `save`, `save-atomic`, `draft-save`, `publish`, `media-upload`, `media-delete`. */
  action: string;
  /** content-relative path (forward slashes). */
  file?: string;
  hashBefore?: string;
  hashAfter?: string;
  /** best-effort byte size of the written payload. */
  bytes?: number;
  meta?: Record<string, unknown>;
}

/** content-relative, forward-slash path for audit records. */
export function auditRelPath(file: string): string {
  return path.relative(CONTENT_ROOT, file).split(path.sep).join("/");
}

export function appendAudit(entry: AuditEntry): void {
  try {
    const { ts, ...rest } = entry;
    const line = `${JSON.stringify({ ts: ts ?? new Date().toISOString(), ...rest })}\n`;
    fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
    fs.appendFileSync(AUDIT_LOG, line, "utf8");
  } catch {
    // best-effort: never fail a save because logging failed
  }
}
