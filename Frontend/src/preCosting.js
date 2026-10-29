export const chargeFields = [
  ["insurance", "Insurance"], ["freight", "Freight"], ["cid", "CID"],
  ["pal", "PAL"], ["eic", "EIC"], ["sscl", "SSCL"], ["vat", "VAT"], ["clearing", "Clearing / other charges"],
];

export function newPreCosting() {
  return { reference: "", material: "", hsCode: "", totalLabel: "", breakdownClearing: 0, breakdownLabel: "3%", breakdownOther: 0, breakdownBank: 0, breakdownDetails: "", date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date()), exchangeRate: "", ...Object.fromEntries(chargeFields.map(([key]) => [key, 0])), items: [{ description: "", quantity: "", usdValue: "" }] };
}

export function samplePreCosting() {
  return { ...newPreCosting(), reference: "AVIENT-INDIA- - PRE Costing - SEA freight", material: "MASTER BATCHES", hsCode: "3206.49.00", date: "2026-05-10", totalLabel: "RED", breakdownClearing: 41300, breakdownOther: 11300, breakdownBank: 5000, breakdownDetails: "(Transport 22800+ Cargo bill 2,000 clearing 16500)", exchangeRate: 336, insurance: 1500, pal: 37615, sscl: 15000, vat: 82250, clearing: 58000, items: [{ description: "PE 34407349", quantity: 25, usdValue: 1117.5 }] };
}

export function validatePreCosting(draft) {
  for (const [key, label] of [["reference", "Costing title"], ["material", "Material"]]) {
    if (!String(draft[key] || "").trim()) return `${label} is required.`;
  }
  if (!Number.isFinite(Number(draft.exchangeRate)) || Number(draft.exchangeRate) <= 0) return "Enter an exchange rate greater than zero.";
  for (const [key, label] of chargeFields) {
    if (draft[key] === "" || !Number.isFinite(Number(draft[key])) || Number(draft[key]) < 0) return `${label} must be zero or a positive amount.`;
  }
  if (!Array.isArray(draft.items) || !draft.items.length || draft.items.length > 100) return "Enter between 1 and 100 items.";
  for (const [index, item] of draft.items.entries()) {
    if (!String(item.description || "").trim()) return `Enter a description for item ${index + 1}.`;
    if (![item.quantity, item.usdValue].every((value) => Number.isFinite(Number(value)) && Number(value) > 0)) return `Quantity and USD invoice value for item ${index + 1} must be greater than zero.`;
  }
  return "";
}

// The template allocates shipment-level LKR charges by each item's USD invoice value.
// USD value is the full line value, not a unit price. Round only for presentation.
export function calculatePreCosting(draft) {
  const totalUsd = draft.items.reduce((sum, item) => sum + Number(item.usdValue), 0);
  const ready = Number.isFinite(Number(draft.exchangeRate)) && Number(draft.exchangeRate) > 0 && Number.isFinite(totalUsd) && totalUsd > 0 && draft.items.every((item) => Number.isFinite(Number(item.quantity)) && Number.isFinite(Number(item.usdValue)) && Number(item.quantity) > 0 && Number(item.usdValue) > 0) && chargeFields.every(([key]) => draft[key] !== "" && Number.isFinite(Number(draft[key])) && Number(draft[key]) >= 0);
  if (!ready) return null;
  const rows = draft.items.map((item) => {
    const share = Number(item.usdValue) / totalUsd;
    const allocated = Object.fromEntries(chargeFields.map(([key]) => [key, Number(draft[key]) * share]));
    const lkrValue = Number(item.usdValue) * Number(draft.exchangeRate);
    const cif = lkrValue + allocated.insurance + allocated.freight;
    const duty = allocated.cid + allocated.pal + allocated.eic + allocated.sscl + allocated.vat;
    const landed = cif + duty + allocated.clearing;
    return { ...item, ...allocated, lkrValue, cif, duty, landed, perKg: landed / Number(item.quantity), withoutVat: (landed - allocated.vat) / Number(item.quantity) };
  });
  const quantity = rows.reduce((sum, row) => sum + Number(row.quantity), 0);
  const totals = Object.fromEntries(["lkrValue", ...chargeFields.map(([key]) => key), "cif", "duty", "landed"].map((key) => [key, rows.reduce((sum, row) => sum + row[key], 0)]));
  return { rows, totals: { ...totals, quantity, usdValue: totalUsd, perKg: totals.landed / quantity, withoutVat: (totals.landed - totals.vat) / quantity } };
}
