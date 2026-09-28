import http from "node:http";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ChatHandler } from "./handlers/chat.ts";
import { validateBackendRequest } from "./schemas.ts";

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

export function startServer(options) {
  const handler = new ChatHandler({ provider: options?.provider });
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (req.method === "GET" && (req.url === "/chat" || req.url === "/" || req.url.startsWith("/chat"))) {
        try {
          const __filenameLocal = fileURLToPath(import.meta.url);
          const base = dirname(__filenameLocal);
          const html = readFileSync(join(base, "..", "tools", "chatbox.html"), "utf8");
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(html);
        } catch (e) {
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end("chat UI not available: " + String(e));
        }
        return;
      }


      if (req.method === "POST" && req.url === "/api/v1/ai/chat") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", async () => {
          try {
            let parsed = {};
            try {
              parsed = JSON.parse(body || "{}");
            } catch {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: { code: "INVALID_JSON", message: "Malformed JSON payload in request body." } }));
              return;
            }

            const errors = validateBackendRequest(parsed);
            if (errors.length > 0) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({
                error: {
                  code: "INVALID_REQUEST",
                  message: "AI request validation failed.",
                  details: errors
                }
              }));
              return;
            }

            const out = await handler.process(parsed);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(out));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: String(err.message || err) } }));
          }
        });
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Endpoint not found" } }));
    });

    const targetPort = options?.port ?? 3000;
    server.listen(targetPort, () => {
      console.log(`MedSought AI Chatbot Server listening on http://localhost:${targetPort}`);
      resolve({ server, port: targetPort, stop: () => new Promise((r) => server.close(() => r(undefined))) });
    });
    server.on("error", (e) => reject(e));
  });
}

const __filename = fileURLToPath(import.meta.url);
const normalizedArg = (process.argv[1] || "").replace(/\\/g, "/").toLowerCase();
const normalizedFile = __filename.replace(/\\/g, "/").toLowerCase();
if (normalizedArg && (normalizedArg === normalizedFile || normalizedArg.endsWith("server.js"))) {
  startServer({ port: 3000 });
}
