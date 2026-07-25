/**
 * The vault: the half of memory that never reaches a hosted service.
 *
 * Backed by x-vec, XTrace's encrypted vector database. Content is AES-encrypted
 * and the embedding vector is encrypted with Paillier before it leaves the
 * machine; the server computes Hamming distances over ciphertext and returns
 * chunk ids, which we decrypt locally. The server never sees the guest record,
 * the vector, or the query.
 *
 * `vault/service.py` wraps the Python SDK behind a small local HTTP interface,
 * because the SDK is Python and the agent is Node. If that service is not
 * running, this falls back to an AES-encrypted file on disk with the same shape
 * so the demo still runs — search quality drops to lexical, and nothing is
 * remote, which for this data is the conservative failure.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config, stateDir } from "../config.ts";

export interface VaultEntry {
  id: string;
  text: string;
  guest_id?: string;
  tags: string[];
  score?: number;
}

const FALLBACK_FILE = path.join(stateDir, "vault.enc");
const FALLBACK_KEY = crypto.createHash("sha256")
  .update(process.env.MISE_VAULT_PASSPHRASE || "mise-demo-passphrase")
  .digest();

function sealFallback(entries: VaultEntry[]): void {
  fs.mkdirSync(stateDir, { recursive: true });
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", FALLBACK_KEY, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(entries), "utf8"), cipher.final()]);
  fs.writeFileSync(FALLBACK_FILE, Buffer.concat([iv, cipher.getAuthTag(), body]));
}

/**
 * Thrown when the vault file exists but will not open under the current
 * passphrase. AES-GCM authenticates as well as encrypts, so a changed
 * MISE_VAULT_PASSPHRASE does not decrypt to garbage — it refuses outright.
 * That is the vault behaving correctly; it just needs to say so in English.
 */
export class VaultLocked extends Error {
  constructor() {
    super(
      `The vault at ${FALLBACK_FILE} will not open with the current MISE_VAULT_PASSPHRASE.\n` +
      `    Either restore the passphrase that wrote it, or delete the .mise directory\n` +
      `    to start a fresh vault — the contents are rebuilt from data/ by npm run seed.`,
    );
    this.name = "VaultLocked";
  }
}

function openFallback(): VaultEntry[] {
  if (!fs.existsSync(FALLBACK_FILE)) return [];
  const blob = fs.readFileSync(FALLBACK_FILE);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", FALLBACK_KEY, blob.subarray(0, 12));
    decipher.setAuthTag(blob.subarray(12, 28));
    const plain = Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString("utf8");
    return JSON.parse(plain) as VaultEntry[];
  } catch {
    throw new VaultLocked();
  }
}

export class Vault {
  private remote = false;

  static async open(): Promise<Vault> {
    const v = new Vault();
    try {
      const res = await fetch(`${config.vaultUrl}/health`, { signal: AbortSignal.timeout(1200) });
      v.remote = res.ok;
    } catch {
      v.remote = false;
    }
    return v;
  }

  get backend(): "x-vec" | "local-aes" {
    return this.remote ? "x-vec" : "local-aes";
  }

  async put(entries: Array<{ text: string; guest_id?: string; tags?: string[] }>): Promise<number> {
    if (this.remote) {
      const res = await fetch(`${config.vaultUrl}/chunks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chunks: entries }),
      });
      if (!res.ok) throw new Error(`vault put failed: ${res.status}`);
      const body = (await res.json()) as { stored: number };
      return body.stored;
    }

    const all = openFallback();
    for (const e of entries) {
      if (all.some((x) => x.text === e.text)) continue;
      all.push({
        id: crypto.randomUUID(),
        text: e.text,
        guest_id: e.guest_id,
        tags: e.tags ?? [],
      });
    }
    sealFallback(all);
    return entries.length;
  }

  async query(text: string, k = 4): Promise<VaultEntry[]> {
    if (this.remote) {
      const res = await fetch(`${config.vaultUrl}/query`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: text, k }),
      });
      if (!res.ok) throw new Error(`vault query failed: ${res.status}`);
      const body = (await res.json()) as { results: VaultEntry[] };
      return body.results;
    }

    const q = new Set(
      text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3),
    );
    return openFallback()
      .map((e) => {
        const words = e.text.toLowerCase().split(/\W+/);
        let hits = 0;
        // Stem both directions at three characters, so a question about the
        // "fryer" reaches a record that says "fry station".
        for (const w of q) {
          const stem = w.slice(0, 3);
          if (words.some((x) => x.startsWith(stem) || w.startsWith(x.slice(0, 3)))) hits += 1;
        }
        return { ...e, score: hits / Math.max(1, q.size) };
      })
      .filter((e) => (e.score ?? 0) > 0.08)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, k);
  }

  /** Chunk count, or -1 if the vault exists but is locked. Never throws. */
  async count(): Promise<number> {
    if (this.remote) {
      const res = await fetch(`${config.vaultUrl}/health`);
      const body = (await res.json()) as { chunks?: number };
      return body.chunks ?? 0;
    }
    try {
      return openFallback().length;
    } catch {
      return -1;
    }
  }
}
