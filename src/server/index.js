// src/server/index.js
// HTTP/WS bootstrap: Express app, Swagger UI, Redis clients, and WS layer.

require("dotenv").config();
const http = require("http");
const express = require("express");
const swaggerUi = require("swagger-ui-express");
const fs = require("fs");
const path = require("path");
const { makeRoutes } = require("./routes");
const { wireWebSocket } = require("./ws");
const { makeRedis } = require("../lib/bus");

const PORT = Number(process.env.PORT || 3001);

const app = express();
const redisPub = makeRedis();
const redisSub = makeRedis();

// REST endpoints (/api/*)
app.use("/api", makeRoutes(redisPub));

// Swagger UI at /docs
const openapiPath = path.join(__dirname, "../docs/openapi.json");
const openapi = JSON.parse(fs.readFileSync(openapiPath, "utf-8"));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(openapi));

// Create HTTP server and attach WS layer.
const server = http.createServer(app);

wireWebSocket({ server, redisPub, redisSub })
  .then(() => {
    server.listen(PORT, () => console.log(`Server listening on :${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to start WebSocket layer:", err);
    process.exit(1);
  });
