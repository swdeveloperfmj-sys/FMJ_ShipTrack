import * as XLSX from "xlsx-js-style";

const standardColumns = [
  ["description", "ITEM DESCRIPTION"], ["quantity", "QTY KG"], ["usdValue", "USD PRICE/C&F"],
  ["lkrValue", "LKR PRICE"], ["insurance", "INSURANCE"], ["freight", "FREIGHT"],
  ["cif", "CIF PRICE"], ["cid", "CID"], ["pal", "PAL"], ["eic", "EIC"],
  ["sscl", "SSCL"], ["vat", "VAT"], ["duty", "TOT DUTY"], ["clearing", "CLEARING/ OTHER CHGS"],
  ["landed", "TOTAL LANDING COST"], ["perKg", "LANDING COST/KG"], ["withoutVat", "without VAT"],
];
const doubleColumns = [
  ["description", "ITEM DESCRIPTION"], ["quantity", "QTY KG"], ["dollarRate", "DOLLAR RATE"],
  ["bankAmount", "BANK CHARGES (USD)"], ["lkrValue", "LKR PRICE"], ["insurance", "INSURANCE"],
  ["freight", "FREIGHT"], ["cif", "CIF PRICE"], ["cid", "CID"], ["pal", "PAL"],
  ["eic", "EIC"], ["sscl", "SSCL"], ["vat", "VAT"], ["duty", "TOT DUTY"],
  ["clearing", "CLEARING/ OTHER CHGS"], ["landed", "TOTAL LANDING COST"],
  ["perKg", "LANDING COST/KG"], ["withoutVat", "without VAT"],
];
const inputKeys = new Set(["description", "quantity", "usdValue", "dollarRate", "bankAmount"]);
const colors = { peach: "FBE5D6", material: "F8CBAD", total: "D9EAD3", highlight: "FFFF00", red: "D00000", black: "000000" };
const thinBorder = { style: "thin", color: { rgb: colors.black } };
const gridBorder = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };
const numberFormat = "#,##0.00;[Red](#,##0.00);-";

function safePart(value) {
  return String(value || "costing").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "costing";
}

function cellAddress(row, column) {
  return XLSX.utils.encode_cell({ r: row, c: column });
}

function columnLetter(column) {
  return XLSX.utils.encode_col(column);
}

function ensureCell(sheet, row, column) {
  const address = cellAddress(row, column);
  if (!sheet[address]) sheet[address] = { t: "s", v: "" };
  return sheet[address];
}

function styleRange(sheet, row, firstColumn, lastColumn, style) {
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    ensureCell(sheet, row, column).s = style;
  }
}

function setFormula(sheet, row, column, formula, cachedValue) {
  const cell = ensureCell(sheet, row, column);
  cell.t = typeof cachedValue === "number" && Number.isFinite(cachedValue) ? "n" : "str";
  cell.v = cachedValue ?? "";
  cell.f = formula;
  delete cell.w;
}

