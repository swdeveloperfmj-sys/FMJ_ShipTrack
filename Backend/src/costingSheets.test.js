import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createCostingsRouter } from "./preCostings.js";
import { samplePreCosting } from "../../Frontend/src/preCosting.js";

function memoryModel() {
  const records = new Map();
  return {
    find: () => ({ sort: () => ({ lean: async () => [...records.values()] }) }),
    create: async (record) => { records.set(record._id, record); return record; },
    findByIdAndUpdate: async (id, payload) => {
      if (!records.has(id)) return null;
      const record = { ...records.get(id), ...payload };
      records.set(id, record);
      return record;
    },
    findByIdAndDelete: async (id) => {
      const record = records.get(id);
      records.delete(id);
      return record;
    },
  };
}

test("worksheet routes isolate records, validate inputs and enforce separate access", async (t) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { role: "user", sidebarAccess: (req.headers["x-access"] || "").split(",") };
    next();
  });
  app.use("/pre", createCostingsRouter(memoryModel(), "pre-costing", "Pre costing"));
  app.use("/post", createCostingsRouter(memoryModel(), "post-costing-sheet", "Post costing"));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const request = (path, method = "GET", body, access = "pre-costing,post-costing-sheet") => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method, headers: { "Content-Type": "application/json", "x-access": access },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await request("/post", "GET", null, "pre-costing")).status, 403);
  assert.equal((await request("/pre", "GET", null, "post-costing-sheet")).status, 403);
  assert.equal((await request("/post", "POST", {})).status, 400);
  const response = await request("/post", "POST", samplePreCosting());
  assert.equal(response.status, 201);
  const saved = await response.json();
  assert.deepEqual(await (await request("/pre")).json(), []);
  assert.equal((await (await request("/post")).json()).length, 1);
  const edited = await request(`/post/${saved.id}`, "PUT", { ...saved, reference: "Actual costs" });
  assert.equal((await edited.json()).reference, "Actual costs");
  assert.equal((await request(`/pre/${saved.id}`, "DELETE")).status, 404);
  assert.equal((await request(`/post/${saved.id}`, "DELETE")).status, 204);
  assert.deepEqual(await (await request("/post")).json(), []);
});
