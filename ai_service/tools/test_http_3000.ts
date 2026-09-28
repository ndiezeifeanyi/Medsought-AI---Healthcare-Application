async function main() {
  console.log("Sending POST to http://localhost:3000/api/v1/ai/chat for 'what is paracetaamol'...");
  const res = await fetch("http://localhost:3000/api/v1/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: "c1",
      userId: "u1",
      message: "what is paracetaamol"
    })
  });

  const data = await res.json();
  console.log("HTTP 3000 Response:");
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
