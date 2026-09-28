import { startServer } from "../api/server.ts";

async function main() {
  const srv = await startServer({ port: 0 });
  const res = await fetch(`http://localhost:${srv.port}/api/v1/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: "user-123",
      conversationId: "conv-456",
      message: "vitamin c mixed with augmentin"
    })
  });
  const data = await res.json();
  console.log("HTTP_STATUS:", res.status);
  console.log("RESPONSE_JSON:", JSON.stringify(data, null, 2));
  await srv.stop();
}

main().catch(console.error);
