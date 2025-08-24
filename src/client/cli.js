// src/client/cli.js
// Colored CLI WebSocket client.
// - Connect via URL: node cli.js "ws://localhost:3001?token=..."
// - Shows your role (You are: X|O), colored board (X=green, O=red).
// - Enter moves as "row,col" or 'q' to quit (server notifies the opponent).

const WebSocket = require("ws");
const readline = require("readline");

const url = process.argv[2] || "ws://localhost:3001?token=" + encodeURIComponent(process.env.TOKEN);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const ws = new WebSocket(url);

// Minimal ANSI color helpers (no extra deps).
const color = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`
};

let nextTurn = "X";
let board = [
  ["", "", ""],
  ["", "", ""],
  ["", "", ""]
];
let myRole = "?";

// Paint a board cell with color.
function paintCell(c) {
  if (c === "X") return color.green("X");
  if (c === "O") return color.red("O");
  return " ";
}

// Draw the screen: title, role, board, and next turn.
function draw() {
  console.clear();
  console.log("Tic-Tac-Toe\n");
  console.log(color.cyan(`You are: ${myRole}`) + "\n");
  for (let r = 0; r < 3; r++) {
    console.log(" " + board[r].map((c) => paintCell(c)).join(" | "));
    if (r < 2) console.log("---+---+---");
  }
  console.log("\n" + color.yellow(`Next turn: ${nextTurn}`));
}

// WS lifecycle.
ws.on("open", () => {
  console.log("Connected:", url);
});

ws.on("message", (data) => {
  const msg = JSON.parse(data);

  if (msg.type === "update") {
    board = msg.board;
    nextTurn = msg.nextTurn;

    // Infer role from JWT in URL (middle part of token).
    const token = new URL(url).searchParams.get("token");
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
      myRole = payload.role || "?";
    } catch {
      myRole = "?";
    }

    draw();
  } else if (msg.type === "win") {
    draw();
    console.log("\nWinner:", msg.winner);
    process.exit(0);
  } else if (msg.type === "draw") {
    draw();
    console.log("\nDraw!");
    process.exit(0);
  } else if (msg.type === "you_quit") {
    draw();
    console.log("\nYou quit. Game closed.");
    process.exit(0);
  } else if (msg.type === "opponent_quit") {
    draw();
    console.log("\nOpponent quit. Game closed.");
    process.exit(0);
  } else if (msg.type === "error") {
    console.log("Error:", msg.message);
  }
});

ws.on("close", () => {
  console.log("Disconnected");
  process.exit(0);
});

// Prompt for a move or quit.
function ask() {
  rl.question("Enter move as row,col (e.g. 0,2) or 'q': ", (ans) => {
    if (ans.trim().toLowerCase() === "q") {
      try {
        ws.send(JSON.stringify({ type: "quit" }));
      } catch {}
      setTimeout(() => process.exit(0), 150);
      return;
    }

    const [r, c] = ans.split(",").map((x) => Number(x));
    ws.send(JSON.stringify({ type: "move", row: r, col: c }));
    ask();
  });
}

setTimeout(ask, 800);
