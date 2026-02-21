const express = require("express");
const cors = require("cors");

const PORT = Number(process.env.PORT || 8080);
const HEARTBEAT_INTERVAL_MS = 1000;
const HEARTBEAT_TIMEOUT_MS = 1000;
const MAX_CONSECUTIVE_FAILURES = 3;

const TARGETS = {
  primary: "http://primary:3000",
  spare: "http://spare:3000",
};

let activeTarget = "primary";
let consecutiveFailures = 0;
let heartbeatTimer = null;

const app = express();
app.use(cors());
app.use(express.json());

function switchToSpare(reason) {
  if (activeTarget !== "spare") {
    activeTarget = "spare";
    console.log(`[failover] switching traffic to spare (${reason})`);
  }
}

async function heartbeatCurrentTarget() {
  const currentTarget = activeTarget;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);

  try {
    const response = await fetch(`${TARGETS[currentTarget]}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    const data = await response.json();

    if (response.status === 500 || data.status === "unhealthy") {
      consecutiveFailures += 1;
      console.log(`[heartbeat] ${currentTarget} unhealthy (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        if (currentTarget === "primary") {
          switchToSpare("3 consecutive heartbeat failures on primary");
        } else {
          console.log("[heartbeat] spare is unhealthy");
        }
      }
      return;
    }

    consecutiveFailures = 0;
  } catch (error) {
    consecutiveFailures += 1;
    console.log(
      `[heartbeat] ${currentTarget} check failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${error.message}`,
    );

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      if (currentTarget === "primary") {
        switchToSpare(`primary unreachable: ${error.message}`);
      } else {
        console.log(`[heartbeat] spare unreachable: ${error.message}`);
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function runHeartbeatLoop() {
  await heartbeatCurrentTarget();
  heartbeatTimer = setTimeout(runHeartbeatLoop, HEARTBEAT_INTERVAL_MS);
}

async function forwardRequest(targetBase, req) {
  const targetUrl = `${targetBase}${req.originalUrl}`;
  const hasBody = !["GET", "HEAD"].includes(req.method) && req.body !== undefined;

  return fetch(targetUrl, {
    method: req.method,
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(req.body) : undefined,
  });
}

async function proxyRequest(req, res) {
  if (req.originalUrl === "/failover/status") {
    res.status(200).json({
      activeTarget,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      consecutivePrimary500: consecutiveFailures,
      maxConsecutive500: MAX_CONSECUTIVE_FAILURES,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (req.method === "POST" && req.originalUrl === "/failover/reset") {
    activeTarget = "primary";
    consecutiveFailures = 0;

    res.status(200).json({
      success: true,
      message: "Failover state reset",
      activeTarget,
      consecutiveFailures,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const response = await forwardRequest(TARGETS[activeTarget], req);

    if (response.status === 500) {
      consecutiveFailures += 1;
      console.log(`[proxy] ${activeTarget} returned 500 (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        if (activeTarget === "primary") {
          switchToSpare("3 consecutive 500 responses on primary");
        } else {
          console.log("[proxy] spare returned repeated 500 responses");
        }
      }
    } else if (response.status < 500) {
      consecutiveFailures = 0;
    }

    const responseBody = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.type(contentType);
    }
    res.status(response.status).send(responseBody);
  } catch (error) {
    if (activeTarget === "primary") {
      switchToSpare(`request forwarding failed to primary: ${error.message}`);

      try {
        const fallbackResponse = await forwardRequest(TARGETS.spare, req);

        const fallbackBody = Buffer.from(await fallbackResponse.arrayBuffer());
        const fallbackContentType = fallbackResponse.headers.get("content-type");
        if (fallbackContentType) {
          res.type(fallbackContentType);
        }
        res.status(fallbackResponse.status).send(fallbackBody);
        return;
      } catch (fallbackError) {
        res.status(502).json({
          error: "Both primary and spare are unavailable",
          details: fallbackError.message,
        });
        return;
      }
    }

    res.status(502).json({
      error: "Upstream request failed",
      details: error.message,
    });
    return;
  }
}

app.all(/.*/, (req, res) => {
  proxyRequest(req, res).catch((error) => {
    res.status(500).json({
      error: "Failover router internal error",
      details: error.message,
    });
  });
});

app.listen(PORT, () => {
  console.log(`[failover] listening on port ${PORT}`);
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
  }
  runHeartbeatLoop();
});
