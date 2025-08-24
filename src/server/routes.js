// src/server/routes.js
// Small HTTP API: register (issue token), health, and recent logs.

const express = require("express");
const { issueToken } = require("../lib/auth");
const { LOG_LIST } = require("../lib/logger");
const { playersKey } = require("../lib/bus");

function makeRoutes(redis) {
  const r = express.Router();

  // POST /api/auth/register -> { token }
  r.post("/auth/register", express.json(), async (req, res) => {
    const { userId, gameId, role } = req.body || {};
    if (!userId || !gameId || !["X", "O"].includes(role)) {
      return res.status(400).json({ error: "userId, gameId, role(X|O) are required" });
    }
    const token = issueToken({ userId, gameId, role });
    return res.json({ token });
  });

  // GET /api/health
  r.get("/health", (_req, res) => res.json({ status: "ok", uptime: process.uptime() }));

  // GET /api/logs?limit=20

  // GET /api/games/:id/status -> { exists, ended, winner }
  r.get("/games/:id/status", async (req, res) => {
    const gameId = req.params.id;
    const key = require("../lib/bus").gameKey(gameId);
    const raw = await redis.get(key);
    if (!raw) return res.json({ exists: false });
    try {
      const state = JSON.parse(raw);
      return res.json({ exists: true, ended: !!state.ended, winner: state.winner || null });
    } catch {
      return res.json({ exists: true });
    }
  });

  // POST /api/games/:id/init -> create a fresh state if missing
  r.post("/games/:id/init", async (req, res) => {
    const gameId = req.params.id;
    const { stateExists, publishState } = require("../lib/bus");
    const { newGame } = require("../lib/game");
    const exists = await stateExists(redis, gameId);
    if (exists) return res.status(409).json({ error: "Game already exists", gameId });
    const st = newGame();
    await publishState(redis, gameId, st);
    return res.json({ ok: true, gameId, state: st });
  });

  r.get("/logs", async (req, res) => {
    const size = Number(req.query.limit || 50);
    const items = await redis.lrange(LOG_LIST, 0, size - 1);
    return res.json(items.map((i) => JSON.parse(i)));
  });

  return r;
}

module.exports = { makeRoutes };
