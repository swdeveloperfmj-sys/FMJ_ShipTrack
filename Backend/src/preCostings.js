import express from "express";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, required: true },
}, { versionKey: false });
const PreCosting = mongoose.model("PreCosting", schema);
const serialize = (record) => ({ ...record.data, id: record._id, createdAt: record.createdAt, updatedAt: record.updatedAt });

export function normalizePreCosting(body = {}) {
  const data = {};
  for (const key of ["reference", "supplier", "material", "country", "hsCode", "date", "transport", "incoterm", "notes", "totalLabel", "breakdownLabel", "breakdownDetails"]) {
    if (body[key] !== undefined && typeof body[key] !== "string") throw new Error(`Invalid ${key}.`);
    data[key] = (body[key] || "").trim();
    if (data[key].length > (key === "notes" ? 4000 : key === "breakdownDetails" ? 500 : 200)) throw new Error(`${key} is too long.`);
  }
  if (!data.reference || !data.material) throw new Error("Costing title and material are required.");
  function number(value, label, positive = false) {
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "" || !Number.isFinite(Number(value)) || (positive ? Number(value) <= 0 : Number(value) < 0)) throw new Error(`Enter a valid ${label}.`);
    return Number(value);
  }
  data.exchangeRate = number(body.exchangeRate, "exchange rate", true);
  for (const key of ["breakdownClearing", "breakdownOther", "breakdownBank"]) data[key] = number(body[key] ?? 0, key);
  for (const key of ["insurance", "freight", "cid", "pal", "eic", "sscl", "vat", "clearing"]) {
    const value = body[key];
    data[key] = number(typeof value === "string" && value.trim() === "" ? 0 : value, key);
  }
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) throw new Error("Enter between 1 and 100 items.");
  data.items = body.items.map((item) => {
    if (typeof item?.description !== "string" || !item.description.trim() || item.description.length > 200) throw new Error("Enter a valid item description.");
    return { description: item.description.trim(), quantity: number(item.quantity, "quantity", true), usdValue: number(item.usdValue, "USD invoice value", true) };
  });
  return { data, updatedAt: new Date().toISOString() };
}

export const preCostingsRouter = express.Router();
preCostingsRouter.use((request, response, next) => {
  if (request.user.role !== "super-admin" && !request.user.sidebarAccess.includes("pre-costing")) return response.status(403).json({ error: "Pre costing access is required." });
  next();
});
preCostingsRouter.get("/", async (_request, response, next) => {
  try { response.json((await PreCosting.find().sort({ updatedAt: -1 }).lean()).map(serialize)); } catch (error) { next(error); }
});
for (const method of ["post", "put"]) {
  preCostingsRouter[method](method === "post" ? "/" : "/:id", async (request, response, next) => {
    let payload;
    try { payload = normalizePreCosting(request.body); } catch (error) { return response.status(400).json({ error: error.message }); }
    try {
      const record = method === "post" ? await PreCosting.create({ _id: randomUUID(), ...payload }) : await PreCosting.findByIdAndUpdate(request.params.id, payload, { new: true, runValidators: true });
      if (!record) return response.status(404).json({ error: "Pre costing not found." });
      response.status(method === "post" ? 201 : 200).json(serialize(record));
    } catch (error) { next(error); }
  });
}
preCostingsRouter.delete("/:id", async (request, response, next) => {
  try {
    if (!await PreCosting.findByIdAndDelete(request.params.id)) return response.status(404).json({ error: "Pre costing not found." });
    response.status(204).end();
  } catch (error) { next(error); }
});
