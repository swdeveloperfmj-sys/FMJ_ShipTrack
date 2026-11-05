import * as XLSX from "xlsx";

const standardColumns = [
  ["description", "ITEM DESCRIPTION"], ["quantity", "QTY KG"], ["usdValue", "USD PRICE/C&F"],
  ["lkrValue", "LKR PRICE"], ["insurance", "INSURANCE"], ["freight", "FREIGHT"],
  ["cif", "CIF PRICE"], ["cid", "CID"], ["pal", "PAL"], ["eic", "EIC"],
  ["sscl", "SSCL"], ["vat", "VAT"], ["duty", "TOT DUTY"], ["clearing", "CLEARING/ OTHER CHGS"],
  ["landed", "TOTAL LANDING COST"], ["perKg", "LANDING COST/KG"], ["withoutVat", "WITHOUT VAT"],
];
const doubleColumns = [
  ["description", "ITEM DESCRIPTION"], ["quantity", "QTY KG"], ["dollarRate", "DOLLAR RATE"],
  ["bankAmount", "BANK CHARGES (USD)"], ["lkrValue", "LKR PRICE"], ["insurance", "INSURANCE"],
  ["freight", "FREIGHT"], ["cif", "CIF PRICE"], ["cid", "CID"], ["pal", "PAL"],
  ["eic", "EIC"], ["sscl", "SSCL"], ["vat", "VAT"], ["duty", "TOT DUTY"],
  ["clearing", "CLEARING/ OTHER CHGS"], ["landed", "TOTAL LANDING COST"],
  ["perKg", "LANDING COST/KG"], ["withoutVat", "WITHOUT VAT"],
];
const inputKeys = new Set(["description", "quantity", "usdValue", "dollarRate", "bankAmount"]);

function safePart(value) {
  return String(value || "costing").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "costing";
}

export function downloadCostingExcel(draft, result, title, double = false) {
  const columns = double ? doubleColumns : standardColumns;
  const rows = [
    ["Costing", draft.reference],
    ["Material", draft.material],
    ["HS Code", draft.hsCode],
    ["Date", draft.date],
    ...(double ? [["LKR Price formula", "Dollar Rate × Bank Charges (USD)"]] : [["Exchange rate (LKR per USD)", Number(draft.exchangeRate)]]),
    [],
    columns.map(([, label]) => label),
    ...draft.items.map((item, index) => columns.map(([key]) => inputKeys.has(key) ? (item[key] ?? "") : result.rows[index]?.[key] ?? "")),
    ["TOTAL", ...columns.slice(1).map(([key]) => result.totals[key] ?? "")],
    [],
    ["BREAKDOWN", "LKR AMOUNT"],
    ["Clearing", Number(draft.breakdownClearing || 0)],
    [draft.breakdownLabel || "3%", result.totals.lkrValue * 0.03],
    ["Bank Charges", draft.breakdownBank === "" || draft.breakdownBank == null ? result.totals.lkrValue * 0.01 : Number(draft.breakdownBank)],
    ["CLEARING / OTHER CHARGES TOTAL", result.totals.clearing],
    ...(draft.breakdownDetails ? [["Details", draft.breakdownDetails]] : []),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = columns.map(([key, label]) => ({ wch: key === "description" ? 30 : Math.min(22, Math.max(12, label.length + 2)) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Costing");
  XLSX.writeFile(workbook, `${safePart(title)}-${safePart(draft.reference)}.xlsx`, { compression: true });
}
