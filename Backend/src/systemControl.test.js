import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { installSystemControl } from "./systemControl.js";

test("code in both login fields toggles; normal login and disabled recovery work", async () => {
  let state;
  const State = {
    findById: () => ({ lean: async () => state }),
    findOneAndUpdate: async () => (state = { disabled: !state?.disabled }),
  };
  const app = express();
  app.use(express.json());
  let secret = "Private-control-code!";
  installSystemControl(app, { State, getCode: () => secret });
  app.get("/api/shipments", (_req, res) => res.json([]));
  app.post("/api/auth/login", (_req, res) => res.json({ authenticated: true }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const toggle = (overrides = {}) => fetch(`${url}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "Private-control-code!", password: "Private-control-code!", ...overrides }) });
  try {
    assert.equal((await fetch(`${url}/api/shipments`)).status, 200);
    for (const invalid of [{ username: "user" }, { password: "wrong" }, { username: "private-control-code!" }]) {
      assert.deepEqual(await (await toggle(invalid)).json(), { authenticated: true });
      assert.equal(state, undefined);
    }
    assert.deepEqual(await (await toggle()).json(), { systemToggled: true, disabled: true });
    assert.equal((await toggle({ password: "wrong" })).status, 503);
    assert.equal((await fetch(`${url}/api/shipments`)).status, 503);
    assert.equal((await fetch(`${url}/api/auth/login`, { method: "POST" })).status, 503);
    assert.equal((await (await fetch(`${url}/api/auth/status`)).json()).disabled, true);
    assert.deepEqual(await (await toggle()).json(), { systemToggled: true, disabled: false });
    assert.equal((await fetch(`${url}/api/shipments`)).status, 200);
    secret = "654321";
    assert.deepEqual(await (await toggle({ username: secret, password: secret })).json(), { systemToggled: true, disabled: true });
    assert.deepEqual(await (await toggle({ username: secret, password: secret })).json(), { systemToggled: true, disabled: false });
    secret = "";
    assert.deepEqual(await (await toggle()).json(), { authenticated: true });
    assert.equal(state.disabled, false);
    assert.equal((await fetch(`${url}/api/system/toggle`, { method: "POST" })).status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
