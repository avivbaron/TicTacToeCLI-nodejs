// src/server/ws.js
// WebSocket orchestration across two servers.
// - Auth via JWT in query (?token=...)
// - Join/init with latest snapshot
// - Handle moves (apply, validate, persist, publish)
// - Handle quit (custom you_quit/opponent_quit messages)
// - Pub/Sub to synchronize multiple server processes

const { WebSocketServer } = require("ws");
const { verifyToken } = require("../lib/auth");
const { newGame, applyMove } = require("../lib/game");
const { gameChannel, publishMove, publishState, loadState, claimRole } = require("../lib/bus");
const { log } = require("../lib/logger");

// Local caches per process; Redis keeps them in sync.
const games = new Map();          // gameId -> state
const clientsByGame = new Map();  // gameId -> Set<WebSocket>

// Broadcast a JSON message to all clients of a given game in THIS process.
function broadcast(gameId, msg) {
  const set = clientsByGame.get(gameId);
  if (!set) return;
  const payload = JSON.stringify(msg);
  for (const ws of set) if (ws.readyState === ws.OPEN) ws.send(payload);
}

// Broadcast to all EXCEPT a specific socket.
function broadcastExcept(gameId, exceptWs, msg) {
  const set = clientsByGame.get(gameId);
  if (!set) return;
  const payload = JSON.stringify(msg);
  for (const ws of set) {
    if (ws !== exceptWs && ws.readyState === ws.OPEN) ws.send(payload);
  }
}

async function wireWebSocket({ server, redisPub, redisSub }) {
  const wss = new WebSocketServer({ server });

  // When any server publishes a new state, reflect it locally and notify clients.
  redisSub.on("message", async (_channel, message) => {
    const { type, gameId, state } = JSON.parse(message);
    if (type === "state") {
      games.set(gameId, state);
      broadcast(gameId, { type: "update", board: state.board, nextTurn: state.nextTurn });
      if (state.ended) {
        if (state.winner) {
          broadcast(gameId, { type: "win", winner: state.winner });
        } else if (state.reason === "quit") {
          // This is a cross-process catch-up: other servers will show opponent_quit;
          // the quitting client would have already received you_quit locally.
          broadcast(gameId, { type: "opponent_quit", by: state.by || "unknown" });
        } else {
          broadcast(gameId, { type: "draw" });
        }
      }
    }
  });

  // New client connection.
  wss.on("connection", async (ws, req) => {
    // Verify token from query string.
    const token = new URL(req.url, "http://local").searchParams.get("token");
    const v = verifyToken(token);
    if (!v.ok) { ws.close(4001, "Unauthorized"); return; }

    const { gameId, role, sub: userId } = v.payload;

    // Subscribe to this game's Redis channel.
        // Enforce role uniqueness per game across servers
    const claim = await claimRole(redisPub, gameId, role, userId);
    if (!claim.ok) {
      ws.send(JSON.stringify({ type: "error", message: `Role ${role} already taken by another player` }));
      ws.close(4003, "Role already taken");
      return;
    }

    await redisSub.subscribe(gameChannel(gameId));

    // Track client in local set.
    if (!clientsByGame.has(gameId)) clientsByGame.set(gameId, new Set());
    clientsByGame.get(gameId).add(ws);

    // Ensure we have a snapshot for this game; create if missing and publish.
    if (!games.has(gameId)) {
      const recovered = await loadState(redisPub, gameId);
      if (recovered) {
        games.set(gameId, recovered);
      } else {
        const g = newGame();
        games.set(gameId, g);
        await publishState(redisPub, gameId, g);
        await log(redisPub, "info", "game-created", { gameId });
      }
    }

    // Send the snapshot to the newcomer.
    const snapshot = games.get(gameId);
    ws.send(JSON.stringify({ type: "update", board: snapshot.board, nextTurn: snapshot.nextTurn }));

    // Handle client messages.
    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Bad JSON" }));
        return;
      }

      if (msg.type === "move") {
        // Validate and apply move.
        const state = games.get(gameId);
        const res = applyMove(state, msg.row, msg.col, role);
        if (!res.ok) {
          ws.send(JSON.stringify({ type: "error", message: res.err }));
          await log(redisPub, "warn", "invalid-move", { gameId, by: role, row: msg.row, col: msg.col, err: res.err });
          return;
        }

        // Persist and publish new state; notify others.
        games.set(gameId, res.state);
        await publishState(redisPub, gameId, res.state);
        await publishMove(redisPub, gameId, msg.row, msg.col, role);
        await log(redisPub, "info", "move", { gameId, by: role, row: msg.row, col: msg.col });

      } else if (msg.type === "quit") {
        // Mark the game as ended due to quit; persist and notify.
        const state = games.get(gameId) || newGame();
        state.ended = true;
        state.reason = "quit";
        state.by = role;
        games.set(gameId, state);

        // Persist + publish (so other processes learn).
        await publishState(redisPub, gameId, state);
        await log(redisPub, "info", "quit", { gameId, by: role });

        // Tell the quitter themself:
        try { ws.send(JSON.stringify({ type: "you_quit" })); } catch {}

        // Tell everyone else (in this process):
        broadcastExcept(gameId, ws, { type: "opponent_quit", by: role });

      } else {
        ws.send(JSON.stringify({ type: "error", message: "Unknown type" }));
      }
    });

    // Cleanup on disconnect.
    ws.on("close", () => {
      const set = clientsByGame.get(gameId);
      if (set) set.delete(ws);
    });
  });
}

module.exports = { wireWebSocket };
