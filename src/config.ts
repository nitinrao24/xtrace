import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal .env reader so the repo has no dotenv dependency. */
function loadEnvFile(): void {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile();

const apiKey = process.env.XTRACE_API_KEY ?? "";
const orgId = process.env.XTRACE_ORG_ID ?? "";

export const config = {
  apiKey,
  orgId,
  baseUrl: process.env.XTRACE_BASE_URL || "https://api.production.xtrace.ai",

  /** The working context directives are written under and recalled from. */
  namespace: process.env.MISE_NAMESPACE || "verano:service",
  appId: process.env.MISE_APP_ID || "mise",
  agentId: process.env.MISE_AGENT_ID || "mise-expo",

  vaultUrl: process.env.MISE_VAULT_URL || "http://127.0.0.1:8787",
  port: Number(process.env.MISE_PORT || 5174),

  /**
   * Offline mode. Runs the whole pipeline against an in-process stand-in so the
   * demo works on conference wifi and on a plane. Forced on when credentials
   * are absent.
   */
  offline: process.env.MISE_OFFLINE === "1" || !apiKey,
} as const;

export const dataDir = path.join(ROOT, "data");
export const stateDir = path.join(ROOT, ".mise");

export function readData<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8")) as T;
}

export function saveState(name: string, value: unknown): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, name), JSON.stringify(value, null, 2) + "\n");
}

export function readState<T>(name: string, fallback: T): T {
  const file = path.join(stateDir, name);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

/** Node reports every network failure as "fetch failed" and hides the reason in `cause`. */
export function explain(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 4 && cur; i++) {
    const e = cur as { message?: string; code?: string; cause?: unknown };
    if (e.message) parts.push(e.code ? `${e.message} (${e.code})` : e.message);
    cur = e.cause;
  }
  return parts.join(" → ") || String(err);
}
