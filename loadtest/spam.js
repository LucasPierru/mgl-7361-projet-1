const fetch = require("node-fetch");

// Configuration
const URL = "http://localhost:3000/api";
const MIN_INTERVAL_MS = 100;      // Intervalle min entre bursts
const MAX_INTERVAL_MS = 300;      // Intervalle max entre bursts
const REQUESTS_PER_BURST = 5;     // Nombre de requêtes simultanées par burst
const TEST_DURATION_MS = 30000;   // 30 secondes
const INJECT_FAILURE_AT_MS = 10000; // Injecter panne après 10 secondes

// Calcul: 5 req / 0.2s (moyenne) = 25 req/sec

// État
let requests = [];
let failureInjected = false;
let testStartTime = null;

// Couleurs pour la console
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = colors.reset) {
  const elapsed = testStartTime ? ((Date.now() - testStartTime) / 1000).toFixed(1) : "0.0";
  console.log(`${color}[${elapsed}s] ${message}${colors.reset}`);
}

async function sendRequest() {
  const startTime = Date.now();

  try {
    const response = await fetch(URL, {
      method: "GET",
      timeout: 2000,
    });

    const status = response.status;
    const body = await response.json();
    const backend = body.node || "unknown";

    const result = {
      time: startTime,
      status,
      backend,
      success: status === 200,
      latencyMs: Date.now() - startTime,
    };

    requests.push(result);

    if (status === 200) {
      log(`✓ ${status} from ${backend} (${result.latencyMs}ms)`, colors.green);
    } else {
      log(`✗ ${status} from ${backend}`, colors.red);
    }

    return result;
  } catch (error) {
    const result = {
      time: startTime,
      status: "error",
      backend: "unknown",
      success: false,
      latencyMs: Date.now() - startTime,
      error: error.message,
    };

    requests.push(result);
    log(`✗ ERROR: ${error.message}`, colors.red);

    return result;
  }
}

async function injectFailure() {
  if (failureInjected) return;

  log("💥 Injecting failure on primary (timeout mode)", colors.yellow);
  failureInjected = true;

  try {
    const response = await fetch("http://localhost:3000/inject-failure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "timeout" }),
    });

    const result = await response.json();
    log(`Failure injected: tFail = ${result.tFail}`, colors.yellow);
  } catch (error) {
    log(`Failed to inject failure: ${error.message}`, colors.red);
  }
}

function computeStats() {
  const total = requests.length;
  const successful = requests.filter((r) => r.success).length;
  const failed = total - successful;
  const successRate = total > 0 ? ((successful / total) * 100).toFixed(2) : "0.00";

  // Compter les backends
  const primaryCount = requests.filter((r) => r.backend === "primary").length;
  const spareCount = requests.filter((r) => r.backend === "spare").length;

  // Détecter moment du failover (première réponse spare après échecs)
  const firstSpareIndex = requests.findIndex((r) => r.backend === "spare");
  const firstSpareTime = firstSpareIndex >= 0 ? requests[firstSpareIndex].time : null;

  // Détecter première erreur
  const firstErrorIndex = requests.findIndex((r) => !r.success);
  const firstErrorTime = firstErrorIndex >= 0 ? requests[firstErrorIndex].time : null;

  return {
    total,
    successful,
    failed,
    successRate,
    primaryCount,
    spareCount,
    firstSpareTime,
    firstErrorTime,
  };
}

function printResults() {
  console.log("\n" + "=".repeat(60));
  console.log(`${colors.cyan}LOAD TEST RESULTS${colors.reset}`);
  console.log("=".repeat(60));

  const stats = computeStats();

  console.log(`\n${colors.blue}Request Statistics:${colors.reset}`);
  console.log(`  Total requests:    ${stats.total}`);
  console.log(`  ${colors.green}✓ Successful:      ${stats.successful} (${stats.successRate}%)${colors.reset}`);
  console.log(`  ${colors.red}✗ Failed:          ${stats.failed}${colors.reset}`);

  console.log(`\n${colors.blue}Backend Distribution:${colors.reset}`);
  console.log(`  Primary:           ${stats.primaryCount} requests`);
  console.log(`  Spare:             ${stats.spareCount} requests`);

  if (stats.firstErrorTime && stats.firstSpareTime) {
    const recoveryDelay = ((stats.firstSpareTime - stats.firstErrorTime) / 1000).toFixed(2);
    console.log(`\n${colors.blue}Failover Timing:${colors.reset}`);
    console.log(`  First error:       ${((stats.firstErrorTime - testStartTime) / 1000).toFixed(2)}s`);
    console.log(`  First spare resp:  ${((stats.firstSpareTime - testStartTime) / 1000).toFixed(2)}s`);
    console.log(`  ${colors.yellow}Recovery delay:    ${recoveryDelay}s${colors.reset}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`${colors.cyan}Check detailed metrics at: http://localhost:3000/metrics${colors.reset}`);
  console.log("=".repeat(60) + "\n");
}

function getNextIntervalMs() {
  const span = MAX_INTERVAL_MS - MIN_INTERVAL_MS;
  return MIN_INTERVAL_MS + Math.floor(Math.random() * (span + 1));
}

async function sendRequestBurst() {
  const promises = [];
  for (let i = 0; i < REQUESTS_PER_BURST; i++) {
    promises.push(sendRequest());
  }
  await Promise.all(promises);
}

async function runLoadTest() {
  console.log("\n" + "=".repeat(60));
  console.log(`${colors.cyan}STARTING LOAD TEST${colors.reset}`);
  console.log("=".repeat(60));
  console.log(`Target:            ${URL}`);
  console.log(`Request interval:  ${MIN_INTERVAL_MS}-${MAX_INTERVAL_MS}ms in bursts of ${REQUESTS_PER_BURST}`);
  console.log(`Avg throughput:    ~25 req/sec`);
  console.log(`Test duration:     ${TEST_DURATION_MS / 1000}s`);
  console.log(`Inject failure at: ${INJECT_FAILURE_AT_MS / 1000}s`);
  console.log("=".repeat(60) + "\n");

  testStartTime = Date.now();

  // Première burst immédiate
  await sendRequestBurst();

  // Fonction récursive pour les bursts suivants
  function scheduleNextBurst() {
    const elapsed = Date.now() - testStartTime;

    // Arrêter le test après TEST_DURATION_MS
    if (elapsed >= TEST_DURATION_MS) {
      log("Test completed", colors.cyan);

      // Attendre un peu pour les dernières requêtes
      setTimeout(() => {
        printResults();
        process.exit(0);
      }, 1000);
      return;
    }

    // Injecter la panne après INJECT_FAILURE_AT_MS
    if (elapsed >= INJECT_FAILURE_AT_MS && !failureInjected) {
      injectFailure().then(() => {
        // Continuer après l'injection
        const delay = getNextIntervalMs();
        setTimeout(() => {
          sendRequestBurst().then(scheduleNextBurst);
        }, delay);
      });
    } else {
      // Envoyer le prochain burst après un délai aléatoire
      const delay = getNextIntervalMs();
      setTimeout(() => {
        sendRequestBurst().then(scheduleNextBurst);
      }, delay);
    }
  }

  // Démarrer la boucle de bursts
  scheduleNextBurst();
}

// Gérer Ctrl+C
process.on("SIGINT", () => {
  console.log("\n\nTest interrupted by user");
  printResults();
  process.exit(0);
});

// Lancer le test
runLoadTest().catch((error) => {
  console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
  process.exit(1);
});
