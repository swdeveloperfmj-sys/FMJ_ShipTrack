import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Box,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  ContactRound,
  Download,
  FileText,
  Globe2,
  LayoutDashboard,
  LogOut,
  MailCheck,
  Menu,
  MoreHorizontal,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ShieldCheck,
  Ship,
  Settings,
  Moon,
  Sun,
  TrendingUp,
  Upload,
  Users,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { api } from "./api.js";

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { label: "To be TT", icon: CircleDollarSign, key: "to-be-tt" },
  { label: "TT Sent", icon: CheckCircle2, key: "tt-sent" },
  { label: "Under Clearing Shipments", icon: ArrowDownToLine, key: "under-clearing" },
  { label: "Cleared Shipments", icon: PackageCheck, key: "cleared-shipments" },
  { label: "Consignee Reports", icon: Building2, key: "companies" },
  { label: "Consignees", icon: ContactRound, key: "consignees" },
  { label: "Countries", icon: Globe2, key: "countries" },
  { label: "Material analysis", icon: Box, key: "materials" },
  { label: "Post costing", icon: FileText, key: "post-costing" },
];
const reportNavigation = [
  { label: "SHIPMENT", key: "report-shipment" },
  { label: "Cleared", key: "report-cleared" },
  { label: "FMJ", key: "report-fmj", consigneeName: "FMJ" },
  { label: "JD", key: "report-jd", consigneeName: "JD" },
  { label: "RLA", key: "report-rla", consigneeName: "RLA" },
  { label: "AOP", key: "report-aop", consigneeName: "AOP" },
  { label: "UB", key: "report-ub", consigneeName: "UB" },
];
const userAccessOptions = [
  ...navigation.map(({ key, label }) => ({ key, label })),
  { key: "reports", label: "Reports & Analytics" },
  { key: "settings", label: "Settings" },
];

const consigneeColorPresets = [
  { name: "Blue", value: "#2865db" },
  { name: "Violet", value: "#7655d8" },
  { name: "Green", value: "#16845b" },
  { name: "Rose", value: "#cf4568" },
  { name: "Amber", value: "#b76a12" },
  { name: "Slate", value: "#475569" },
];
const defaultConsigneeColor = consigneeColorPresets[0].value;
function consigneeColorFor(code, consignees) {
  const consignee = consignees.find((item) => item.code === code);
  if (!consignee) return "#64748b";
  return /^#[0-9a-f]{6}$/i.test(consignee.color || "") ? consignee.color : defaultConsigneeColor;
}
const shipmentStatuses = ["Pending", "Under Clearing", "Cleared"];
const documentTypes = ["PI", "CI", "Packing List", "BL/AWB", "Customs"];
const emptyShipment = {
  importNo: "",
  company: "",
  supplier: "",
  country: "",
  consignee: "",
  description: "",
  transportMode: "",
  incoterm: "",
  incotermLocation: "",
  fclLcl: "",
  containerSize: "",
  remarks: "",
  currency: "USD",
  etd: "",
  eta: "",
  arrivalDate: "",
  deliveryDate: "",
  status: "Pending",
  paymentMethod: "Advance TT",
  paymentTerms: "",
  paymentTermType: "",
  paymentTermDays: "",
  paymentStatus: "Pending",
  advanceTT: 0,
  sightLC: 0,
  usanceLC: 0,
  duty: 0,
  doCharges: 0,
  clearanceStatus: "Not started",
  totalCost: 0,
  payments: [],
  adjustments: [],
  documents: Object.fromEntries(documentTypes.map((name) => [name, "Pending"])),
};

const importHeaderAliases = {
  "imp no": "importNo", "import no": "importNo", consignee: "consignee", shipper: "supplier",
  "item descreption": "description", "item description": "description", "fcl lcl": "shippingType",
  value: "value", etd: "etd", "eta cmb": "eta", duty: "duty", do: "doCharges", remarks: "remarks",
};
const normalizeImportHeader = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const importText = (value) => value === null || value === undefined ? "" : String(value).trim();
const importDate = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}` : "";
  }
  const text = importText(value);
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};
const importAmount = (value) => Number(String(value || "").replace(/[^0-9.-]/g, "")) || 0;
const importValue = (value) => {
  const text = importText(value).toUpperCase();
  const match = text.match(/([A-Z]{3})\s*\.?\s*([0-9][0-9,]*(?:\.\d+)?)/);
  return { currency: match?.[1] || "USD", totalCost: match ? Number(match[2].replaceAll(",", "")) : importAmount(value) };
};

function parseShipmentWorkbook(file, consignees, existingShipments) {
  const workbook = XLSX.read(file, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeImportHeader(cell) === "imp no"));
  if (headerIndex < 0) throw new Error('Could not find the "Imp No." header row in this workbook.');
  const headers = rows[headerIndex].map((header) => importHeaderAliases[normalizeImportHeader(header)] || "");
  const sourceTitle = rows.slice(0, headerIndex).flat().map(importText).join(" ").toLowerCase();
  let importSection = sourceTitle.includes("cleared") ? "cleared" : sourceTitle.includes("under clearing") ? "under-clearing" : sourceTitle.includes("tt sent") ? "tt-sent" : "to-be-tt";
  const existingImportNos = new Set(existingShipments.map((shipment) => String(shipment.importNo).trim().toUpperCase()));
  const workbookImportNos = new Set();
  return rows.slice(headerIndex + 1).map((row, index) => {
    const rowText = row.map(importText).join(" ").toLowerCase();
    if (/^\s*tt\s+sent\s*$/.test(rowText)) { importSection = "tt-sent"; return null; }
    if (/^\s*to\s+be\s+tt\s*$/.test(rowText)) { importSection = "to-be-tt"; return null; }
    if (/^\s*under\s+clearing\s+shipment\s*$/.test(rowText)) { importSection = "under-clearing"; return null; }
    if (/^\s*cleared(?:\s+shipments?)?\s*$/.test(rowText)) { importSection = "cleared"; return null; }
    const values = Object.fromEntries(headers.map((key, column) => [key, row[column]]).filter(([key]) => key));
    if (!importText(values.importNo) && !importText(values.supplier) && !importText(values.description)) return null;
    const errors = [];
    const importNo = importText(values.importNo);
    const consigneeName = importText(values.consignee);
    const consignee = consignees.find((item) => item.code.toLowerCase() === consigneeName.toLowerCase() || item.name.toLowerCase() === consigneeName.toLowerCase());
    if (!importNo) errors.push("Missing import number");
    const normalizedImportNo = importNo.toUpperCase();
    if (existingImportNos.has(normalizedImportNo)) errors.push("Import number already exists");
    if (importNo && workbookImportNos.has(normalizedImportNo)) errors.push("Import number is repeated in this workbook");
    if (importNo) workbookImportNos.add(normalizedImportNo);
    if (!consignee) errors.push(`Consignee not found: ${consigneeName || "blank"}`);
    if (!importText(values.supplier)) errors.push("Missing shipper");
    if (!importText(values.description)) errors.push("Missing item description");
    const shippingType = importText(values.shippingType).toUpperCase();
    const transportMode = shippingType.includes("AIR") ? "AIR" : "SEA";
    const fclLcl = shippingType.includes("FCL") ? "FCL" : shippingType.includes("LCL") ? "LCL" : "";
    // Some historical schedules contain the common "ceared" typo.  Correct it
    // only while importing a Cleared section so it continues to satisfy the
    // workflow's explicit cleared-remark rule without losing the full note.
    let remarks = importText(values.remarks);
    if (importSection === "cleared") remarks = remarks.replace(/\bceared\b/gi, "cleared");
    const termMatch = remarks.match(/\b(CIP|CPT|FCA|EXW|CIF|CFR|FOB|C&F)\b/i);
    const incoterm = termMatch?.[1]?.toUpperCase() === "C&F" ? "CFR" : termMatch?.[1]?.toUpperCase() || "";
    const validTerms = transportMode === "AIR" ? ["CIP", "CPT", "FCA", "EXW"] : ["CIF", "CFR", "FOB", "EXW"];
    if (!validTerms.includes(incoterm)) errors.push(`Could not identify a valid ${transportMode} Incoterm from remarks`);
    const locationMatch = remarks.match(/\b(?:FCA|EXW|FOB)\s*[- ]\s*([A-Za-z]+)/i);
    const incotermLocation = ["CIP", "CPT", "CIF", "CFR"].includes(incoterm) ? "Colombo, Sri Lanka" : locationMatch?.[1] || "";
    if (["FCA", "FOB", "EXW"].includes(incoterm) && !incotermLocation) errors.push("Missing Incoterm country/location");
    const { currency, totalCost } = importValue(values.value);
    const workflow = importSection === "cleared" ? { status: "Cleared", clearanceStatus: "Cleared", paymentStatus: "Paid" } : importSection === "under-clearing" ? { status: "Under Clearing", paymentStatus: "Paid" } : importSection === "tt-sent" ? { status: "Pending", paymentStatus: "Paid" } : { status: "Pending", paymentStatus: "Pending" };
    return { row: headerIndex + index + 2, errors, shipment: { ...emptyShipment, importNo, company: consignee?.code || "", consignee: consignee?.name || consigneeName, supplier: importText(values.supplier), description: importText(values.description), transportMode, fclLcl, incoterm, incotermLocation, currency, totalCost, etd: importDate(values.etd), eta: importDate(values.eta), duty: importAmount(values.duty), doCharges: importAmount(values.doCharges), remarks, paymentMethod: "Advance TT", paymentTerms: "ADVANCE_TT", ...workflow } };
  }).filter(Boolean);
}

const materialMonthNumbers = { JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4, MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7, AUG: 8, AUGUST: 8, SEP: 9, SEPT: 9, SEPTEMBER: 9, OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11, DEC: 12, DECEMBER: 12 };

function parseMaterialWorkbook(file) {
  const workbook = XLSX.read(file, { type: "array", cellDates: true });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "", raw: true });
  const yearCell = rows.flat().find((value) => /^20\d{2}$/.test(String(value).trim()));
  const year = Number(yearCell) || new Date().getFullYear();
  const totals = new Map();
  for (let companyRowIndex = 1; companyRowIndex < rows.length; companyRowIndex += 1) {
    const companyRow = rows[companyRowIndex];
    const companyColumns = companyRow.map((value, column) => ({ column, value: String(value || "").trim().toUpperCase() })).filter(({ value }) => /^(FMJ|AOP|RLA?|JD|UB)$/.test(value));
    if (companyColumns.length < 2) continue;
    const materialRow = rows[companyRowIndex - 1] || [];
    for (let rowIndex = companyRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const monthNumber = materialMonthNumbers[String(row?.[0] || "").trim().toUpperCase()];
      if (!monthNumber) {
        if (rowIndex > companyRowIndex + 1 && row?.some((value) => materialMonthNumbers[String(value || "").trim().toUpperCase()])) break;
        continue;
      }
      const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
      for (const { column } of companyColumns) {
        const quantity = Number(row[column]);
        if (!Number.isFinite(quantity) || quantity < 0) continue;
        let materialName = "";
        for (let materialColumn = column; materialColumn >= 0; materialColumn -= 1) {
          const candidate = String(materialRow[materialColumn] || "").trim();
          if (candidate && candidate !== String(year)) { materialName = candidate.replace(/\s+/g, " "); break; }
        }
        if (!materialName) continue;
        if (!totals.has(materialName)) totals.set(materialName, new Map());
        const materialMonths = totals.get(materialName);
        materialMonths.set(month, (materialMonths.get(month) || 0) + quantity);
      }
    }
  }
  const materials = [...totals].map(([name, months]) => ({
    name,
    unit: "MT",
    monthlyPurchases: [...months].map(([month, quantity]) => ({ month, quantity })).sort((a, b) => a.month.localeCompare(b.month)),
  }));
  if (!materials.length) throw new Error("No monthly material purchase rows were found in this workbook.");
  return materials;
}

function materialForecast(material) {
  const activeMonths = [...(material.monthlyPurchases || [])].filter((entry) => Number(entry.quantity) > 0).sort((a, b) => a.month.localeCompare(b.month)).slice(-3).reverse();
  const baseWeights = [0.5, 0.3, 0.2].slice(0, activeMonths.length);
  const weightTotal = baseWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  const forecast = activeMonths.reduce((sum, entry, index) => sum + Number(entry.quantity) * baseWeights[index], 0) / weightTotal;
  const available = Number(material.currentStock || 0) + Number(material.onOrder || 0);
  const target = forecast * (Number(material.leadTimeDays || 30) / 30 + Number(material.safetyStockMonths ?? 0.5));
  const recommended = Math.max(0, target - available);
  const coverage = forecast > 0 ? available / forecast : null;
  const leadDemand = forecast * Number(material.leadTimeDays || 30) / 30;
  const status = !forecast ? "No history" : available < leadDemand ? "Critical" : recommended > 0 ? "Reorder" : "Healthy";
  return { forecast, recommended, coverage, status };
}

const money = (value) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const decimalAmount = (value) =>
  Number(value || 0).toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const currencyAmount = (value, currency) => `${currency || "LKR"}.${decimalAmount(value)}`;

function paymentSummary(shipment) {
  const payments = Array.isArray(shipment.payments) ? shipment.payments : [];
  const adjustments = Array.isArray(shipment.adjustments) ? shipment.adjustments : [];
  const adjustmentTotal = adjustments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const finalPayable = Math.max(0, Number(shipment.totalCost || 0) + adjustmentTotal);
  const hasLedger = payments.length > 0 || adjustments.length > 0;
  const recordedPaid = payments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalPaid = !hasLedger && shipment.paymentStatus === "Paid" ? finalPayable : recordedPaid;
  const balance = finalPayable - totalPaid;
  const status = totalPaid <= 0 ? "Unpaid" : balance > 0.005 ? "Partially Paid" : balance < -0.005 ? "Overpaid" : "Fully Paid";
  return { adjustmentTotal, finalPayable, totalPaid, balance, status };
}

const hasOutstandingPayment = (shipment) => {
  const summary = paymentSummary(shipment);
  return summary.balance > 0.005 || (summary.finalPayable === 0 && shipment.paymentStatus !== "Paid");
};

const formatDate = (value) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    : "";

const dateLabel = (value) => formatDate(value) || "—";

const openDatePicker = (event) => {
  try {
    event.currentTarget.showPicker?.();
  } catch {
    // Browsers without showPicker keep their native date-input behavior.
  }
};

function DatePickerField({ name, value, onChange, label }) {
  return <span className="date-picker-field">
    <input name={name} type="date" value={value} onClick={openDatePicker} onChange={onChange} aria-label={label} />
    <span aria-hidden="true">{formatDate(value) || "dd/mm/yyyy"}</span>
  </span>;
}

const paymentTermsLabel = (shipment) => {
  const labels = {
    ADVANCE_TT: "TT",
    DA_BL: "DA - From date of BL",
    DP_SIGHT: "DP of Sight",
    OPEN_ACCOUNT: "Open account",
  };
  if (shipment.paymentTerms === "LETTER_OF_CREDIT") {
    return shipment.paymentTermType
      ? `${shipment.paymentTermType} LC${shipment.paymentTermDays ? ` (${shipment.paymentTermDays} days)` : ""}`
      : "Letter of credit";
  }
  const label = labels[shipment.paymentTerms] || shipment.paymentMethod || "—";
  return shipment.paymentTermDays && shipment.paymentTerms !== "ADVANCE_TT"
    ? `${label} (${shipment.paymentTermDays} days)`
    : label;
};

const transportLabel = (shipment) =>
  [shipment.transportMode, shipment.fclLcl, shipment.containerSize].filter(Boolean).join(" / ") || "—";

function exportPendingTTToExcel(shipments) {
  const rows = shipments.map((shipment) => {
    const payment = paymentSummary(shipment);
    return ({
    "Import No.": shipment.importNo,
    Consignee: shipment.consignee || shipment.company,
    Shipper: shipment.supplier,
    "Item Description": shipment.description,
    "FCL/LCL": transportLabel(shipment),
    "Payment Terms": paymentTermsLabel(shipment),
    Currency: shipment.currency || "LKR",
    "Invoice Value": Number(shipment.totalCost || 0),
    Adjustments: payment.adjustmentTotal,
    "Final Payable": payment.finalPayable,
    "Total Paid": payment.totalPaid,
    Balance: payment.balance,
    "Payment Status": payment.status,
    ETD: shipment.etd ? new Date(`${shipment.etd}T00:00:00`) : "",
    "ETA CMB": shipment.eta ? new Date(`${shipment.eta}T00:00:00`) : "",
    "Duty (LKR)": Number(shipment.duty || 0),
    "DO (LKR)": Number(shipment.doCharges || 0),
    Remarks: shipment.remarks || "",
    });
  });
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const lastRow = rows.length + 1;
  worksheet["!autofilter"] = { ref: `A1:R${lastRow}` };
  worksheet["!cols"] = [
    { wch: 16 }, { wch: 24 }, { wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 30 },
    { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 18 },
    { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 34 },
  ];
  for (let index = 2; index <= lastRow; index += 1) {
    for (const column of ["H", "I", "J", "K", "L", "P", "Q"]) if (worksheet[`${column}${index}`]) worksheet[`${column}${index}`].z = "0.00";
    for (const column of ["N", "O"]) if (worksheet[`${column}${index}`]) worksheet[`${column}${index}`].z = "dd/mm/yyyy";
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Pending TT");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `pending-tt-payments-${stamp}.xlsx`, { compression: true });
}

function downloadShipmentImportTemplate() {
  const headers = ["Imp No.", "Consignee", "Shipper", "Item Description", "FCL/LCL", "Value", "ETD", "ETA CMB", "Duty", "DO", "Remarks"];
  const worksheet = XLSX.utils.aoa_to_sheet([headers]);
  worksheet["!autofilter"] = { ref: "A1:K1" };
  worksheet["!cols"] = [
    { wch: 16 }, { wch: 24 }, { wch: 30 }, { wch: 32 }, { wch: 14 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 44 },
  ];

  const instructions = XLSX.utils.aoa_to_sheet([
    ["Shipment import template"],
    ["Complete one shipment per row on the Shipment Import sheet."],
    ["Required: Imp No., Consignee, Shipper, Item Description, FCL/LCL and Remarks."],
    ["Consignee must match an existing consignee code or name in ShipTrack."],
    ["FCL/LCL must include SEA or AIR (for example: SEA FCL, SEA LCL, or AIR)."],
    ["Remarks must include a valid Incoterm: SEA uses CIF, CFR, FOB or EXW; AIR uses CIP, CPT, FCA or EXW."],
    ["For FOB, FCA and EXW, include the origin location in Remarks (for example: FOB - Shanghai)."],
    ["Value can be a number or include its currency (for example: USD 1,250.00). Dates use dd/mm/yyyy."],
  ]);
  instructions["!cols"] = [{ wch: 118 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Shipment Import");
  XLSX.utils.book_append_sheet(workbook, instructions, "Instructions");
  XLSX.writeFile(workbook, "shiptrack-shipment-import-template.xlsx", { compression: true });
}

function StatusBadge({ children, tone }) {
  const value = String(children || "Pending").toLowerCase().replaceAll(" ", "-");
  return <span className={`badge ${tone || value}`}>{children}</span>;
}

function ConsigneeBadge({ code, label, showName = false, consignees = [] }) {
  const consignee = consignees.find((item) => item.code === code);
  const color = consigneeColorFor(code, consignees);
  const displayLabel = showName ? consignee?.name || label || code : label || code;
  return <span className="company-tag consignee-color-tag" style={{ "--consignee-color": color }}>{displayLabel}</span>;
}

function PageTitle({ eyebrow, title, subtitle, action }) {
  return (
    <div className="page-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, helper, icon: Icon, color, trend, onClick }) {
  return (
    <article className={`stat-card ${onClick ? "stat-card-clickable" : ""}`} onClick={onClick} onKeyDown={(event) => { if (onClick && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onClick(); } }} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}>
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}><Icon size={18} /></span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-helper">
        {trend && <span className="trend"><ArrowUpRight size={13} /> {trend}</span>}
        {helper}
      </div>
    </article>
  );
}

function EmptyState({ message = "No shipments found", description, actionLabel, onAdd }) {
  return <div className="empty-state"><Box size={25} /><strong>{message}</strong><span>{description || (onAdd ? "Add a shipment to start tracking your real import data." : "Try changing your filters or add a shipment.")}</span>{onAdd && <button className="button primary empty-add-button" onClick={onAdd}><Plus size={15} /> {actionLabel || "Add shipment"}</button>}</div>;
}

function ShipmentActions({ shipment, onEdit, onDelete, onPayments }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function removeShipment() {
    setDeleting(true);
    try {
      await onDelete(shipment);
      setConfirming(false);
    } finally {
      setDeleting(false);
    }
  }

  return <div className="shipment-actions" onClick={(event) => event.stopPropagation()}>
    <button className="icon-button row-more" aria-label={`Actions for ${shipment.importNo}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((current) => !current)}><MoreHorizontal size={18} /></button>
    {open && <div className="shipment-action-menu" role="menu">
      <button role="menuitem" onClick={() => { setOpen(false); onEdit(shipment); }}>Edit shipment</button>
      {onPayments && <button role="menuitem" onClick={() => { setOpen(false); onPayments(shipment); }}>Payments & adjustments</button>}
      <button className="shipment-action-delete" role="menuitem" onClick={() => { setOpen(false); setConfirming(true); }}>Delete shipment</button>
    </div>}
    {confirming && <div className="delete-confirm-backdrop" role="presentation">
      <section className="delete-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`delete-title-${shipment.id}`} aria-describedby={`delete-description-${shipment.id}`}>
        <h2 id={`delete-title-${shipment.id}`}>Delete shipment?</h2>
        <p id={`delete-description-${shipment.id}`}>Are you sure you want to delete <strong>{shipment.importNo}</strong>? This cannot be undone.</p>
        <div className="delete-confirm-actions">
          <button className="button secondary" onClick={() => setConfirming(false)} disabled={deleting}>Cancel</button>
          <button className="button delete-confirm" onClick={removeShipment} disabled={deleting}>{deleting ? "Deleting…" : "Delete shipment"}</button>
        </div>
      </section>
    </div>}
  </div>;
}

