// src/client/play.js
// Helper launcher: issues a token via HTTP then starts the colored CLI.
// Usage:
//   npm run play:x:a -- <gameId> [userId]
//   node src/client/play.js <X|O> <PORT> <gameId|auto> [userId]
//
// Behavior:
// - If gameId is "auto" or omitted, generate g-<ts>-<rand>.
// - Check /api/games/:id/status. If not exists, create via /api/games/:id/init and print an informative message.
// - If exists, print an informative message and proceed (joining an existing match).

const { spawn } = require("child_process");

function uniqueGameId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return `g-${ts}-${rand}`;
}

async function httpJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { res, data };
}

async function main() {
  // When invoked from npm script, we might have only gameId/userId after '--'
  // For generic usage, keep positional: role, port, gameId, userId
  let [role, port, gameId, userId] = process.argv.slice(2);

  // If invoked via npm run play:x:a -- <gameId> [userId], we set role/port from script and only pass gameId/userId.
  if (!role || (role.length > 1 && (role === "--"))) {
    console.error("Usage: node src/client/play.js <X|O> <PORT> <gameId|auto> [userId]");
    process.exit(1);
  }

  if (!port || isNaN(Number(port))) {
    console.error("Second arg must be a port, got:", port);
    process.exit(1);
  }

  if (!gameId || gameId.toLowerCase() === "auto") gameId = uniqueGameId();
  if (!userId) userId = `${role.toLowerCase()}-${Math.random().toString(36).slice(2,6)}`;

  // Check existence
  const status = await httpJson(`http://localhost:${port}/api/games/${encodeURIComponent(gameId)}/status`);
  if (status.res.ok && status.data && status.data.exists) {
    console.log(`[launcher] Joining existing game: ${gameId}`);
  } else {
    // Try to init
    const init = await httpJson(`http://localhost:${port}/api/games/${encodeURIComponent(gameId)}/init`, { method: "POST" });
    if (init.res.status === 409) {
      console.log(`[launcher] Game already exists: ${gameId} — joining...`);
    } else if (init.res.ok) {
      console.log(`[launcher] Created new game: ${gameId}. Waiting for opponent...`);
    } else {
      console.log(`[launcher] Proceeding without init (status ${init.res.status}).`);
    }
  }

  // Get token
  const reg = await httpJson(`http://localhost:${port}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, gameId, role })
  });

  if (!reg.res.ok) {
    console.error("Failed to get token:", reg.res.status, reg.data);
    process.exit(1);
  }

  const token = reg.data.token;
  const wsUrl = `ws://localhost:${port}?token=${encodeURIComponent(token)}`;

  console.log(`[launcher] role=${role} port=${port} gameId=${gameId} userId=${userId}`);

  const child = spawn(process.execPath, ["src/client/cli.js", wsUrl], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
