#!/usr/bin/env node
/**
 * Generate ADMIN_PASSWORD_HASH / ADMIN_PASSWORD_SALT for the ECOWAVE admin login.
 *
 * The application (lib/auth/guard.ts) verifies credentials with:
 *     crypto.scryptSync(password, salt, 64)   // Node default scrypt params
 * compared via timingSafeEqual against the 64-byte digest in
 * ADMIN_PASSWORD_HASH (lowercase hex, 128 chars) using the salt in
 * ADMIN_PASSWORD_SALT (hex). This script produces exactly those two values.
 *
 * The password is never echoed and never printed. Only the two derived values
 * (which are safe at rest) are written to the env file.
 *
 * Usage
 *   node scripts/admin-set-password.mjs                      # prompt (hidden input)
 *   node scripts/admin-set-password.mjs --file=.env.local
 *   ADMIN_PW='...' node scripts/admin-set-password.mjs --password-env=ADMIN_PW --yes
 *   printf '%s\n' '...' | node scripts/admin-set-password.mjs --password-stdin --yes
 *   node scripts/admin-set-password.mjs --generate --print-generated --yes
 *
 * Flags
 *   --file=<path>           env file to update           (default: .env.local)
 *   --password-env=<NAME>   read the password from an environment variable
 *   --password-stdin        read the password from stdin (first line)
 *   --password-file=<path>  read the ADMIN_PASSWORD line from another env file
 *                           (e.g. --password-file=.env.local to derive the hash
 *                           from a plaintext already sitting in that file)
 *   --generate              generate a strong random password instead
 *   --print-generated       print a generated password once (implies --generate)
 *   --email=<addr>          also set ADMIN_EMAIL
 *   --drop-plaintext        remove a plaintext ADMIN_PASSWORD line (the app
 *                           does not read it, but it is still a secret on disk)
 *   --dry-run               report the planned edit without writing
 *   --yes                   skip the interactive confirmation prompt
 */
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const KEY_HASH = "ADMIN_PASSWORD_HASH";
const KEY_SALT = "ADMIN_PASSWORD_SALT";
const KEY_PLAIN = "ADMIN_PASSWORD";
const KEY_EMAIL = "ADMIN_EMAIL";

const args = process.argv.slice(2);
const getArg = (name, fallback = null) => {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  const eq = hit.indexOf("=");
  return eq === -1 ? true : hit.slice(eq + 1);
};
const has = (name) => args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));

const filePath = resolve(process.cwd(), String(getArg("file", ".env.local")));
const dryRun = Boolean(has("dry-run"));
const skipConfirm = Boolean(has("yes"));

function fail(message) {
  console.error(`\n  error: ${message}\n`);
  process.exit(1);
}

/** Read one line from a TTY without echoing it. */
function readHidden(prompt) {
  return new Promise((resolvePromise, rejectPromise) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      let buf = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => {
        buf += chunk;
        const nl = buf.indexOf("\n");
        if (nl !== -1) {
          stdin.pause();
          resolvePromise(buf.slice(0, nl).replace(/\r$/, ""));
        }
      });
      stdin.on("end", () => resolvePromise(buf.replace(/\r?\n$/, "")));
      return;
    }
    process.stderr.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const cleanup = () => {
      stdin.removeListener("data", onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n" || ch === "\u0004") {
          cleanup();
          process.stderr.write("\n");
          resolvePromise(value);
          return;
        }
        if (ch === "\u0003") {
          cleanup();
          process.stderr.write("\n");
          rejectPromise(new Error("aborted"));
          return;
        }
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/** Loose dotenv read: returns key -> raw value (quotes stripped). */
function readEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    map.set(m[1], value);
  }
  return map;
}

