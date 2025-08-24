// src/lib/logger.js
// Structured logs stored in Redis (list) and echoed to console.

const LOG_LIST = "logs:tictactoe";

// Push a log entry and print it.
async function log(redis, level, msg, extra = {}) {
  const entry = { ts: Date.now(), level, msg, ...extra };
  await redis.lpush(LOG_LIST, JSON.stringify(entry));
  console.log(`[${level}] ${msg}`, extra);
}

module.exports = { log, LOG_LIST };
