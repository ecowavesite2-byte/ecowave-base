import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import writeFileAtomic from "write-file-atomic";
import { appendAudit, auditRelPath } from "./audit";
import { CONTENT_ROOT } from "./paths";

/**
 * Serialized, crash-safe writes for the file-backed content store.
 *
 *  - an in-process mutex serializes every read-modify-write,
 *  - `write-file-atomic` + retry/backoff tolerates Windows AV/file-lock errors,
 *  - the previous content is snapshotted under `content/.history/<ISO>/`,
 *  - an optimistic sha256 hash rejects stale saves with `HashMismatchError`.
 */

const HISTORY_ROOT = path.join(CONTENT_ROOT, ".history");
const RETRY_DELAYS_MS = [50, 200, 800] as const;
const RETRYABLE_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

/** sha256 of the empty string — the version token for a not-yet-created file. */
export const EMPTY_HASH = crypto.createHash("sha256").update("").digest("hex");

/** Thrown when the caller's `expectedHash` no longer matches the file on disk. */
export class HashMismatchError extends Error {
  readonly expected: string;
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super(
      `Content is stale: expected ${expected.slice(0, 12)}… but found ${actual.slice(0, 12)}…`,
    );
    this.name = "HashMismatchError";
    this.expected = expected;
    this.actual = actual;
  }
}

/** sha256 (hex) of a string or buffer. */
export function hashOf(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/** sha256 (hex) of a file's raw bytes. */
export function hashOfFile(file: string): string {
  return hashOf(fs.readFileSync(file));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertInsideContentRoot(file: string): void {
  const root = path.resolve(CONTENT_ROOT);
  const resolved = path.resolve(file);
  if (!(resolved === root || resolved.startsWith(root + path.sep))) {
    throw new Error(`Refusing to write outside CONTENT_ROOT: ${file}`);
  }
}

/**
 * In-process mutex (a promise chain): the next task waits for the previous one,
 * then runs whether it resolved or rejected. Good enough for a single Node
 * process — no cross-process lockfile needed.
 */
let chain: Promise<unknown> = Promise.resolve();

export function withLock<T>(task: () => Promise<T> | T): Promise<T> {
  const run = chain.then(task, task);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

let snapshotSeq = 0;

/** Copy the current file into `content/.history/<ISO-timestamp>/<relative>`. */
function snapshotBeforeOverwrite(file: string): string | null {
  if (!fs.existsSync(file)) return null;
  const relative = path.relative(CONTENT_ROOT, file);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let dest = path.join(HISTORY_ROOT, stamp, relative);
  while (fs.existsSync(dest)) {
    dest = path.join(HISTORY_ROOT, `${stamp}-${++snapshotSeq}`, relative);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(file, dest);
  return dest;
}

/** Atomic write with retry/backoff for Windows EPERM/EBUSY/EACCES (AV, locks). */
async function writeAtomicWithRetry(file: string, data: string): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      await writeFileAtomic(file, data, { encoding: "utf8" });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= RETRY_DELAYS_MS.length || !code || !RETRYABLE_CODES.has(code)) {
        throw error;
      }
      await delay(RETRY_DELAYS_MS[attempt]);
    }
  }
}

function serialize(content: unknown): string {
  return JSON.stringify(content, null, 2) + "\n";
}

/**
 * Atomic JSON write WITHOUT acquiring the in-process lock. Callers doing a
 * read-modify-write (e.g. the media index) must wrap this in `withLock`;
 * `saveJsonFile` already holds the lock and must not call this.
 *
 * `opts.actor` / `opts.action` are recorded in the audit log (best-effort).
 */
export async function writeJsonFileAtomic(
  file: string,
  content: unknown,
  opts?: { actor?: string; action?: string },
): Promise<void> {
  assertInsideContentRoot(file);
  const before = fs.existsSync(file) ? hashOfFile(file) : EMPTY_HASH;
  const next = serialize(content);
  await writeAtomicWithRetry(file, next);
  appendAudit({
    actor: opts?.actor,
    action: opts?.action ?? "save-atomic",
    file: auditRelPath(file),
    hashBefore: before,
    hashAfter: hashOf(next),
    bytes: Buffer.byteLength(next),
  });
}

export interface SaveJsonOptions {
  /** Destination file; must live under CONTENT_ROOT. */
  file: string;
  content: unknown;
  /** Version token the client loaded; compared inside the lock. */
  expectedHash?: string;
  /**
   * File whose current hash must equal `expectedHash` (defaults to `file`).
   * Used for ko→en inheritance: read the ko file, write a new en file.
   */
  versionFile?: string;
  /** Admin email, recorded in the audit log. */
  actor?: string;
  /** Audit action label; defaults to `save`. */
  action?: string;
}

/**
 * Atomically persist `content` and return the hash of the bytes written.
 * Throws `HashMismatchError` when `expectedHash` is stale.
 */
export async function saveJsonFile(options: SaveJsonOptions): Promise<string> {
  return withLock(async () => {
    const dest = options.file;
    assertInsideContentRoot(dest);

    const versionFile = options.versionFile ?? dest;
    const actual = fs.existsSync(versionFile) ? hashOfFile(versionFile) : EMPTY_HASH;
    if (options.expectedHash !== undefined && options.expectedHash !== actual) {
      throw new HashMismatchError(options.expectedHash, actual);
    }

    const before = fs.existsSync(dest) ? hashOfFile(dest) : EMPTY_HASH;
    snapshotBeforeOverwrite(dest);
    const next = serialize(options.content);
    await writeAtomicWithRetry(dest, next);
    const after = hashOf(next);
    appendAudit({
      actor: options.actor,
      action: options.action ?? "save",
      file: auditRelPath(dest),
      hashBefore: before,
      hashAfter: after,
      bytes: Buffer.byteLength(next),
    });
    return after;
  });
}
