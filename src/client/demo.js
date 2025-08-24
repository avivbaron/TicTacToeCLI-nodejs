// src/client/demo.js
// Demo launcher: spawns two clients (X and O) with the SAME fresh gameId.
// Usage: node src/client/demo.js <PORT_X> <PORT_O>
// Example: node src/client/demo.js 3001 3002

const { spawn } = require("child_process");

function uniqueGameId() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return `g-${ts}-${rand}`;
}

const [portX, portO] = process.argv.slice(2);
if (!portX || !portO) {
  console.error("Usage: node src/client/demo.js <PORT_X> <PORT_O>");
  process.exit(1);
}

const gameId = uniqueGameId();
console.log(`[demo] Using gameId=${gameId}`);

// Spawn X
spawn(process.execPath, ["src/client/play.js", "X", String(portX), gameId, "uX"], { stdio: "inherit" });

// Small delay so X prints first
setTimeout(() => {
  // Spawn O
  spawn(process.execPath, ["src/client/play.js", "O", String(portO), gameId, "uO"], { stdio: "inherit" });
}, 300);