function numberOrBlank(value) {
  if (value === "" || value == null) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

export function downloadCostingExcel(draft, result, title, double = false) {
  const columns = double ? doubleColumns : standardColumns;
  const columnIndex = Object.fromEntries(columns.map(([key], index) => [key, index]));
  const lastColumn = columns.length - 1;
  const headerRow = double ? 4 : 3;
  const dataStartRow = headerRow + 1;
  const dataEndRow = dataStartRow + draft.items.length - 1;
  const totalRow = dataEndRow + 1;
  const dataStartExcel = dataStartRow + 1;
  const dataEndExcel = dataEndRow + 1;
  const totalExcel = totalRow + 1;
  const blankRow = () => Array(columns.length).fill("");
  const rows = [blankRow(), blankRow(), blankRow()];

  rows[0][0] = draft.reference || title;
  rows[1][0] = "HS CODE";
  rows[1][1] = draft.hsCode || "";
  rows[1][3] = draft.material || "";
  rows[1][lastColumn - 1] = "DATE";
  rows[1][lastColumn] = draft.date || "";

  if (double) {
    const groupRow = blankRow();
    groupRow[2] = "USD PRICE/C&F";
    rows.push(groupRow);
  }
  rows.push(columns.map(([, label]) => label));
  draft.items.forEach((item) => {
    rows.push(columns.map(([key]) => {
      if (key === "description") return item[key] ?? "";
      return inputKeys.has(key) ? numberOrBlank(item[key]) : "";
    }));
  });
  rows.push(["TOTAL", ...columns.slice(1).map(() => "")]);
  rows.push(blankRow());
  const breakdownStartRow = rows.length;
  rows.push(["Clearing", numberOrBlank(draft.breakdownClearing || 0), draft.breakdownDetails || "", ...Array(columns.length - 3).fill("")]);
  rows.push([draft.breakdownLabel || "3%", "", "", ...Array(columns.length - 3).fill("")]);
  rows.push(["Bank Charges (1% default)", draft.breakdownBank === "" || draft.breakdownBank == null ? "" : numberOrBlank(draft.breakdownBank), "", ...Array(columns.length - 3).fill("")]);
  const breakdownTotalRow = rows.length;
  rows.push(["", "", "", ...Array(columns.length - 3).fill("")]);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } },
    { s: { r: 1, c: 3 }, e: { r: 1, c: lastColumn - 2 } },
  ];
  if (double) merges.push({ s: { r: 3, c: 2 }, e: { r: 3, c: 3 } });
  sheet["!merges"] = merges;

  const lkrLetter = columnLetter(columnIndex.lkrValue);
  const quantityLetter = columnLetter(columnIndex.quantity);
  const landedLetter = columnLetter(columnIndex.landed);
  const vatLetter = columnLetter(columnIndex.vat);
  const priceKey = double ? "lkrValue" : "usdValue";
  const priceLetter = columnLetter(columnIndex[priceKey]);
  const priceRange = `$${priceLetter}$${dataStartExcel}:$${priceLetter}$${dataEndExcel}`;
  const lkrRange = `$${lkrLetter}$${dataStartExcel}:$${lkrLetter}$${dataEndExcel}`;
  const quantityRange = `$${quantityLetter}$${dataStartExcel}:$${quantityLetter}$${dataEndExcel}`;
  const rateRange = double ? `$${columnLetter(columnIndex.dollarRate)}$${dataStartExcel}:$${columnLetter(columnIndex.dollarRate)}$${dataEndExcel}` : "";
  const bankAmountRange = double ? `$${columnLetter(columnIndex.bankAmount)}$${dataStartExcel}:$${columnLetter(columnIndex.bankAmount)}$${dataEndExcel}` : "";
  const validUsdTotal = `SUMIFS(${priceRange},${quantityRange},">0",${priceRange},">0")`;
  const allocationDenominator = double ? `SUM(${lkrRange})` : validUsdTotal;
  const landedRange = `$${landedLetter}$${dataStartExcel}:$${landedLetter}$${dataEndExcel}`;
  const vatRange = `$${vatLetter}$${dataStartExcel}:$${vatLetter}$${dataEndExcel}`;
  const totalLkrValue = result.totals.lkrValue;
  const breakdownClearingRow = breakdownStartRow;
  const breakdownOtherRow = breakdownStartRow + 1;
  const breakdownBankRow = breakdownStartRow + 2;
  const breakdownClearingExcel = breakdownClearingRow + 1;
  const breakdownOtherExcel = breakdownOtherRow + 1;
  const breakdownBankExcel = breakdownBankRow + 1;
  const breakdownTotalExcel = breakdownTotalRow + 1;
  const breakdownOtherCached = totalLkrValue * 0.03;
  const breakdownBankCached = draft.breakdownBank === "" || draft.breakdownBank == null ? totalLkrValue * 0.01 : Number(draft.breakdownBank);
  const breakdownTotalCached = Number(draft.breakdownClearing || 0) + breakdownOtherCached + breakdownBankCached;

  // Editable charge assumptions sit above the table, as in the web worksheet.
  if (!double) {
    const rateColumn = columnIndex.lkrValue;
    ensureCell(sheet, 2, rateColumn).v = numberOrBlank(draft.exchangeRate);
    ensureCell(sheet, 2, rateColumn).t = "n";
  }
  for (const key of ["insurance", "freight", "cid", "pal", "eic", "sscl", "vat"]) {
    const column = columnIndex[key];
    ensureCell(sheet, 2, column).v = numberOrBlank(draft[key] ?? 0);
    ensureCell(sheet, 2, column).t = "n";
  }
  const clearingColumn = columnIndex.clearing;
  setFormula(sheet, 2, clearingColumn, `B${breakdownTotalExcel}`, breakdownTotalCached);

  const assumptionExcelRow = 3;
  const assumptionRef = (key) => `$${columnLetter(columnIndex[key])}$${assumptionExcelRow}`;
  const clearingTotalFormula = `SUM(B${breakdownClearingExcel}:B${breakdownBankExcel})`;
  setFormula(sheet, breakdownOtherRow, 1, `SUM(${lkrRange})*3%`, breakdownOtherCached);
  if (draft.breakdownBank === "" || draft.breakdownBank == null) {
    setFormula(sheet, breakdownBankRow, 1, `SUM(${lkrRange})*1%`, breakdownBankCached);
  }
  setFormula(sheet, breakdownTotalRow, 1, clearingTotalFormula, breakdownTotalCached);

  for (let row = dataStartRow; row <= dataEndRow; row += 1) {
    const excelRow = row + 1;
    const rowReady = double ? `AND($B${excelRow}>0,$C${excelRow}>0,$D${excelRow}>0)` : `AND($B${excelRow}>0,$C${excelRow}>0)`;
    const allocationReady = `AND(${rowReady},${allocationDenominator}>0)`;
    const allocationBase = double ? "lkrValue" : "usdValue";
    const allocationColumn = columnLetter(columnIndex[allocationBase]);
    const allocationFormula = (key) => `IF(${allocationReady},${assumptionRef(key)}*$${allocationColumn}${excelRow}/${allocationDenominator},"")`;
    const formulaFor = {
      lkrValue: double
        ? `IF(${rowReady},$C${excelRow}*$D${excelRow},"")`
        : `IF(AND($B${excelRow}>0,$C${excelRow}>0,$D$3>0),$C${excelRow}*$D$3,"")`,
      insurance: allocationFormula("insurance"),
      freight: allocationFormula("freight"),
      cid: allocationFormula("cid"),
      pal: allocationFormula("pal"),
      eic: allocationFormula("eic"),
      sscl: allocationFormula("sscl"),
      vat: allocationFormula("vat"),
      clearing: allocationFormula("clearing"),
    };
    const cifKey = "cif";
    const cifColumn = columnLetter(columnIndex[cifKey]);
    const valueColumn = columnLetter(columnIndex.lkrValue);
    const insuranceColumn = columnLetter(columnIndex.insurance);
    const freightColumn = columnLetter(columnIndex.freight);
    formulaFor.cif = `IF(${valueColumn}${excelRow}="","",${valueColumn}${excelRow}+${insuranceColumn}${excelRow}+${freightColumn}${excelRow})`;
    const dutyParts = ["cid", "pal", "eic", "sscl", "vat"].map((key) => `${columnLetter(columnIndex[key])}${excelRow}`);
    formulaFor.duty = `IF(${cifColumn}${excelRow}="","",SUM(${dutyParts.join(",")}))`;
    formulaFor.landed = `IF(${cifColumn}${excelRow}="","",${cifColumn}${excelRow}+${columnLetter(columnIndex.duty)}${excelRow}+${columnLetter(columnIndex.clearing)}${excelRow})`;
    formulaFor.perKg = `IF(AND($B${excelRow}>0,${columnLetter(columnIndex.landed)}${excelRow}<>""),${columnLetter(columnIndex.landed)}${excelRow}/$B${excelRow},"")`;
    formulaFor.withoutVat = `IF(AND($B${excelRow}>0,${columnLetter(columnIndex.landed)}${excelRow}<>""),(${columnLetter(columnIndex.landed)}${excelRow}-${columnLetter(columnIndex.vat)}${excelRow})/$B${excelRow},"")`;

    for (const [key] of columns) {
      if (key === "description" || inputKeys.has(key)) continue;
      const cachedValue = result.rows[row - dataStartRow]?.[key];
      setFormula(sheet, row, columnIndex[key], formulaFor[key], cachedValue ?? "");
    }
  }

  for (let column = 1; column <= lastColumn; column += 1) {
    const key = columns[column][0];
    const letter = columnLetter(column);
    if (double && ["dollarRate", "bankAmount"].includes(key)) continue;
    let formula;
    let cachedValue = result.totals[key];
    if (key === "quantity") {
      formula = double
        ? `SUMIFS(${quantityRange},${quantityRange},">0",${rateRange},">0",${bankAmountRange},">0")`
        : `SUMIFS(${quantityRange},${quantityRange},">0",${priceRange},">0")`;
    } else if (key === "usdValue" && !double) formula = validUsdTotal;
    else if (key === "perKg") formula = `IF(B${totalExcel}>0,SUM(${landedRange})/B${totalExcel},"")`;
    else if (key === "withoutVat") formula = `IF(B${totalExcel}>0,(SUM(${landedRange})-SUM(${vatRange}))/B${totalExcel},"")`;
    else formula = `SUM($${letter}$${dataStartExcel}:$${letter}$${dataEndExcel})`;
    if (key === "perKg") cachedValue = result.totals.landed / result.totals.quantity;
    if (key === "withoutVat") cachedValue = (result.totals.landed - result.totals.vat) / result.totals.quantity;
    setFormula(sheet, totalRow, column, formula, cachedValue ?? "");
  }
  const titleStyle = { font: { name: "Arial", sz: 14, bold: true }, fill: { fgColor: { rgb: colors.peach } }, alignment: { horizontal: "center", vertical: "center" }, border: gridBorder };
  const materialStyle = { font: { name: "Arial", sz: 12, bold: true }, fill: { fgColor: { rgb: colors.material } }, alignment: { horizontal: "center", vertical: "center" }, border: gridBorder };
  const metaLabelStyle = { font: { name: "Arial", sz: 10, bold: true }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: thinBorder } };
  const metaValueStyle = { font: { name: "Arial", sz: 10, bold: true }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: thinBorder } };
  const groupStyle = { font: { name: "Arial", sz: 10, bold: true }, fill: { fgColor: { rgb: colors.peach } }, alignment: { horizontal: "center", vertical: "center" }, border: gridBorder };
  const headerStyle = { font: { name: "Arial", sz: 9, bold: true }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: gridBorder };
  const dataStyle = { font: { name: "Arial", sz: 10 }, alignment: { horizontal: "right", vertical: "center" }, border: gridBorder, numFmt: numberFormat };
  const descriptionStyle = { ...dataStyle, alignment: { horizontal: "left", vertical: "center", wrapText: true } };
  const redInputStyle = { ...dataStyle, font: { name: "Arial", sz: 10, color: { rgb: colors.red } } };
  const highlightStyle = { ...dataStyle, fill: { fgColor: { rgb: colors.highlight } } };
  const totalStyle = { font: { name: "Arial", sz: 10, bold: true }, fill: { fgColor: { rgb: colors.total } }, alignment: { horizontal: "right", vertical: "center" }, border: { top: { style: "medium", color: { rgb: colors.black } }, bottom: { style: "double", color: { rgb: colors.black } }, left: thinBorder, right: thinBorder }, numFmt: numberFormat };
  const breakdownStyle = { font: { name: "Arial", sz: 10 }, alignment: { horizontal: "right", vertical: "center" }, border: { bottom: thinBorder }, numFmt: numberFormat };
  const breakdownTotalStyle = { ...breakdownStyle, font: { name: "Arial", sz: 10, bold: true }, border: { top: thinBorder, bottom: { style: "double", color: { rgb: colors.black } } } };

  styleRange(sheet, 0, 0, lastColumn, titleStyle);
  styleRange(sheet, 1, 0, 1, metaLabelStyle);
  styleRange(sheet, 1, 1, 1, metaValueStyle);
  styleRange(sheet, 1, 3, lastColumn - 2, materialStyle);
  styleRange(sheet, 1, lastColumn - 1, lastColumn, metaLabelStyle);
  ensureCell(sheet, 1, lastColumn).s = metaValueStyle;
  for (let column = 0; column <= lastColumn; column += 1) ensureCell(sheet, 2, column).s = { font: { name: "Arial", sz: 10 }, alignment: { horizontal: "right", vertical: "center" } };
  if (!double) ensureCell(sheet, 2, columnIndex.lkrValue).s = { font: { name: "Arial", sz: 10, color: { rgb: colors.red } }, alignment: { horizontal: "right", vertical: "center" }, numFmt: "0.00" };
  for (const key of ["insurance", "freight", "cid", "pal", "eic", "sscl", "vat", "clearing"]) {
    ensureCell(sheet, 2, columnIndex[key]).s = { font: { name: "Arial", sz: 10 }, alignment: { horizontal: "right", vertical: "center" }, numFmt: numberFormat };
  }
  if (double) styleRange(sheet, 3, 0, lastColumn, groupStyle);
  styleRange(sheet, headerRow, 0, lastColumn, headerStyle);
  for (let row = dataStartRow; row <= dataEndRow; row += 1) {
    for (let column = 0; column <= lastColumn; column += 1) {
      const key = columns[column][0];
      const style = key === "description" ? descriptionStyle : double && ["dollarRate", "bankAmount"].includes(key) ? redInputStyle : ["perKg", "withoutVat"].includes(key) ? highlightStyle : dataStyle;
      ensureCell(sheet, row, column).s = style;
    }
  }
  styleRange(sheet, totalRow, 0, lastColumn, totalStyle);
  ensureCell(sheet, totalRow, 0).s = { ...totalStyle, alignment: { horizontal: "left", vertical: "center" } };
  for (let row = breakdownStartRow; row <= breakdownTotalRow; row += 1) {
    ensureCell(sheet, row, 0).s = { ...breakdownStyle, alignment: { horizontal: "left", vertical: "center" } };
    ensureCell(sheet, row, 1).s = breakdownStyle;
    ensureCell(sheet, row, 2).s = { ...breakdownStyle, alignment: { horizontal: "left", vertical: "center", wrapText: true } };
  }
  ensureCell(sheet, breakdownTotalRow, 0).s = { ...breakdownTotalStyle, alignment: { horizontal: "left", vertical: "center" } };
  ensureCell(sheet, breakdownTotalRow, 1).s = breakdownTotalStyle;

  sheet["!cols"] = columns.map(([key, label]) => ({ wch: key === "description" ? 30 : Math.min(22, Math.max(12, label.length + 2)) }));
  sheet["!rows"] = rows.map((_, index) => ({ hpt: index === 0 ? 28 : index === 1 ? 25 : index === headerRow ? 54 : index >= dataStartRow && index <= totalRow ? 22 : 20 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Costing");
  XLSX.writeFile(workbook, `${safePart(title)}-${safePart(draft.reference)}.xlsx`, { compression: true, cellStyles: true });
}
