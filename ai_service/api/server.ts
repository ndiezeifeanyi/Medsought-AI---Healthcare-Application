import http from "node:http";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ChatHandler } from "./handlers/chat.ts";
import { validateBackendRequest } from "./schemas.ts";
import { readFileSync } from "node:fs";

function loadLocalEnv() {
  try {
    const __filenameLocal = fileURLToPath(import.meta.url);
    const base = dirname(__filenameLocal);
    const envPaths = [
      join(base, "..", ".env"),
      join(base, "..", "..", ".env")
    ];
    for (const envPath of envPaths) {
      try {
        const raw = readFileSync(envPath, "utf8");
        for (const line of raw.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const idx = trimmed.indexOf("=");
          if (idx <= 0) continue;
          const key = trimmed.slice(0, idx);
          const val = trimmed.slice(idx + 1);
          if (!process.env[key]) process.env[key] = val;
        }
      } catch {
        // ignore missing path
      }
    }
  } catch {
    // ignore missing .env
  }
}

loadLocalEnv();

export interface ServerInstance {
  server: http.Server;
  port: number;
  stop: () => Promise<void>;
}

export function startServer(options?: { port?: number; provider?: any }): Promise<ServerInstance> {
  const handler = new ChatHandler({ provider: options?.provider });
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
      if (req.method === "GET" && (req.url === "/chat" || req.url === "/")) {
        try {
          const __filenameLocal = fileURLToPath(import.meta.url);
          const base = dirname(__filenameLocal);
          const html = await readFile(join(base, "..", "tools", "chatbox.html"), "utf8");
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
        } catch (e: any) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("chat UI not available");
        }
        return;
      }

      if (req.method === "POST" && req.url === "/api/v1/ai/chat") {
        let body = "";
        req.on("data", (chunk: any) => (body += chunk));
        req.on("end", async () => {
          try {
            const parsed = JSON.parse(body || "{}");
            const errors = validateBackendRequest(parsed);
            if (errors.length > 0) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ errors }));
              return;
            }

            const out = await handler.process(parsed);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(out));
          } catch (err: any) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: String(err.message || err) }));
          }
        });
        return;
      }

      // default: JSON 404
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not_found" }));
    });

    server.listen(options?.port ?? 0, () => {
      // @ts-ignore
      const port = (server.address() as any).port;
      resolve({ server, port, stop: () => new Promise((r) => server.close(() => r(undefined))) });
    });
    server.on("error", (e: any) => reject(e));
  });
}

// If this file was executed directly (node ai_service/api/server.ts), start the server.
// Use a robust comparison by converting `import.meta.url` to a file path and comparing
// it to `process.argv[1]` which contains the executed script path.
const __filename = fileURLToPath(import.meta.url);
const normalizedArg = (process.argv[1] || "").replace(/\\/g, "/").toLowerCase();
const normalizedFile = __filename.replace(/\\/g, "/").toLowerCase();
if (normalizedArg && (normalizedArg === normalizedFile || normalizedArg.endsWith("ai_service/api/server.ts"))) {
  // started directly
  startServer({ port: 3000 }).then(({ port }) => console.log(`AI API listening on http://localhost:${port}`));
}
