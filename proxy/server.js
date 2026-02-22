const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const PORT = process.env.PORT || 3000;
const SERVER_NAME = "proxy";

// Configuration
const PRIMARY_BASE = "http://localhost:3001";
const SPARE_BASE = "http://localhost:3002";
const HEARTBEAT_TIMEOUT_MS = 4000;  // 4 secondes sans heartbeat = DOWN
const CHECK_HEARTBEAT_INTERVAL_MS = 500;  // Vérifier toutes les 500ms
const WINDOW_BEFORE_MS = 2000;  // 2 secondes avant la panne
const WINDOW_AFTER_MS = 10000;  // 10 secondes après la panne

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));  // Servir l'UI web

// ===== ÉTAT INTERNE =====
let primaryHealthy = true;  // État de santé du primary
let lastHeartbeat = null;   // Timestamp du dernier heartbeat reçu
let tFail = null;           // Timestamp injection de panne
let tFirstSpare200 = null;  // Timestamp première réponse 200 du spare après panne
let requestsLog = [];       // Log de toutes les requêtes

console.log(`[${SERVER_NAME}] Starting on port ${PORT}`);
console.log(`[${SERVER_NAME}] Configuration:`);
console.log(`  - PRIMARY_BASE: ${PRIMARY_BASE}`);
console.log(`  - SPARE_BASE: ${SPARE_BASE}`);
console.log(`  - HEARTBEAT_TIMEOUT_MS: ${HEARTBEAT_TIMEOUT_MS}`);

// ===== HELPER: FETCH WITH TIMEOUT =====
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

// ===== HEARTBEAT : MONITORING DU PRIMARY =====
function checkHeartbeats() {
  const now = Date.now();

  if (lastHeartbeat === null) {
    // Pas encore de heartbeat reçu, considérer primary comme UP au démarrage
    return;
  }

  const timeSinceLastHeartbeat = now - lastHeartbeat;

  if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
    if (primaryHealthy) {
      console.log(`[${SERVER_NAME}] Primary is DOWN (no heartbeat for ${timeSinceLastHeartbeat}ms)`);
      primaryHealthy = false;
    }
  } else {
    if (!primaryHealthy) {
      console.log(`[${SERVER_NAME}] Primary is UP again (heartbeat received)`);
      primaryHealthy = true;
    }
  }
}

// Lancer la vérification des heartbeats en boucle
let heartbeatCheckInterval = null;

function startHeartbeatMonitoring() {
  if (heartbeatCheckInterval) {
    clearInterval(heartbeatCheckInterval);
  }

  heartbeatCheckInterval = setInterval(() => {
    checkHeartbeats();
  }, CHECK_HEARTBEAT_INTERVAL_MS);

  console.log(`[${SERVER_NAME}] Heartbeat monitoring started (checking every ${CHECK_HEARTBEAT_INTERVAL_MS}ms)`);
}

// ===== RECEVOIR HEARTBEAT : POST /heartbeat =====
app.post("/heartbeat", (req, res) => {
  const from = req.query.from;
  const timestamp = Date.now();

  if (from === "primary") {
    lastHeartbeat = timestamp;
    console.log(`[${SERVER_NAME}] Received heartbeat from primary at timestamp ${timestamp}`);
  }

  res.status(200).json({ ok: true, timestamp });
});

// ===== ROUTAGE : GET /api =====
app.get("/api", async (req, res) => {
  const startTime = Date.now();

  // Choisir le backend selon l'état de santé
  const backend = primaryHealthy ? "primary" : "spare";
  const targetBase = backend === "primary" ? PRIMARY_BASE : SPARE_BASE;

  console.log(`[${SERVER_NAME}] GET /api -> routing to ${backend}`);

  try {
    const response = await fetchWithTimeout(
      `${targetBase}/api`,
      { method: "GET" },
      1000
    );

    const status = response.status;
    const latencyMs = Date.now() - startTime;
    const body = await response.json();

    // Logger la requête
    requestsLog.push({
      t: startTime,
      backend,
      status,
      latencyMs,
    });

    // Mise à jour métrique T_bascule
    if (tFail !== null && tFirstSpare200 === null && backend === "spare" && status === 200) {
      tFirstSpare200 = Date.now();
      console.log(`[${SERVER_NAME}] First successful spare response! T_bascule = ${tFirstSpare200 - tFail}ms at timestamp ${tFirstSpare200}`);
    }

    res.status(status).json(body);
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    // Logger l'erreur
    requestsLog.push({
      t: startTime,
      backend,
      status: "timeout",
      latencyMs,
    });

    console.log(`[${SERVER_NAME}] Request to ${backend} failed: ${error.message}`);

    res.status(502).json({
      error: "Bad Gateway",
      backend,
      message: `Request to ${backend} failed: ${error.message}`,
    });
  }
});

