// src/lib/auth.js
// JWT issue/verify helpers used by the HTTP auth route and WS handshake.

const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET || "dev-secret";

// Create a short-lived token for a game join.
function issueToken({ userId, gameId, role }) {
  return jwt.sign({ sub: userId, gameId, role }, SECRET, { expiresIn: "1h" });
}

// Verify a presented token (returns ok/payload or ok:false).
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, SECRET);
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, err: "Invalid token" };
  }
}

module.exports = { issueToken, verifyToken };
