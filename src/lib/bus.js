// src/lib/bus.js
// Redis wiring: connections, channels, and helpers to publish state and persist it.

const Redis = require("ioredis");

// Create a Redis client using REDIS_URL env var (defaults to local Redis).
function makeRedis() {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  return new Redis(url);
}

// Channel for a game's pub/sub messages.
function gameChannel(gameId) {
  return `games:${gameId}`;
}

// Key where we store the last snapshot of a game.
function gameKey(gameId) {
  return `game:${gameId}:state`;
}

// Persist the latest state.
async function saveState(redis, gameId, state) {
  await redis.set(gameKey(gameId), JSON.stringify(state));
}

// Load the last snapshot (or null if not found).
async function loadState(redis, gameId) {
  const raw = await redis.get(gameKey(gameId));
  return raw ? JSON.parse(raw) : null;
}

// Publish a state update and also persist it.
async function publishState(pub, gameId, state) {
  await saveState(pub, gameId, state);
  const payload = JSON.stringify({ type: "state", gameId, state });
  await pub.publish(gameChannel(gameId), payload);
}

// Optional: publish a move event (informational).
async function publishMove(pub, gameId, row, col, by) {
  const payload = JSON.stringify({ type: "move", gameId, row, col, by });
  await pub.publish(gameChannel(gameId), payload);
}

module.exports = { makeRedis, publishState, publishMove, gameChannel, gameKey, saveState, loadState };


// Check if a game snapshot exists
async function stateExists(redis, gameId) {
  const n = await redis.exists(gameKey(gameId));
  return n === 1;
}

module.exports.stateExists = stateExists;


// --- Role reservation (prevent two Xs or two Os in same game) ---
function playersKey(gameId) { return `game:${gameId}:players`; }

// Claim role X/O for a given userId. If role is free, assigns it.
// If role is taken by the same userId => allow (reconnect).
// If role is taken by someone else => reject.
async function claimRole(redis, gameId, role, userId) {
  const key = playersKey(gameId);
  const current = await redis.hget(key, role);
  if (!current) {
    await redis.hset(key, role, userId);
    return { ok: true, first: true };
  }
  if (current === userId) {
    return { ok: true, first: false, same: true };
  }
  return { ok: false, owner: current };
}

// Optionally release a role if the same user holds it.
async function releaseRole(redis, gameId, role, userId) {
  const key = playersKey(gameId);
  const current = await redis.hget(key, role);
  if (current === userId) {
    await redis.hdel(key, role);
    return true;
  }
  return false;
}

// Get both players mapping e.g. { X: "u1", O: "u2" }
async function getPlayers(redis, gameId) {
  const key = playersKey(gameId);
  return await redis.hgetall(key);
}

module.exports.playersKey = playersKey;
module.exports.claimRole = claimRole;
module.exports.releaseRole = releaseRole;
module.exports.getPlayers = getPlayers;
