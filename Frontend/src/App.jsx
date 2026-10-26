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
  Plus,
  ShieldCheck,
  Ship,
  Moon,
  Sun,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
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
const paymentStatuses = ["Pending", "Paid"];
const documentTypes = ["PI", "CI", "Packing List", "BL/AWB", "Customs"];
const emptyShipment = {
  importNo: "",
  company: "",
  supplier: "",
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
    ADVANCE_TT: "100% Advance Payment by TT",
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
  const rows = shipments.map((shipment) => ({
    "Import No.": shipment.importNo,
    Consignee: shipment.consignee || shipment.company,
    Shipper: shipment.supplier,
    "Item Description": shipment.description,
    "FCL/LCL": transportLabel(shipment),
    "Payment Terms": paymentTermsLabel(shipment),
    Currency: shipment.currency || "LKR",
    Value: Number(shipment.totalCost || 0),
    ETD: shipment.etd ? new Date(`${shipment.etd}T00:00:00`) : "",
    "ETA CMB": shipment.eta ? new Date(`${shipment.eta}T00:00:00`) : "",
    "Duty (LKR)": Number(shipment.duty || 0),
    "DO (LKR)": Number(shipment.doCharges || 0),
    Remarks: shipment.remarks || "",
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const lastRow = rows.length + 1;
  worksheet["!autofilter"] = { ref: `A1:M${lastRow}` };
  worksheet["!cols"] = [
    { wch: 16 }, { wch: 24 }, { wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 30 },
    { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 34 },
  ];
  for (let index = 2; index <= lastRow; index += 1) {
    for (const column of ["H", "K", "L"]) if (worksheet[`${column}${index}`]) worksheet[`${column}${index}`].z = "0.00";
    for (const column of ["I", "J"]) if (worksheet[`${column}${index}`]) worksheet[`${column}${index}`].z = "dd/mm/yyyy";
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

function StatCard({ label, value, helper, icon: Icon, color, trend }) {
  return (
    <article className="stat-card">
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

function ShipmentActions({ shipment, onEdit, onDelete }) {
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

function ShipmentTable({ rows, mode, onEdit, onDelete, onAdd, onTTSent, onUnderClearing, onCleared, showActions = true, consignees = [] }) {
  if (!rows.length) return <EmptyState message={mode === "shipments" ? "No shipment records yet" : "No shipments found"} onAdd={onAdd} />;
  if (mode === "payment-cards") return (
    <div className="payment-details-list">
      {rows.map((shipment) => {
        const incoterm = [shipment.incoterm, shipment.incotermLocation].filter(Boolean).join(" · ") || "—";
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
    payments: ["Import No.", "Consignee", "Shipper", "Item description", "Transport", "Incoterm", "Payment terms", "Value", "ETD", "ETA CMB", "Duty (LKR)", "DO (LKR)", "Clearance", "Remarks", ""],
    customs: ["Import No.", "Consignee", "Duty", "DO charges", "Clearance progress", "Clearance status", "Shipment status", ""],
  }[mode];
  const workflowAction = onTTSent ? { label: "TT Sent", onClick: onTTSent } : onUnderClearing ? { label: "Under Clearing", onClick: onUnderClearing } : onCleared ? { label: "Cleared", onClick: onCleared } : null;
  const visibleHeaders = workflowAction ? [...headers.slice(0, -1), workflowAction.label, ""] : headers;
  const tableHeaders = showActions ? visibleHeaders : visibleHeaders.slice(0, -1);

  return (
    <div className="table-scroll">
      <table>
        <thead><tr>{tableHeaders.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead>
        <tbody>
          {rows.map((shipment) => (
            <tr key={shipment.id}>
              {mode === "shipments" && <>
                <td className="consignee-row-first" style={{ "--consignee-color": consigneeColorFor(shipment.company, consignees) }}><span className="import-id">{shipment.importNo}</span><small>{shipment.description}</small></td>
                <td><ConsigneeBadge code={shipment.company} consignees={consignees} /></td>
                <td>{shipment.supplier}</td><td>{shipment.consignee}</td>
                <td className="description-cell">{shipment.description}</td><td>{dateLabel(shipment.eta)}</td>
                <td><StatusBadge>{shipment.status}</StatusBadge></td>
              </>}
              {mode === "tracking" && <>
                <td className="consignee-row-first" style={{ "--consignee-color": consigneeColorFor(shipment.company, consignees) }}><span className="import-id">{shipment.importNo}</span><small><ConsigneeBadge code={shipment.company} consignees={consignees} /></small></td>
                <td>{shipment.supplier}</td><td>{dateLabel(shipment.etd)}</td><td>{dateLabel(shipment.eta)}</td>
                <td>{dateLabel(shipment.arrivalDate)}</td><td>{dateLabel(shipment.deliveryDate)}</td><td><StatusBadge>{shipment.status}</StatusBadge></td>
              </>}
              {mode === "payments" && <>
                <td className="consignee-row-first" style={{ "--consignee-color": consigneeColorFor(shipment.company, consignees) }}><span className="import-id">{shipment.importNo}</span></td>
                <td><ConsigneeBadge code={shipment.company} label={shipment.consignee || shipment.company || "—"} showName consignees={consignees} /></td><td>{shipment.supplier || "—"}</td>
                <td className="description-cell">{shipment.description || "—"}</td><td>{transportLabel(shipment)}</td>
                <td>{[shipment.incoterm, shipment.incotermLocation].filter(Boolean).join(" · ") || "—"}</td>
                <td>{paymentTermsLabel(shipment)}</td><td>{currencyAmount(shipment.totalCost, shipment.currency)}</td>
                <td>{dateLabel(shipment.etd)}</td><td>{dateLabel(shipment.eta)}</td>
                <td>{decimalAmount(shipment.duty)}</td><td>{decimalAmount(shipment.doCharges)}</td>
                <td>{shipment.clearanceStatus || "—"}</td>
                <td className="description-cell">{shipment.remarks || "—"}</td>
                {workflowAction && <td><button type="button" className="tt-sent-update-button" onClick={() => workflowAction.onClick(shipment)}>{workflowAction.label}</button></td>}
              </>}
              {mode === "customs" && <>
                <td className="consignee-row-first" style={{ "--consignee-color": consigneeColorFor(shipment.company, consignees) }}><span className="import-id">{shipment.importNo}</span><small>{shipment.supplier}</small></td>
                <td><ConsigneeBadge code={shipment.company} consignees={consignees} /></td><td>{money(shipment.duty)}</td>
                <td>{money(shipment.doCharges)}</td><td><span className="progress-copy">{shipment.clearanceStatus}</span></td>
                <td><StatusBadge tone={shipment.clearanceStatus === "Cleared" ? "cleared" : "under-clearing"}>{shipment.clearanceStatus}</StatusBadge></td>
                <td><StatusBadge>{shipment.status}</StatusBadge></td>
              </>}
              {showActions && <td>{mode === "payments" ? <ShipmentActions shipment={shipment} onEdit={onEdit} onDelete={onDelete} /> : <button className="icon-button row-more" aria-label={`Edit ${shipment.importNo}`} title="Edit shipment" onClick={() => onEdit(shipment)}><MoreHorizontal size={18} /></button>}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const emptyShipmentFilters = { search: "", consignee: "", transportMode: "", fclLcl: "" };

function filterShipmentRows(rows, filters) {
  const search = filters.search.trim().toLowerCase();
  return rows.filter((shipment) => {
    const searchable = [shipment.importNo, shipment.consignee, shipment.company, shipment.supplier, shipment.description, shipment.remarks]
      .filter(Boolean).join(" ").toLowerCase();
    return (!search || searchable.includes(search))
      && (!filters.consignee || shipment.company === filters.consignee)
      && (!filters.transportMode || shipment.transportMode === filters.transportMode)
      && (!filters.fclLcl || shipment.fclLcl === filters.fclLcl);
  });
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

function ShipmentListPage({ eyebrow, title, subtitle, rows, mode = "shipments", consignees, onEdit, onDelete, onAdd, onTTSent, onUnderClearing, onCleared, showAdd = true, footer }) {
  const [filters, setFilters] = useState(emptyShipmentFilters);
  const filteredRows = filterShipmentRows(rows, filters);
  return <>
    <PageTitle eyebrow={eyebrow} title={title} subtitle={subtitle} action={showAdd ? <button className="button primary" onClick={onAdd}><Plus size={17} /> Add shipment</button> : undefined} />
    <section className="panel table-panel">
      <div className="table-toolbar"><div className="table-title"><h2>{title}</h2><span className="count-pill">{filteredRows.length}</span></div><ShipmentFilterControls filters={filters} onChange={setFilters} consignees={consignees} /></div>
      <ShipmentTable rows={filteredRows} mode={mode} onEdit={onEdit} onDelete={onDelete} onAdd={showAdd ? onAdd : undefined} onTTSent={onTTSent} onUnderClearing={onUnderClearing} onCleared={onCleared} consignees={consignees} />
      <div className="table-footer"><span><strong>{filteredRows.length}</strong> of {rows.length} {footer || "shipments"}</span><span>Data saved automatically</span></div>
    </section>
  </>;
}

function ShipmentSummarySections({ shipments, consignees, onEdit, onDelete }) {
  const [filters, setFilters] = useState(emptyShipmentFilters);
  const filteredShipments = filterShipmentRows(shipments, filters);
  const underClearing = filteredShipments.filter((shipment) => shipment.status === "Under Clearing");
  const ttSent = filteredShipments.filter((shipment) =>
    shipment.status !== "Under Clearing"
    && shipment.paymentMethod === "Advance TT"
    && shipment.paymentStatus === "Paid"
    && shipment.status === "Pending",
  );
  const toBeTT = filteredShipments.filter((shipment) =>
    shipment.status !== "Under Clearing"
    && shipment.paymentMethod === "Advance TT"
    && shipment.paymentStatus === "Pending",
  );
  const sections = [
    ["Under Clearing Shipment", underClearing],
    ["TT SENT", ttSent],
    ["To be TT", toBeTT],
  ];

  return <>
    <PageTitle eyebrow="REPORTS & ANALYTICS" title="SHIPMENT" subtitle="All shipment records, arranged in the same sections as the shipment workbook." />
    <section className="panel table-panel shipment-summary-filter"><div className="table-toolbar"><div className="table-title"><h2>Filters</h2><span className="count-pill">{filteredShipments.length}</span></div><ShipmentFilterControls filters={filters} onChange={setFilters} consignees={consignees} /></div></section>
    <div className="shipment-summary-sections">
      {sections.map(([title, rows]) => <section className="panel table-panel" key={title}>
        <div className="table-toolbar"><div className="table-title"><h2>{title}</h2><span className="count-pill">{rows.length}</span></div></div>
        <ShipmentTable rows={rows} mode="payments" onEdit={onEdit} onDelete={onDelete} consignees={consignees} />
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
              <label className="shipment-field shipment-field--description">Item Description<input name="description" value={form.description} onChange={change} required /></label>
              <label className="shipment-field shipment-field--payment-terms">Payment Terms<select name="paymentTerms" value={form.paymentTerms} onChange={(event) => {
                const paymentTerms = event.target.value;
                const paymentMethod = paymentTerms === "LETTER_OF_CREDIT" ? "Letter of credit"
                  : paymentTerms === "ADVANCE_TT" ? "Advance TT"
                    : paymentTerms === "DA_BL" ? "DA - From date of BL"
                      : paymentTerms === "DP_SIGHT" ? "DP of Sight"
                        : paymentTerms === "OPEN_ACCOUNT" ? "Open account" : "";
                setForm((current) => ({ ...current, paymentTerms, paymentMethod, paymentTermType: "", paymentTermDays: "" }));
              }} required><option value="">Select payment terms</option><option value="LETTER_OF_CREDIT">Letter of credit</option><option value="ADVANCE_TT">100% Advance Payment by TT</option><option value="DA_BL">DA - From date of BL</option><option value="DP_SIGHT">DP of Sight</option><option value="OPEN_ACCOUNT">Open account</option></select></label>
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
              {initial && <label className="shipment-field shipment-field--conditional">Payment status<select name="paymentStatus" value={form.paymentStatus} onChange={change}>{paymentStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>}
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

function Dashboard({ shipments, consignees, analytics, onNavigate, onEdit, onAdd, onImport }) {
  const [monthRange, setMonthRange] = useState(6);
  const monthlyData = (analytics?.monthly || []).slice(-monthRange);
  const maxMonthly = Math.max(1, ...monthlyData.map((item) => item.shipments));
  const chartMaximum = Math.max(4, Math.ceil(maxMonthly / 4) * 4);
  const chartTicks = Array.from({ length: 5 }, (_, index) => chartMaximum - (chartMaximum / 4) * index);
  return (
    <>
      <PageTitle eyebrow="OVERVIEW" title="Good morning, team" subtitle="Here's what's happening with your shipments today." action={<div className="page-actions"><button className="button secondary" onClick={downloadShipmentImportTemplate}><Download size={16} /> Download template</button><button className="button secondary" onClick={onImport}><Upload size={16} /> Import Excel</button></div>} />
      <section className="stat-grid">
        <StatCard label="Total shipments" value={analytics?.total ?? "—"} helper="Live records from MongoDB" icon={Ship} color="blue" />
        <StatCard label="Pending" value={analytics?.pending ?? "—"} helper="Awaiting next action" icon={Clock3} color="amber" />
        <StatCard label="Under clearing" value={analytics?.underClearing ?? "—"} helper="At customs now" icon={ArrowDownToLine} color="violet" />
        <StatCard label="Cleared" value={analytics?.cleared ?? "—"} helper="Currently cleared" icon={PackageCheck} color="green" />
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
          <div className="panel-heading"><div><h2>Shipment status</h2><p>Current portfolio overview</p></div><button className="icon-button"><MoreHorizontal size={20} /></button></div>
          <div className="status-total"><strong>{analytics?.total ?? 0}</strong><span>Total shipments</span></div>
          <div className="status-stack"><i className="stack-cleared" style={{ flex: analytics?.cleared || 0.1 }} /><i className="stack-clearing" style={{ flex: analytics?.underClearing || 0.1 }} /><i className="stack-pending" style={{ flex: analytics?.pending || 0.1 }} /></div>
          <div className="legend-list">
            {shipmentStatuses.map((status) => <div className="legend-row" key={status}><span><i className={`legend-dot ${status.toLowerCase().replace(" ", "-")}`} />{status}</span><strong>{analytics?.byStatus?.[status] ?? 0}</strong></div>)}
          </div>
        </section>
        <section className="panel recent-panel">
          <div className="panel-heading"><div><h2>Recent shipments</h2><p>Latest updates across your imports</p></div></div>
          <ShipmentTable rows={shipments.slice(0, 5)} mode="shipments" onEdit={onEdit} onAdd={onAdd} showActions={false} consignees={consignees} />
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
  const rows = shipments.flatMap((shipment) => documentTypes.map((document) => ({
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
              <div><span><ShieldCheck size={17} /></span><strong>Private super-admin access</strong></div>
              <div><span><MailCheck size={17} /></span><strong>One-time email verification code</strong></div>
              <div><span><CheckCircle2 size={17} /></span><strong>Shipment records protected behind sign-in</strong></div>
            </div>
          </div>
          <div className="auth-legal">FMJ ShipTrack <span>·</span> Secure operations workspace</div>
        </section>
        <section className="auth-card-wrap">
          <div className="auth-card">
            <div className="auth-card-icon">{mode === "otp" ? <MailCheck size={21} /> : <ShieldCheck size={21} />}</div>
            <div className="auth-card-eyebrow">{mode === "setup" ? "ONE-TIME INITIALIZATION" : "SUPER-ADMIN ACCESS"}</div>
            <h2>{mode === "setup" ? "Create your admin account" : mode === "otp" ? "Check your email" : "Welcome back"}</h2>
            <p className="auth-card-subtitle">
              {mode === "setup"
                ? "Set up the only super-admin account. This page locks after setup."
                : mode === "otp"
                  ? "Enter the 6-digit code sent to your registered admin email."
                  : "Sign in with your own credentials to receive a one-time verification code."}
            </p>
            {loading && <div className="auth-message">Checking secure sign-in…</div>}
            {!loading && connectionError && <div className="auth-error">{connectionError}<button type="button" onClick={onRetry}>Retry connection</button></div>}
            {!loading && !connectionError && <form className="auth-form" onSubmit={submit}>
              {mode !== "otp" && <>
                {mode === "setup" && <label>One-time setup key<input type="password" autoComplete="off" value={setupKey} onChange={(event) => setSetupKey(event.target.value)} required minLength={32} placeholder="Paste the private setup key" /></label>}
                <label>Username<input type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={40} pattern="[A-Za-z0-9._\-]+" placeholder="Your username" /></label>
                <label>Password<input type="password" autoComplete={mode === "setup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={128} placeholder={mode === "setup" ? "At least 12 characters" : "Your password"} /></label>
              </>}
              {mode === "otp" && <>
                <div className="otp-destination"><MailCheck size={16} /><span>Code sent to <strong>sw.developer.fmj@gmail.com</strong></span></div>
                <label>6-digit verification code<input className="otp-input" type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required pattern="[0-9]{6}" maxLength={6} placeholder="000000" autoFocus /></label>
              </>}
              {notice && <div className="auth-message">{notice}</div>}
              {error && <div className="auth-error">{error}</div>}
              <button className="auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "setup" ? "Create account & continue" : mode === "otp" ? "Verify & sign in" : "Continue with email code"}<ArrowRight size={16} /></button>
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
  const [analytics, setAnalytics] = useState(null);
  const [modalShipment, setModalShipment] = useState(undefined);
  const [modalShipmentImport, setModalShipmentImport] = useState(false);
  const [ttSentDateShipment, setTtSentDateShipment] = useState(undefined);
  const [underClearingShipment, setUnderClearingShipment] = useState(undefined);
  const [clearedShipment, setClearedShipment] = useState(undefined);
  const [modalConsignee, setModalConsignee] = useState(undefined);
  const [modalCountry, setModalCountry] = useState(undefined);
  const [modalCurrency, setModalCurrency] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [ttFilters, setTtFilters] = useState(emptyShipmentFilters);
  const accountMenuRef = useRef(null);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [shipmentData, analyticsData, consigneeData, countryData, currencyData] = await Promise.all([
        api.getShipments(),
        api.getAnalytics(),
        api.getConsignees(),
        api.getCountries(),
        api.getCurrencies(),
      ]);
      setShipments(shipmentData);
      setAnalytics(analyticsData);
      setConsignees(consigneeData);
      setCountries(countryData);
      setCurrencies(currencyData);
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
    };
    window.addEventListener("fmj-session-expired", expireSession);
    return () => window.removeEventListener("fmj-session-expired", expireSession);
  }, []);
  useEffect(() => {
    localStorage.setItem("fmj-shiptrack-theme", theme);
  }, [theme]);
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
    await api.updateShipment(shipment.id, { ...shipment, etd, eta, remarks, paymentStatus: "Paid" });
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

  const activeTitle = [...navigation, ...reportNavigation].find((item) => item.key === active)?.label || "Dashboard";
  const openModal = (shipment) => setModalShipment(shipment || null);
  const markAuthenticated = (username) => {
    setAuthError("");
    setAuthState({ setupRequired: false, authenticated: true, username });
    setLoading(true);
  };

  function renderContent() {
    if (loading) return <div className="loading-state"><span className="loader" />Loading shipment workspace…</div>;
    if (error && !shipments.length) return <div className="error-state"><strong>Unable to load shipments</strong><span>{error}</span><button className="button secondary" onClick={refresh}>Try again</button></div>;
    if (active === "dashboard") return <Dashboard shipments={shipments} consignees={consignees} analytics={analytics} onNavigate={setActive} onEdit={openModal} onAdd={() => openModal(null)} onImport={() => setModalShipmentImport(true)} />;
    if (active === "to-be-tt") {
      const pendingTTShipments = shipments.filter((shipment) =>
        shipment.paymentMethod === "Advance TT" && shipment.paymentStatus === "Pending",
      );
      const filteredPendingTTShipments = filterShipmentRows(pendingTTShipments, ttFilters);
      return <section className="to-be-tt-page">
        <PageTitle eyebrow="PAYMENTS" title="To be TT" subtitle="Shipments awaiting Advance TT payment." action={<button className="button primary" onClick={() => openModal(null)}><Plus size={17} /> Add shipment</button>} />
        {error && <div className="inline-error">{error}</div>}
        <section className="panel table-panel tt-payments-panel">
          <div className="table-toolbar"><div className="table-title"><h2>Pending TT payments</h2><span className="count-pill">{filteredPendingTTShipments.length}</span></div><ShipmentFilterControls filters={ttFilters} onChange={setTtFilters} consignees={consigneeOptions} exportAction={() => exportPendingTTToExcel(filteredPendingTTShipments)} exportDisabled={!filteredPendingTTShipments.length} /></div>
          <ShipmentTable rows={filteredPendingTTShipments} mode="payments" onEdit={openModal} onDelete={deleteShipmentFromList} onAdd={() => openModal(null)} onTTSent={setTtSentDateShipment} consignees={consignees} />
          <div className="table-footer"><span><strong>{filteredPendingTTShipments.length}</strong> of {pendingTTShipments.length} shipments awaiting Advance TT</span><span>Data saved automatically</span></div>
        </section>
      </section>;
    }
    if (active === "tt-sent") {
      const ttSentShipments = shipments.filter((shipment) => shipment.paymentMethod === "Advance TT" && shipment.paymentStatus === "Paid" && shipment.status === "Pending");
      return <ShipmentListPage eyebrow="PAYMENTS" title="TT Sent" subtitle="Advance TT shipments whose payment has been sent." rows={ttSentShipments} mode="payments" consignees={consignees} onEdit={openModal} onDelete={deleteShipmentFromList} onAdd={() => openModal(null)} onUnderClearing={setUnderClearingShipment} showAdd={false} footer="Advance TT payments sent" />;
    }
    if (active === "under-clearing") {
      const underClearingShipments = shipments.filter((shipment) => shipment.status === "Under Clearing");
      return <ShipmentListPage eyebrow="CLEARANCE" title="Under Clearing Shipments" subtitle="Shipments currently progressing through customs clearance." rows={underClearingShipments} mode="payments" consignees={consignees} onEdit={openModal} onDelete={deleteShipmentFromList} onAdd={() => openModal(null)} onCleared={setClearedShipment} showAdd={false} footer="shipments under clearing" />;
    }
    if (active === "cleared-shipments") {
      const clearedShipments = shipments.filter((shipment) => shipment.status === "Cleared");
      return <ShipmentListPage eyebrow="CLEARANCE" title="Cleared Shipments" subtitle="Shipments that have completed customs clearance." rows={clearedShipments} mode="payments" consignees={consignees} onEdit={openModal} onDelete={deleteShipmentFromList} onAdd={() => openModal(null)} showAdd={false} footer="cleared shipments" />;
    }
    if (active.startsWith("report-")) {
      const report = reportNavigation.find((item) => item.key === active);
      const consigneeCode = report?.consigneeName && consignees.find((item) => item.name.toUpperCase() === report.consigneeName)?.code;
      const reportShipments = report?.key === "report-cleared"
        ? shipments.filter((shipment) => shipment.status === "Cleared")
        : report?.consigneeName ? shipments.filter((shipment) => shipment.status === "Cleared" && (shipment.company === consigneeCode || shipment.company === report.consigneeName)) : shipments;
      if (report?.key === "report-shipment") {
        return <ShipmentSummarySections shipments={reportShipments} consignees={consignees} onEdit={openModal} onDelete={deleteShipmentFromList} />;
      }
      return <ShipmentListPage eyebrow="REPORTS & ANALYTICS" title={report?.label || "SHIPMENT"} subtitle={report?.key === "report-cleared" ? "Cleared shipment records." : report?.consigneeName ? `Cleared shipment records for ${report.consigneeName}.` : "All shipment records."} rows={reportShipments} mode="payments" consignees={consignees} onEdit={openModal} onDelete={deleteShipmentFromList} onAdd={() => openModal(null)} showAdd={false} footer="shipment records" />;
    }
    if (active === "companies") return <><PageTitle eyebrow="CONSIGNEES" title="Consignee reports" subtitle="A clear view of imports and clearance progress for each consignee." />{error && <div className="inline-error">{error}</div>}<ConsigneeReports analytics={analytics} shipments={shipments} consignees={consignees} onEdit={openModal} /></>;
    if (active === "consignees") return <><PageTitle eyebrow="DIRECTORY" title="Consignees" subtitle="Create and manage the consignee records assigned to your shipments." action={<button className="button primary" onClick={() => setModalConsignee(null)}><Plus size={17} /> Create consignee</button>} />{error && <div className="inline-error">{error}</div>}<ConsigneeDirectory consignees={consignees} shipments={shipments} onEdit={setModalConsignee} onAdd={() => setModalConsignee(null)} /></>;
    if (active === "countries") return <><PageTitle eyebrow="DIRECTORY" title="Countries & currencies" subtitle="Manage country and currency lists separately." action={<button className="button primary" title="Create country (F1)" onClick={() => setModalCountry(null)}><Plus size={17} /> Create country</button>} />{error && <div className="inline-error">{error}</div>}<CountryDirectory countries={countries} onEdit={setModalCountry} onAdd={() => setModalCountry(null)} /><CurrencyDirectory currencies={currencies} onEdit={setModalCurrency} onAdd={() => setModalCurrency(null)} /></>;
    if (active === "documents") return <><PageTitle eyebrow="PAPERWORK" title="Documents" subtitle="Track required shipping and customs documents in one place." />{error && <div className="inline-error">{error}</div>}<DocumentsView shipments={shipments} consignees={consignees} onEdit={openModal} /></>;
    if (active === "analytics") return <><PageTitle eyebrow="PERFORMANCE" title="Reports & analytics" subtitle="Monitor shipment delays, landed costs and monthly activity." />{error && <div className="inline-error">{error}</div>}<AnalyticsView analytics={analytics} /></>;
    return <Dashboard shipments={shipments} consignees={consignees} analytics={analytics} onNavigate={setActive} onEdit={openModal} onAdd={() => openModal(null)} onImport={() => setModalShipmentImport(true)} />;
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
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : ""}`} data-theme={theme}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Ship size={21} /></div><div><strong>FMJ <span>ShipTrack</span></strong><small>IMPORT MANAGEMENT</small></div><button className="mobile-close icon-button" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>{navigation.map(({ label, icon: Icon, key }) => <button key={key} className={`nav-item ${active === key ? "active" : ""}`} onClick={() => { setActive(key); setSidebarOpen(false); }}><Icon size={18} /><span>{label}</span>{key === "tracking" && analytics?.delayed > 0 && <i className="nav-count">{analytics.delayed}</i>}</button>)}
          <div className="reports-nav-group"><button className={`nav-item reports-nav-toggle ${active.startsWith("report-") ? "active" : ""}`} onClick={() => setReportsOpen((open) => !open)} aria-expanded={reportsOpen}><Activity size={18} /><span>Reports &amp; Analytics</span><ChevronDown size={15} className={reportsOpen ? "reports-nav-chevron open" : "reports-nav-chevron"} /></button>
            {reportsOpen && <div className="reports-nav-links">{reportNavigation.map(({ label, key }) => <button key={key} className={`reports-nav-link ${active === key ? "active" : ""}`} onClick={() => { setActive(key); setSidebarOpen(false); }}>{label}</button>)}</div>}
          </div>
        </nav>
        <div className="sidebar-bottom"><div className="profile"><div className="profile-avatar">FM</div><div className="profile-name"><strong>{authState.username}</strong><span>Super administrator</span></div></div></div>
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
              {accountMenuOpen && <div className="account-menu" role="menu"><div className="account-menu-user"><strong>{authState.username}</strong><span>Super administrator</span></div><button className="account-menu-signout" role="menuitem" onClick={() => { setAccountMenuOpen(false); setConfirmSignOut(true); }}><LogOut size={16} />Sign out</button></div>}
            </div>
          </div>
        </header>
        <main className={`content ${["to-be-tt", "tt-sent", "under-clearing", "cleared-shipments", ...reportNavigation.map((item) => item.key)].includes(active) ? "content-wide" : ""}`}>
          {renderContent()}
          <footer className="app-footer"><span>© 2026 FMJ ShipTrack</span><span>Shipment management, made simpler.</span></footer>
        </main>
      </div>
      {sidebarOpen && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      {modalShipment !== undefined && <ShipmentModal initial={modalShipment} consignees={consigneeOptions} countries={countries} currencies={currencies} onClose={() => setModalShipment(undefined)} onSave={saveShipment} />}
      {modalShipmentImport && <ShipmentImportModal consignees={consigneeOptions} shipments={shipments} onClose={() => setModalShipmentImport(false)} onImport={importShipments} />}
      {ttSentDateShipment !== undefined && <TTSentDateModal shipment={ttSentDateShipment} onClose={() => setTtSentDateShipment(undefined)} onSave={saveTTSentDates} />}
      {underClearingShipment !== undefined && <UnderClearingModal shipment={underClearingShipment} onClose={() => setUnderClearingShipment(undefined)} onSave={saveUnderClearingShipment} />}
      {clearedShipment !== undefined && <ClearedShipmentModal shipment={clearedShipment} onClose={() => setClearedShipment(undefined)} onSave={saveClearedShipment} />}
      {modalConsignee !== undefined && <ConsigneeModal initial={modalConsignee} onClose={() => setModalConsignee(undefined)} onSave={saveConsignee} />}
      {modalCountry !== undefined && <CountryModal initial={modalCountry} onClose={() => setModalCountry(undefined)} onSave={saveCountry} />}
      {modalCurrency !== undefined && <CurrencyModal initial={modalCurrency} onClose={() => setModalCurrency(undefined)} onSave={saveCurrency} />}
      {confirmSignOut && <div className="modal-backdrop signout-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmSignOut(false); }}><section className="signout-dialog" role="alertdialog" aria-modal="true" aria-labelledby="signout-title" aria-describedby="signout-description"><div className="signout-icon"><LogOut size={19} /></div><h2 id="signout-title">Sign out of ShipTrack?</h2><p id="signout-description">Are you sure you want to sign out? You’ll need to verify your email again to access your shipment workspace.</p><div className="signout-actions"><button className="button secondary" onClick={() => setConfirmSignOut(false)}>No, stay signed in</button><button className="button signout-confirm" onClick={signOut}>Yes, sign out</button></div></section></div>}
      {notice && <div className="toast"><CheckCircle2 size={17} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
    </div>
  );
}
