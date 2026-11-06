import { jsPDF } from "jspdf";

const standardColumns = [
  ["description", "Item description"], ["quantity", "Qty kg"], ["usdValue", "USD value / C&F"],
  ["lkrValue", "LKR value"], ["insurance", "Insurance"], ["freight", "Freight"],
  ["cif", "CIF value"], ["cid", "CID"], ["pal", "PAL"], ["eic", "EIC"],
  ["sscl", "SSCL"], ["vat", "VAT"], ["duty", "Total duty"],
  ["clearing", "Clearing / other"], ["landed", "Landed cost"], ["perKg", "Cost / kg"],
  ["withoutVat", "Cost / kg excl. VAT"],
];
const doubleColumns = [
  ["description", "Item description"], ["quantity", "Qty kg"], ["dollarRate", "Dollar rate"],
  ["bankAmount", "Bank charges USD"], ["lkrValue", "LKR value"], ["insurance", "Insurance"],
  ["freight", "Freight"], ["cif", "CIF value"], ["cid", "CID"], ["pal", "PAL"],
  ["eic", "EIC"], ["sscl", "SSCL"], ["vat", "VAT"], ["duty", "Total duty"],
  ["clearing", "Clearing / other"], ["landed", "Landed cost"], ["perKg", "Cost / kg"],
  ["withoutVat", "Cost / kg excl. VAT"],
];
const money = (value) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function downloadCostingPdf(draft, result, title, double = false) {
  const columns = double ? doubleColumns : standardColumns;
  const rowsPerPage = 15;
  const pages = [];
  for (let index = 0; index < result.rows.length; index += rowsPerPage) pages.push(result.rows.slice(index, index + rowsPerPage));
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const left = 12;
  const tableWidth = 273;
  const right = left + tableWidth;
  const columnWidth = tableWidth / columns.length;
  const notes = double
    ? "LKR price = dollar rate × bank charges USD. Other LKR charges are allocated by each item's LKR price. Cost / kg excl. VAT = (landed cost - VAT) / kg."
    : "Charges in LKR allocated by USD invoice value. Cost / kg excl. VAT = (landed cost - VAT) / kg.";

  pages.forEach((pageRows, pageIndex) => {
    const isLastPage = pageIndex === pages.length - 1;
    if (pageIndex > 0) pdf.addPage("a4", "landscape");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(`FMJ ShipTrack - ${title}`, left, 11);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`${draft.reference} | ${draft.date}`, left, 18);
    pdf.text(`${draft.material} | HS ${draft.hsCode}${double ? " | LKR price = dollar rate × bank charges USD" : ` | USD/LKR ${draft.exchangeRate}`}`, left, 24);

    let y = 33;
    pdf.setFontSize(6.5);
    pdf.setFont("helvetica", "bold");
    columns.forEach(([, label], index) => {
      const headerLines = pdf.splitTextToSize(label, columnWidth - 1);
      if (index === 0) pdf.text(headerLines, left + index * columnWidth, y);
      else pdf.text(headerLines, left + (index + 1) * columnWidth - 1, y, { align: "right" });
    });
    y += 9;
    pdf.setFont("helvetica", "normal");
    pageRows.forEach((row, rowIndex) => {
      if (rowIndex % 2 === 0) {
        pdf.setFillColor(247, 243, 252);
        pdf.rect(left, y - 4.5, tableWidth, 7.5, "F");
      }
      columns.forEach(([key], column) => {
        if (key === "description") pdf.text(pdf.splitTextToSize(row.description || "", columnWidth - 1), left + column * columnWidth, y);
        else pdf.text(money(row[key]), left + (column + 1) * columnWidth - 1, y, { align: "right" });
      });
      y += 8;
    });

    if (isLastPage) {
      pdf.setFont("helvetica", "bold");
      pdf.setDrawColor(0);
      pdf.setFillColor(217, 234, 211);
      pdf.rect(left, y - 4.5, tableWidth, 8, "F");
      pdf.line(left, y - 4, right, y - 4);
      columns.forEach(([key], column) => {
        const value = key === "description" ? "TOTAL" : result.totals[key];
        if (key === "description") pdf.text(value, left + column * columnWidth, y);
        else pdf.text(money(value), left + (column + 1) * columnWidth - 1, y, { align: "right" });
      });
      y += 8;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7);
      const breakdownRows = [
        ["Clearing", draft.breakdownClearing],
        [draft.breakdownLabel || "3%", result.totals.lkrValue * 0.03],
        ["Bank charges", draft.breakdownBank === "" || draft.breakdownBank == null ? result.totals.lkrValue * 0.01 : Number(draft.breakdownBank)],
        ["CLEARING / OTHER CHGS", result.totals.clearing],
      ];
      const breakdownLabelX = 190;
      const breakdownValueX = right;
      breakdownRows.forEach(([label, value], index) => {
        if (index === breakdownRows.length - 1) pdf.setFont("helvetica", "bold");
        pdf.text(String(label), breakdownLabelX, y);
        pdf.text(money(value), breakdownValueX, y, { align: "right" });
        y += 4.5;
      });
      pdf.setFont("helvetica", "normal");
      if (draft.breakdownDetails) {
        pdf.text(pdf.splitTextToSize(`Details: ${draft.breakdownDetails}`, 180), left, y);
        y += 4.5;
      }
      pdf.setFontSize(6.5);
      pdf.text(pdf.splitTextToSize(notes, tableWidth), left, y);
    }
  });
  pdf.save(`${title.replace(/\s+/g, "-")}-${draft.reference.replace(/[^a-z0-9_-]/gi, "-")}.pdf`);
}
