const express = require("express");
const cors = require("cors");

const PORT = process.env.PORT || 3002;
const SERVER_NAME = "spare";

const app = express();
app.use(cors());
app.use(express.json());

console.log(`[${SERVER_NAME}] Starting on port ${PORT}`);

// ===== ENDPOINT PRINCIPAL : GET /api =====
// Le spare est toujours sain et répond toujours 200
app.get("/api", (req, res) => {
  console.log(`[${SERVER_NAME}] GET /api - always healthy`);

  res.status(200).json({
    node: SERVER_NAME,
    ok: true,
    ts: Date.now(),
    message: `Response from ${SERVER_NAME} (warm spare)`,
  });
});

// ===== ENDPOINT DE DEBUG (optionnel) =====
app.get("/status", (req, res) => {
  res.status(200).json({
    node: SERVER_NAME,
    port: PORT,
    status: "always healthy",
    ts: Date.now(),
  });
});

// ===== DÉMARRAGE DU SERVEUR =====
app.listen(PORT, () => {
  console.log(`[${SERVER_NAME}] Server running on http://localhost:${PORT}`);
  console.log(`[${SERVER_NAME}] Role: Warm spare (always available)`);
  console.log(`[${SERVER_NAME}] Endpoints:`);
  console.log(`  - GET /api     : Main API endpoint (always 200)`);
  console.log(`  - GET /status  : Current status`);
});
