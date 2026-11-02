import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

const schema = new mongoose.Schema({
  _id: { type: String, default: randomUUID },
  actorId: String, actorName: String, username: String, role: String,
  action: String, resource: String, recordId: String, label: String,
  fields: [String], state: { type: mongoose.Schema.Types.Mixed },
  outcome: String, statusCode: Number,
  occurredAt: { type: Date, default: Date.now },
}, { versionKey: false });
schema.index({ occurredAt: -1, _id: -1 });
schema.index({ actorId: 1, occurredAt: -1 });
schema.index({ resource: 1, recordId: 1, occurredAt: -1 });
export const ActivityLog = mongoose.model("ActivityLog", schema);

const resources = new Set(["shipments", "consignees", "countries", "currencies", "materials", "pre-costings", "post-costings", "users", "settings"]);
const safeFields = new Set(["name", "username", "sidebarAccess", "fontSize", "userId", "importNo", "company", "supplier", "country", "consignee", "description", "transportMode", "incoterm", "incotermLocation", "fclLcl", "containerSize", "remarks", "currency", "etd", "eta", "arrivalDate", "deliveryDate", "status", "paymentMethod", "paymentTerms", "paymentTermType", "paymentTermDays", "paymentStatus", "advanceTT", "sightLC", "usanceLC", "duty", "doCharges", "clearanceStatus", "totalCost", "payments", "adjustments", "documents", "code", "color", "contactName", "email", "phone", "address", "unit", "currentStock", "onOrder", "leadTimeDays", "safetyStockMonths", "monthlyPurchases", "materials", "fileNo", "material", "data", "reference", "items", "exchangeRate", "date", "insurance", "freight", "cid", "pal", "eic", "sscl", "vat", "clearing"]);

export function activityEntry(request, statusCode, result = {}) {
  if (!request.user) return null;
  const [resource, recordId = ""] = request.originalUrl.split("?")[0].replace(/^\/api\//, "").split("/");
  if (!resources.has(resource) || !["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return null;
  const body = request.body || {};
  const state = {};
  for (const key of ["status", "paymentStatus", "clearanceStatus"]) {
    if (typeof result?.[key] === "string") state[key] = result[key].slice(0, 100);
  }
  return {
    action: ({ POST: "Create", PUT: "Update", PATCH: "Update", DELETE: "Delete" })[request.method],
    resource, recordId: String(result?.id || recordId || body.userId || "").slice(0, 200),
    label: String(result?.importNo || result?.reference || result?.fileNo || result?.name || result?.code || recordId || resource).slice(0, 200),
    // Store field names and workflow state only, never arbitrary payloads or credentials.
    fields: Object.keys(body).filter((key) => safeFields.has(key)), state,
    outcome: statusCode < 400 ? "Success" : "Failed", statusCode,
  };
}

export async function recordActivity(user, entry) {
  return ActivityLog.create({ ...entry, actorId: user.id, actorName: user.name || user.username, username: user.username, role: user.role });
}

export function activityMiddleware(request, response, next) {
  let result;
  const json = response.json;
  response.json = function (body) { result = body; return json.call(this, body); };
  const end = response.end;
  let ending = false;
  response.end = function (...args) {
    if (ending) return this;
    ending = true;
    const entry = activityEntry(request, response.statusCode, result);
    if (!entry) return end.apply(this, args);
    // Complete the write before ending the request (also works on serverless hosts).
    recordActivity(request.user, entry)
      .catch(() => { console.error("Activity log persistence failed."); })
      .finally(() => end.apply(this, args));
    return this;
  };
  next();
}

export function activityFilter(query) {
  const filter = {};
  for (const key of ["actorId", "resource", "recordId", "action", "outcome"]) {
    if (typeof query[key] === "string" && query[key]) filter[key] = query[key].slice(0, 200);
  }
  for (const [key, operator] of [["from", "$gte"], ["to", "$lte"]]) {
    if (!query[key]) continue;
    if (typeof query[key] !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(query[key])) throw new Error("Use YYYY-MM-DD dates.");
    const calendarDate = new Date(`${query[key]}T00:00:00.000Z`);
    if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== query[key]) throw new Error("Invalid date.");
    const date = new Date(`${query[key]}T${key === "from" ? "00:00:00.000" : "23:59:59.999"}+05:30`);
    if (Number.isNaN(date.getTime())) throw new Error("Invalid date.");
    filter.occurredAt = { ...filter.occurredAt, [operator]: date };
  }
  if (filter.occurredAt?.$gte > filter.occurredAt?.$lte) throw new Error("Start date must be before end date.");
  return filter;
}
