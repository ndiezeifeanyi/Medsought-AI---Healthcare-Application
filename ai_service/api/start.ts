import { startServer } from "./server.ts";

console.log("Starting MedSought AI Server on port 3000...");
startServer({ port: 3000 })
  .then(({ port }) => {
    console.log(`AI API listening on http://localhost:${port}`);
  })
  .catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
