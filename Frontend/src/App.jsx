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
  FileText,
  Globe2,
  LayoutDashboard,
  LogOut,
  MailCheck,
  Menu,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Settings2,
  ShieldCheck,
  Ship,
  Moon,
  Sun,
  TrendingUp,
  X,
} from "lucide-react";
import { api } from "./api.js";

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { label: "To be TT", icon: CircleDollarSign, key: "to-be-tt" },
  { label: "Consignee Reports", icon: Building2, key: "companies" },
  { label: "Consignees", icon: ContactRound, key: "consignees" },
  { label: "Countries", icon: Globe2, key: "countries" },
  { label: "Documents", icon: FileText, key: "documents" },
  { label: "Reports & Analytics", icon: Activity, key: "analytics" },
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
  consignee: "",
  description: "",
  transportMode: "",
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

const money = (value) =>
  new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const dateLabel = (value) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

function StatusBadge({ children, tone }) {
  const value = String(children || "Pending").toLowerCase().replaceAll(" ", "-");
  return <span className={`badge ${tone || value}`}>{children}</span>;
}

function ConsigneeBadge({ code, consignees = [] }) {
  const color = consigneeColorFor(code, consignees);
  return <span className="company-tag consignee-color-tag" style={{ "--consignee-color": color }}>{code}</span>;
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

function ShipmentTable({ rows, mode, onEdit, onAdd, consignees = [] }) {
  if (!rows.length) return <EmptyState message={mode === "shipments" ? "No shipment records yet" : "No shipments found"} onAdd={onAdd} />;
  const headers = {
    shipments: ["Import No.", "Consignee", "Shipper", "Consignee name", "Description", "ETA", "Status", ""],
    tracking: ["Import No.", "Shipper", "ETD", "ETA", "Arrival", "Delivery", "Status", ""],
    payments: ["Import No.", "Consignee", "Payment method", "Advance TT", "Sight LC", "Usance LC", "Payment status", ""],
    customs: ["Import No.", "Consignee", "Duty", "DO charges", "Clearance progress", "Clearance status", "Shipment status", ""],
  }[mode];

  return (
    <div className="table-scroll">
      <table>
        <thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead>
        <tbody>
          {rows.map((shipment) => (
            <tr key={shipment.id} onClick={() => onEdit(shipment)} className="clickable-row">
              {mode === "shipments" && <>
                <td><span className="import-id">{shipment.importNo}</span><small>{shipment.description}</small></td>
                <td><ConsigneeBadge code={shipment.company} consignees={consignees} /></td>
                <td>{shipment.supplier}</td><td>{shipment.consignee}</td>
                <td className="description-cell">{shipment.description}</td><td>{dateLabel(shipment.eta)}</td>
                <td><StatusBadge>{shipment.status}</StatusBadge></td>
              </>}
              {mode === "tracking" && <>
                <td><span className="import-id">{shipment.importNo}</span><small><ConsigneeBadge code={shipment.company} consignees={consignees} /></small></td>
                <td>{shipment.supplier}</td><td>{dateLabel(shipment.etd)}</td><td>{dateLabel(shipment.eta)}</td>
                <td>{dateLabel(shipment.arrivalDate)}</td><td>{dateLabel(shipment.deliveryDate)}</td><td><StatusBadge>{shipment.status}</StatusBadge></td>
              </>}
              {mode === "payments" && <>
                <td><span className="import-id">{shipment.importNo}</span><small>{shipment.supplier}</small></td>
                <td><ConsigneeBadge code={shipment.company} consignees={consignees} /></td><td>{shipment.paymentMethod}</td>
                <td>{money(shipment.advanceTT)}</td><td>{money(shipment.sightLC)}</td><td>{money(shipment.usanceLC)}</td>
                <td><StatusBadge>{shipment.paymentStatus}</StatusBadge></td>
              </>}
              {mode === "customs" && <>
                <td><span className="import-id">{shipment.importNo}</span><small>{shipment.supplier}</small></td>
                <td><ConsigneeBadge code={shipment.company} consignees={consignees} /></td><td>{money(shipment.duty)}</td>
                <td>{money(shipment.doCharges)}</td><td><span className="progress-copy">{shipment.clearanceStatus}</span></td>
                <td><StatusBadge tone={shipment.clearanceStatus === "Cleared" ? "cleared" : "under-clearing"}>{shipment.clearanceStatus}</StatusBadge></td>
                <td><StatusBadge>{shipment.status}</StatusBadge></td>
              </>}
              <td><button className="icon-button row-more" aria-label={`Edit ${shipment.importNo}`} onClick={(event) => { event.stopPropagation(); onEdit(shipment); }}><MoreHorizontal size={18} /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShipmentModal({ initial, consignees, currencies, onClose, onSave }) {
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
    <div className={`modal-backdrop ${initial ? "" : "shipment-fullscreen-backdrop"}`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`shipment-modal ${initial ? "" : "shipment-modal-fullscreen"}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          <div><div className="eyebrow">{initial ? "UPDATE SHIPMENT" : "NEW ENTRY"}</div><h2 id="modal-title">{initial ? "Edit shipment" : "Add shipment"}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-section">
            <h3>Shipment details</h3>
            <div className="form-grid shipment-details-grid">
              <label className="shipment-field shipment-field--import">Imp No.<input name="importNo" value={form.importNo} onChange={change} required placeholder="FMJ-2026-003" /></label>
              <label className="shipment-field shipment-field--consignee">Consignee<select name="company" value={form.company} onChange={(event) => { const code = event.target.value; setForm((current) => ({ ...current, company: code, consignee: consignees.find((item) => item.code === code)?.name || current.consignee })); }} required><option value="" disabled>Select a consignee</option>{consignees.map((consignee) => <option key={consignee.id} value={consignee.code}>{consignee.code} — {consignee.name}</option>)}</select></label>
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
              <label className="shipment-field shipment-field--mode">Transport Mode<select name="transportMode" value={form.transportMode} onChange={(event) => setForm((current) => ({ ...current, transportMode: event.target.value, fclLcl: "", containerSize: "" }))} required={!initial}><option value="">Select AIR/SEA</option><option value="AIR">AIR</option><option value="SEA">SEA</option></select></label>
              {form.transportMode === "SEA" && <label className="shipment-field shipment-field--conditional">FCL/LCL<select name="fclLcl" value={form.fclLcl} onChange={(event) => setForm((current) => ({ ...current, fclLcl: event.target.value, containerSize: "" }))} required><option value="">Select FCL/LCL</option><option value="FCL">FCL</option><option value="LCL">LCL</option></select></label>}
              {form.transportMode === "SEA" && form.fclLcl === "FCL" && <label className="shipment-field shipment-field--conditional">Container Size<select name="containerSize" value={form.containerSize} onChange={change} required><option value="">Select size</option><option value="20FT">20FT</option><option value="40FT">40FT</option></select></label>}
              <label className="shipment-field shipment-field--currency">Currency<select name="currency" value={form.currency} onChange={change} required>
                {!currencies.length && ["USD", "AED", "RMB"].map((code) => <option key={code} value={code}>{code}</option>)}
                {form.currency && form.currency !== "LKR" && !currencies.some((item) => item.code === form.currency) && <option value={form.currency}>{form.currency} (existing)</option>}
                {form.currency === "LKR" && <option value="LKR">LKR (existing)</option>}
                {currencies.map((currency) => <option key={currency.id} value={currency.code}>{currency.code} — {currency.name}</option>)}
              </select></label>
              <label className="shipment-field shipment-field--amount">Value<input name="totalCost" type="number" min="0" value={form.totalCost} onChange={change} /></label>
              <label className="shipment-field shipment-field--date">ETD<input name="etd" type="date" value={form.etd} onChange={change} /></label>
              <label className="shipment-field shipment-field--date">ETA CMB<input name="eta" type="date" value={form.eta} onChange={change} /></label>
              <label className="shipment-field shipment-field--amount">Duty (LKR)<input name="duty" type="number" min="0" value={form.duty} onChange={change} /></label>
              <label className="shipment-field shipment-field--amount">DO (LKR)<input name="doCharges" type="number" min="0" value={form.doCharges} onChange={change} /></label>
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

function Dashboard({ shipments, consignees, analytics, onNavigate, onEdit, onAdd }) {
  const maxMonthly = Math.max(1, ...((analytics?.monthly || []).map((item) => item.shipments)));
  return (
    <>
      <PageTitle eyebrow="OVERVIEW" title="Good morning, team" subtitle="Here's what's happening with your shipments today." />
      <section className="stat-grid">
        <StatCard label="Total shipments" value={analytics?.total ?? "—"} helper="Live records from MongoDB" icon={Ship} color="blue" />
        <StatCard label="Pending" value={analytics?.pending ?? "—"} helper="Awaiting next action" icon={Clock3} color="amber" />
        <StatCard label="Under clearing" value={analytics?.underClearing ?? "—"} helper="At customs now" icon={ArrowDownToLine} color="violet" />
        <StatCard label="Cleared" value={analytics?.cleared ?? "—"} helper="Currently cleared" icon={PackageCheck} color="green" />
      </section>
      <div className="dashboard-grid">
        <section className="panel monthly-panel">
          <div className="panel-heading"><div><h2>Shipment activity</h2><p>Shipments by expected arrival month</p></div><button className="select-button">Last 6 months <ChevronDown size={14} /></button></div>
          <div className="chart">
            <div className="chart-y"><span>8</span><span>6</span><span>4</span><span>2</span><span>0</span></div>
            <div className="chart-main">
              <div className="chart-gridlines"><i /><i /><i /><i /><i /></div>
              <div className="bar-list">{(analytics?.monthly || []).map((item) => {
                const barHeight = `${Math.max(8, (item.shipments / maxMonthly) * 100)}%`;
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
          <ShipmentTable rows={shipments.slice(0, 5)} mode="shipments" onEdit={onEdit} onAdd={onAdd} consignees={consignees} />
        </section>
        <section className="panel company-panel">
          <div className="panel-heading"><div><h2>Consignee overview</h2><p>Shipments by consignee</p></div><button className="icon-button"><MoreHorizontal size={20} /></button></div>
          <div className="company-list">{(analytics?.byCompany || []).map((company) => { const color = consigneeColorFor(company.company, consignees); return <div className="company-row" key={company.company}><span className="company-avatar consignee-color-avatar" style={{ "--consignee-color": color }}>{company.company.slice(0, 1)}</span><div className="company-name"><strong>{company.company}</strong><small>{company.total} shipments</small></div><div className="company-progress"><i style={{ width: `${company.total ? Math.max(12, (company.cleared / company.total) * 100) : 0}%`, backgroundColor: color }} /></div><b>{company.cleared}/{company.total}</b></div>; })}</div>
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
    {!rows.length ? <EmptyState /> : <div className="table-scroll"><table><thead><tr><th>Document</th><th>Import No.</th><th>Consignee</th><th>Shipper</th><th>Document status</th><th>Shipment status</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="clickable-row" onClick={() => onEdit(row.shipment)}><td><span className="doc-icon"><FileText size={15} /></span>{row.document}</td><td><span className="import-id">{row.importNo}</span></td><td><ConsigneeBadge code={row.company} consignees={consignees} /></td><td>{row.supplier}</td><td><StatusBadge>{row.status}</StatusBadge></td><td><StatusBadge>{row.shipment.status}</StatusBadge></td><td><button className="icon-button row-more" aria-label="Edit document status"><MoreHorizontal size={18} /></button></td></tr>)}</tbody></table></div>}
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
          <label>Consignee code<input name="code" value={form.code} onChange={change} required minLength={2} maxLength={20} pattern="[A-Za-z0-9_-]+" placeholder="FMJ" /></label>
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
                <label>Username<input type="text" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={40} pattern="[A-Za-z0-9._-]+" placeholder="Your username" /></label>
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
  const [shipments, setShipments] = useState([]);
  const [consignees, setConsignees] = useState([]);
  const [countries, setCountries] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [modalShipment, setModalShipment] = useState(undefined);
  const [modalConsignee, setModalConsignee] = useState(undefined);
  const [modalCountry, setModalCountry] = useState(undefined);
  const [modalCurrency, setModalCurrency] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
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

  const activeTitle = navigation.find((item) => item.key === active)?.label || "Dashboard";
  const openModal = (shipment) => setModalShipment(shipment || null);
  const markAuthenticated = (username) => {
    setAuthError("");
    setAuthState({ setupRequired: false, authenticated: true, username });
    setLoading(true);
  };

  function renderContent() {
    if (loading) return <div className="loading-state"><span className="loader" />Loading shipment workspace…</div>;
    if (error && !shipments.length) return <div className="error-state"><strong>Unable to load shipments</strong><span>{error}</span><button className="button secondary" onClick={refresh}>Try again</button></div>;
    if (active === "dashboard") return <Dashboard shipments={shipments} consignees={consignees} analytics={analytics} onNavigate={setActive} onEdit={openModal} onAdd={() => openModal(null)} />;
    if (active === "to-be-tt") {
      const pendingTTShipments = shipments.filter((shipment) =>
        shipment.paymentMethod === "Advance TT" && shipment.paymentStatus === "Pending",
      );
      return <>
        <PageTitle eyebrow="PAYMENTS" title="To be TT" subtitle="Shipments awaiting Advance TT payment." action={<button className="button primary" onClick={() => openModal(null)}><Plus size={17} /> Add shipment</button>} />
        {error && <div className="inline-error">{error}</div>}
        <section className="panel table-panel">
          <div className="table-toolbar"><div className="table-title"><h2>Pending TT payments</h2><span className="count-pill">{pendingTTShipments.length}</span></div></div>
          <ShipmentTable rows={pendingTTShipments} mode="payments" onEdit={openModal} onAdd={() => openModal(null)} consignees={consignees} />
          <div className="table-footer"><span><strong>{pendingTTShipments.length}</strong> shipments awaiting Advance TT</span><span>Data saved automatically</span></div>
        </section>
      </>;
    }
    if (active === "companies") return <><PageTitle eyebrow="CONSIGNEES" title="Consignee reports" subtitle="A clear view of imports and clearance progress for each consignee." />{error && <div className="inline-error">{error}</div>}<ConsigneeReports analytics={analytics} shipments={shipments} consignees={consignees} onEdit={openModal} /></>;
    if (active === "consignees") return <><PageTitle eyebrow="DIRECTORY" title="Consignees" subtitle="Create and manage the consignee records assigned to your shipments." action={<button className="button primary" onClick={() => setModalConsignee(null)}><Plus size={17} /> Create consignee</button>} />{error && <div className="inline-error">{error}</div>}<ConsigneeDirectory consignees={consignees} shipments={shipments} onEdit={setModalConsignee} onAdd={() => setModalConsignee(null)} /></>;
    if (active === "countries") return <><PageTitle eyebrow="DIRECTORY" title="Countries & currencies" subtitle="Manage country and currency lists separately." action={<button className="button primary" title="Create country (F1)" onClick={() => setModalCountry(null)}><Plus size={17} /> Create country</button>} />{error && <div className="inline-error">{error}</div>}<CountryDirectory countries={countries} onEdit={setModalCountry} onAdd={() => setModalCountry(null)} /><CurrencyDirectory currencies={currencies} onEdit={setModalCurrency} onAdd={() => setModalCurrency(null)} /></>;
    if (active === "documents") return <><PageTitle eyebrow="PAPERWORK" title="Documents" subtitle="Track required shipping and customs documents in one place." />{error && <div className="inline-error">{error}</div>}<DocumentsView shipments={shipments} consignees={consignees} onEdit={openModal} /></>;
    if (active === "analytics") return <><PageTitle eyebrow="PERFORMANCE" title="Reports & analytics" subtitle="Monitor shipment delays, landed costs and monthly activity." />{error && <div className="inline-error">{error}</div>}<AnalyticsView analytics={analytics} /></>;
    return <Dashboard shipments={shipments} consignees={consignees} analytics={analytics} onNavigate={setActive} onEdit={openModal} onAdd={() => openModal(null)} />;
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
        <nav>{navigation.map(({ label, icon: Icon, key }) => <button key={key} className={`nav-item ${active === key ? "active" : ""}`} onClick={() => { setActive(key); setSidebarOpen(false); }}><Icon size={18} /><span>{label}</span>{key === "tracking" && analytics?.delayed > 0 && <i className="nav-count">{analytics.delayed}</i>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><Settings2 size={17} /></div><strong>Need a hand?</strong><span>Manage your workspace and preferences.</span><button onClick={() => setNotice("Workspace settings are coming soon.")}>Workspace settings <ArrowRight size={14} /></button></div><div className="profile"><div className="profile-avatar">FM</div><div className="profile-name"><strong>{authState.username}</strong><span>Super administrator</span></div></div></div>
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
        <main className="content">
          {renderContent()}
          <footer className="app-footer"><span>© 2026 FMJ ShipTrack</span><span>Shipment management, made simpler.</span></footer>
        </main>
      </div>
      {sidebarOpen && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      {modalShipment !== undefined && <ShipmentModal initial={modalShipment} consignees={consigneeOptions} currencies={currencies} onClose={() => setModalShipment(undefined)} onSave={saveShipment} />}
      {modalConsignee !== undefined && <ConsigneeModal initial={modalConsignee} onClose={() => setModalConsignee(undefined)} onSave={saveConsignee} />}
      {modalCountry !== undefined && <CountryModal initial={modalCountry} onClose={() => setModalCountry(undefined)} onSave={saveCountry} />}
      {modalCurrency !== undefined && <CurrencyModal initial={modalCurrency} onClose={() => setModalCurrency(undefined)} onSave={saveCurrency} />}
      {confirmSignOut && <div className="modal-backdrop signout-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmSignOut(false); }}><section className="signout-dialog" role="alertdialog" aria-modal="true" aria-labelledby="signout-title" aria-describedby="signout-description"><div className="signout-icon"><LogOut size={19} /></div><h2 id="signout-title">Sign out of ShipTrack?</h2><p id="signout-description">Are you sure you want to sign out? You’ll need to verify your email again to access your shipment workspace.</p><div className="signout-actions"><button className="button secondary" onClick={() => setConfirmSignOut(false)}>No, stay signed in</button><button className="button signout-confirm" onClick={signOut}>Yes, sign out</button></div></section></div>}
      {notice && <div className="toast"><CheckCircle2 size={17} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
    </div>
  );
}
