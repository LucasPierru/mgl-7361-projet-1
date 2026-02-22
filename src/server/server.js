const express = require("express");
const cors = require("cors");

const PORT = process.env.PORT || 3000;
const SERVER_NAME = process.env.SERVER_NAME || `unknown-server-${PORT}`;

const app = express();
app.use(cors());
app.use(express.json());

let isAvailable = true;

app.get("/health", (req, res) => {
  if (isAvailable) {
    res.status(200).json({
      status: "healthy",
      server: SERVER_NAME,
      port: PORT,
    });
  } else {
    res.status(503).json({ status: "unhealthy", server: SERVER_NAME, port: PORT });
  }
});

app.get("/api/data", (req, res) => {
  if (!isAvailable) {
    return res.status(500).json({ error: "Server is currently unavailable", server: SERVER_NAME, port: PORT });
  }

  res.json({
    success: true,
    server: SERVER_NAME,
    port: PORT,
    datetime: new Date().toISOString(),
    message: `Hello from ${SERVER_NAME} on port ${PORT}!`,
  });
});

app.post("/crash", (req, res) => {
  isAvailable = false;
  console.log(`${SERVER_NAME} set to unavailable`);
  res.json({
    success: true,
    message: `${SERVER_NAME} is now unavailable (recoverable via /recover)`,
    server: SERVER_NAME,
    port: PORT,
    datetime: new Date().toISOString(),
  });
});

app.post("/unavailable", (req, res) => {
  isAvailable = false;

  res.json({
    success: true,
    message: `${SERVER_NAME} is now unavailable (returns 500 on /api/data)`,
    server: SERVER_NAME,
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

app.post("/recover", (req, res) => {
  isAvailable = true;

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
    status: isAvailable ? "healthy" : "crashed",
  });
});

app.listen(PORT, () => {
  console.log(`${SERVER_NAME} running on port ${PORT}`);
});