/** Upsert KEY=value lines, preserving every unrelated line and the file's EOL style. */
function upsertEnv(text, updates, removals) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const pending = new Map(Object.entries(updates));
  const removed = new Set(removals);

  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (m && removed.has(m[1])) continue;
    if (m && pending.has(m[1])) {
      out.push(`${m[1]}=${pending.get(m[1])}`);
      pending.delete(m[1]);
      continue;
    }
    out.push(line);
  }
  if (pending.size > 0) {
    while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
    for (const [key, value] of pending) out.push(`${key}=${value}`);
    out.push("");
  }
  return out.join(eol);
}

function randomPassword() {
  // 24 bytes -> 32 base64url chars; comfortably above the 32-char guidance in README.
  return randomBytes(24).toString("base64url");
}

async function main() {
  if (!existsSync(filePath)) fail(`env file not found: ${filePath}`);

  const original = readFileSync(filePath, "utf8");
  const current = readEnv(original);

  if (!current.has(KEY_HASH)) {
    console.warn(`  note: ${KEY_HASH} is not currently set in ${filePath}`);
  }

  let password;
  let generated = false;
  if (has("generate") || has("print-generated")) {
    password = randomPassword();
    generated = true;
  } else if (has("password-env")) {
    const name = String(getArg("password-env"));
    password = process.env[name];
    if (!password) fail(`environment variable ${name} is empty or unset`);
  } else if (has("password-stdin")) {
    password = await readHidden("");
  } else if (has("password-file")) {
    const source = resolve(process.cwd(), String(getArg("password-file")));
    if (!existsSync(source)) fail(`password source file not found: ${source}`);
    const fromFile = readEnv(readFileSync(source, "utf8")).get(KEY_PLAIN);
    if (!fromFile) fail(`${KEY_PLAIN} is not set in ${source}`);
    password = fromFile;
  } else if (process.stdin.isTTY) {
    password = await readHidden("  New admin password: ");
    if (!skipConfirm) {
      const again = await readHidden("  Repeat password:    ");
      if (again !== password) fail("passwords do not match");
    }
  } else {
    fail(
      "no password source. Use --password-env=<NAME>, --password-stdin, --generate, " +
        "or run interactively in a terminal.",
    );
  }

  if (!password) fail("empty password refused");
  if (password.length < 8) {
    console.warn(`  warning: password is only ${password.length} characters long`);
  }

  const salt = randomBytes(16);
  const digest = scryptSync(password, salt, 64); // default params, matches lib/auth/guard.ts

  const updates = {
    [KEY_SALT]: salt.toString("hex"),
    [KEY_HASH]: digest.toString("hex"),
  };
  const email = getArg("email");
  if (email && email !== true) updates[KEY_EMAIL] = String(email);

  const removals = [];
  if (has("drop-plaintext") && current.has(KEY_PLAIN)) removals.push(KEY_PLAIN);

  const next = upsertEnv(original, updates, removals);

  console.log("");
  console.log(`  file         ${filePath}`);
  console.log(`  salt bytes   ${salt.length}`);
  console.log(`  digest bytes ${digest.length} (hex length ${digest.toString("hex").length})`);
  if (email && email !== true) console.log(`  ${KEY_EMAIL}   set`);
  if (removals.length) console.log(`  removed      ${removals.join(", ")}`);
  if (!generated && current.has(KEY_PLAIN)) {
    console.log(
      `  note         ${KEY_PLAIN} is still present but UNUSED by the application;\n` +
        `               pass --drop-plaintext to remove it from the file`,
    );
  }
  if (password.length < 8) console.log("  warning      weak password length accepted");

  if (dryRun) {
    console.log("\n  dry run: nothing written\n");
    return;
  }

  writeFileSync(filePath, next, "utf8");
  console.log("\n  written. Restart the server so the new credentials load.\n");

  if (generated && has("print-generated")) {
    console.log("  generated password (shown once, not stored):");
    console.log(`  ${password}`);
    console.log("");
  }
}

main().catch((error) => {
  if (error && error.message === "aborted") process.exit(130);
  fail(error && error.stack ? error.stack : String(error));
});
