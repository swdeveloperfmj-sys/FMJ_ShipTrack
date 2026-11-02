import test from "node:test";
import assert from "node:assert/strict";
import { ActivityLog, activityEntry, activityFilter, activityMiddleware, recordActivity } from "./activity.js";

const user = { id: "user-1", username: "operator", name: "Operator", role: "user" };
const request = (changes = {}) => ({ user, method: "PUT", originalUrl: "/api/shipments/shipment-1", body: {}, ...changes });

test("records actor, record identity and workflow state without credentials or body values", () => {
  const entry = activityEntry(request({ body: { status: "Cleared", password: "secret", otp: "123456", documents: { private: "payload" }, unexpected: "secret" } }), 200, { id: "shipment-1", importNo: "FMJ-12", status: "Cleared", paymentStatus: "Paid" });
  assert.equal(entry.recordId, "shipment-1");
  assert.equal(entry.label, "FMJ-12");
  assert.deepEqual(entry.fields, ["status", "documents"]);
  assert.deepEqual(entry.state, { status: "Cleared", paymentStatus: "Paid" });
  assert.equal(JSON.stringify(entry).includes("secret"), false);
  assert.equal(JSON.stringify(entry).includes("payload"), false);
});

test("captures failed writes and deletes while excluding reads and monitoring requests", () => {
  assert.equal(activityEntry(request(), 403, {}).outcome, "Failed");
  assert.equal(activityEntry(request({ method: "DELETE" }), 204).recordId, "shipment-1");
  assert.equal(activityEntry(request({ method: "GET" }), 200), null);
  assert.equal(activityEntry(request({ originalUrl: "/api/activity/page-view", method: "POST" }), 204), null);
  assert.equal(activityEntry(request({ user: undefined }), 401), null);
});

test("filters use exact strings and Sri Lanka calendar day boundaries", () => {
  const filter = activityFilter({ actorId: "user-1", resource: "shipments", recordId: "record-1", from: "2026-11-02", to: "2026-11-02" });
  assert.equal(filter.occurredAt.$gte.toISOString(), "2026-11-01T18:30:00.000Z");
  assert.equal(filter.occurredAt.$lte.toISOString(), "2026-11-02T18:29:59.999Z");
  assert.deepEqual(activityFilter({ actorId: { $ne: null } }), {});
  assert.throws(() => activityFilter({ from: "invalid" }));
  assert.throws(() => activityFilter({ from: "2026-02-30" }));
  assert.throws(() => activityFilter({ from: "2026-11-03", to: "2026-11-02" }));
});

test("middleware persists once before ending response and uses authenticated identity", async () => {
  const original = ActivityLog.create;
  const entries = [];
  ActivityLog.create = async (entry) => { entries.push(entry); };
  try {
    let complete;
    const finished = new Promise((resolve) => { complete = resolve; });
    const response = {
      statusCode: 201,
      json(body) { this.end(JSON.stringify(body)); return this; },
      end() { assert.equal(entries.length, 1); complete(); },
    };
    activityMiddleware(request({ method: "POST", originalUrl: "/api/pre-costings", body: { actorId: "spoof", reference: "Estimate" } }), response, () => {});
    response.json({ id: "estimate-1", reference: "Estimate" });
    await finished;
    assert.equal(entries[0].actorId, user.id);
    assert.equal(entries[0].recordId, "estimate-1");
    assert.equal(entries[0].action, "Create");
    await recordActivity(user, { actorId: "spoof", action: "Sign in" });
    assert.equal(entries[1].actorId, user.id);
  } finally { ActivityLog.create = original; }
});

test("a log storage failure still completes the original business response", async () => {
  const original = ActivityLog.create;
  const logError = console.error;
  ActivityLog.create = async () => { throw new Error("storage unavailable"); };
  console.error = () => {};
  try {
    let complete;
    const finished = new Promise((resolve) => { complete = resolve; });
    const response = { statusCode: 204, end: complete };
    activityMiddleware(request({ method: "DELETE" }), response, () => {});
    response.end();
    await finished;
  } finally { ActivityLog.create = original; console.error = logError; }
});
