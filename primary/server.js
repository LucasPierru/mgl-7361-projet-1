const express = require("express");
const cors = require("cors");

const PORT = process.env.PORT || 3001;
const SERVER_NAME = "primary";

const app = express();
app.use(cors());
app.use(express.json());

// État interne : mode de défaillance
// Valeurs possibles : "none", "error", "timeout", "crash"
let failureMode = "none";

console.log(`[${SERVER_NAME}] Starting on port ${PORT}`);

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

  if (failureMode === "error") {
    // Mode erreur : réponse 500
    console.log(`[${SERVER_NAME}] Returning 500 error (simulated)`);
    return res.status(500).json({
      node: SERVER_NAME,
      ok: false,
      error: "simulated",
      ts: Date.now(),
    });
  }

  if (failureMode === "timeout") {
    // Mode timeout : ne répond jamais (laisse la connexion ouverte)
    console.log(`[${SERVER_NAME}] Timeout mode - not responding`);
    // Ne pas envoyer de réponse = timeout côté client
    return;
  }

  if (failureMode === "crash") {
    // Mode crash : terminer le processus
    console.log(`[${SERVER_NAME}] CRASH mode triggered - exiting process`);
    process.exit(1);
  }
});

// ===== HEALTH CHECK : GET /health =====
app.get("/health", (req, res) => {
  console.log(`[${SERVER_NAME}] GET /health - failureMode: ${failureMode}`);

  if (failureMode === "none") {
    // Mode normal : healthy
    return res.status(200).json({
      status: "up",
      node: SERVER_NAME,
      ts: Date.now(),
    });
  }

  if (failureMode === "error") {
    // Mode erreur : on peut choisir 500 (service a un problème)
    // Ou 200 mais avec status "degraded"
    // Ici on choisit 500 pour indiquer un problème
    return res.status(500).json({
      status: "degraded",
      node: SERVER_NAME,
      error: "simulated",
      ts: Date.now(),
    });
  }

  if (failureMode === "timeout") {
    // Mode timeout : ne répond pas
    console.log(`[${SERVER_NAME}] Health check - timeout mode (not responding)`);
    return;
  }

  if (failureMode === "crash") {
    // En mode crash, le processus sera terminé donc ce code ne sera pas atteint
    // Mais on le met pour la complétude
    console.log(`[${SERVER_NAME}] Health check - CRASH mode`);
    process.exit(1);
  }
});

// ===== DÉCLENCHER UNE PANNE : POST /fail =====
app.post("/fail", (req, res) => {
  const { mode } = req.body;

  if (!mode || !["error", "timeout", "crash"].includes(mode)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid mode. Must be 'error', 'timeout', or 'crash'",
    });
  }

  failureMode = mode;
  console.log(`[${SERVER_NAME}] Failure mode set to: ${failureMode}`);

  // Si mode crash, on répond d'abord puis on crash
  if (mode === "crash") {
    res.status(200).json({
      ok: true,
      mode: failureMode,
      message: `${SERVER_NAME} will crash on next request`,
      ts: Date.now(),
    });

    // Crash après un petit délai pour laisser la réponse partir
    setTimeout(() => {
      console.log(`[${SERVER_NAME}] Crashing now...`);
      process.exit(1);
    }, 100);

    return;
  }

  res.status(200).json({
    ok: true,
    mode: failureMode,
    message: `${SERVER_NAME} failure mode activated`,
    ts: Date.now(),
  });
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
  console.log(`  - GET  /health        : Health check`);
  console.log(`  - POST /fail          : Trigger failure (body: {mode: "error"|"timeout"|"crash"})`);
  console.log(`  - POST /recover       : Recover from failure`);
  console.log(`  - GET  /status        : Current status`);
});