// ===== DÉCLENCHER UNE PANNE VIA LE PROXY : POST /inject-failure =====
app.post("/inject-failure", async (req, res) => {
  const mode = req.body.mode || "crash";

  // Enregistrer le timestamp de la panne
  tFail = Date.now();
  tFirstSpare200 = null;  // Reset

  console.log(`[${SERVER_NAME}] Injecting failure on primary (mode: ${mode}) at timestamp ${tFail}`);

  try {
    // Appeler le primary pour déclencher la panne
    const response = await fetch(`${PRIMARY_BASE}/fail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });

    const result = await response.json();

    res.status(200).json({
      ok: true,
      tFail,
      mode,
      primaryResponse: result,
    });
  } catch (error) {
    res.status(200).json({
      ok: true,
      tFail,
      mode,
      error: `Failed to contact primary: ${error.message}`,
    });
  }
});

// ===== MÉTRIQUES : GET /metrics =====
app.get("/metrics", (req, res) => {
  let T_bascule_ms = null;
  let E_bascule = null;
  let counts = { total: 0, failed: 0 };

  // Calculer T_bascule
  if (tFail !== null && tFirstSpare200 !== null) {
    T_bascule_ms = tFirstSpare200 - tFail;
  }

  // Calculer E_bascule
  if (tFail !== null) {
    const windowStart = tFail - WINDOW_BEFORE_MS;
    const windowEnd = tFail + WINDOW_AFTER_MS;

    const windowRequests = requestsLog.filter(
      (r) => r.t >= windowStart && r.t <= windowEnd
    );

    counts.total = windowRequests.length;

    if (counts.total > 0) {
      counts.failed = windowRequests.filter(
        (r) => r.status >= 500 || r.status === "timeout"
      ).length;

      E_bascule = counts.failed / counts.total;
    }
  }

  res.status(200).json({
    tFail,
    tFirstSpare200,
    T_bascule_ms,
    window: {
      before_ms: WINDOW_BEFORE_MS,
      after_ms: WINDOW_AFTER_MS,
    },
    E_bascule,
    counts,
    primaryHealthy,
    totalRequests: requestsLog.length,
  });
});

// ===== ENDPOINT DEBUG : GET /logs =====
app.get("/logs", (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const recentLogs = requestsLog.slice(-limit);

  res.status(200).json({
    total: requestsLog.length,
    showing: recentLogs.length,
    logs: recentLogs,
  });
});

// ===== DÉMARRAGE DU SERVEUR =====
app.listen(PORT, () => {
  console.log(`[${SERVER_NAME}] Server running on http://localhost:${PORT}`);
  console.log(`[${SERVER_NAME}] Web UI available at http://localhost:${PORT}/test-client.html`);
  console.log(`[${SERVER_NAME}] Endpoints:`);
  console.log(`  - POST /heartbeat?from=X  : Receive heartbeat from service`);
  console.log(`  - GET  /api               : Main API endpoint (routes to primary or spare)`);
  console.log(`  - GET  /metrics           : T_bascule and E_bascule metrics`);
  console.log(`  - POST /inject-failure    : Trigger failure on primary`);
  console.log(`  - GET  /logs              : Recent request logs`);

  // Démarrer le monitoring heartbeat
  startHeartbeatMonitoring();
});

// Cleanup à l'arrêt
process.on("SIGINT", () => {
  console.log(`\n[${SERVER_NAME}] Stopping...`);
  if (heartbeatCheckInterval) {
    clearInterval(heartbeatCheckInterval);
  }
  process.exit(0);
});