function sortShipmentsByConsignee(rows = [], consignees = []) {
  if (!Array.isArray(rows) || !rows.length) return [];
  const consigneeOrder = new Map(
    consignees.map((c, index) => [(c.code || "").trim().toUpperCase(), index]),
  );
  return [...rows].sort((a, b) => {
    const compA = (a.company || "").trim().toUpperCase();
    const compB = (b.company || "").trim().toUpperCase();
    if (compA !== compB) {
      if (!compA) return 1;
      if (!compB) return -1;
      const orderA = consigneeOrder.has(compA) ? consigneeOrder.get(compA) : 999999;
      const orderB = consigneeOrder.has(compB) ? consigneeOrder.get(compB) : 999999;
      if (orderA !== orderB) return orderA - orderB;
      return compA.localeCompare(compB, undefined, { numeric: true });
    }
    const createdA = a.createdAt || "";
    const createdB = b.createdAt || "";
    if (createdA && createdB) {
      return createdB.localeCompare(createdA);
    }
    return (a.importNo || "").localeCompare(b.importNo || "", undefined, { numeric: true });
  });
}

function InlineEditCell({ shipment, field, value, children, onSave, type = "text", options = [], className, buildPatch }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);
  const saveInFlightRef = useRef(false);

  useEffect(() => { if (!editing) setDraft(value ?? ""); }, [value, editing]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function commit(nextValue = draft) {
    if (saveInFlightRef.current) return;
    const normalized = type === "number" ? Number(nextValue || 0) : nextValue;
    if (String(normalized) === String(value ?? "")) { setEditing(false); return; }
    saveInFlightRef.current = true;
    setSaving(true);
    try {
      await onSave(shipment, buildPatch ? buildPatch(normalized) : { [field]: normalized });
      setEditing(false);
    } catch (error) {
      window.alert(error.message || "Unable to save this cell.");
      inputRef.current?.focus();
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  }

  return <td className={`${className || ""} ${editing ? "inline-editing" : "inline-editable"}`.trim()} onDoubleClick={(event) => { event.stopPropagation(); setEditing(true); }} title={editing ? undefined : `${value || "Empty"} — double-click to edit`}>
    {editing ? (type === "select"
      ? <select ref={inputRef} value={draft} disabled={saving} onChange={(event) => { setDraft(event.target.value); commit(event.target.value); }} onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); }} onBlur={() => { if (!saving) setEditing(false); }}>{options.map((option) => <option key={typeof option === "string" ? option : option.value} value={typeof option === "string" ? option : option.value}>{typeof option === "string" ? option : option.label}</option>)}</select>
      : <input ref={inputRef} type={type} value={draft} disabled={saving} onClick={type === "date" ? openDatePicker : undefined} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") commit(); if (event.key === "Escape") setEditing(false); }} onBlur={() => commit()} />)
      : children}
  </td>;
}

