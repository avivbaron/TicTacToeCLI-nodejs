# Real-Time Tic-Tac-Toe (Two Node.js Servers + CLI Clients)

A real-time, multiplayer Tic-Tac-Toe built with **Node.js**, using **two independent backend servers** that synchronize game state via **Redis Pub/Sub** and persist game state snapshots in Redis. Each player connects to either server via WebSocket. A **colored CLI client** renders an ASCII board and sends moves.

---

## Contents
- [Architecture](#architecture)
- [Protocol](#protocol)
- [Why Redis (DB Decision)](#why-redis-db-decision)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Run Without Docker](#run-without-docker)
- [Run With Docker (only Redis)](#run-with-docker-only-redis)
- [Optional: Full Docker Compose](#optional-full-docker-compose)
- [Quick Scripts (one-liners)](#quick-scripts-one-liners)
- [How To Play / Confirm It Works](#how-to-play--confirm-it-works)
- [Logs, Health, and Swagger](#logs-health-and-swagger)
- [Testing](#testing)
- [Code Quality](#code-quality)
- [Packages & Roles](#packages--roles)
- [Where AI Was Used](#where-ai-was-used)
- [Visuals](#visuals)

---

## Architecture

```
+--------------------+           Redis (DB + Pub/Sub)             +--------------------+
|   Server A :3001   | <---- publish/subscribe "games:*" ---->    |   Server B :3002   |
|  WS + HTTP + JWT   |                                           |  WS + HTTP + JWT   |
+---------+----------+                                           +----------+---------+
          ^                                                                 ^
          |  WebSocket (client protocol JSON)                               | WebSocket
          |                                                                 |
     +----+-----+                                                      +----+-----+
     |  CLI X   |                                                      |  CLI O   |
     +----------+                                                      +----------+
```
Servers keep an in-memory cache and **persist** the latest snapshot to Redis so a restarted server can **recover** a game when a client reconnects.

---

## Protocol

**Client ⇄ Server (WebSocket JSON)**

- Client → Server
  - `{"type":"move","row":0,"col":2}`
  - `{"type":"quit"}`
- Server → Client
  - `{"type":"update","board":[...],"nextTurn":"O"}`
  - `{"type":"win","winner":"X"}`
  - `{"type":"draw"}`
  - `{"type":"error","message":"Cell occupied"}`
  - `{"type":"you_quit"}`
  - `{"type":"opponent_quit","by":"X"|"O"}`

**Server ⇄ Server (Redis Pub/Sub)**  
- Channel: `games:{gameId}`  
- Messages:
  - `{ "type":"state", "gameId":"g1", "state": { ... } }`
  - `{ "type":"move",  "gameId":"g1", "row": 1, "col": 2, "by":"X" }` *(informational; state is the source of truth)*

Auth is **JWT** as `?token=...` in the WS URL. JWT includes `gameId`, `role` (X/O), `sub` (userId).

---

## Why Redis (DB Decision)

- Need **fast, ephemeral, synchronized** state → **Redis** is ideal (in-memory, atomic ops, Pub/Sub).
- We store:
  - `game:{id}:state` – last snapshot (JSON)
  - `logs:tictactoe` – structured logs
- Constraints (turn order, bounds, occupancy) live in **pure functions** for testability.

---

## Project Structure

```
tictactoe/
  src/
    server/
      index.js          # HTTP server, Swagger, WS wiring
      ws.js             # WS handlers (auth, join/init, move, quit, broadcast)
      routes.js         # HTTP: /auth/register, /health, /logs
    lib/
      game.js           # Pure engine
      bus.js            # Redis clients + pub/sub + save/load
      logger.js         # Structured logs -> Redis
      auth.js           # JWT issue/verify
    client/
      cli.js            # Colored CLI
      play.js           # Helper: auto-token + run CLI
    docs/
      openapi.json      # Swagger spec
  tests/
    game.test.js        # Engine unit tests
    routes.test.js      # Route tests with ioredis-mock
  .env.example
  .eslintrc.json
  .prettierrc
  .dockerignore
  Dockerfile
  docker-compose.yml
  package.json
  README.md
```

---

## Prerequisites

- **Node.js 18+**
- **Redis 7+** (Docker or native)

Check Redis:
```bash
redis-cli PING
# -> PONG
```

Install deps:
```bash
cd tictactoe
npm install
```

---

## Run Without Docker

### Start two servers (two terminals)

**Windows PowerShell:**
```powershell
cd tictactoe
$env:PORT="3001"; $env:REDIS_URL="redis://localhost:6379"; $env:JWT_SECRET="dev-secret"
node src\server\index.js
```
```powershell
cd tictactoe
$env:PORT="3002"; $env:REDIS_URL="redis://localhost:6379"; $env:JWT_SECRET="dev-secret"
node src\server\index.js
```

**macOS/Linux:**
```bash
cd tictactoe
PORT=3001 REDIS_URL=redis://localhost:6379 JWT_SECRET=dev-secret node src/server/index.js
```
```bash
cd tictactoe
PORT=3002 REDIS_URL=redis://localhost:6379 JWT_SECRET=dev-secret node src/server/index.js
```

### Issue tokens
Windows:
```powershell
$tokenA = (Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/auth/register `
  -ContentType 'application/json' -Body '{"userId":"u1","gameId":"g1","role":"X"}').token
$tokenB = (Invoke-RestMethod -Method Post -Uri http://localhost:3002/api/auth/register `
  -ContentType 'application/json' -Body '{"userId":"u2","gameId":"g1","role":"O"}').token
```
macOS/Linux:
```bash
tokenA=$(curl -s -X POST http://localhost:3001/api/auth/register -H 'content-type: application/json' -d '{"userId":"u1","gameId":"g1","role":"X"}' | node -pe "JSON.parse(fs.readFileSync(0,'utf8')).token")
tokenB=$(curl -s -X POST http://localhost:3002/api/auth/register -H 'content-type: application/json' -d '{"userId":"u2","gameId":"g1","role":"O"}' | node -pe "JSON.parse(fs.readFileSync(0,'utf8')).token")
```

### Start CLI clients
```bash
node src/client/cli.js "ws://localhost:3001?token=$tokenA"
node src/client/cli.js "ws://localhost:3002?token=$tokenB"
```

---

## Run With Docker (only Redis)
```bash
docker run --name ttt-redis -p 6379:6379 -d redis:7
```

---

## Optional: Full Docker Compose
```bash
docker compose up --build
```

---

## Quick Scripts (one-liners)
### Auto gameId
The launcher now generates a **unique gameId** by default, so you won't hit “Game ended” from stale Redis state.
- `npm run play:x:a` uses a fresh id each time.
- For a one-command demo that spawns **both players with the same fresh id**, use:
  ```bash
  npm run play:demo
  ```


### Start servers
- Terminal 1: `npm run start:a` (PORT=3001)
- Terminal 2: `npm run start:b` (PORT=3002)

### Play (auto-token + colored CLI)
- Player X on Server A: `npm run play:x:a`
- Player O on Server B: `npm run play:o:b`
- Cross-connect if you like: `npm run play:x:b`, `npm run play:o:a`

These scripts call: `node src/client/play.js <X|O> <PORT> <gameId> <userId>`

---

## How To Play / Confirm It Works

1. Make X’s first move (e.g., `0,0`); O updates immediately.  
2. Invalid move → `{type:"error"}`.  
3. Win/draw → `{type:"win"}/{type:"draw"}` to both.  
4. Press `q` → quitter sees **`You quit. Game closed.`**, opponent sees **`Opponent quit. Game closed.`**  
5. Logs at `/api/logs?limit=20` or `redis-cli LRANGE logs:tictactoe 0 50`.

---

## Logs, Health, and Swagger

- Health: `GET /api/health`
- Logs: `GET /api/logs?limit=20`
- Swagger UI: `GET /docs` on both ports

---

## Testing
```bash
npm test
```

---

## Code Quality
```bash
npm run lint
npm run format
```

---

## Packages & Roles
- `ws` – WebSocket server/client
- `ioredis` – Redis client + Pub/Sub
- `express` – HTTP routes
- `jsonwebtoken` – JWT auth
- `swagger-ui-express` – Swagger UI
- `jest`, `ioredis-mock`, `supertest` – tests
- `dotenv` – dev env loader

---

## Visuals
- Colored CLI: X=green, O=red, cyan role header, yellow next-turn.

---

## Where AI Was Used
- Design, code generation, tests, docs, and polishing.

### Parametrized gameId (your request)
You can pass a **specific gameId** to the launcher via npm scripts using `--`:

```bash
# X on Server A with gameId g123 (userId auto)
npm run play:x:a -- g123

# O on Server B joining the same game
npm run play:o:b -- g123

# You can also pass an explicit userId:
npm run play:x:a -- g123 alice
npm run play:o:b -- g123 bob
```

The launcher will:
- Call `/api/games/:id/status` — if **not exists**, it creates it via `/api/games/:id/init` and prints
  “**Created new game: g123. Waiting for opponent...**”
- If the game **already exists**, it prints “**Game already exists: g123 — joining...**”
- Then it issues a token and connects the CLI.


### Role Reservation (anti-duplicate X/O)
- On connection, the server **claims** your role in Redis (`game:{id}:players`).
- If that role is already taken **by a different user**, your connection is rejected with an informative error.
- If it's taken **by the same userId** (reconnect), you’re allowed.
- Resetting a game (`POST /api/games/{id}/reset`) also clears role reservations.
