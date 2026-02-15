const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

const servers = [
  { name: "server-1", url: "http://localhost:3001", port: 3001 },
  { name: "server-2", url: "http://localhost:3002", port: 3002 },
  { name: "server-3", url: "http://localhost:3003", port: 3003 },
  { name: "server-4", url: "http://localhost:3004", port: 3004 },
];

let roundRobinIndex = 0;

app.listen(PORT, () => {
  console.log(`Load balancer is running on port ${PORT}`);
});