function ShipmentTable({ rows, mode, onEdit, onDelete, onAdd, onTTSent, onUnderClearing, onCleared, onPayments, onCellSave, showActions = true, consignees = [], groupByConsignee = true }) {
  const [contextMenu, setContextMenu] = useState(null);
  const displayRows = useMemo(() => {
    return groupByConsignee ? sortShipmentsByConsignee(rows, consignees) : rows;
  }, [rows, consignees, groupByConsignee]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    const close = () => setContextMenu(null);
    const closeOnEscape = (event) => { if (event.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  function openContextMenu(event, shipment) {
    if (mode !== "payments" || !showActions) return;
    event.preventDefault();
    const menuWidth = 190;
    const menuHeight = onPayments ? 126 : 90;
    setContextMenu({
      shipment,
      x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
    });
  }

  function openCellEditor(event, shipment) {
    if (mode === "payments" || !onEdit || event.target.closest("button, a, input, select, textarea")) return;
    onEdit(shipment);
  }

  if (!displayRows.length) return <EmptyState message={mode === "shipments" ? "No shipment records yet" : "No shipments found"} onAdd={onAdd} />;
  if (mode === "payment-cards") return (
    <div className="payment-details-list">
      {displayRows.map((shipment) => {
        const incoterm = shipment.incoterm || "—";
        return <article className="payment-detail-card" key={shipment.id}>
          <header className="payment-detail-card-head">
            <div><span className="payment-detail-label">Import no.</span><strong>{shipment.importNo}</strong></div>
            <div className="payment-detail-card-actions"><StatusBadge>{shipment.paymentStatus || "Pending"}</StatusBadge><ShipmentActions shipment={shipment} onEdit={onEdit} onDelete={onDelete} /></div>
          </header>
          <div className="payment-detail-grid">
            <div><span>Consignee</span><strong>{shipment.consignee || shipment.company || "—"}</strong><small>{shipment.company || "—"}</small></div>
            <div><span>Shipper</span><strong>{shipment.supplier || "—"}</strong></div>
            <div><span>Item description</span><strong>{shipment.description || "—"}</strong></div>
            <div><span>Transport</span><strong>{transportLabel(shipment)}</strong></div>
            <div><span>Incoterm</span><strong>{incoterm}</strong></div>
            <div><span>Payment terms</span><strong>{paymentTermsLabel(shipment)}</strong></div>
            <div><span>Shipment value</span><strong>{currencyAmount(shipment.totalCost, shipment.currency)}</strong></div>
            <div><span>ETD</span><strong>{dateLabel(shipment.etd)}</strong></div>
            <div><span>ETA CMB</span><strong>{dateLabel(shipment.eta)}</strong></div>
            <div><span>Arrival date</span><strong>{dateLabel(shipment.arrivalDate)}</strong></div>
            <div><span>Delivery date</span><strong>{dateLabel(shipment.deliveryDate)}</strong></div>
            <div><span>Duty (LKR)</span><strong>{decimalAmount(shipment.duty)}</strong></div>
            <div><span>DO charges (LKR)</span><strong>{decimalAmount(shipment.doCharges)}</strong></div>
            <div><span>Clearance status</span><strong>{shipment.clearanceStatus || "—"}</strong></div>
            <div className="payment-detail-remarks"><span>Remarks</span><strong>{shipment.remarks || "—"}</strong></div>
          </div>
        </article>;
      })}
    </div>
  );
  const headers = {
    shipments: ["Import No.", "Consignee", "Shipper", "Consignee name", "Description", "ETA", "Status", ""],
    tracking: ["Import No.", "Shipper", "ETD", "ETA", "Arrival", "Delivery", "Status", ""],
    payments: ["Import No.", "Consignee", "Shipper", "Item description", "Transport", "Incoterm", "Payment terms", "Invoice", "Paid", "Balance", "Payment status", "ETD", "ETA CMB", "Duty (LKR)", "DO (LKR)", "Clearance", "Remarks", ""],
    customs: ["Import No.", "Consignee", "Duty", "DO charges", "Clearance progress", "Clearance status", "Shipment status", ""],
  }[mode];
  const workflowAction = onTTSent ? { label: "TT Sent", onClick: onTTSent } : onUnderClearing ? { label: "Under Clearing", onClick: onUnderClearing } : onCleared ? { label: "Cleared", onClick: onCleared } : null;
  const visibleHeaders = mode === "payments"
    ? [headers[0], ...(workflowAction ? [workflowAction.label] : []), ...headers.slice(1, -1)]
    : workflowAction ? [...headers.slice(0, -1), workflowAction.label, ""] : headers;
  const tableHeaders = mode === "payments" || showActions ? visibleHeaders : visibleHeaders.slice(0, -1);

  return (
    <div className="table-scroll">
      <table className={mode === "payments" ? "payments-table" : undefined}>
        <thead><tr>{tableHeaders.map((header, index) => <th key={`${header}-${index}`} className={header === "Shipper" ? "shipper-header" : header === "Item description" ? "description-header" : undefined}>{header}</th>)}</tr></thead>
        <tbody>
          {displayRows.map((shipment, index) => {
            const isGroupStart = index > 0 && (shipment.company || "").trim().toUpperCase() !== (displayRows[index - 1]?.company || "").trim().toUpperCase();
            const payment = paymentSummary(shipment);
            return (
              <tr key={shipment.id} className={`${isGroupStart ? "consignee-group-start " : ""}${mode === "payments" && showActions ? "context-menu-row editable-data-row" : "editable-data-row"}`.trim() || undefined} onContextMenu={(event) => openContextMenu(event, shipment)} onDoubleClick={(event) => openCellEditor(event, shipment)} title="Double-click a cell to edit this shipment">
                {mode === "shipments" && <>
                  <td className="consignee-row-first" style={{ "--consignee-color": consigneeColorFor(shipment.company, consignees) }}><span className="import-id">{shipment.importNo}</span><small>{shipment.description}</small></td>
                  <td><ConsigneeBadge code={shipment.company} consignees={consignees} /></td>
                  <td className="shipper-cell">{shipment.supplier}</td><td>{shipment.consignee}</td>
                  <td className="description-cell">{shipment.description}</td><td>{dateLabel(shipment.eta)}</td>
                  <td><StatusBadge>{shipment.status}</StatusBadge></td>
                </>}
                {mode === "tracking" && <>
                  <td className="consignee-row-first" style={{ "--consignee-color": consigneeColorFor(shipment.company, consignees) }}><span className="import-id">{shipment.importNo}</span><small><ConsigneeBadge code={shipment.company} consignees={consignees} /></small></td>
                  <td className="shipper-cell">{shipment.supplier}</td><td>{dateLabel(shipment.etd)}</td><td>{dateLabel(shipment.eta)}</td>
                  <td>{dateLabel(shipment.arrivalDate)}</td><td>{dateLabel(shipment.deliveryDate)}</td><td><StatusBadge>{shipment.status}</StatusBadge></td>
                </>}
                {mode === "payments" && <>
                  <InlineEditCell shipment={shipment} field="importNo" value={shipment.importNo} onSave={onCellSave} className="consignee-row-first"><span className="import-id">{shipment.importNo}</span></InlineEditCell>
                  {workflowAction && <td><button type="button" className="tt-sent-update-button" onClick={() => workflowAction.onClick(shipment)}>{workflowAction.label}</button></td>}
                  <InlineEditCell shipment={shipment} field="company" value={shipment.company} onSave={onCellSave} type="select" options={consignees.map((item) => ({ value: item.code, label: item.name }))} buildPatch={(company) => ({ company, consignee: consignees.find((item) => item.code === company)?.name || shipment.consignee })}><ConsigneeBadge code={shipment.company} label={shipment.consignee || shipment.company || "—"} showName consignees={consignees} /></InlineEditCell>
                  <InlineEditCell shipment={shipment} field="supplier" value={shipment.supplier} onSave={onCellSave} className="shipper-cell">{shipment.supplier || "—"}</InlineEditCell>
                  <InlineEditCell shipment={shipment} field="description" value={shipment.description} onSave={onCellSave} className="description-cell">{shipment.description || "—"}</InlineEditCell>
                  <InlineEditCell shipment={shipment} field="transportMode" value={shipment.transportMode} onSave={onCellSave} type="select" options={["AIR", "SEA"]}>{transportLabel(shipment)}</InlineEditCell>
                  <InlineEditCell shipment={shipment} field="incoterm" value={shipment.incoterm} onSave={onCellSave} type="select" options={shipment.transportMode === "AIR" ? ["CIP", "CPT", "FCA", "EXW"] : ["CIF", "CFR", "FOB", "EXW"]} buildPatch={(incoterm) => ({ incoterm, incotermLocation: ["CIP", "CPT", "CIF", "CFR"].includes(incoterm) ? "Colombo, Sri Lanka" : shipment.incotermLocation === "Colombo, Sri Lanka" ? "" : shipment.incotermLocation })}>{shipment.incoterm || "—"}</InlineEditCell>
                  <InlineEditCell shipment={shipment} field="paymentTerms" value={shipment.paymentTerms} onSave={onCellSave} type="select" options={[{ value: "ADVANCE_TT", label: "TT" }, { value: "LETTER_OF_CREDIT", label: "Letter of credit" }, { value: "DA_BL", label: "DA - From date of BL" }, { value: "DP_SIGHT", label: "DP of Sight" }, { value: "OPEN_ACCOUNT", label: "Open account" }]} buildPatch={(paymentTerms) => ({ paymentTerms, paymentMethod: paymentTerms === "ADVANCE_TT" ? "Advance TT" : paymentTerms === "LETTER_OF_CREDIT" ? "Sight LC" : paymentTerms === "DA_BL" ? "DA - From date of BL" : paymentTerms === "DP_SIGHT" ? "DP of Sight" : "Open account", paymentTermType: paymentTerms === "LETTER_OF_CREDIT" ? "Sight" : "", paymentTermDays: ["DA_BL", "OPEN_ACCOUNT"].includes(paymentTerms) ? 30 : "" })}>{paymentTermsLabel(shipment)}</InlineEditCell>
                  <InlineEditCell shipment={shipment} field="totalCost" value={shipment.totalCost} onSave={onCellSave} type="number">{currencyAmount(payment.finalPayable, shipment.currency)}</InlineEditCell>
                  <td>{currencyAmount(payment.totalPaid, shipment.currency)}</td><td>{currencyAmount(payment.balance, shipment.currency)}</td><td><StatusBadge>{payment.status}</StatusBadge></td>
                  <InlineEditCell shipment={shipment} field="etd" value={shipment.etd} onSave={onCellSave} type="date">{dateLabel(shipment.etd)}</InlineEditCell>
                  <InlineEditCell shipment={shipment} field="eta" value={shipment.eta} onSave={onCellSave} type="date">{dateLabel(shipment.eta)}</InlineEditCell>
                  <InlineEditCell shipment={shipment} field="duty" value={shipment.duty} onSave={onCellSave} type="number">{decimalAmount(shipment.duty)}</InlineEditCell>
                  <InlineEditCell shipment={shipment} field="doCharges" value={shipment.doCharges} onSave={onCellSave} type="number">{decimalAmount(shipment.doCharges)}</InlineEditCell>
                  <InlineEditCell shipment={shipment} field="clearanceStatus" value={shipment.clearanceStatus} onSave={onCellSave}>{shipment.clearanceStatus || "—"}</InlineEditCell>
                  <InlineEditCell shipment={shipment} field="remarks" value={shipment.remarks} onSave={onCellSave} className="remarks-cell">{shipment.remarks || "—"}</InlineEditCell>
                </>}
                {mode === "customs" && <>
                  <td className="consignee-row-first" style={{ "--consignee-color": consigneeColorFor(shipment.company, consignees) }}><span className="import-id">{shipment.importNo}</span><small>{shipment.supplier}</small></td>
                  <td><ConsigneeBadge code={shipment.company} consignees={consignees} /></td><td>{money(shipment.duty)}</td>
                  <td>{money(shipment.doCharges)}</td><td><span className="progress-copy">{shipment.clearanceStatus}</span></td>
                  <td><StatusBadge tone={shipment.clearanceStatus === "Cleared" ? "cleared" : "under-clearing"}>{shipment.clearanceStatus}</StatusBadge></td>
                  <td><StatusBadge>{shipment.status}</StatusBadge></td>
                </>}
                {showActions && mode !== "payments" && <td><button className="icon-button row-more" aria-label={`Edit ${shipment.importNo}`} title="Edit shipment" onClick={() => onEdit(shipment)}><MoreHorizontal size={18} /></button></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {contextMenu && <div className="shipment-action-menu shipment-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} role="menu" onPointerDown={(event) => event.stopPropagation()}>
        <button role="menuitem" onClick={() => { onEdit(contextMenu.shipment); setContextMenu(null); }}>Edit shipment</button>
        {onPayments && <button role="menuitem" onClick={() => { onPayments(contextMenu.shipment); setContextMenu(null); }}>Payments & adjustments</button>}
        <button className="shipment-action-delete" role="menuitem" onClick={async () => { const shipment = contextMenu.shipment; setContextMenu(null); if (window.confirm(`Delete ${shipment.importNo}? This cannot be undone.`)) await onDelete(shipment); }}>Delete shipment</button>
      </div>}
    </div>
  );
}

const emptyShipmentFilters = { search: "", consignee: "", transportMode: "", fclLcl: "" };

function filterShipmentRows(rows, filters, consignees = []) {
  const search = filters.search.trim().toLowerCase();
  const filtered = rows.filter((shipment) => {
    const searchable = [shipment.importNo, shipment.consignee, shipment.company, shipment.supplier, shipment.description, shipment.remarks]
      .filter(Boolean).join(" ").toLowerCase();
    return (!search || searchable.includes(search))
      && (!filters.consignee || shipment.company === filters.consignee)
      && (!filters.transportMode || shipment.transportMode === filters.transportMode)
      && (!filters.fclLcl || shipment.fclLcl === filters.fclLcl);
  });
  return sortShipmentsByConsignee(filtered, consignees);
}

function ShipmentFilterControls({ filters, onChange, consignees, exportAction, exportDisabled }) {
  const update = (field, value) => onChange((current) => ({ ...current, [field]: value }));
  const hasFilters = Object.values(filters).some(Boolean);
  return <div className="table-actions tt-table-actions">
    <label className="table-search"><input value={filters.search} onChange={(event) => update("search", event.target.value)} placeholder="Search shipments" aria-label="Search shipments" /></label>
    <label className="filter-select filter-select--consignee"><select value={filters.consignee} onChange={(event) => update("consignee", event.target.value)} aria-label="Filter by consignee"><option value="">All consignees</option>{consignees.map((consignee) => <option key={consignee.id} value={consignee.code}>{consignee.name}</option>)}</select></label>
    <label className="filter-select filter-select--transport"><select value={filters.transportMode} onChange={(event) => update("transportMode", event.target.value)} aria-label="Filter by transport mode"><option value="">All transport</option><option value="AIR">Air</option><option value="SEA">Sea</option></select></label>
    <label className="filter-select filter-select--shipping-type"><select value={filters.fclLcl} onChange={(event) => update("fclLcl", event.target.value)} aria-label="Filter by FCL or LCL"><option value="">FCL / LCL</option><option value="FCL">FCL</option><option value="LCL">LCL</option></select></label>
    {hasFilters && <button type="button" className="button secondary compact-filter-button" onClick={() => onChange(() => ({ ...emptyShipmentFilters }))}>Clear filters</button>}
    {exportAction && <button className="button secondary export-button" onClick={exportAction} disabled={exportDisabled}><ArrowDownToLine size={15} /> Export Excel</button>}
  </div>;
}

function ShipmentListPage({ eyebrow, title, subtitle, rows, mode = "shipments", consignees, onEdit, onDelete, onAdd, onTTSent, onUnderClearing, onCleared, onPayments, onCellSave, showAdd = true, footer }) {
  const [filters, setFilters] = useState(emptyShipmentFilters);
  const filteredRows = filterShipmentRows(rows, filters, consignees);
  return <section className="shipment-list-page">
    <section className="panel table-panel">
      <div className="table-toolbar"><div className="table-title"><h2>{title}</h2><span className="count-pill">{filteredRows.length}</span></div><div className="pending-tt-toolbar-actions"><ShipmentFilterControls filters={filters} onChange={setFilters} consignees={consignees} />{showAdd && <button className="button primary" onClick={onAdd}><Plus size={15} /> Add shipment</button>}</div></div>
      <ShipmentTable rows={filteredRows} mode={mode} onEdit={onEdit} onDelete={onDelete} onAdd={showAdd ? onAdd : undefined} onTTSent={onTTSent} onUnderClearing={onUnderClearing} onCleared={onCleared} onPayments={onPayments} onCellSave={onCellSave} consignees={consignees} />
      <div className="table-footer"><span><strong>{filteredRows.length}</strong> of {rows.length} {footer || "shipments"}</span><span>Data saved automatically</span></div>
    </section>
  </section>;
}

function ShipmentSummarySections({ shipments, consignees, onEdit, onDelete, onPayments, onCellSave }) {
  const [filters, setFilters] = useState(emptyShipmentFilters);
  const filteredShipments = filterShipmentRows(shipments, filters, consignees);
  const underClearing = filteredShipments.filter((shipment) => shipment.status === "Under Clearing");
  const ttSent = filteredShipments.filter((shipment) =>
    shipment.status !== "Under Clearing"
    && shipment.paymentMethod === "Advance TT"
    && shipment.paymentStatus === "Paid"
    && shipment.status === "Pending",
  );
  const toBeTT = filteredShipments.filter((shipment) =>
    shipment.status !== "Under Clearing"
    && hasOutstandingPayment(shipment),
  );
  const sections = [
    ["Under Clearing Shipment", underClearing],
    ["TT SENT", ttSent],
    ["To be TT", toBeTT],
  ];

  return <>
    <section className="panel table-panel shipment-summary-filter"><div className="table-toolbar"><div className="table-title"><h2>Filters</h2><span className="count-pill">{filteredShipments.length}</span></div><ShipmentFilterControls filters={filters} onChange={setFilters} consignees={consignees} /></div></section>
    <div className="shipment-summary-sections">
      {sections.map(([title, rows]) => <section className="panel table-panel" key={title}>
        <div className="table-toolbar"><div className="table-title"><h2>{title}</h2><span className="count-pill">{rows.length}</span></div></div>
        <ShipmentTable rows={rows} mode="payments" onEdit={onEdit} onDelete={onDelete} onPayments={onPayments} onCellSave={onCellSave} consignees={consignees} />
        <div className="table-footer"><span><strong>{rows.length}</strong> {rows.length === 1 ? "shipment" : "shipments"}</span><span>Data saved automatically</span></div>
      </section>)}
    </div>
  </>;
}

function ShipmentModal({ initial, consignees, countries, currencies, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    ...emptyShipment,
    ...(initial || {}),
    currency: initial?.currency || (currencies.find((item) => item.code === "USD")?.code || currencies[0]?.code || (initial ? "LKR" : "USD")),
    company: initial?.company || consignees[0]?.code || "",
    transportMode: initial?.transportMode || (initial?.fclLcl ? "SEA" : ""),
    paymentTerms: initial?.paymentTerms || "",
    paymentTermType: initial?.paymentTermType || "",
    paymentTermDays: initial?.paymentTermDays ?? "",
    consignee: initial?.consignee || consignees.find((consignee) => consignee.code === (initial?.company || consignees[0]?.code))?.name || "",
    documents: { ...emptyShipment.documents, ...(initial?.documents || {}) },
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const change = (event) => {
    const { name, value, type, checked } = event.target;
    if (name.startsWith("document.")) {
      const document = name.slice("document.".length);
      setForm((current) => ({ ...current, documents: { ...current.documents, [document]: checked ? "Received" : "Pending" } }));
    } else {
      setForm((current) => ({ ...current, [name]: type === "number" ? Number(value) : value }));
    }
  };

  async function submit(event) {
    event.preventDefault();
    if (initial && form.paymentTerms !== initial.paymentTerms) {
      const previousTerms = paymentTermsLabel(initial);
      const nextTerms = paymentTermsLabel(form);
      if (!window.confirm(`Change payment terms from "${previousTerms}" to "${nextTerms}"? This may move the shipment to a different payment section.`)) return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(form);
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="shipment-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          <div><div className="eyebrow">{initial ? "UPDATE SHIPMENT" : "NEW ENTRY"}</div><h2 id="modal-title">{initial ? "Edit shipment" : "Add shipment"}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-section">
            <h3>Shipment details</h3>
            <div className="form-grid shipment-details-grid">
              <label className="shipment-field shipment-field--import">Imp No.<input name="importNo" value={form.importNo} onChange={change} required placeholder="FMJ-2026-003" /></label>
              <label className="shipment-field shipment-field--consignee">Consignee<select name="company" value={form.company} onChange={(event) => { const code = event.target.value; setForm((current) => ({ ...current, company: code, consignee: consignees.find((item) => item.code === code)?.name || current.consignee })); }} required><option value="" disabled>Select a consignee</option>{consignees.map((consignee) => <option key={consignee.id} value={consignee.code}>{consignee.name}</option>)}</select></label>
              <label className="shipment-field shipment-field--shipper">Shipper<input name="supplier" value={form.supplier} onChange={change} required /></label>
              <label className="shipment-field shipment-field--conditional">Country<select name="country" value={form.country || ""} onChange={change}><option value="">Select a country</option>{form.country && !countries.some((country) => country.name === form.country) && <option value={form.country}>{form.country} (existing)</option>}{countries.map((country) => <option key={country.id} value={country.name}>{country.name}</option>)}</select></label>
              <label className="shipment-field shipment-field--description">Item Description<input name="description" value={form.description} onChange={change} required /></label>
              <label className="shipment-field shipment-field--payment-terms">Payment Terms<select name="paymentTerms" value={form.paymentTerms} onChange={(event) => {
                const paymentTerms = event.target.value;
                const paymentMethod = paymentTerms === "LETTER_OF_CREDIT" ? "Letter of credit"
                  : paymentTerms === "ADVANCE_TT" ? "Advance TT"
                    : paymentTerms === "DA_BL" ? "DA - From date of BL"
                      : paymentTerms === "DP_SIGHT" ? "DP of Sight"
                        : paymentTerms === "OPEN_ACCOUNT" ? "Open account" : "";
                setForm((current) => ({ ...current, paymentTerms, paymentMethod, paymentTermType: "", paymentTermDays: "" }));
              }} required><option value="">Select payment terms</option><option value="LETTER_OF_CREDIT">Letter of credit</option><option value="ADVANCE_TT">TT</option><option value="DA_BL">DA - From date of BL</option><option value="DP_SIGHT">DP of Sight</option><option value="OPEN_ACCOUNT">Open account</option></select></label>
              {form.paymentTerms === "LETTER_OF_CREDIT" && <label className="shipment-field shipment-field--conditional">Letter of Credit Type<select name="paymentTermType" value={form.paymentTermType} onChange={(event) => {
                const paymentTermType = event.target.value;
                setForm((current) => ({ ...current, paymentTermType, paymentMethod: paymentTermType ? `${paymentTermType} LC` : "Letter of credit", paymentTermDays: "" }));
              }} required><option value="">Select LC type</option><option value="Sight">Sight</option><option value="Usance">Usance</option></select></label>}
              {form.paymentTerms === "LETTER_OF_CREDIT" && form.paymentTermType === "Usance" && <label className="shipment-field shipment-field--conditional">Usance days<input name="paymentTermDays" type="number" min="1" max="365" value={form.paymentTermDays} onChange={change} required /></label>}
              {form.paymentTerms === "DA_BL" && <label className="shipment-field shipment-field--conditional">DA days<select name="paymentTermDays" value={form.paymentTermDays} onChange={change} required><option value="">Select days</option>{[30, 60, 90, 120].map((days) => <option key={days} value={days}>{days} days from BL</option>)}</select></label>}
              {form.paymentTerms === "OPEN_ACCOUNT" && <label className="shipment-field shipment-field--conditional">Open account days<select name="paymentTermDays" value={form.paymentTermDays} onChange={change} required><option value="">Select days</option>{[30, 45, 60, 90, 120].map((days) => <option key={days} value={days}>{days} days</option>)}</select></label>}
              <label className="shipment-field shipment-field--mode">Transport Mode<select name="transportMode" value={form.transportMode} onChange={(event) => setForm((current) => ({ ...current, transportMode: event.target.value, incoterm: "", incotermLocation: "", fclLcl: "", containerSize: "" }))} required={!initial}><option value="">Select AIR/SEA</option><option value="AIR">AIR</option><option value="SEA">SEA</option></select></label>
              {form.transportMode && <label className="shipment-field shipment-field--conditional">Incoterm<select name="incoterm" value={form.incoterm} onChange={(event) => {
                const incoterm = event.target.value;
                const colomboTerms = ["CIP", "CPT", "CIF", "CFR"];
                setForm((current) => ({ ...current, incoterm, incotermLocation: colomboTerms.includes(incoterm) ? "Colombo, Sri Lanka" : "" }));
              }} required><option value="">Select Incoterm</option>{(form.transportMode === "AIR" ? ["CIP", "CPT", "FCA", "EXW"] : ["CIF", "CFR", "FOB", "EXW"]).map((incoterm) => <option key={incoterm} value={incoterm}>{incoterm}</option>)}</select></label>}
              {["CIP", "CPT", "CIF", "CFR"].includes(form.incoterm) && <label className="shipment-field shipment-field--conditional">Incoterm location<input value="Colombo, Sri Lanka" readOnly /></label>}
              {["FCA", "FOB", "EXW"].includes(form.incoterm) && <label className="shipment-field shipment-field--conditional">Incoterm country<select name="incotermLocation" value={form.incotermLocation} onChange={change} required><option value="">Select a country</option>{form.incotermLocation && !countries.some((country) => country.name === form.incotermLocation) && <option value={form.incotermLocation}>{form.incotermLocation} (existing)</option>}{countries.map((country) => <option key={country.id} value={country.name}>{country.name}</option>)}</select></label>}
              {form.transportMode === "SEA" && <label className="shipment-field shipment-field--conditional">FCL/LCL<select name="fclLcl" value={form.fclLcl} onChange={(event) => setForm((current) => ({ ...current, fclLcl: event.target.value, containerSize: "" }))} required><option value="">Select FCL/LCL</option><option value="FCL">FCL</option><option value="LCL">LCL</option></select></label>}
              {form.transportMode === "SEA" && form.fclLcl === "FCL" && <label className="shipment-field shipment-field--conditional">Container Size<select name="containerSize" value={form.containerSize} onChange={change} required><option value="">Select size</option><option value="20FT">20FT</option><option value="40FT">40FT</option></select></label>}
              <label className="shipment-field shipment-field--currency">Currency<select name="currency" value={form.currency} onChange={change} required>
                {!currencies.length && ["USD", "AED", "RMB"].map((code) => <option key={code} value={code}>{code}</option>)}
                {form.currency && form.currency !== "LKR" && !currencies.some((item) => item.code === form.currency) && <option value={form.currency}>{form.currency} (existing)</option>}
                {form.currency === "LKR" && <option value="LKR">LKR (existing)</option>}
                {currencies.map((currency) => <option key={currency.id} value={currency.code}>{currency.code} — {currency.name}</option>)}
              </select></label>
              <label className="shipment-field shipment-field--amount">Value<input name="totalCost" type="number" min="0" step="0.01" value={form.totalCost} onChange={change} /></label>
              <label className="shipment-field shipment-field--date">ETD<DatePickerField name="etd" value={form.etd} onChange={change} label="ETD" /></label>
              <label className="shipment-field shipment-field--date">ETA CMB<DatePickerField name="eta" value={form.eta} onChange={change} label="ETA CMB" /></label>
              <label className="shipment-field shipment-field--amount">Duty (LKR)<input name="duty" type="number" min="0" step="0.01" value={form.duty} onChange={change} /></label>
              <label className="shipment-field shipment-field--amount">DO (LKR)<input name="doCharges" type="number" min="0" step="0.01" value={form.doCharges} onChange={change} /></label>
              {initial && <label className="shipment-field shipment-field--conditional">Shipment status<select name="status" value={form.status} onChange={change}>{shipmentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>}
              {initial && <label className="shipment-field shipment-field--conditional">Payment status<input value={paymentSummary(form).status} readOnly title="Calculated automatically from the payment ledger" /></label>}
              <label className="form-wide">Remarks<textarea name="remarks" value={form.remarks} onChange={change} rows={3} maxLength={1000} /></label>
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-footer">
            {initial && <button type="button" className="delete-button" onClick={async () => {
              if (!window.confirm(`Delete ${initial.importNo}? This cannot be undone.`)) return;
              setSaving(true);
              try { await onSave(null, initial.id); onClose(); } catch (deleteError) { setError(deleteError.message); setSaving(false); }
            }}>Delete shipment</button>}
            <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="button primary" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Create shipment"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function PaymentLedgerModal({ shipment, onClose, onSave }) {
  const [payments, setPayments] = useState(() => [...(shipment.payments || [])]);
  const [adjustments, setAdjustments] = useState(() => [...(shipment.adjustments || [])]);
  const [payment, setPayment] = useState({ date: new Date().toISOString().slice(0, 10), amount: "", method: "TT", reference: "", remarks: "" });
  const [adjustment, setAdjustment] = useState({ date: new Date().toISOString().slice(0, 10), amount: "", type: "Discount", reason: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const draft = { ...shipment, payments, adjustments };
  const summary = paymentSummary(draft);

  function addPayment(event) {
    event.preventDefault();
    const amount = Number(payment.amount);
    if (!(amount > 0)) return setError("Enter a payment amount greater than zero.");
    setPayments((current) => [...current, { ...payment, id: crypto.randomUUID(), amount, createdAt: new Date().toISOString() }]);
    setPayment((current) => ({ ...current, amount: "", reference: "", remarks: "" }));
    setError("");
  }

  function addAdjustment(event) {
    event.preventDefault();
    const enteredAmount = Math.abs(Number(adjustment.amount));
    if (!(enteredAmount > 0) || !adjustment.reason.trim()) return setError("Enter an adjustment amount and reason.");
    const negative = adjustment.type === "Discount" || adjustment.type === "Credit Note";
    setAdjustments((current) => [...current, { ...adjustment, id: crypto.randomUUID(), amount: negative ? -enteredAmount : enteredAmount, reason: adjustment.reason.trim(), createdAt: new Date().toISOString() }]);
    setAdjustment((current) => ({ ...current, amount: "", reason: "" }));
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await onSave({ ...shipment, payments, adjustments });
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Unable to save payment ledger.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="shipment-modal payment-ledger-modal" role="dialog" aria-modal="true" aria-labelledby="payment-ledger-title">
      <div className="modal-head"><div><div className="eyebrow">PAYMENT LEDGER · {shipment.importNo}</div><h2 id="payment-ledger-title">Payments & adjustments</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      <div className="payment-ledger-body">
        <div className="payment-summary-grid">
          <div><span>Invoice value</span><strong>{currencyAmount(shipment.totalCost, shipment.currency)}</strong></div>
          <div><span>Adjustments</span><strong>{currencyAmount(summary.adjustmentTotal, shipment.currency)}</strong></div>
          <div><span>Final payable</span><strong>{currencyAmount(summary.finalPayable, shipment.currency)}</strong></div>
          <div><span>Total paid</span><strong>{currencyAmount(summary.totalPaid, shipment.currency)}</strong></div>
          <div><span>Balance</span><strong>{currencyAmount(summary.balance, shipment.currency)}</strong></div>
          <div><span>Status</span><StatusBadge>{summary.status}</StatusBadge></div>
        </div>
        <div className="payment-ledger-columns">
          <section><h3>Add payment</h3><form className="ledger-entry-form" onSubmit={addPayment}>
            <label>Date<input type="date" value={payment.date} onClick={openDatePicker} onChange={(event) => setPayment((current) => ({ ...current, date: event.target.value }))} required /></label>
            <label>Amount ({shipment.currency})<input type="number" min="0.01" step="0.01" value={payment.amount} onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))} required /></label>
            <label>Method<select value={payment.method} onChange={(event) => setPayment((current) => ({ ...current, method: event.target.value }))}><option>TT</option><option>LC</option><option>DP</option><option>DA</option><option>Other</option></select></label>
            <label>Reference<input value={payment.reference} onChange={(event) => setPayment((current) => ({ ...current, reference: event.target.value }))} /></label>
            <label className="ledger-wide">Remarks<input value={payment.remarks} onChange={(event) => setPayment((current) => ({ ...current, remarks: event.target.value }))} /></label>
            <button className="button secondary ledger-wide" type="submit"><Plus size={14} /> Add payment</button>
          </form></section>
          <section><h3>Add adjustment</h3><form className="ledger-entry-form" onSubmit={addAdjustment}>
            <label>Date<input type="date" value={adjustment.date} onClick={openDatePicker} onChange={(event) => setAdjustment((current) => ({ ...current, date: event.target.value }))} required /></label>
            <label>Amount ({shipment.currency})<input type="number" min="0.01" step="0.01" value={adjustment.amount} onChange={(event) => setAdjustment((current) => ({ ...current, amount: event.target.value }))} required /></label>
            <label>Type<select value={adjustment.type} onChange={(event) => setAdjustment((current) => ({ ...current, type: event.target.value }))}>{["Discount", "Credit Note", "Additional Charge", "Bank Charge", "Other"].map((type) => <option key={type}>{type}</option>)}</select></label>
            <label className="ledger-wide">Reason<input value={adjustment.reason} onChange={(event) => setAdjustment((current) => ({ ...current, reason: event.target.value }))} required /></label>
            <button className="button secondary ledger-wide" type="submit"><Plus size={14} /> Add adjustment</button>
          </form></section>
        </div>
        <section className="ledger-history"><h3>History</h3>
          {!payments.length && !adjustments.length ? <p>No ledger entries yet.</p> : <div className="ledger-history-list">
            {[...payments.map((item) => ({ ...item, kind: "Payment" })), ...adjustments.map((item) => ({ ...item, kind: "Adjustment" }))].sort((a, b) => b.date.localeCompare(a.date)).map((item) => <div key={item.id} className="ledger-history-row"><span><strong>{item.kind}</strong><small>{dateLabel(item.date)} · {item.kind === "Payment" ? item.method : item.type}{item.reference ? ` · ${item.reference}` : ""}</small></span><b>{currencyAmount(item.amount, shipment.currency)}</b><button type="button" className="ledger-remove" onClick={() => { if (!window.confirm("Remove this ledger entry?")) return; item.kind === "Payment" ? setPayments((current) => current.filter((entry) => entry.id !== item.id)) : setAdjustments((current) => current.filter((entry) => entry.id !== item.id)); }}>Remove</button></div>)}
          </div>}
        </section>
        {error && <div className="form-error">{error}</div>}
      </div>
      <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="button" className="button primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save ledger"}</button></div>
    </section>
  </div>;
}

function ShipmentImportModal({ consignees, shipments, onClose, onImport }) {
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const validRows = rows.filter((item) => !item.errors.length);

  async function selectFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      setFileName(file.name);
      setRows(parseShipmentWorkbook(await file.arrayBuffer(), consignees, shipments));
    } catch (fileError) {
      setRows([]);
      setError(fileError.message || "Unable to read the workbook.");
    }
  }

  async function importRows() {
    setImporting(true);
    setError("");
    try {
      await onImport(validRows.map((item) => item.shipment));
      onClose();
    } catch (importError) {
      setError(importError.message || "Unable to import shipments.");
    } finally {
      setImporting(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="shipment-modal shipment-import-modal" role="dialog" aria-modal="true" aria-labelledby="shipment-import-title">
      <div className="modal-head"><div><div className="eyebrow">EXCEL IMPORT</div><h2 id="shipment-import-title">Import shipments</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      <div className="shipment-import-body">
        <p>Select the shipment workbook. The import reads the “Imp No.” table and saves only valid rows; the spreadsheet itself is not changed.</p>
        <label className="shipment-import-file"><Upload size={17} /><span>{fileName || "Choose Excel file (.xlsx)"}</span><input type="file" accept=".xlsx,.xls" onChange={selectFile} /></label>
        {!!rows.length && <div className="shipment-import-summary"><strong>{validRows.length} valid</strong><span>{rows.length - validRows.length} need attention</span></div>}
        {!!rows.length && <div className="shipment-import-review"><table><thead><tr><th>Row</th><th>Import no.</th><th>Consignee</th><th>Result</th></tr></thead><tbody>{rows.map((item) => <tr key={item.row}><td>{item.row}</td><td>{item.shipment.importNo || "—"}</td><td>{item.shipment.consignee || "—"}</td><td className={item.errors.length ? "import-error-copy" : "import-valid-copy"}>{item.errors.length ? item.errors.join("; ") : "Ready to import"}</td></tr>)}</tbody></table></div>}
        {error && <div className="form-error">{error}</div>}
      </div>
      <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="button" className="button primary" disabled={!validRows.length || importing} onClick={importRows}>{importing ? "Importing…" : `Import ${validRows.length || ""} shipment${validRows.length === 1 ? "" : "s"}`}</button></div>
    </section>
  </div>;
}

function TTSentDateModal({ shipment, onClose, onSave }) {
  const [etd, setEtd] = useState(shipment.etd || "");
  const [eta, setEta] = useState(shipment.eta || "");
  const [remarks, setRemarks] = useState(shipment.remarks || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(shipment, etd, eta, remarks);
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Unable to update TT Sent dates.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="shipment-modal tt-sent-date-modal" role="dialog" aria-modal="true" aria-labelledby="tt-sent-date-modal-title">
      <div className="modal-head"><div><div className="eyebrow">TT SENT</div><h2 id="tt-sent-date-modal-title">Mark payment as TT Sent</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      <form onSubmit={submit}>
        <div className="form-section">
          <p className="tt-sent-import">Import no. <strong>{shipment.importNo}</strong></p>
          <div className="form-grid">
            <label>ETD<DatePickerField value={etd} onChange={(event) => setEtd(event.target.value)} label="ETD" /></label>
            <label>ETA CMB<DatePickerField value={eta} onChange={(event) => setEta(event.target.value)} label="ETA CMB" /></label>
          </div>
          <label className="tt-sent-remarks">Existing remarks<textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={4} maxLength={1000} placeholder="Add remarks" /></label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Saving…" : "Mark TT Sent"}</button></div>
      </form>
    </section>
  </div>;
}

function UnderClearingModal({ shipment, onClose, onSave }) {
  const [duty, setDuty] = useState(shipment.duty ?? 0);
  const [doCharges, setDoCharges] = useState(shipment.doCharges ?? 0);
  const [remarks, setRemarks] = useState(shipment.remarks || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(shipment, duty, doCharges, remarks);
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Unable to move the shipment to Under Clearing.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="shipment-modal tt-sent-date-modal" role="dialog" aria-modal="true" aria-labelledby="under-clearing-modal-title">
      <div className="modal-head"><div><div className="eyebrow">UNDER CLEARING</div><h2 id="under-clearing-modal-title">Update clearance charges</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      <form onSubmit={submit}>
        <div className="form-section">
          <p className="tt-sent-import">Import no. <strong>{shipment.importNo}</strong></p>
          <div className="form-grid">
            <label>Duty (LKR)<input type="number" min="0" step="0.01" value={duty} onChange={(event) => setDuty(Number(event.target.value))} /></label>
            <label>DO charges (LKR)<input type="number" min="0" step="0.01" value={doCharges} onChange={(event) => setDoCharges(Number(event.target.value))} /></label>
          </div>
          <label className="tt-sent-remarks">Remarks<textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={4} maxLength={1000} placeholder="Add remarks" /></label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Saving…" : "Move to Under Clearing"}</button></div>
      </form>
    </section>
  </div>;
}

function ClearedShipmentModal({ shipment, onClose, onSave }) {
  const [remarks, setRemarks] = useState(shipment.remarks || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (!/\bcleared\b/i.test(remarks)) {
      setError('Remarks must include the word "cleared" before completing clearance.');
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(shipment, remarks);
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Unable to move the shipment to Cleared.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="shipment-modal tt-sent-date-modal" role="dialog" aria-modal="true" aria-labelledby="cleared-modal-title">
      <div className="modal-head"><div><div className="eyebrow">CLEARED</div><h2 id="cleared-modal-title">Complete shipment clearance</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      <form onSubmit={submit}>
        <div className="form-section">
          <p className="tt-sent-import">Import no. <strong>{shipment.importNo}</strong></p>
          <label className="tt-sent-remarks">Remarks<textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={4} maxLength={1000} placeholder='Include "cleared" in the remarks to complete clearance' /></label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button type="submit" className="button primary" disabled={saving}>{saving ? "Saving…" : "Mark Cleared"}</button></div>
      </form>
    </section>
  </div>;
}

const clearingChargeNames = ["Handling / Documentation", "Additional Handling / Documentation", "Agency Fee", "Transport Charges", "Weighing Charges", "RCT Expenses", "Grayline Charges", "RCT Charges", "SLPA Charges", "CICT Rent", "Transport Detention / Charges", "Shipping Line Charges", "Valuation Charges", "Grayline Expenses", "Yard OT / Container Yard OT", "Detail Examination", "D/O Charges", "D/O Extension Charges", "SAGT Charges", "Other Charges / Out Pass", "Rank Container Terminal Charges", "Customs OT", "Additional Container", "Customs Examination RCT", "Container Scan", "Scan Out", "CICT OT", "Liner Detention Charges", "Grayline Examination", "Labour Charges", "Port Charges", "E Unit Entry Pass", "Amendment Charges", "Demurrage", "RCT Examination", "Computer Charges", "Without Examination", "Red Channel Examination", "VAT and SSCL"];
const makeEmptyPostCosting = () => ({ sourceShipmentId: "", company: "", material: "", supplier: "", country: "", paymentType: "T.T", fileNo: "", lcNo: "", lcOpenedDate: "", bank: "", blDate: "", etd: "", eta: "", clearingDate: "", maturityDate: "", settlementDate: "", priceFob: 0, priceCfr: 0, priceCif: 0, unitPriceMt: 0, quantityMt: 0, location: "", foreignCurrency: "USD", foreignValue: 0, conversionRate: 0, gainLoss: 0, bankRate: 0, insuranceLkr: 0, freightLkr: 0, customsRate: 0, customsInsurance: 0, customsFreight: 0, cidRate: 0, palRate: 10, xidPerKg: 12, ssclRate: 2.5, vatRate: 18, otherDuty: 0, clearingCharges: clearingChargeNames.map((name) => ({ name, amount: 0 })), extraInsurance: 0, unloading: 0, bankCommissionRate: 3, bankDocumentCharges: 0, remittance: 0 });

function openPostCostingPdf(costing) {
  const pdfTab = window.open("", "_blank");
  if (!pdfTab) throw new Error("Please allow pop-ups to open the costing PDF.");
  pdfTab.document.write("<title>Preparing costing PDF...</title><p style='font-family:Arial;padding:24px'>Preparing PDF...</p>");

  try {
    const n = (value) => Number(value || 0);
    const quantityKg = n(costing.quantityMt) * 1000;
    const billValue = n(costing.priceCif) || n(costing.quantityMt) * n(costing.unitPriceMt) || n(costing.priceCfr) || n(costing.priceFob) || n(costing.foreignValue);
    const bankRate = n(costing.bankRate);
    const billValueLkr = billValue * bankRate;
    const cifLkr = billValueLkr + n(costing.insuranceLkr) + n(costing.freightLkr);
    const customsCif = (billValue + n(costing.customsInsurance) + n(costing.customsFreight)) * n(costing.customsRate);
    const cid = customsCif * n(costing.cidRate) / 100;
    const pal = customsCif * n(costing.palRate) / 100;
    const xid = quantityKg * n(costing.xidPerKg);
    const sscl = (customsCif * 1.1 + cid + pal + xid) * n(costing.ssclRate) / 100;
    const vat = (customsCif * 1.1 + cid + pal + xid) * n(costing.vatRate) / 100;
    const totalDuty = cid + pal + xid + sscl + vat + n(costing.otherDuty);
    const clearingTotal = (costing.clearingCharges || []).reduce((sum, item) => sum + n(item.amount), 0);
    const landedBeforeBank = cifLkr + totalDuty + clearingTotal + n(costing.extraInsurance);
    const bankCommission = billValueLkr * n(costing.bankCommissionRate) / 100;
    const totalCost = landedBeforeBank + n(costing.unloading) + bankCommission + n(costing.bankDocumentCharges) + n(costing.remittance);
    const costPerKg = quantityKg ? totalCost / quantityKg : 0;
    const amount = (value) => n(value).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const gap = 5;
    const columnWidth = (pageWidth - margin * 2 - gap * 2) / 3;
    const columns = [margin, margin + columnWidth + gap, margin + (columnWidth + gap) * 2];
    const section = (title, x, y, width = columnWidth) => {
      doc.setFillColor(235, 241, 251); doc.rect(x, y, width, 6, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(40, 101, 219); doc.text(title, x + 2, y + 4.2);
      return y + 8;
    };
    const row = (label, value, x, y, width = columnWidth, height = 5.2) => {
      const safeLabel = doc.splitTextToSize(String(label), width * 0.58)[0];
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(94, 108, 126); doc.text(safeLabel, x + 1.5, y);
      doc.setFont("helvetica", "bold"); doc.setTextColor(44, 55, 73); doc.text(String(value ?? "-"), x + width - 1.5, y, { align: "right" });
      doc.setDrawColor(228, 233, 240); doc.line(x, y + 1.7, x + width, y + 1.7);
      return y + height;
    };
    const rows = (items, x, y, width = columnWidth, height = 5.2) => items.reduce((nextY, [label, value]) => row(label, value, x, nextY, width, height), y);

    doc.setFillColor(40, 101, 219); doc.rect(0, 0, pageWidth, 25, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("POST COSTING", margin, 11);
    doc.setFontSize(9); doc.text(`File ${costing.fileNo || "-"}`, margin, 18);
    doc.setFont("helvetica", "normal"); doc.text(`${costing.material || ""}  |  ${new Date().toLocaleDateString("en-LK")}`, pageWidth - margin, 18, { align: "right" });

    let y1 = section("IMPORT DETAILS", columns[0], 31);
    y1 = rows([["Company", costing.company || "-"], ["Material", costing.material || "-"], ["Supplier", costing.supplier || "-"], ["Country", costing.country || "-"], ["Payment type", costing.paymentType || "-"], ["LC no.", costing.lcNo || "-"], ["Bank", costing.bank || "-"], ["ETD", costing.etd || "-"], ["ETA", costing.eta || "-"], ["Clearing date", costing.clearingDate || "-"]], columns[0], y1);
    y1 = section("PRICE & INVOICE", columns[0], y1 + 3);
    rows([["FOB", amount(costing.priceFob)], ["CFR", amount(costing.priceCfr)], ["CIF", amount(costing.priceCif)], ["Unit price / MT", amount(costing.unitPriceMt)], ["Quantity MT", amount(costing.quantityMt)], [`Bill value (${costing.foreignCurrency || "USD"})`, amount(billValue)], ["Bank rate for TT", amount(bankRate)], ["Bill value LKR", amount(billValueLkr)], ["CIF LKR", amount(cifLkr)]], columns[0], y1);

    let y2 = section("CUSTOMS DUTY", columns[1], 31);
    y2 = rows([["Customs CIF", amount(customsCif)], [`CID (${amount(costing.cidRate)}%)`, amount(cid)], [`PAL (${amount(costing.palRate)}%)`, amount(pal)], ["XID", amount(xid)], [`SSCL (${amount(costing.ssclRate)}%)`, amount(sscl)], [`VAT (${amount(costing.vatRate)}%)`, amount(vat)], ["Other duty", amount(costing.otherDuty)], ["Total duty", amount(totalDuty)]], columns[1], y2);
    y2 = section("FINAL COST SUMMARY (LKR)", columns[1], y2 + 3);
    rows([["Cost + duty + clearing", amount(landedBeforeBank)], ["Unloading charges", amount(costing.unloading)], [`Bank commission (${amount(costing.bankCommissionRate)}%)`, amount(bankCommission)], ["Bank document charges", amount(costing.bankDocumentCharges)], ["Remittance", amount(costing.remittance)], ["TOTAL COST", amount(totalCost)], ["Cost / Kg incl. SSCL + VAT", amount(costPerKg)], ["Cost / Kg excl. VAT", amount(costPerKg - (quantityKg ? vat / quantityKg : 0))]], columns[1], y2);

    const clearingItems = (costing.clearingCharges || []).filter((item) => n(item.amount) !== 0).map((item) => [item.name, amount(item.amount)]);
    let y3 = section("CLEARING CHARGES", columns[2], 31);
    const clearingGap = 3;
    const clearingWidth = (columnWidth - clearingGap) / 2;
    const splitAt = Math.ceil(clearingItems.length / 2);
    rows(clearingItems.slice(0, splitAt), columns[2], y3, clearingWidth, 5.2);
    rows(clearingItems.slice(splitAt), columns[2] + clearingWidth + clearingGap, y3, clearingWidth, 5.2);
    const clearingRows = Math.max(splitAt, clearingItems.length - splitAt);
    y3 += clearingRows * 5.2 + 3;
    y3 = section("CLEARING TOTAL", columns[2], y3);
    row("Total clearing bill", amount(clearingTotal), columns[2], y3);

    const safeFileNo = String(costing.fileNo || "costing").replace(/[^a-z0-9_-]+/gi, "-");
    doc.setProperties({ title: `Post Costing - ${costing.fileNo || "Costing"}`, subject: costing.material || "Post costing" });
    const pdfUrl = URL.createObjectURL(doc.output("blob"));
    pdfTab.location.replace(pdfUrl);
    pdfTab.document.title = `Post-Costing-${safeFileNo}.pdf`;
    window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 300000);
  } catch (error) {
    pdfTab.close();
    throw error;
  }
}

function PostCosting({ shipments, consignees, countries, records, onSave, onDelete }) {
  const [draft, setDraft] = useState(makeEmptyPostCosting);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const n = (value) => Number(value || 0);
  const quantityKg = n(draft.quantityMt) * 1000;
  const billValue = n(draft.priceCif) || n(draft.quantityMt) * n(draft.unitPriceMt) || n(draft.priceCfr) || n(draft.priceFob) || n(draft.foreignValue);
  const billValueLkr = billValue * n(draft.bankRate);
  const cifLkr = billValueLkr + n(draft.insuranceLkr) + n(draft.freightLkr);
  const customsCif = (billValue + n(draft.customsInsurance) + n(draft.customsFreight)) * n(draft.customsRate);
  const cid = customsCif * n(draft.cidRate) / 100;
  const pal = customsCif * n(draft.palRate) / 100;
  const xid = quantityKg * n(draft.xidPerKg);
  const sscl = (customsCif * 1.1 + cid + pal + xid) * n(draft.ssclRate) / 100;
  const vat = (customsCif * 1.1 + cid + pal + xid) * n(draft.vatRate) / 100;
  const totalDuty = cid + pal + xid + sscl + vat + n(draft.otherDuty);
  const costAndDuty = cifLkr + totalDuty;
  const clearingTotal = (draft.clearingCharges || []).reduce((sum, item) => sum + n(item.amount), 0);
  const landedBeforeBank = costAndDuty + clearingTotal + n(draft.extraInsurance);
  const bankCommission = billValueLkr * n(draft.bankCommissionRate) / 100;
  const totalCost = landedBeforeBank + n(draft.unloading) + bankCommission + n(draft.bankDocumentCharges) + n(draft.remittance);
  const costPerKg = quantityKg ? totalCost / quantityKg : 0;
  const vatPerKg = quantityKg ? vat / quantityKg : 0;
  const ssclPerKg = quantityKg ? sscl / quantityKg : 0;
  const set = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const setCharge = (index, value) => setDraft((current) => ({ ...current, clearingCharges: current.clearingCharges.map((item, itemIndex) => itemIndex === index ? { ...item, amount: value } : item) }));
  const clearedShipments = shipments.filter((shipment) => shipment.status === "Cleared");

  function selectClearedShipment(shipmentId) {
    const shipment = clearedShipments.find((item) => item.id === shipmentId);
    if (!shipment) { set("sourceShipmentId", ""); return; }
    const companyName = consignees.find((consignee) => consignee.code === shipment.company)?.name || shipment.consignee || shipment.company || "";
    const countryName = shipment.country || countries.find((country) => country.name === shipment.incotermLocation)?.name || "";
    setDraft((current) => ({
      ...current,
      sourceShipmentId: shipment.id,
      company: companyName,
      material: shipment.description || "",
      supplier: shipment.supplier || "",
      country: countryName,
      paymentType: shipment.paymentMethod || current.paymentType,
      fileNo: shipment.importNo || "",
      etd: shipment.etd || "",
      eta: shipment.eta || "",
      clearingDate: shipment.deliveryDate || shipment.arrivalDate || "",
      foreignCurrency: shipment.currency || "USD",
      foreignValue: Number(shipment.totalCost || 0),
      priceFob: shipment.incoterm === "FOB" ? Number(shipment.totalCost || 0) : current.priceFob,
      priceCfr: shipment.incoterm === "CFR" ? Number(shipment.totalCost || 0) : current.priceCfr,
      priceCif: shipment.incoterm === "CIF" ? Number(shipment.totalCost || 0) : current.priceCif,
      cidRate: 0,
      palRate: 0,
      xidPerKg: 0,
      ssclRate: 0,
      vatRate: 0,
      otherDuty: Number(shipment.duty || 0),
      clearingCharges: current.clearingCharges.map((charge) => charge.name === "D/O Charges" ? { ...charge, amount: Number(shipment.doCharges || 0) } : charge),
    }));
  }

  async function submit(event) {
    event.preventDefault(); setSaving(true); setFormError("");
    try { const saved = await onSave(draft); setDraft({ ...makeEmptyPostCosting(), ...saved, clearingCharges: saved.clearingCharges || makeEmptyPostCosting().clearingCharges }); }
    catch (error) { setFormError(error.message || "Unable to save post costing."); }
    finally { setSaving(false); }
  }
  async function remove() { if (!draft.id || !window.confirm(`Delete post costing ${draft.fileNo}?`)) return; await onDelete(draft.id); setDraft(makeEmptyPostCosting()); }
  const input = (field, label, type = "text") => <label>{label}<input type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "any" : undefined} value={draft[field]} onClick={type === "date" ? openDatePicker : undefined} onChange={(event) => set(field, event.target.value)} /></label>;

  return <section className="post-costing-page">
    <PageTitle eyebrow="LANDED COST" title="Post costing" subtitle="Record and save shipment price details for each imported material." action={<button className="button primary" onClick={() => setDraft(makeEmptyPostCosting())}><Plus size={16} /> New post costing</button>} />
    <div className="post-costing-layout"><aside className="panel costing-list"><div className="costing-list-head"><strong>Saved costings</strong><span>{records.length}</span></div>{records.length ? records.map((item) => <button type="button" key={item.id} className={draft.id === item.id ? "active" : ""} onClick={() => { setDraft({ ...makeEmptyPostCosting(), ...item, clearingCharges: item.clearingCharges || makeEmptyPostCosting().clearingCharges }); setFormError(""); }} onDoubleClick={() => { try { openPostCostingPdf(item); } catch (error) { setFormError(error.message || "Unable to generate the costing PDF."); } }} title="Click to edit · Double-click to open PDF"><strong>File {item.fileNo}</strong><span>{item.material}</span></button>) : <div className="costing-empty">No post costings saved yet.</div>}</aside>
      <form className="panel post-costing-form" onSubmit={submit}>{formError && <div className="inline-error">{formError}</div>}
        <div className="post-shipment-picker"><div><span>AUTO-FILL</span><h2>Select cleared shipment</h2><p>Shipment, material and price details will be loaded automatically.</p></div><label>Cleared shipment number<select value={draft.sourceShipmentId || ""} onChange={(event) => selectClearedShipment(event.target.value)}><option value="">Select shipment</option>{clearedShipments.map((shipment) => <option key={shipment.id} value={shipment.id}>{shipment.importNo} · {shipment.description}</option>)}</select></label></div>
        <div className="costing-section-title"><div><span>IMPORT DETAILS</span><h2>Shipment and material</h2></div>{draft.id && <button type="button" className="button secondary compact danger-text" onClick={remove}>Delete</button>}</div>
        <div className="post-fields">{input("company", "Company")}{input("material", "Material")}{input("supplier", "Supplier")}{input("country", "Country")}{input("paymentType", "Payment type")}{input("fileNo", "File no.")}{input("lcNo", "LC no.")}{input("lcOpenedDate", "Date of LC Opened", "date")}{input("bank", "Bank")}{input("blDate", "BL date", "date")}{input("etd", "ETD", "date")}{input("eta", "ETA", "date")}{input("clearingDate", "Clearing date", "date")}{input("maturityDate", "Maturity date", "date")}{input("settlementDate", "Settlement date", "date")}</div>
        <div className="costing-section-title section-gap"><div><span>PRICE DETAILS</span><h2>Shipment price and quantity</h2></div></div>
        <div className="post-fields">{input("priceFob", "PRICE-FOB", "number")}{input("priceCfr", "CFR", "number")}{input("priceCif", "CIF", "number")}{input("unitPriceMt", "UNIT PRICE/MT", "number")}{input("quantityMt", "QUANTITY-MT", "number")}{input("location", "Location")}</div>
        <div className="costing-section-title section-gap"><div><span>COSTING</span><h2>Invoice conversion</h2></div></div>
        <div className="post-calculation-table">
          <div><span>Bill Value - {draft.foreignCurrency}</span><strong>{decimalAmount(billValue)}</strong></div>
          <div><span>Invoiced Qty - Kgs.</span><strong>{decimalAmount(quantityKg)}</strong></div>
          <label>Bank rate for TT<input type="number" min="0" step="any" value={draft.bankRate} onChange={(event) => set("bankRate", event.target.value)} /></label>
          <label>GAIN / LOSS<input type="number" step="any" value={draft.gainLoss} onChange={(event) => set("gainLoss", event.target.value)} /></label>
          <div className="calculated"><span>Bill Value SLR</span><strong>{money(billValueLkr)}</strong></div>
          <label>Insurance<input type="number" min="0" step="any" value={draft.insuranceLkr} onChange={(event) => set("insuranceLkr", event.target.value)} /></label>
          <label>Freight<input type="number" min="0" step="any" value={draft.freightLkr} onChange={(event) => set("freightLkr", event.target.value)} /></label>
          <div className="calculated total"><span>CIF - SLR</span><strong>{money(cifLkr)}</strong></div>
        </div>
        <div className="costing-section-title section-gap"><div><span>CUSTOMS</span><h2>Customs conversion</h2></div></div>
        <div className="post-calculation-table customs-table">
          <label>Customs Exchange Rate<input type="number" min="0" step="any" value={draft.customsRate} onChange={(event) => set("customsRate", event.target.value)} /></label>
          <label>Insurance<input type="number" min="0" step="any" value={draft.customsInsurance} onChange={(event) => set("customsInsurance", event.target.value)} /></label>
          <label>Freight<input type="number" min="0" step="any" value={draft.customsFreight} onChange={(event) => set("customsFreight", event.target.value)} /></label>
        </div>
        <div className="costing-section-title section-gap"><div><span>DUTY</span><h2>Customs duty calculation</h2></div></div>
        <div className="post-duty-table">
          <div className="calculated"><span className="rate">Duty</span><span>CIF - SLR</span><strong>{money(customsCif)}</strong></div>
          <div><label><input type="number" min="0" step="any" value={draft.cidRate} onChange={(event) => set("cidRate", event.target.value)} />%</label><span>CID</span><strong>{money(cid)}</strong></div>
          <div><label><input type="number" min="0" step="any" value={draft.palRate} onChange={(event) => set("palRate", event.target.value)} />%</label><span>PAL</span><strong>{money(pal)}</strong></div>
          <div><label>Rs <input type="number" min="0" step="any" value={draft.xidPerKg} onChange={(event) => set("xidPerKg", event.target.value)} /> × 1KG</label><span>XID</span><strong>{money(xid)}</strong></div>
          <div><label><input type="number" min="0" step="any" value={draft.ssclRate} onChange={(event) => set("ssclRate", event.target.value)} />%</label><span>NBT / SSCL</span><strong>{money(sscl)}</strong></div>
          <div><label><input type="number" min="0" step="any" value={draft.vatRate} onChange={(event) => set("vatRate", event.target.value)} />%</label><span>VAT</span><strong>{money(vat)}</strong></div>
          <div><span className="rate" /><span>Other</span><label className="amount"><input type="number" min="0" step="any" value={draft.otherDuty} onChange={(event) => set("otherDuty", event.target.value)} /></label></div>
          <div className="total"><span className="rate" /><span>Total Duty</span><strong>{money(totalDuty)}</strong></div>
          <div className="spacer" />
          <div className="calculated"><span className="rate" /><span>Cost + duty</span><strong>{money(costAndDuty)}</strong></div>
          <div><span className="rate" /><span>EXTRA PAYMENT (if any) Insurance premium</span><label className="amount"><input type="number" min="0" step="any" value={draft.extraInsurance} onChange={(event) => set("extraInsurance", event.target.value)} /></label></div>
        </div>
        <div className="costing-section-title section-gap"><div><span>CLEARING BILL</span><h2>Clearing and port charges</h2></div></div>
        <div className="post-clearing-table">
          {(draft.clearingCharges || []).map((item, index) => <label key={item.name}><span>{index === 0 ? "Clearing Bill" : ""}</span><em>{item.name}</em><input type="number" min="0" step="0.01" value={Number(item.amount) === 0 ? "" : item.amount} placeholder="0.00" onFocus={(event) => event.target.select()} onChange={(event) => setCharge(index, event.target.value)} aria-label={`${item.name} amount`} /></label>)}
          <div className="clearing-total"><span /><strong>Total Clearing bill</strong><b>{money(clearingTotal)}</b></div>
        </div>
        <div className="post-final-cost-table">
          <div><span /><strong>Total - cost + duty + clearing bill</strong><b>{money(landedBeforeBank)}</b></div>
          <label><span /><strong>Unloading charges</strong><input type="number" min="0" step="any" value={draft.unloading} onChange={(event) => set("unloading", event.target.value)} /></label>
          <div className="bank-heading"><span>Bank Charges</span><strong /><b /></div>
          <label><span /><strong>LC / TT / DC Commission <input className="inline-rate" type="number" min="0" step="any" value={draft.bankCommissionRate} onChange={(event) => set("bankCommissionRate", event.target.value)} />%</strong><b>{money(bankCommission)}</b></label>
          <label><span /><strong>Bank Document Charges</strong><input type="number" min="0" step="any" value={draft.bankDocumentCharges} onChange={(event) => set("bankDocumentCharges", event.target.value)} /></label>
          <div className="bank-total"><span /><strong>Total</strong><b>{money(landedBeforeBank + n(draft.unloading) + bankCommission + n(draft.bankDocumentCharges))}</b></div>
          <label className="remittance"><span /><strong>D/Remittance (L)</strong><input type="number" min="0" step="any" value={draft.remittance} onChange={(event) => set("remittance", event.target.value)} /></label>
          <div className="grand-total"><span /><strong>Total cost</strong><b>{money(totalCost)}</b></div>
          <div><span /><strong>Cost per Kg - incl SSCL + VAT</strong><b>{money(costPerKg)}</b></div>
          <div><span /><strong>SSCL</strong><b>{money(ssclPerKg)}</b></div>
          <div><span /><strong>LESS VAT</strong><b>{money(vatPerKg)}</b></div>
          <div className="cost-ex-vat"><span /><strong>Cost per Kg - Excl VAT</strong><b>{money(costPerKg - vatPerKg)}</b></div>
        </div>
        <div className="costing-actions"><button className="button primary" disabled={saving}>{saving ? "Saving…" : draft.id ? "Update post costing" : "Save post costing"}</button></div>
      </form></div>
  </section>;
}

function MaterialAnalysis({ materials, onImport, onSave }) {
  const [query, setQuery] = useState("");
  const [tableView, setTableView] = useState("monthly");
  const [selectedYear, setSelectedYear] = useState("");
  const [drafts, setDrafts] = useState({});
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [savingPurchase, setSavingPurchase] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const fileRef = useRef(null);
  const availableYears = useMemo(() => [...new Set(materials.flatMap((material) => (material.monthlyPurchases || []).map((entry) => entry.month.slice(0, 4))))].filter(Boolean).sort().reverse(), [materials]);
  const activeYear = selectedYear && availableYears.includes(selectedYear) ? selectedYear : availableYears[0] || String(new Date().getFullYear());
  const rows = useMemo(() => materials
    .map((material) => ({ ...material, analysis: materialForecast(material) }))
    .filter((material) => material.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => tableView === "monthly"
      ? a.name.localeCompare(b.name)
      : b.analysis.recommended - a.analysis.recommended || a.name.localeCompare(b.name)), [materials, query, tableView]);
  const totals = useMemo(() => rows.reduce((summary, material) => ({
    stock: summary.stock + Number(material.currentStock || 0),
    forecast: summary.forecast + material.analysis.forecast,
    recommended: summary.recommended + material.analysis.recommended,
    alerts: summary.alerts + (material.analysis.recommended > 0 ? 1 : 0),
  }), { stock: 0, forecast: 0, recommended: 0, alerts: 0 }), [rows]);
  const valueFor = (material, field) => drafts[material.id]?.[field] ?? material[field];
  const setDraft = (material, field, value) => setDrafts((current) => ({ ...current, [material.id]: { ...(current[material.id] || {}), [field]: value } }));

  async function importWorkbook(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError("");
    try {
      await onImport(parseMaterialWorkbook(await file.arrayBuffer()));
    } catch (error) {
      setImportError(error.message || "Unable to import this workbook.");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  }

  async function saveRow(material) {
    const draft = drafts[material.id] || {};
    await onSave(material.id, {
      currentStock: Number(draft.currentStock ?? material.currentStock),
      onOrder: Number(draft.onOrder ?? material.onOrder),
      leadTimeDays: Number(draft.leadTimeDays ?? material.leadTimeDays),
      safetyStockMonths: Number(draft.safetyStockMonths ?? material.safetyStockMonths),
    });
    setDrafts((current) => { const next = { ...current }; delete next[material.id]; return next; });
  }

  function editPurchase(material, month, quantity) {
    if (savingPurchase) return;
    setPurchaseError("");
    setEditingPurchase({ materialId: material.id, month, value: String(quantity || "") });
  }

  async function savePurchase(material, month) {
    if (!editingPurchase || editingPurchase.materialId !== material.id || editingPurchase.month !== month) return;
    const quantity = Number(editingPurchase.value);
    if (editingPurchase.value.trim() === "" || !Number.isFinite(quantity) || quantity < 0) {
      setEditingPurchase(null);
      return;
    }
    const cellKey = `${material.id}:${month}`;
    const monthlyPurchases = (material.monthlyPurchases || []).filter((entry) => entry.month !== month);
    monthlyPurchases.push({ month, quantity });
    setSavingPurchase(cellKey);
    setPurchaseError("");
    try {
      await onSave(material.id, {
        currentStock: Number(material.currentStock || 0),
        onOrder: Number(material.onOrder || 0),
        leadTimeDays: Number(material.leadTimeDays || 30),
        safetyStockMonths: Number(material.safetyStockMonths ?? 0.5),
        monthlyPurchases,
      });
      setEditingPurchase(null);
    } catch (error) {
      setPurchaseError(error.message || "Unable to update the monthly purchase.");
    } finally {
      setSavingPurchase("");
    }
  }

  return <section className="material-analysis-page">
    <PageTitle eyebrow="INVENTORY PLANNING" title="Material analysis" subtitle="Review purchase history, current stock and purchase-based demand forecasts." action={<><input ref={fileRef} className="visually-hidden" type="file" accept=".xlsx,.xls" onChange={importWorkbook} /><button className="button primary" disabled={importing} onClick={() => fileRef.current?.click()}><Upload size={16} /> {importing ? "Importing…" : "Import purchase workbook"}</button></>} />
    {(importError || purchaseError) && <div className="inline-error">{importError || purchaseError}</div>}
    <div className="material-method-note"><span className="material-method-icon"><TrendingUp size={17} /></span><div><strong>Purchase forecast</strong><span>Latest three active purchase months are weighted 50%, 30% and 20%. The order suggestion includes lead time and safety stock, then deducts stock already available or on order.</span></div></div>
    <section className="material-kpis">
      <article className="material-kpi stock"><span className="material-kpi-icon"><Box size={17} /></span><div><span>Current stock</span><strong>{decimalAmount(totals.stock)} <small>MT</small></strong><em>Available inventory</em></div></article>
      <article className="material-kpi forecast"><span className="material-kpi-icon"><TrendingUp size={17} /></span><div><span>Next-period forecast</span><strong>{decimalAmount(totals.forecast)} <small>MT</small></strong><em>Purchase-based estimate</em></div></article>
      <article className="material-kpi purchase"><span className="material-kpi-icon"><ArrowUpRight size={17} /></span><div><span>Recommended purchase</span><strong>{decimalAmount(totals.recommended)} <small>MT</small></strong><em>Suggested order quantity</em></div></article>
      <article className="material-kpi review"><span className="material-kpi-icon"><Clock3 size={17} /></span><div><span>Materials to review</span><strong>{totals.alerts}</strong><em>Need purchasing attention</em></div></article>
    </section>
    <section className="panel material-table-panel">
      <div className="material-view-bar"><div className="material-view-tabs"><button className={tableView === "monthly" ? "active" : ""} onClick={() => setTableView("monthly")}>Monthly purchases</button><button className={tableView === "stock" ? "active" : ""} onClick={() => setTableView("stock")}>Stock plan</button></div><div className="material-view-controls">{tableView === "monthly" && availableYears.length > 0 && <label>Year<select value={activeYear} onChange={(event) => setSelectedYear(event.target.value)}>{availableYears.map((year) => <option key={year}>{year}</option>)}</select></label>}<label className="material-search"><span>Search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Material name" /></label></div></div>
      <div className="table-toolbar"><div className="table-title"><h2>{tableView === "monthly" ? `Monthly purchase history · ${activeYear}` : "Material stock plan"}</h2><span className="count-pill">{rows.length}</span></div><span className="material-table-hint">{tableView === "monthly" ? "Quantities shown in MT · Double-click a value to edit" : "Update stock inputs and save each changed row"}</span></div>
      {!materials.length ? <div className="empty-state"><Box size={34} /><strong>No material history imported</strong><span>Import the Jan–Dec raw material purchase workbook to create the analysis.</span><button className="button primary" onClick={() => fileRef.current?.click()}><Upload size={16} /> Import workbook</button></div> : tableView === "monthly" ? <div className="table-scroll"><table className="data-table material-table monthly-material-table"><thead><tr><th>Material</th>{["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((month) => <th key={month}>{month}</th>)}<th>Total</th><th>Avg / active mo.</th></tr></thead><tbody>{rows.map((material) => {
        const monthValues = Array.from({ length: 12 }, (_, index) => Number(material.monthlyPurchases?.find((entry) => entry.month === `${activeYear}-${String(index + 1).padStart(2, "0")}`)?.quantity || 0));
        const annualTotal = monthValues.reduce((sum, value) => sum + value, 0);
        const activeMonths = monthValues.filter((value) => value > 0).length;
        return <tr key={material.id}><td><strong>{material.name}</strong><span className="cell-subtext">{material.unit || "MT"}</span></td>{monthValues.map((value, index) => {
          const month = `${activeYear}-${String(index + 1).padStart(2, "0")}`;
          const cellKey = `${material.id}:${month}`;
          const isEditing = editingPurchase?.materialId === material.id && editingPurchase?.month === month;
          return <td key={month} className={`${value > 0 ? "monthly-value has-value" : "monthly-value"}${isEditing ? " editing" : ""}${savingPurchase === cellKey ? " saving" : ""}`} onDoubleClick={() => editPurchase(material, month, value)} title="Double-click to edit">{isEditing ? <input className="monthly-value-input" type="number" min="0" step="0.01" autoFocus value={editingPurchase.value} disabled={savingPurchase === cellKey} onChange={(event) => setEditingPurchase((current) => ({ ...current, value: event.target.value }))} onFocus={(event) => event.target.select()} onBlur={() => savePurchase(material, month)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") setEditingPurchase(null); }} aria-label={`${material.name} ${month} purchase quantity`} /> : value > 0 ? decimalAmount(value) : "—"}</td>;
        })}<td className="monthly-total">{decimalAmount(annualTotal)}</td><td className="monthly-average">{activeMonths ? decimalAmount(annualTotal / activeMonths) : "—"}</td></tr>;
      })}</tbody><tfoot><tr><th>Monthly total</th>{Array.from({ length: 12 }, (_, index) => { const monthKey = `${activeYear}-${String(index + 1).padStart(2, "0")}`; const total = rows.reduce((sum, material) => sum + Number(material.monthlyPurchases?.find((entry) => entry.month === monthKey)?.quantity || 0), 0); return <th key={monthKey}>{total > 0 ? decimalAmount(total) : "—"}</th>; })}<th>{decimalAmount(rows.reduce((sum, material) => sum + (material.monthlyPurchases || []).filter((entry) => entry.month.startsWith(activeYear)).reduce((monthSum, entry) => monthSum + Number(entry.quantity || 0), 0), 0))}</th><th /></tr></tfoot></table></div> : <div className="table-scroll"><table className="data-table material-table"><thead><tr><th>Material</th><th>Recent purchases</th><th>Forecast</th><th>Current stock</th><th>On order</th><th>Lead days</th><th>Safety months</th><th>Coverage</th><th>Recommended</th><th>Status</th><th /></tr></thead><tbody>{rows.map((material) => {
        const recent = [...(material.monthlyPurchases || [])].filter((entry) => Number(entry.quantity) > 0).slice(-4);
        return <tr key={material.id}><td><strong>{material.name}</strong><span className="cell-subtext">{material.unit || "MT"}</span></td><td><div className="purchase-history">{recent.length ? recent.map((entry) => <span key={entry.month}><small>{entry.month.slice(5)}</small>{decimalAmount(entry.quantity)}</span>) : <em>No purchases</em>}</div></td><td><strong>{decimalAmount(material.analysis.forecast)}</strong><span className="cell-subtext">MT / period</span></td>{["currentStock", "onOrder", "leadTimeDays", "safetyStockMonths"].map((field) => <td key={field}><input className="material-number-input" type="number" min="0" step={field === "leadTimeDays" ? "1" : "0.01"} value={valueFor(material, field)} onChange={(event) => setDraft(material, field, event.target.value)} aria-label={`${material.name} ${field}`} /></td>)}<td>{material.analysis.coverage === null ? "—" : `${material.analysis.coverage.toFixed(1)} mo`}</td><td className="recommended-quantity">{decimalAmount(material.analysis.recommended)} MT</td><td><span className={`stock-status ${material.analysis.status.toLowerCase().replace(" ", "-")}`}>{material.analysis.status}</span></td><td><button className="button secondary compact" disabled={!drafts[material.id]} onClick={() => saveRow(material)}>Save</button></td></tr>;
      })}</tbody></table></div>}
    </section>
  </section>;
}

function Dashboard({ shipments, consignees, analytics, accountName, onNavigate, onEdit, onAdd, onImport }) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const hour = currentTime.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const displayName = String(accountName || "there").trim();
  const [monthRange, setMonthRange] = useState(6);
  const [statusMonthRange, setStatusMonthRange] = useState("all");
  const monthlyData = (analytics?.monthly || []).slice(-monthRange);
  const maxMonthly = Math.max(1, ...monthlyData.map((item) => item.shipments));
  const chartMaximum = Math.max(4, Math.ceil(maxMonthly / 4) * 4);
  const chartTicks = Array.from({ length: 5 }, (_, index) => chartMaximum - (chartMaximum / 4) * index);
  const shipmentMonths = [...new Set(shipments.map((shipment) => (shipment.eta || shipment.etd || "").slice(0, 7)).filter(Boolean))].sort();
  const statusMonths = statusMonthRange === "all" ? null : new Set(shipmentMonths.slice(-Number(statusMonthRange)));
  const statusShipments = statusMonths ? shipments.filter((shipment) => statusMonths.has((shipment.eta || shipment.etd || "").slice(0, 7))) : shipments;
  const statusCounts = Object.fromEntries(shipmentStatuses.map((status) => [status, statusShipments.filter((shipment) => shipment.status === status).length]));
  return (
    <>
      <PageTitle eyebrow="OVERVIEW" title={`${greeting}, ${displayName}`} subtitle="Here's what's happening with your shipments today." action={<div className="page-actions"><button className="button secondary" onClick={downloadShipmentImportTemplate}><Download size={16} /> Download template</button><button className="button secondary" onClick={onImport}><Upload size={16} /> Import Excel</button></div>} />
      <section className="stat-grid">
        <StatCard label="Total shipments" value={analytics?.total ?? "—"} helper="View all shipment records" icon={Ship} color="blue" onClick={() => onNavigate("report-shipment")} />
        <StatCard label="Pending" value={analytics?.pending ?? "—"} helper="View pending TT shipments" icon={Clock3} color="amber" onClick={() => onNavigate("to-be-tt")} />
        <StatCard label="Under clearing" value={analytics?.underClearing ?? "—"} helper="View shipments at customs" icon={ArrowDownToLine} color="violet" onClick={() => onNavigate("under-clearing")} />
        <StatCard label="Cleared" value={analytics?.cleared ?? "—"} helper="View cleared shipments" icon={PackageCheck} color="green" onClick={() => onNavigate("cleared-shipments")} />
      </section>
      <div className="dashboard-grid">
        <section className="panel monthly-panel">
          <div className="panel-heading"><div><h2>Shipment activity</h2><p>Shipments by expected arrival month</p></div><select className="select-button" value={monthRange} onChange={(event) => setMonthRange(Number(event.target.value))} aria-label="Shipment activity period"><option value={3}>Last 3 months</option><option value={6}>Last 6 months</option><option value={12}>Last 12 months</option></select></div>
          <div className="chart">
            <div className="chart-y">{chartTicks.map((tick) => <span key={tick}>{tick}</span>)}</div>
            <div className="chart-main">
              <div className="chart-gridlines"><i /><i /><i /><i /><i /></div>
              <div className="bar-list">{monthlyData.map((item) => {
                const barHeight = `${Math.max(8, (item.shipments / chartMaximum) * 100)}%`;
                return <div className="bar-column" key={item.month} style={{ "--bar-height": barHeight }}><div className="bar-value">{item.shipments}</div><div className="bar" /><span>{new Date(`${item.month}-01T00:00:00`).toLocaleDateString("en", { month: "short" })}</span></div>;
              })}</div>
            </div>
          </div>
        </section>
        <section className="panel status-panel">
          <div className="panel-heading"><div><h2>Shipment status</h2><p>Current portfolio overview</p></div><select className="select-button" value={statusMonthRange} onChange={(event) => setStatusMonthRange(event.target.value)} aria-label="Shipment status period"><option value="all">All months</option><option value="3">Last 3 months</option><option value="6">Last 6 months</option><option value="12">Last 12 months</option></select></div>
          <div className="status-total"><strong>{statusShipments.length}</strong><span>Total shipments</span></div>
          <div className="status-stack"><i className="stack-cleared" style={{ flex: statusCounts.Cleared || 0.1 }} /><i className="stack-clearing" style={{ flex: statusCounts["Under Clearing"] || 0.1 }} /><i className="stack-pending" style={{ flex: statusCounts.Pending || 0.1 }} /></div>
          <div className="legend-list">
            {shipmentStatuses.map((status) => <div className="legend-row" key={status}><span><i className={`legend-dot ${status.toLowerCase().replace(" ", "-")}`} />{status}</span><strong>{statusCounts[status]}</strong></div>)}
          </div>
        </section>
        <section className="panel recent-panel">
          <div className="panel-heading"><div><h2>Recent shipments</h2><p>Latest updates across your imports</p></div></div>
          <ShipmentTable rows={[...shipments].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 5)} mode="shipments" onEdit={onEdit} onAdd={onAdd} showActions={false} consignees={consignees} groupByConsignee={false} />
        </section>
        <section className="panel company-panel">
          <div className="panel-heading"><div><h2>Consignee overview</h2><p>Shipments by consignee</p></div><button className="icon-button"><MoreHorizontal size={20} /></button></div>
          <div className="company-list">{(analytics?.byCompany || []).map((company) => { const color = consigneeColorFor(company.company, consignees); const consignee = consignees.find((item) => item.code === company.company); const consigneeName = consignee?.name || company.company; return <div className="company-row" key={company.company}><span className="company-avatar consignee-color-avatar" style={{ "--consignee-color": color }}>{consigneeName.slice(0, 1)}</span><div className="company-name"><strong>{consigneeName}</strong><small>{company.total} shipments</small></div><div className="company-progress"><i style={{ width: `${company.total ? Math.max(12, (company.cleared / company.total) * 100) : 0}%`, backgroundColor: color }} /></div><b>{company.cleared}/{company.total}</b></div>; })}</div>
          <button className="company-footer" onClick={() => onNavigate("companies")}>View consignee reports <ArrowRight size={15} /></button>
        </section>
      </div>
    </>
  );
}

function DocumentsView({ shipments, consignees, onEdit }) {
  const rows = sortShipmentsByConsignee(shipments, consignees).flatMap((shipment) => documentTypes.map((document) => ({
    id: `${shipment.id}-${document}`,
    importNo: shipment.importNo,
    company: shipment.company,
    supplier: shipment.supplier,
    document,
    status: shipment.documents?.[document] || "Pending",
    shipment,
  })));
  return <section className="panel table-panel"><div className="panel-heading"><div><h2>Document register</h2><p>PI, CI, packing lists, BL/AWB and customs paperwork</p></div><span className="document-count">{rows.filter((row) => row.status === "Received").length} / {rows.length} received</span></div>
    {!rows.length ? <EmptyState /> : <div className="table-scroll"><table><thead><tr><th>Document</th><th>Import No.</th><th>Consignee</th><th>Shipper</th><th>Document status</th><th>Shipment status</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><span className="doc-icon"><FileText size={15} /></span>{row.document}</td><td><span className="import-id">{row.importNo}</span></td><td><ConsigneeBadge code={row.company} consignees={consignees} /></td><td>{row.supplier}</td><td><StatusBadge>{row.status}</StatusBadge></td><td><StatusBadge>{row.shipment.status}</StatusBadge></td><td><button className="icon-button row-more" aria-label={`Edit ${row.importNo}`} onClick={() => onEdit(row.shipment)}><MoreHorizontal size={18} /></button></td></tr>)}</tbody></table></div>}
  </section>;
}

function ConsigneeReports({ analytics, shipments, consignees, onEdit, onAdd }) {
  return <>
    <section className="company-report-grid">{(analytics?.byCompany || []).map((company) => {
      const ratio = company.total ? Math.round((company.cleared / company.total) * 100) : 0;
      const color = consigneeColorFor(company.company, consignees);
      return <article className="company-report-card" key={company.company}><div className="company-card-top"><span className="company-avatar large consignee-color-avatar" style={{ "--consignee-color": color }}>{company.company.slice(0, 1)}</span><ConsigneeBadge code={company.company} consignees={consignees} /></div><h2>{consignees.find((item) => item.code === company.company)?.name || company.company}</h2><p>Consignee shipment portfolio</p><div className="company-metrics"><div><strong>{company.total}</strong><span>Total shipments</span></div><div><strong>{ratio}%</strong><span>Clearance rate</span></div></div><div className="company-progress wide"><i style={{ width: `${ratio}%`, backgroundColor: color }} /></div><div className="company-card-bottom"><span>Total value</span><strong>{money(company.totalCost)}</strong></div></article>;
    })}</section>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>All consignee shipments</h2><p>Shipment activity across registered consignees</p></div></div><ShipmentTable rows={shipments} mode="shipments" onEdit={onEdit} onAdd={onAdd} consignees={consignees} /></section>
  </>;
}

function ConsigneeModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    code: initial?.code || "",
    name: initial?.name || "",
    color: initial?.color || defaultConsigneeColor,
    contactName: initial?.contactName || "",
    email: initial?.email || "",
    phone: initial?.phone || "",
    address: initial?.address || "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function change(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(form, initial?.id);
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete consignee ${initial.code}?`)) return;
    setBusy(true);
    setError("");
    try {
      await onSave(null, initial.id, true);
      onClose();
    } catch (deleteError) {
      setError(deleteError.message);
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="shipment-modal consignee-modal" role="dialog" aria-modal="true" aria-labelledby="consignee-modal-title">
      <div className="modal-head"><div><div className="eyebrow">{initial ? "UPDATE CONSIGNEE" : "NEW CONSIGNEE"}</div><h2 id="consignee-modal-title">{initial ? "Edit consignee" : "Create consignee"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      <form onSubmit={submit}>
        <div className="form-section"><h3>Consignee details</h3><div className="form-grid">
          <label>Consignee code<input name="code" value={form.code} onChange={change} required minLength={2} maxLength={20} pattern="[A-Za-z0-9_\-]+" placeholder="FMJ" /></label>
          <label>Consignee name<input name="name" value={form.name} onChange={change} required maxLength={120} placeholder="FMJ Trading (Pvt) Ltd" /></label>
          <label className="consignee-color-field">Consignee color<div className="consignee-color-control"><div className="consignee-color-swatches">{consigneeColorPresets.map((preset) => <button key={preset.value} type="button" className={`consignee-color-swatch ${form.color.toLowerCase() === preset.value ? "selected" : ""}`} style={{ "--swatch": preset.value }} aria-label={preset.name} title={preset.name} onClick={() => setForm((current) => ({ ...current, color: preset.value }))} />)}</div><input type="color" aria-label="Choose custom consignee color" value={form.color} onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))} /></div></label>
          <label>Contact person<input name="contactName" value={form.contactName} onChange={change} maxLength={120} /></label>
          <label>Email<input name="email" type="email" value={form.email} onChange={change} maxLength={254} /></label>
          <label>Phone<input name="phone" type="tel" value={form.phone} onChange={change} maxLength={40} /></label>
          <label className="form-wide">Address<input name="address" value={form.address} onChange={change} maxLength={300} /></label>
        </div></div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-footer">{initial && <button type="button" className="delete-button" onClick={remove} disabled={busy}>Delete consignee</button>}<button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : initial ? "Save changes" : "Create consignee"}</button></div>
      </form>
    </section>
  </div>;
}

function ConsigneeDirectory({ consignees, shipments, onEdit, onAdd }) {
  if (!consignees.length) {
    return <section className="panel consignee-empty-panel"><EmptyState message="No consignees registered" description="Create a consignee to assign it to shipment records." actionLabel="Create consignee" onAdd={onAdd} /></section>;
  }
  return <section className="panel table-panel">
    <div className="table-toolbar"><div className="table-title"><h2>Registered consignees</h2><span className="count-pill">{consignees.length}</span></div><span className="consignee-directory-note">Select a consignee when creating or editing a shipment.</span></div>
    <div className="table-scroll"><table><thead><tr><th>Code</th><th>Consignee name</th><th>Color</th><th>Contact person</th><th>Email</th><th>Phone</th><th>Shipments</th><th /></tr></thead><tbody>
      {consignees.map((consignee) => <tr key={consignee.id} className="clickable-row" onClick={() => onEdit(consignee)}>
        <td><ConsigneeBadge code={consignee.code} consignees={consignees} /></td><td><span className="import-id">{consignee.name}</span></td><td><span className="consignee-color-preview" style={{ backgroundColor: consigneeColorFor(consignee.code, consignees) }} />{consigneeColorFor(consignee.code, consignees)}</td><td>{consignee.contactName || "—"}</td><td>{consignee.email || "—"}</td><td>{consignee.phone || "—"}</td><td>{shipments.filter((shipment) => shipment.company === consignee.code).length}</td>
        <td><button className="consignee-edit-button" aria-label={`Edit ${consignee.name}`} onClick={(event) => { event.stopPropagation(); onEdit(consignee); }}>Edit</button></td>
      </tr>)}
    </tbody></table></div>
  </section>;
}

function CountryModal({ initial, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ name: name.trim() }, initial?.id);
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete country ${initial.name}?`)) return;
    setBusy(true);
    setError("");
    try {
      await onSave(null, initial.id, true);
      onClose();
    } catch (deleteError) {
      setError(deleteError.message);
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="shipment-modal consignee-modal" role="dialog" aria-modal="true" aria-labelledby="country-modal-title">
      <div className="modal-head"><div><div className="eyebrow">{initial ? "UPDATE COUNTRY" : "NEW COUNTRY"}</div><h2 id="country-modal-title">{initial ? "Edit country" : "Create country"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      <form onSubmit={submit}>
        <div className="form-section"><h3>Country details</h3><div className="form-grid">
          <label className="form-wide">Country name<input autoFocus name="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} placeholder="e.g. Sri Lanka" /></label>
        </div></div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-footer">{initial && <button type="button" className="delete-button" onClick={remove} disabled={busy}>Delete country</button>}<button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : initial ? "Save changes" : "Create country"}</button></div>
      </form>
    </section>
  </div>;
}

function CountryDirectory({ countries, onEdit, onAdd }) {
  if (!countries.length) {
    return <section className="panel consignee-empty-panel"><EmptyState message="No countries added" description="Create a country record to maintain your country list." actionLabel="Create country" onAdd={onAdd} /></section>;
  }
  return <section className="panel table-panel">
    <div className="table-toolbar"><div className="table-title"><h2>Countries</h2><span className="count-pill">{countries.length}</span></div></div>
    <div className="table-scroll"><table><thead><tr><th>Country name</th><th /></tr></thead><tbody>
      {countries.map((country) => <tr key={country.id} className="clickable-row" onClick={() => onEdit(country)}>
        <td><span className="import-id">{country.name}</span></td>
        <td><button className="consignee-edit-button" aria-label={`Edit ${country.name}`} onClick={(event) => { event.stopPropagation(); onEdit(country); }}>Edit</button></td>
      </tr>)}
    </tbody></table></div>
  </section>;
}

function CurrencyModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({ code: initial?.code || "", name: initial?.name || "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave({ code: form.code.trim().toUpperCase(), name: form.name.trim() }, initial?.id);
      onClose();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete currency ${initial.code}?`)) return;
    setBusy(true);
    setError("");
    try {
      await onSave(null, initial.id, true);
      onClose();
    } catch (deleteError) {
      setError(deleteError.message);
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="shipment-modal consignee-modal" role="dialog" aria-modal="true" aria-labelledby="currency-modal-title">
      <div className="modal-head"><div><div className="eyebrow">{initial ? "UPDATE CURRENCY" : "NEW CURRENCY"}</div><h2 id="currency-modal-title">{initial ? "Edit currency" : "Add currency"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      <form onSubmit={submit}>
        <div className="form-section"><h3>Currency details</h3><div className="form-grid">
          <label>Currency code<input autoFocus name="code" value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" placeholder="USD" /></label>
          <label>Currency name<input name="name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required maxLength={100} placeholder="US Dollar" /></label>
        </div></div>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-footer">{initial && <button type="button" className="delete-button" onClick={remove} disabled={busy}>Delete currency</button>}<button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Saving…" : initial ? "Save changes" : "Add currency"}</button></div>
      </form>
    </section>
  </div>;
}

function CurrencyDirectory({ currencies, onEdit, onAdd }) {
  return <section className="panel table-panel">
    <div className="table-toolbar">
      <div className="table-title"><h2>Currencies</h2><span className="count-pill">{currencies.length}</span></div>
      <button className="button primary" onClick={onAdd}><Plus size={15} /> Add currency</button>
    </div>
    {!currencies.length ? <EmptyState message="No managed currencies yet" description="Add USD, AED, RMB or another three-letter currency code." actionLabel="Add currency" onAdd={onAdd} /> : <div className="table-scroll"><table><thead><tr><th>Code</th><th>Currency name</th><th /></tr></thead><tbody>
      {currencies.map((currency) => <tr key={currency.id} className="clickable-row" onClick={() => onEdit(currency)}>
        <td><span className="company-tag">{currency.code}</span></td><td><span className="import-id">{currency.name}</span></td>
        <td><button className="consignee-edit-button" aria-label={`Edit ${currency.code}`} onClick={(event) => { event.stopPropagation(); onEdit(currency); }}>Edit</button></td>
      </tr>)}
    </tbody></table></div>}
  </section>;
}

function AnalyticsView({ analytics }) {
  const monthMax = Math.max(1, ...(analytics?.monthly || []).map((item) => item.cost));
  return <>
    <section className="stat-grid analytics-stats">
      <StatCard label="Total shipment value" value={money(analytics?.totalCost)} helper="Declared shipment cost" icon={CircleDollarSign} color="blue" />
      <StatCard label="Delayed shipments" value={analytics?.delayed ?? 0} helper="ETA passed, not yet cleared" icon={Clock3} color="amber" />
      <StatCard label="Clearance rate" value={`${analytics?.total ? Math.round((analytics.cleared / analytics.total) * 100) : 0}%`} helper="Successfully cleared" icon={TrendingUp} color="green" />
      <StatCard label="Avg. cost / shipment" value={money(analytics?.total ? analytics.totalCost / analytics.total : 0)} helper="Across active portfolio" icon={ArrowDownUp} color="violet" />
    </section>
    <div className="analytics-grid">
      <section className="panel cost-panel"><div className="panel-heading"><div><h2>Monthly shipment costs</h2><p>Total declared costs by ETA month</p></div><span className="chart-unit">LKR</span></div><div className="cost-bars">{(analytics?.monthly || []).map((item) => <div className="cost-bar-item" key={item.month}><div className="cost-number">{money(item.cost)}</div><div className="cost-bar-wrap"><div className="cost-bar" style={{ height: `${Math.max(4, item.cost / monthMax * 100)}%` }} /></div><span>{new Date(`${item.month}-01T00:00:00`).toLocaleDateString("en", { month: "short", year: "2-digit" })}</span></div>)}</div></section>
      <section className="panel delay-panel"><div className="panel-heading"><div><h2>Shipment delays</h2><p>ETA passed and not yet cleared</p></div><StatusBadge tone="delayed">{analytics?.delayed ?? 0} delayed</StatusBadge></div>
        {analytics?.delayedShipments?.length ? <div className="delay-list">{analytics.delayedShipments.map((item) => <div className="delay-row" key={item.id}><span className="delay-icon"><Clock3 size={16} /></span><div><strong>{item.importNo}</strong><small>{item.supplier} · ETA {dateLabel(item.eta)}</small></div><StatusBadge>{item.status}</StatusBadge></div>)}</div> : <div className="no-delays"><CheckCircle2 size={22} /><strong>All clear</strong><span>No active shipment delays right now.</span></div>}
      </section>
    </div>
  </>;
}

function UserModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState({ name: initial?.name || "", username: initial?.username || "", password: "", confirmPassword: "", sidebarAccess: initial?.sidebarAccess || [] });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const toggleAccess = (key) => setForm((current) => ({ ...current, sidebarAccess: current.sidebarAccess.includes(key) ? current.sidebarAccess.filter((item) => item !== key) : [...current.sidebarAccess, key] }));
  async function submit(event) {
    event.preventDefault();
    if (form.password !== form.confirmPassword) return setError("Passwords do not match.");
    if (!form.sidebarAccess.length) return setError("Select at least one left sidebar item.");
    setSaving(true); setError("");
    try { await onSave(form, initial?.id); onClose(); } catch (saveError) { setError(saveError.message); } finally { setSaving(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete user ${initial.username}?`)) return;
    setSaving(true); setError("");
    try { await onSave(null, initial.id, true); onClose(); } catch (deleteError) { setError(deleteError.message); setSaving(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="shipment-modal consignee-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title"><div className="modal-head"><div><div className="eyebrow">{initial ? "UPDATE USER" : "NEW USER"}</div><h2 id="user-modal-title">{initial ? "Edit user" : "Create user"}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close"><X size={20} /></button></div><form onSubmit={submit}><div className="form-section"><div className="form-grid"><label>Full name<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required maxLength={120} /></label><label>Username<input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} required minLength={3} maxLength={40} pattern="[A-Za-z0-9._-]+" /></label><label>{initial ? "New password (optional)" : "Password"}<input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required={!initial} minLength={6} maxLength={128} /></label><label>{initial ? "Re-enter new password" : "Re-enter password"}<input type="password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} required={!initial} minLength={6} maxLength={128} /></label></div></div><div className="form-section"><h3>Left sidebar access</h3><div className="user-access-list">{userAccessOptions.map((item) => <label key={item.key}><input type="checkbox" checked={form.sidebarAccess.includes(item.key)} onChange={() => toggleAccess(item.key)} />{item.label}</label>)}</div></div>{error && <div className="form-error">{error}</div>}<div className="modal-footer">{initial && <button type="button" className="delete-button" onClick={remove} disabled={saving}>Delete user</button>}<button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Saving…" : initial ? "Save changes" : "Create user"}</button></div></form></section></div>;
}

function UserDirectory({ users, onEdit }) {
  return <section className="panel table-panel"><div className="table-toolbar"><div className="table-title"><h2>Users</h2><span className="count-pill">{users.length}</span></div></div>{!users.length ? <EmptyState message="No users created" description="Use the Create user button above to add the first user." /> : <div className="table-scroll"><table><thead><tr><th>Name</th><th>Username</th><th>Left sidebar access</th><th /></tr></thead><tbody>{users.map((user) => <tr key={user.id} className="clickable-row" onClick={() => onEdit(user)}><td><span className="import-id">{user.name}</span></td><td>{user.username}</td><td>{user.sidebarAccess.map((key) => userAccessOptions.find((item) => item.key === key)?.label).filter(Boolean).join(", ") || "No access selected"}</td><td><button className="consignee-edit-button" aria-label={`Edit ${user.name}`} onClick={(event) => { event.stopPropagation(); onEdit(user); }}>Edit</button></td></tr>)}</tbody></table></div>}</section>;
}

function FontSizeSettings({ users, account, isSuperAdmin, onSave }) {
  const accounts = isSuperAdmin
    ? [{ id: "super-admin", name: account.name || account.username, username: account.username, fontSize: account.fontSize || 100, role: "Super administrator" }, ...users.map((user) => ({ ...user, role: "Team user" }))]
    : [{ id: "self", name: account.name || account.username, username: account.username, fontSize: account.fontSize || 100, role: "My account" }];
  const [selectedId, setSelectedId] = useState(isSuperAdmin ? "super-admin" : "self");
  const selected = accounts.find((account) => account.id === selectedId) || accounts[0];
  const [fontSize, setFontSize] = useState(selected.fontSize || 100);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  useEffect(() => { setFontSize(selected.fontSize || 100); }, [selectedId, selected.fontSize]);
  const save = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await onSave(selectedId, fontSize);
    } catch (error) {
      setSaveError(error.message);
    } finally {
      setSaving(false);
    }
  };
  return <section className="panel settings-panel">
    <div className="settings-heading"><div className="settings-icon"><Settings size={20} /></div><div><h2>User font size</h2><p>Choose an account and set the text size used throughout that user's workspace.</p></div></div>
    <div className="settings-form">
      {isSuperAdmin ? <label>User<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.role})</option>)}</select></label> : <div className="settings-current-user"><span>Account</span><strong>{selected.name}</strong><small>@{selected.username} · Only your font size can be changed</small></div>}
      <div className="font-size-control"><div className="font-size-control-head"><label htmlFor="font-size-range">Font size</label><strong>{fontSize}%</strong></div><input id="font-size-range" type="range" min="80" max="140" step="5" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /><div className="font-size-scale"><span>Smaller</span><span>Default</span><span>Larger</span></div></div>
      <div className="font-preview" style={{ fontSize: `${fontSize / 100}em` }}><span>Preview</span><strong>FMJ ShipTrack</strong><p>Shipment details will appear at this text size for {selected.name}.</p></div>
    </div>
    {saveError && <div className="settings-error">{saveError}</div>}
    <div className="settings-footer"><button className="button secondary" type="button" onClick={() => setFontSize(100)}>Reset to default</button><button className="button primary" type="button" disabled={saving || fontSize === selected.fontSize} onClick={save}>{saving ? "Saving…" : "Save font size"}</button></div>
  </section>;
}

function AuthScreen({ setupRequired, theme, onToggleTheme, onAuthenticated, loading, connectionError, onRetry }) {
  const [mode, setMode] = useState(setupRequired ? "setup" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode(setupRequired ? "setup" : "login");
  }, [setupRequired]);

  async function requestCode(accountName = username, accountPassword = password) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await api.login({ username: accountName, password: accountPassword });
      if (result.authenticated) {
        onAuthenticated(result);
        return;
      }
      setChallengeId(result.challengeId);
      setMode("otp");
      setPassword("");
      setCode("");
      setNotice(`A verification code was sent to ${result.destination}. It expires in 5 minutes.`);
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "setup") {
        await api.setupSuperAdmin({ setupKey, username, password });
        setSetupKey("");
        setMode("login");
        setNotice("Super-admin account created. Sending your sign-in verification code…");
        setBusy(false);
        await requestCode(username, password);
        setPassword("");
        return;
      }
      if (mode === "login") {
        setBusy(false);
        await requestCode();
        return;
      }
      await api.verifyLoginCode({ challengeId, code });
      onAuthenticated(username.trim().toLowerCase());
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`auth-screen ${theme === "dark" ? "dark" : ""}`}>
      <button className="auth-theme-toggle" onClick={onToggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
        {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
      </button>
      <div className="auth-layout">
        <section className="auth-intro">
          <div className="auth-brand"><span><Ship size={22} /></span><strong>FMJ <i>ShipTrack</i></strong></div>
          <div className="auth-intro-copy">
            <div className="auth-eyebrow">IMPORT MANAGEMENT, MADE SIMPLE</div>
            <h1>Your shipments.<br />One clear view.</h1>
            <p>Track every import, payment and clearance milestone from a secure workspace built for your team.</p>
            <div className="auth-benefits">
              <div><span><ShieldCheck size={17} /></span><strong>Secure team access</strong></div>
              <div><span><MailCheck size={17} /></span><strong>Extra verification for administrators</strong></div>
              <div><span><CheckCircle2 size={17} /></span><strong>Shipment records protected behind sign-in</strong></div>
            </div>
          </div>
          <div className="auth-legal">FMJ ShipTrack <span>·</span> Secure operations workspace</div>
        </section>
        <section className="auth-card-wrap">
          <div className="auth-card">
            <div className="auth-card-icon">{mode === "otp" ? <MailCheck size={21} /> : <ShieldCheck size={21} />}</div>
            <div className="auth-card-eyebrow">{mode === "setup" ? "ONE-TIME INITIALIZATION" : mode === "otp" ? "ADMIN VERIFICATION" : "TEAM ACCESS"}</div>
            <h2>{mode === "setup" ? "Create your admin account" : mode === "otp" ? "Check your email" : "Welcome back"}</h2>
            <p className="auth-card-subtitle">
              {mode === "setup"
                ? "Set up the only super-admin account. This page locks after setup."
                : mode === "otp"
                  ? "Enter the 6-digit code sent to your registered admin email."
                  : "Sign in with your username and password. Administrators will also verify by email."}
            </p>
            {loading && <div className="auth-message">Checking secure sign-in…</div>}
            {!loading && connectionError && <div className="auth-error">{connectionError}<button type="button" onClick={onRetry}>Retry connection</button></div>}
            {!loading && !connectionError && <form className="auth-form" onSubmit={submit}>
              {mode !== "otp" && <>
                {mode === "setup" && <label>One-time setup key<input type="password" autoComplete="off" value={setupKey} onChange={(event) => setSetupKey(event.target.value)} required minLength={32} placeholder="Paste the private setup key" /></label>}
                <label>Username<input type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={40} pattern="[A-Za-z0-9._\-]+" placeholder="Your username" /></label>
                <label>Password<input type="password" autoComplete={mode === "setup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === "setup" ? 12 : 6} maxLength={128} placeholder={mode === "setup" ? "At least 12 characters" : "Your password"} /></label>
              </>}
              {mode === "otp" && <>
                <div className="otp-destination"><MailCheck size={16} /><span>Code sent to <strong>sw.developer.fmj@gmail.com</strong></span></div>
                <label>6-digit verification code<input className="otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required pattern="[0-9]{6}" maxLength={6} placeholder="000000" autoFocus /></label>
              </>}
              {notice && <div className="auth-message">{notice}</div>}
              {error && <div className="auth-error">{error}</div>}
              <button className="auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "setup" ? "Create account & continue" : mode === "otp" ? "Verify & sign in" : "Sign in"}<ArrowRight size={16} /></button>
              {mode === "otp" && <div className="auth-secondary-actions"><button type="button" onClick={() => { setMode("login"); setChallengeId(""); setCode(""); setError(""); setNotice(""); }}>Back to sign in</button><button type="button" onClick={() => { setMode("login"); setChallengeId(""); setCode(""); setError(""); setNotice("Sign in again to request a new code."); }}>Sign in for a new code</button></div>}
            </form>}
            <div className="auth-security-note"><LockKeyholeIcon /> Your password is protected and never sent by email.</div>
          </div>
          <div className="auth-bottom-note">© 2026 FMJ ShipTrack. Authorized access only.</div>
        </section>
      </div>
    </div>
  );
}

function LockKeyholeIcon() {
  return <ShieldCheck size={14} aria-hidden="true" />;
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("fmj-shiptrack-theme") || "light");
  const [authState, setAuthState] = useState(null);
  const [authError, setAuthError] = useState("");
  const [active, setActive] = useState("dashboard");
  const [reportsOpen, setReportsOpen] = useState(false);
  const [shipments, setShipments] = useState([]);
  const [consignees, setConsignees] = useState([]);
  const [countries, setCountries] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [users, setUsers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [postCostings, setPostCostings] = useState([]);
  const [modalShipment, setModalShipment] = useState(undefined);
  const [modalShipmentImport, setModalShipmentImport] = useState(false);
  const [paymentLedgerShipment, setPaymentLedgerShipment] = useState(undefined);
  const [ttSentDateShipment, setTtSentDateShipment] = useState(undefined);
  const [underClearingShipment, setUnderClearingShipment] = useState(undefined);
  const [clearedShipment, setClearedShipment] = useState(undefined);
  const [modalConsignee, setModalConsignee] = useState(undefined);
  const [modalCountry, setModalCountry] = useState(undefined);
  const [modalCurrency, setModalCurrency] = useState(undefined);
  const [modalUser, setModalUser] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("fmj-shiptrack-sidebar-collapsed") === "true");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [ttFilters, setTtFilters] = useState(emptyShipmentFilters);
  const accountMenuRef = useRef(null);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [shipmentData, analyticsData, consigneeData, countryData, currencyData, materialData, postCostingData] = await Promise.all([
        api.getShipments(),
        api.getAnalytics(),
        api.getConsignees(),
        api.getCountries(),
        api.getCurrencies(),
        api.getMaterials(),
        api.getPostCostings(),
      ]);
      setShipments(sortShipmentsByConsignee(shipmentData, consigneeData));
      setAnalytics(analyticsData);
      setConsignees(consigneeData);
      setCountries(countryData);
      setCurrencies(currencyData);
      setMaterials(materialData);
      setPostCostings(postCostingData);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAuthStatus = useCallback(async () => {
    setAuthError("");
    try {
      setAuthState(await api.getAuthStatus());
    } catch (statusError) {
      setAuthError(statusError.message);
    }
  }, []);

  useEffect(() => { loadAuthStatus(); }, [loadAuthStatus]);
  useEffect(() => {
    if (authState?.role !== "super-admin") { setUsers([]); return; }
    api.getUsers().then(setUsers).catch((loadError) => setError(loadError.message));
  }, [authState?.role]);
  useEffect(() => {
    if (authState?.role !== "user") return;
    const firstAllowed = navigation.find((item) => authState.sidebarAccess?.includes(item.key))?.key || (authState.sidebarAccess?.includes("settings") ? "settings" : null);
    if (firstAllowed) setActive(firstAllowed);
  }, [authState?.role, authState?.sidebarAccess]);
  useEffect(() => {
    if (authState?.authenticated) refresh();
  }, [authState, refresh]);
  useEffect(() => {
    const expireSession = () => {
      setAuthState({ setupRequired: false, authenticated: false });
      setShipments([]);
      setAnalytics(null);
      setConsignees([]);
      setCountries([]);
      setCurrencies([]);
      setMaterials([]);
      setPostCostings([]);
    };
    window.addEventListener("fmj-session-expired", expireSession);
    return () => window.removeEventListener("fmj-session-expired", expireSession);
  }, []);
  useEffect(() => {
    localStorage.setItem("fmj-shiptrack-theme", theme);
  }, [theme]);
  useEffect(() => {
    localStorage.setItem("fmj-shiptrack-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (active !== "countries" || !authState?.authenticated || modalCountry !== undefined || modalCurrency !== undefined || confirmSignOut) return undefined;
    const openCountryForm = (event) => {
      if (event.key !== "F1") return;
      event.preventDefault();
      setModalCountry(null);
    };
    window.addEventListener("keydown", openCountryForm);
    return () => window.removeEventListener("keydown", openCountryForm);
  }, [active, authState?.authenticated, modalCountry, modalCurrency, confirmSignOut]);
  useEffect(() => {
    if (!accountMenuOpen && !confirmSignOut) return undefined;
    const closeTransientUi = (event) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        setConfirmSignOut(false);
      } else if (event.type === "pointerdown") {
        if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false);
      }
    };
    document.addEventListener("keydown", closeTransientUi);
    document.addEventListener("pointerdown", closeTransientUi);
    return () => {
      document.removeEventListener("keydown", closeTransientUi);
      document.removeEventListener("pointerdown", closeTransientUi);
    };
  }, [accountMenuOpen, confirmSignOut]);

  const consigneeOptions = useMemo(() => {
    const knownCodes = new Set(consignees.map((consignee) => consignee.code));
    const existingShipmentConsignees = [...new Set(
      shipments.map((shipment) => shipment.company).filter((code) => code && !knownCodes.has(code)),
    )].map((code) => ({ id: `existing-${code}`, code, name: code }));
    return [...consignees, ...existingShipmentConsignees];
  }, [consignees, shipments]);

  async function saveShipment(shipment, deleteId) {
    if (deleteId) {
      await api.deleteShipment(deleteId);
      setNotice("Shipment deleted");
    } else if (shipment.id) {
      await api.updateShipment(shipment.id, shipment);
      setNotice("Shipment updated successfully");
    } else {
      await api.createShipment(shipment);
      setNotice("Shipment created successfully");
    }
    await refresh();
  }

  async function saveShipmentCell(shipment, patch) {
    await api.updateShipment(shipment.id, { ...shipment, ...patch });
    setNotice(`${shipment.importNo} updated`);
    await refresh();
  }

  async function importShipments(items) {
    const failures = [];
    for (const shipment of items) {
      try {
        await api.createShipment(shipment);
      } catch (importError) {
        failures.push(`${shipment.importNo}: ${importError.message}`);
      }
    }
    await refresh();
    if (failures.length) throw new Error(`${items.length - failures.length} shipment(s) imported. ${failures.join("; ")}`);
    setNotice(`${items.length} shipment${items.length === 1 ? "" : "s"} imported successfully`);
  }

  async function deleteShipmentFromList(shipment) {
    try {
      await saveShipment(null, shipment.id);
    } catch (deleteError) {
      setNotice(deleteError.message || "Unable to delete shipment");
    }
  }

  async function saveTTSentDates(shipment, etd, eta, remarks) {
    const summary = paymentSummary(shipment);
    const payments = summary.balance > 0.005 ? [...(shipment.payments || []), { id: crypto.randomUUID(), date: new Date().toISOString().slice(0, 10), amount: summary.balance, method: "TT", reference: "", remarks: "Marked as TT Sent", createdAt: new Date().toISOString() }] : shipment.payments || [];
    await api.updateShipment(shipment.id, { ...shipment, etd, eta, remarks, payments });
    setNotice("Shipment marked as TT Sent");
    await refresh();
  }

  async function saveUnderClearingShipment(shipment, duty, doCharges, remarks) {
    await api.updateShipment(shipment.id, { ...shipment, duty, doCharges, remarks, status: "Under Clearing" });
    setNotice("Shipment moved to Under Clearing");
    await refresh();
  }

  async function saveClearedShipment(shipment, remarks) {
    if (!/\bcleared\b/i.test(remarks)) throw new Error('Remarks must include the word "cleared" before completing clearance.');
    await api.updateShipment(shipment.id, { ...shipment, remarks, status: "Cleared", clearanceStatus: "Cleared" });
    setNotice("Shipment marked as Cleared");
    await refresh();
  }

  async function saveConsignee(consignee, id, remove = false) {
    if (remove) {
      await api.deleteConsignee(id);
      setNotice("Consignee deleted");
    } else if (id) {
      await api.updateConsignee(id, consignee);
      setNotice("Consignee updated successfully");
    } else {
      await api.createConsignee(consignee);
      setNotice("Consignee created successfully");
    }
    await refresh();
  }

  async function saveCountry(country, id, remove = false) {
    if (remove) {
      await api.deleteCountry(id);
      setNotice("Country deleted");
    } else if (id) {
      await api.updateCountry(id, country);
      setNotice("Country updated successfully");
    } else {
      await api.createCountry(country);
      setNotice("Country created successfully");
    }
    await refresh();
  }

  async function saveCurrency(currency, id, remove = false) {
    if (remove) {
      await api.deleteCurrency(id);
      setNotice("Currency deleted");
    } else if (id) {
      await api.updateCurrency(id, currency);
      setNotice("Currency updated successfully");
    } else {
      await api.createCurrency(currency);
      setNotice("Currency added successfully");
    }
    await refresh();
  }

  async function importMaterials(materialRecords) {
    const result = await api.importMaterials(materialRecords);
    setNotice(`${result.count} material${result.count === 1 ? "" : "s"} imported successfully`);
    await refresh();
  }

  async function saveMaterial(id, material) {
    const updated = await api.updateMaterial(id, material);
    setMaterials((current) => current.map((item) => item.id === id ? updated : item));
    setNotice(`${updated.name} stock settings updated`);
  }

  async function savePostCosting(costing) {
    const saved = costing.id ? await api.updatePostCosting(costing.id, costing) : await api.createPostCosting(costing);
    setPostCostings((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setNotice(`Post costing ${saved.fileNo} saved`);
    return saved;
  }

  async function deletePostCosting(id) {
    await api.deletePostCosting(id);
    setPostCostings((current) => current.filter((item) => item.id !== id));
    setNotice("Post costing deleted");
  }

  async function signOut() {
    try {
      await api.logout();
      setShipments([]);
      setAnalytics(null);
      setAccountMenuOpen(false);
      setConfirmSignOut(false);
      setAuthState({ setupRequired: false, authenticated: false });
    } catch (logoutError) {
      setNotice(logoutError.message);
    }
  }

  const availableNavigation = authState?.role === "super-admin" ? navigation : navigation.filter((item) => authState?.sidebarAccess?.includes(item.key));
  const canAccessReports = authState?.role === "super-admin" || authState?.sidebarAccess?.includes("reports");
  const activeTitle = active === "settings" ? "Settings" : active === "users" ? "Users" : [...navigation, ...reportNavigation].find((item) => item.key === active)?.label || "Dashboard";
  const openModal = (shipment) => setModalShipment(shipment || null);
  const markAuthenticated = (account) => {
    setAuthError("");
    setAuthState(typeof account === "string" ? { setupRequired: false, authenticated: true, username: account, name: account, role: "super-admin", sidebarAccess: [] } : { setupRequired: false, ...account });
    setLoading(true);
  };

  function renderContent() {
    if (loading) return <div className="loading-state"><span className="loader" />Loading shipment workspace…</div>;
    if (error && !shipments.length) return <div className="error-state"><strong>Unable to load shipments</strong><span>{error}</span><button className="button secondary" onClick={refresh}>Try again</button></div>;
    if (active === "dashboard") return <Dashboard shipments={shipments} consignees={consignees} analytics={analytics} accountName={authState?.name || authState?.username} onNavigate={setActive} onEdit={openModal} onAdd={() => openModal(null)} onImport={() => setModalShipmentImport(true)} />;
    if (active === "materials") return <MaterialAnalysis materials={materials} onImport={importMaterials} onSave={saveMaterial} />;
    if (active === "post-costing") return <PostCosting shipments={shipments} consignees={consignees} countries={countries} records={postCostings} onSave={savePostCosting} onDelete={deletePostCosting} />;
    if (active === "to-be-tt") {
      const pendingTTShipments = shipments.filter((shipment) =>
        hasOutstandingPayment(shipment),
      );
      const filteredPendingTTShipments = filterShipmentRows(pendingTTShipments, ttFilters, consignees);
      return <section className="to-be-tt-page">
        {error && <div className="inline-error">{error}</div>}
        <section className="panel table-panel tt-payments-panel">
          <div className="table-toolbar"><div className="table-title"><h2>Pending TT payments</h2><span className="count-pill">{filteredPendingTTShipments.length}</span></div><div className="pending-tt-toolbar-actions"><ShipmentFilterControls filters={ttFilters} onChange={setTtFilters} consignees={consigneeOptions} exportAction={() => exportPendingTTToExcel(filteredPendingTTShipments)} exportDisabled={!filteredPendingTTShipments.length} /><button className="button primary" onClick={() => openModal(null)}><Plus size={15} /> Add shipment</button></div></div>
          <ShipmentTable rows={filteredPendingTTShipments} mode="payments" onEdit={openModal} onDelete={deleteShipmentFromList} onAdd={() => openModal(null)} onTTSent={setTtSentDateShipment} onPayments={setPaymentLedgerShipment} onCellSave={saveShipmentCell} consignees={consignees} />
          <div className="table-footer"><span><strong>{filteredPendingTTShipments.length}</strong> of {pendingTTShipments.length} shipments awaiting payment</span><span>Data saved automatically</span></div>
        </section>
      </section>;
    }
    if (active === "tt-sent") {
      const ttSentShipments = shipments.filter((shipment) => shipment.paymentMethod === "Advance TT" && shipment.paymentStatus === "Paid" && shipment.status === "Pending");
      return <ShipmentListPage eyebrow="PAYMENTS" title="TT Sent" subtitle="Advance TT shipments whose payment has been sent." rows={ttSentShipments} mode="payments" consignees={consignees} onEdit={openModal} onDelete={deleteShipmentFromList} onAdd={() => openModal(null)} onUnderClearing={setUnderClearingShipment} onPayments={setPaymentLedgerShipment} onCellSave={saveShipmentCell} showAdd={false} footer="Advance TT payments sent" />;
    }
    if (active === "under-clearing") {
      const underClearingShipments = shipments.filter((shipment) => shipment.status === "Under Clearing");
      return <ShipmentListPage eyebrow="CLEARANCE" title="Under Clearing Shipments" subtitle="Shipments currently progressing through customs clearance." rows={underClearingShipments} mode="payments" consignees={consignees} onEdit={openModal} onDelete={deleteShipmentFromList} onAdd={() => openModal(null)} onCleared={setClearedShipment} onPayments={setPaymentLedgerShipment} onCellSave={saveShipmentCell} showAdd={false} footer="shipments under clearing" />;
    }
    if (active === "cleared-shipments") {
      const clearedShipments = shipments.filter((shipment) => shipment.status === "Cleared");
      return <ShipmentListPage eyebrow="CLEARANCE" title="Cleared Shipments" subtitle="Shipments that have completed customs clearance." rows={clearedShipments} mode="payments" consignees={consignees} onEdit={openModal} onDelete={deleteShipmentFromList} onAdd={() => openModal(null)} onPayments={setPaymentLedgerShipment} onCellSave={saveShipmentCell} showAdd={false} footer="cleared shipments" />;
    }
    if (active.startsWith("report-")) {
      const report = reportNavigation.find((item) => item.key === active);
      const consigneeCode = report?.consigneeName && consignees.find((item) => item.name.toUpperCase() === report.consigneeName)?.code;
      const reportShipments = report?.key === "report-cleared"
        ? shipments.filter((shipment) => shipment.status === "Cleared")
        : report?.consigneeName ? shipments.filter((shipment) => shipment.status === "Cleared" && (shipment.company === consigneeCode || shipment.company === report.consigneeName)) : shipments;
      if (report?.key === "report-shipment") {
        return <ShipmentSummarySections shipments={reportShipments} consignees={consignees} onEdit={openModal} onDelete={deleteShipmentFromList} onPayments={setPaymentLedgerShipment} onCellSave={saveShipmentCell} />;
      }
      return <ShipmentListPage eyebrow="REPORTS & ANALYTICS" title={report?.label || "SHIPMENT"} subtitle={report?.key === "report-cleared" ? "Cleared shipment records." : report?.consigneeName ? `Cleared shipment records for ${report.consigneeName}.` : "All shipment records."} rows={reportShipments} mode="payments" consignees={consignees} onEdit={openModal} onDelete={deleteShipmentFromList} onAdd={() => openModal(null)} onPayments={setPaymentLedgerShipment} onCellSave={saveShipmentCell} showAdd={false} footer="shipment records" />;
    }
    if (active === "companies") return <><PageTitle eyebrow="CONSIGNEES" title="Consignee reports" subtitle="A clear view of imports and clearance progress for each consignee." />{error && <div className="inline-error">{error}</div>}<ConsigneeReports analytics={analytics} shipments={shipments} consignees={consignees} onEdit={openModal} /></>;
    if (active === "consignees") return <><PageTitle eyebrow="DIRECTORY" title="Consignees" subtitle="Create and manage the consignee records assigned to your shipments." action={<button className="button primary" onClick={() => setModalConsignee(null)}><Plus size={17} /> Create consignee</button>} />{error && <div className="inline-error">{error}</div>}<ConsigneeDirectory consignees={consignees} shipments={shipments} onEdit={setModalConsignee} onAdd={() => setModalConsignee(null)} /></>;
    if (active === "users" && authState?.role === "super-admin") return <><PageTitle eyebrow="ADMINISTRATION" title="Users" subtitle="Create user accounts and select their left sidebar access." action={<button className="button primary" onClick={() => setModalUser(null)}><Plus size={17} /> Create user</button>} /><UserDirectory users={users} onEdit={setModalUser} /></>;
    if (active === "settings" && (authState?.role === "super-admin" || authState?.sidebarAccess?.includes("settings"))) return <><PageTitle eyebrow="ADMINISTRATION" title="Settings" subtitle={authState.role === "super-admin" ? "Manage user-specific display preferences." : "Manage your display preferences."} /><FontSizeSettings users={users} account={authState} isSuperAdmin={authState.role === "super-admin"} onSave={async (userId, fontSize) => { const updated = await api.updateFontSize(userId, fontSize); if (authState.role === "user" || userId === "super-admin") setAuthState((current) => ({ ...current, fontSize: updated.fontSize })); else setUsers((current) => current.map((user) => user.id === userId ? updated : user)); setNotice("Font size updated successfully"); }} /></>;
    if (active === "countries") return <><PageTitle eyebrow="DIRECTORY" title="Countries & currencies" subtitle="Manage country and currency lists separately." action={<button className="button primary" title="Create country (F1)" onClick={() => setModalCountry(null)}><Plus size={17} /> Create country</button>} />{error && <div className="inline-error">{error}</div>}<CountryDirectory countries={countries} onEdit={setModalCountry} onAdd={() => setModalCountry(null)} /><CurrencyDirectory currencies={currencies} onEdit={setModalCurrency} onAdd={() => setModalCurrency(null)} /></>;
    if (active === "documents") return <><PageTitle eyebrow="PAPERWORK" title="Documents" subtitle="Track required shipping and customs documents in one place." />{error && <div className="inline-error">{error}</div>}<DocumentsView shipments={shipments} consignees={consignees} onEdit={openModal} /></>;
    if (active === "analytics") return <><PageTitle eyebrow="PERFORMANCE" title="Reports & analytics" subtitle="Monitor shipment delays, landed costs and monthly activity." />{error && <div className="inline-error">{error}</div>}<AnalyticsView analytics={analytics} /></>;
    return <Dashboard shipments={shipments} consignees={consignees} analytics={analytics} accountName={authState?.name || authState?.username} onNavigate={setActive} onEdit={openModal} onAdd={() => openModal(null)} onImport={() => setModalShipmentImport(true)} />;
  }

  if (!authState?.authenticated) {
    return (
      <AuthScreen
        setupRequired={authState?.setupRequired || false}
        theme={theme}
        onToggleTheme={() => setTheme((current) => current === "light" ? "dark" : "light")}
        onAuthenticated={markAuthenticated}
        loading={!authState && !authError}
        connectionError={authError}
        onRetry={loadAuthStatus}
      />
    );
  }

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} data-theme={theme} style={{ "--user-font-scale": (authState.fontSize || 100) / 100 }}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Ship size={21} /></div><div className="brand-copy"><strong>FMJ <span>ShipTrack</span></strong><small>IMPORT MANAGEMENT</small></div><button className="sidebar-toggle icon-button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button><button className="mobile-close icon-button" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>{availableNavigation.map(({ label, icon: Icon, key }) => <button key={key} title={sidebarCollapsed ? label : undefined} className={`nav-item ${active === key ? "active" : ""}`} onClick={() => { setActive(key); setSidebarOpen(false); }}><Icon size={18} /><span>{label}</span>{key === "tracking" && analytics?.delayed > 0 && <i className="nav-count">{analytics.delayed}</i>}</button>)}
          {canAccessReports && <div className="reports-nav-group"><button title={sidebarCollapsed ? "Reports & Analytics" : undefined} className={`nav-item reports-nav-toggle ${active.startsWith("report-") ? "active" : ""}`} onClick={() => sidebarCollapsed ? setSidebarCollapsed(false) : setReportsOpen((open) => !open)} aria-expanded={reportsOpen}><Activity size={18} /><span>Reports &amp; Analytics</span><ChevronDown size={15} className={reportsOpen ? "reports-nav-chevron open" : "reports-nav-chevron"} /></button>
            {reportsOpen && <div className="reports-nav-links">{reportNavigation.map(({ label, key }) => <button key={key} className={`reports-nav-link ${active === key ? "active" : ""}`} onClick={() => { setActive(key); setSidebarOpen(false); }}>{label}</button>)}</div>}
          </div>}
          {authState?.role === "super-admin" && <button title={sidebarCollapsed ? "Users" : undefined} className={`nav-item ${active === "users" ? "active" : ""}`} onClick={() => { setActive("users"); setSidebarOpen(false); }}><Users size={18} /><span>Users</span></button>}
          {authState?.role === "super-admin" && <button title={sidebarCollapsed ? "Settings" : undefined} className={`nav-item ${active === "settings" ? "active" : ""}`} onClick={() => { setActive("settings"); setSidebarOpen(false); }}><Settings size={18} /><span>Settings</span></button>}
          {authState?.role === "user" && authState.sidebarAccess?.includes("settings") && <button title={sidebarCollapsed ? "Settings" : undefined} className={`nav-item ${active === "settings" ? "active" : ""}`} onClick={() => { setActive("settings"); setSidebarOpen(false); }}><Settings size={18} /><span>Settings</span></button>}
        </nav>
        <div className="sidebar-bottom"><div className="profile"><div className="profile-avatar">FM</div><div className="profile-name"><strong>{authState.name || authState.username}</strong><span>{authState.role === "super-admin" ? "Super administrator" : "Team user"}</span></div></div></div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeTitle}</strong></div>
          <div className="topbar-right">
            <div className={`system-status ${error ? "offline" : ""}`}><i /> {error ? "Connection issue" : "All systems operational"}</div>
            <button className="icon-button theme-toggle" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`} onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
            <button className="top-icon icon-button" aria-label="Notifications" onClick={() => setNotice("You're all caught up.")}><Bell size={18} /><i /></button>
            <div className="top-divider" />
            <div className="account-menu-wrap" ref={accountMenuRef}>
              <button className="top-user account-trigger" aria-expanded={accountMenuOpen} aria-haspopup="menu" aria-label="Open account menu" onClick={() => setAccountMenuOpen((open) => !open)}><span className="profile-avatar small">FM</span><ChevronDown size={15} /></button>
              {accountMenuOpen && <div className="account-menu" role="menu"><div className="account-menu-user"><strong>{authState.name || authState.username}</strong><span>{authState.role === "super-admin" ? "Super administrator" : `@${authState.username}`}</span></div><button className="account-menu-signout" role="menuitem" onClick={() => { setAccountMenuOpen(false); setConfirmSignOut(true); }}><LogOut size={16} />Sign out</button></div>}
            </div>
          </div>
        </header>
        <main className={`content ${["materials", "post-costing", "to-be-tt", "tt-sent", "under-clearing", "cleared-shipments", ...reportNavigation.map((item) => item.key)].includes(active) ? "content-wide" : ""}`}>
          {renderContent()}
          <footer className="app-footer"><span>© 2026 FMJ ShipTrack</span><span>Shipment management, made simpler.</span></footer>
        </main>
      </div>
      {sidebarOpen && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      {modalShipment !== undefined && <ShipmentModal initial={modalShipment} consignees={consigneeOptions} countries={countries} currencies={currencies} onClose={() => setModalShipment(undefined)} onSave={saveShipment} />}
      {paymentLedgerShipment !== undefined && <PaymentLedgerModal shipment={paymentLedgerShipment} onClose={() => setPaymentLedgerShipment(undefined)} onSave={saveShipment} />}
      {modalShipmentImport && <ShipmentImportModal consignees={consigneeOptions} shipments={shipments} onClose={() => setModalShipmentImport(false)} onImport={importShipments} />}
      {ttSentDateShipment !== undefined && <TTSentDateModal shipment={ttSentDateShipment} onClose={() => setTtSentDateShipment(undefined)} onSave={saveTTSentDates} />}
      {underClearingShipment !== undefined && <UnderClearingModal shipment={underClearingShipment} onClose={() => setUnderClearingShipment(undefined)} onSave={saveUnderClearingShipment} />}
      {clearedShipment !== undefined && <ClearedShipmentModal shipment={clearedShipment} onClose={() => setClearedShipment(undefined)} onSave={saveClearedShipment} />}
      {modalConsignee !== undefined && <ConsigneeModal initial={modalConsignee} onClose={() => setModalConsignee(undefined)} onSave={saveConsignee} />}
      {modalCountry !== undefined && <CountryModal initial={modalCountry} onClose={() => setModalCountry(undefined)} onSave={saveCountry} />}
      {modalCurrency !== undefined && <CurrencyModal initial={modalCurrency} onClose={() => setModalCurrency(undefined)} onSave={saveCurrency} />}
      {modalUser !== undefined && <UserModal initial={modalUser} onClose={() => setModalUser(undefined)} onSave={async (user, id, remove = false) => {
        if (remove) {
          await api.deleteUser(id);
          setUsers((current) => current.filter((item) => item.id !== id));
          setNotice("User deleted");
        } else if (id) {
          const updated = await api.updateUser(id, user);
          setUsers((current) => current.map((item) => item.id === id ? updated : item));
          setNotice("User updated successfully");
        } else {
          const created = await api.createUser(user);
          setUsers((current) => [...current, created]);
          setNotice("User created successfully");
        }
      }} />}
      {confirmSignOut && <div className="modal-backdrop signout-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmSignOut(false); }}><section className="signout-dialog" role="alertdialog" aria-modal="true" aria-labelledby="signout-title" aria-describedby="signout-description"><div className="signout-icon"><LogOut size={19} /></div><h2 id="signout-title">Sign out of ShipTrack?</h2><p id="signout-description">Are you sure you want to sign out? You’ll need to verify your email again to access your shipment workspace.</p><div className="signout-actions"><button className="button secondary" onClick={() => setConfirmSignOut(false)}>No, stay signed in</button><button className="button signout-confirm" onClick={signOut}>Yes, sign out</button></div></section></div>}
      {notice && <div className="toast"><CheckCircle2 size={17} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
    </div>
  );
}
