// tests/routes.test.js
const express = require("express");
const request = require("supertest");
const RedisMock = require("ioredis-mock");
const { makeRoutes } = require("../src/server/routes");
const { LOG_LIST } = require("../src/lib/logger");

test("auth/register returns a token", async () => {
  const redis = new RedisMock();
  const app = express();
  app.use("/api", makeRoutes(redis));

  const res = await request(app)
    .post("/api/auth/register")
    .send({ userId: "u1", gameId: "g1", role: "X" })
    .set("content-type", "application/json");

  expect(res.statusCode).toBe(200);
  expect(res.body.token).toBeTruthy();
});

test("health returns ok", async () => {
  const redis = new RedisMock();
  const app = express();
  app.use("/api", makeRoutes(redis));

  const res = await request(app).get("/api/health");

  expect(res.statusCode).toBe(200);
  expect(res.body.status).toBe("ok");
});

test("logs returns recent entries", async () => {
  const redis = new RedisMock();
  await redis.lpush(LOG_LIST, JSON.stringify({ ts: 1, level: "info", msg: "hello" }));

  const app = express();
  app.use("/api", makeRoutes(redis));

  const res = await request(app).get("/api/logs?limit=5");

  expect(res.statusCode).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body[0].msg).toBe("hello");
});
