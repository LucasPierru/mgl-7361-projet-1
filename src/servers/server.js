const express = require("express");
const cors = require("cors");

const PORT = process.argv[2] || 3001;
const SERVER_NAME = `server-${PORT}`;

const app = express();
app.use(cors());
app.use(express.json());

let isAvailable = true;
let requestCount = 0;
let startTime = Date.now();

const getUptime = () => {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
};

app.get("/health", (req, res) => {
  if (isAvailable) {
    res.status(200).json({
      status: "healthy",
      server: SERVER_NAME,
      port: PORT,
      requestCount,
      uptime: getUptime(),
    });
  } else {
    res.status(503).json({ status: "unhealthy", server: SERVER_NAME, port: PORT });
  }
});

app.get("/api/data", (req, res) => {
  if (!isAvailable) {
    return res.status(503).json({ error: "Server is currently unavailable", server: SERVER_NAME, port: PORT });
  }

  requestCount++;

  res.json({
    success: true,
    server: SERVER_NAME,
    port: PORT,
    datetime: new Date().toISOString(),
    requestCount,
    message: `Hello from ${SERVER_NAME} on port ${PORT}!`,
    uptime: getUptime(),
  });
});

app.post("/crash", (req, res) => {
  isAvailable = false;
  res.json({
    success: true,
    message: `${SERVER_NAME} is now unavailable`,
    server: SERVER_NAME,
    port: PORT,
    datetime: new Date().toISOString(),
  });

  const recoveryTime = req.body.autoRecover ? 60000 : null;
  if (recoveryTime) {
    setTimeout(() => {
      isAvailable = true;
      console.log(`\n✅ ${SERVER_NAME} - AUTO-RECOVERED!`);
    }, recoveryTime);
  }
});

app.post("/recover", (req, res) => {
  isAvailable = true;
  requestCount = 0;
  startTime = Date.now();

  res.json({
    success: true,
    message: `${SERVER_NAME} recovered`,
    server: SERVER_NAME,
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

app.get("/info", (req, res) => {
  res.json({
    server: SERVER_NAME,
    port: PORT,
    color: serverColor,
    status: isHealthy ? "healthy" : "crashed",
    requestCount,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

app.listen(PORT, () => {
  console.log(`${SERVER_NAME} running on port ${PORT}`);
});
