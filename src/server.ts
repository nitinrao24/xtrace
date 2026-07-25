/**
 * The board.
 *
 *   npm run dev   →   http://localhost:5174
 *
 * Serves the dashboard and streams a live replay over server-sent events, so a
 * judge watches memory being written, routed and fired rather than reading a
 * summary of it having happened.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { ROOT, config, readState } from "./config.ts";
import { run } from "./eval/harness.ts";
import { rules } from "./memory/router.ts";

const WEB = path.join(ROOT, "web");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

let running = false;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/api/state") {
    const last = readState<unknown>("last-run.json", null);
    send(res, 200, "application/json", JSON.stringify({
      offline: config.offline,
      namespace: config.namespace,
      rules: rules(),
      last,
    }));
    return;
  }

  if (url.pathname === "/api/replay") {
    if (running) {
      send(res, 409, "application/json", JSON.stringify({ error: "a replay is already running" }));
      return;
    }
    running = true;

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });

    const push = (event: { kind: string; payload: unknown }) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const result = await run({ onEvent: push });
      push({ kind: "done", payload: result });
    } catch (err) {
      push({ kind: "error", payload: { message: err instanceof Error ? err.message : String(err) } });
    } finally {
      running = false;
      res.end();
    }
    return;
  }

  // Static.
  const rel = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB) || !fs.existsSync(file)) {
    send(res, 404, "text/plain", "not found");
    return;
  }
  send(res, 200, MIME[path.extname(file)] ?? "application/octet-stream", fs.readFileSync(file));
});

function send(res: http.ServerResponse, code: number, type: string, body: string | Buffer): void {
  res.writeHead(code, { "content-type": type });
  res.end(body);
}

server.listen(config.port, () => {
  console.log();
  console.log(`  \x1b[1mMISE\x1b[0m  \x1b[2m·  http://localhost:${config.port}\x1b[0m`);
  console.log(`  \x1b[2m   memory: ${config.offline ? "offline stand-in" : "XTrace hosted"}\x1b[0m`);
  console.log();
});
