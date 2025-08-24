// tests/game.test.js
const { newGame, applyMove } = require("../src/lib/game");

test("valid X then O then X", () => {
  let s = newGame();
  let r = applyMove(s, 0, 0, "X"); expect(r.ok).toBe(true); s = r.state;
  r = applyMove(s, 0, 1, "O"); expect(r.ok).toBe(true); s = r.state;
  r = applyMove(s, 1, 1, "X"); expect(r.ok).toBe(true); s = r.state;
});

test("reject occupied cell", () => {
  let s = newGame();
  s = applyMove(s, 0, 0, "X").state;
  const r = applyMove(s, 0, 0, "O");
  expect(r.ok).toBe(false);
});

test("detect win", () => {
  let s = newGame();
  s = applyMove(s, 0, 0, "X").state;
  s = applyMove(s, 1, 0, "O").state;
  s = applyMove(s, 0, 1, "X").state;
  s = applyMove(s, 1, 1, "O").state;
  s = applyMove(s, 0, 2, "X").state;
  expect(s.ended).toBe(true);
  expect(s.winner).toBe("X");
});
