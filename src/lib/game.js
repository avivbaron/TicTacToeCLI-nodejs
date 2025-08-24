// src/lib/game.js
// Pure Tic-Tac-Toe rules. No I/O here — just data in, data out.

const EMPTY = "";

// Create a new 3x3 empty board.
function newBoard() {
  return [
    [EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY],
    [EMPTY, EMPTY, EMPTY]
  ];
}

// Return the opposite player's symbol.
function other(player) {
  return player === "X" ? "O" : "X";
}

// Create a fresh game state.
function newGame() {
  return { board: newBoard(), nextTurn: "X", winner: null, ended: false, moves: 0 };
}

// Validate a move (bounds, turn order, occupancy, not already ended).
function isValidMove(state, row, col, player) {
  if (state.ended) return { ok: false, err: "Game ended" };
  if (player !== state.nextTurn) return { ok: false, err: "Not your turn" };
  if (row < 0 || row > 2 || col < 0 || col > 2) return { ok: false, err: "Out of bounds" };
  if (state.board[row][col] !== EMPTY) return { ok: false, err: "Cell occupied" };
  return { ok: true };
}

// Compute a winner if any by scanning rows, columns, diagonals.
function checkWinner(board) {
  const lines = [
    [board[0][0], board[0][1], board[0][2]],
    [board[1][0], board[1][1], board[1][2]],
    [board[2][0], board[2][1], board[2][2]],
    [board[0][0], board[1][0], board[2][0]],
    [board[0][1], board[1][1], board[2][1]],
    [board[0][2], board[1][2], board[2][2]],
    [board[0][0], board[1][1], board[2][2]],
    [board[0][2], board[1][1], board[2][0]]
  ];
  for (const line of lines) {
    if (line[0] && line[0] === line[1] && line[1] === line[2]) return line[0];
  }
  return null;
}

// Apply a move to a state; returns a new state (immutably).
function applyMove(state, row, col, player) {
  const v = isValidMove(state, row, col, player);
  if (!v.ok) return { ok: false, err: v.err, state };

  const next = JSON.parse(JSON.stringify(state)); // shallow immutability is fine here
  next.board[row][col] = player;
  next.moves++;

  const w = checkWinner(next.board);
  if (w) {
    next.winner = w;
    next.ended = true;
  } else if (next.moves === 9) {
    next.ended = true;
  } else {
    next.nextTurn = other(player);
  }
  return { ok: true, state: next };
}

module.exports = { newGame, applyMove };
