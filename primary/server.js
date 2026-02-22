const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const PORT = process.env.PORT || 3001;
const SERVER_NAME = "primary";
const PROXY_BASE = "http://localhost:3000";
const HEARTBEAT_INTERVAL_MS = 1000;  // Envoyer heartbeat toutes les 1 seconde

const app = express();
app.use(cors());
app.use(express.json());

// État interne : mode de défaillance
// Valeurs possibles : "none", "crash"
let failureMode = "none";

console.log(`[${SERVER_NAME}] Starting on port ${PORT}`);

// ===== HEARTBEAT : ENVOYER AU PROXY =====
async function sendHeartbeat() {
  try {
    await fetch(`${PROXY_BASE}/heartbeat?from=primary`, {
      method: "POST",
    });
  } catch (error) {
    // Si le proxy n'est pas disponible, on continue silencieusement
    // console.error(`[${SERVER_NAME}] Failed to send heartbeat: ${error.message}`);
  }
}

// Démarrer l'envoi de heartbeats
let heartbeatInterval = null;

function startHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  heartbeatInterval = setInterval(() => {
    sendHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);

  console.log(`[${SERVER_NAME}] Heartbeat started (every ${HEARTBEAT_INTERVAL_MS}ms)`);
}

// ===== ENDPOINT PRINCIPAL : GET /api =====
app.get("/api", (req, res) => {
  console.log(`[${SERVER_NAME}] GET /api - failureMode: ${failureMode}`);

  if (failureMode === "none") {
    // Mode normal : réponse 200 OK
    return res.status(200).json({
      node: SERVER_NAME,
      ok: true,
      ts: Date.now(),
      message: `Response from ${SERVER_NAME}`,
    });
  }

  if (failureMode === "crash") {
    // Mode crash : terminer le processus immédiatement
    console.log(`[${SERVER_NAME}] CRASH mode triggered - exiting process`);
    process.exit(1);
  }
});

// ===== DÉCLENCHER UNE PANNE : POST /fail =====
app.post("/fail", (req, res) => {
  const { mode } = req.body;

  if (mode !== "crash") {
    return res.status(400).json({
      ok: false,
      error: "Invalid mode. Must be 'crash'",
    });
  }

  failureMode = mode;
  console.log(`[${SERVER_NAME}] Failure mode set to: ${failureMode}`);

  // Répondre d'abord puis crash immédiatement
  res.status(200).json({
    ok: true,
    mode: failureMode,
    message: `${SERVER_NAME} will crash immediately`,
    ts: Date.now(),
  });

  // Crash après un petit délai pour laisser la réponse partir
  setTimeout(() => {
    console.log(`[${SERVER_NAME}] Crashing now...`);
    process.exit(1);
  }, 100);
});

// ===== RÉCUPÉRATION : POST /recover =====
app.post("/recover", (req, res) => {
  const previousMode = failureMode;
  failureMode = "none";

  console.log(`[${SERVER_NAME}] Recovered from '${previousMode}' to 'none'`);

  res.status(200).json({
    ok: true,
    previousMode,
    currentMode: failureMode,
    message: `${SERVER_NAME} recovered`,
    ts: Date.now(),
  });
});

// ===== ENDPOINT DE DEBUG (optionnel) =====
app.get("/status", (req, res) => {
  res.status(200).json({
    node: SERVER_NAME,
    port: PORT,
    failureMode,
    ts: Date.now(),
  });
});

// ===== DÉMARRAGE DU SERVEUR =====
app.listen(PORT, () => {
  console.log(`[${SERVER_NAME}] Server running on http://localhost:${PORT}`);
  console.log(`[${SERVER_NAME}] Initial failureMode: ${failureMode}`);
  console.log(`[${SERVER_NAME}] Endpoints:`);
  console.log(`  - GET  /api           : Main API endpoint`);
  console.log(`  - POST /fail          : Trigger failure (body: {mode: "crash"})`);
  console.log(`  - POST /recover       : Recover from failure`);
  console.log(`  - GET  /status        : Current status`);

  // Démarrer l'envoi de heartbeats au proxy
  startHeartbeat();
});

// Cleanup à l'arrêt
process.on("SIGINT", () => {
  console.log(`\n[${SERVER_NAME}] Stopping...`);
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  process.exit(0);
});
