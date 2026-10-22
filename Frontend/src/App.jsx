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
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  ContactRound,
  FileText,
  LayoutDashboard,
  LogOut,
  MailCheck,
  Menu,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Ship,
  SlidersHorizontal,
  Moon,
  Sun,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { api } from "./api.js";

const navigation = [
  { label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { label: "Shipment Register", icon: Ship, key: "shipments" },
  { label: "Shipment Tracking", icon: Truck, key: "tracking" },
  { label: "Payment Tracking", icon: CircleDollarSign, key: "payments" },
  { label: "Customs Clearance", icon: CheckCircle2, key: "customs" },
  { label: "Consignee Reports", icon: Building2, key: "companies" },
  { label: "Consignees", icon: ContactRound, key: "consignees" },
  { label: "Documents", icon: FileText, key: "documents" },
  { label: "Reports & Analytics", icon: Activity, key: "analytics" },
];

const shipmentStatuses = ["Pending", "Under Clearing", "Cleared"];
const documentTypes = ["PI", "CI", "Packing List", "BL/AWB", "Customs"];
const emptyShipment = {
  importNo: "",
  company: "",
  supplier: "",
  consignee: "",
  description: "",
  etd: "",
  eta: "",
  arrivalDate: "",
  deliveryDate: "",
  status: "Pending",
  paymentMethod: "Advance TT",
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

function ShipmentTable({ rows, mode, onEdit, onAdd }) {
  if (!rows.length) return <EmptyState message={mode === "shipments" ? "No shipment records yet" : "No shipments found"} onAdd={onAdd} />;
  const headers = {
    shipments: ["Import No.", "Consignee", "Supplier", "Consignee name", "Description", "ETA", "Status", ""],
    tracking: ["Import No.", "Supplier", "ETD", "ETA", "Arrival", "Delivery", "Status", ""],
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
                <td><span className="company-tag">{shipment.company}</span></td>
                <td>{shipment.supplier}</td><td>{shipment.consignee}</td>
                <td className="description-cell">{shipment.description}</td><td>{dateLabel(shipment.eta)}</td>
                <td><StatusBadge>{shipment.status}</StatusBadge></td>
              </>}
              {mode === "tracking" && <>
                <td><span className="import-id">{shipment.importNo}</span><small>{shipment.company}</small></td>
                <td>{shipment.supplier}</td><td>{dateLabel(shipment.etd)}</td><td>{dateLabel(shipment.eta)}</td>
                <td>{dateLabel(shipment.arrivalDate)}</td><td>{dateLabel(shipment.deliveryDate)}</td><td><StatusBadge>{shipment.status}</StatusBadge></td>
              </>}
              {mode === "payments" && <>
                <td><span className="import-id">{shipment.importNo}</span><small>{shipment.supplier}</small></td>
                <td><span className="company-tag">{shipment.company}</span></td><td>{shipment.paymentMethod}</td>
                <td>{money(shipment.advanceTT)}</td><td>{money(shipment.sightLC)}</td><td>{money(shipment.usanceLC)}</td>
                <td><StatusBadge>{shipment.paymentStatus}</StatusBadge></td>
              </>}
              {mode === "customs" && <>
                <td><span className="import-id">{shipment.importNo}</span><small>{shipment.supplier}</small></td>
                <td><span className="company-tag">{shipment.company}</span></td><td>{money(shipment.duty)}</td>
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

function ShipmentModal({ initial, consignees, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    ...emptyShipment,
    ...(initial || {}),
    company: initial?.company || consignees[0]?.code || "",
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
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="shipment-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          <div><div className="eyebrow">{initial ? "UPDATE SHIPMENT" : "NEW ENTRY"}</div><h2 id="modal-title">{initial ? "Edit shipment" : "Add shipment"}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-section">
            <h3>Shipment details</h3>
            <div className="form-grid">
              <label>Import number<input name="importNo" value={form.importNo} onChange={change} required placeholder="FMJ-2026-003" /></label>
              <label>Consignee<select name="company" value={form.company} onChange={change} required><option value="" disabled>Select a consignee</option>{consignees.map((consignee) => <option key={consignee.id} value={consignee.code}>{consignee.code} — {consignee.name}</option>)}</select></label>
              <label>Supplier<input name="supplier" value={form.supplier} onChange={change} required /></label>
              <label>Consignee name<input name="consignee" value={form.consignee} onChange={change} required /></label>
              <label className="form-wide">Description<input name="description" value={form.description} onChange={change} required /></label>
              <label>Shipment status<select name="status" value={form.status} onChange={change}>{shipmentStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label>ETD<input name="etd" type="date" value={form.etd} onChange={change} /></label>
              <label>ETA<input name="eta" type="date" value={form.eta} onChange={change} /></label>
              <label>Arrival date<input name="arrivalDate" type="date" value={form.arrivalDate} onChange={change} /></label>
              <label>Delivery date<input name="deliveryDate" type="date" value={form.deliveryDate} onChange={change} /></label>
            </div>
          </div>
          <div className="form-section">
            <h3>Payments & clearance</h3>
            <div className="form-grid">
              <label>Payment method<select name="paymentMethod" value={form.paymentMethod} onChange={change}>{["Advance TT", "Sight LC", "Usance LC"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Payment status<select name="paymentStatus" value={form.paymentStatus} onChange={change}>{["Pending", "Partial", "Paid"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Advance TT (LKR)<input name="advanceTT" type="number" min="0" value={form.advanceTT} onChange={change} /></label>
              <label>Sight LC (LKR)<input name="sightLC" type="number" min="0" value={form.sightLC} onChange={change} /></label>
              <label>Usance LC (LKR)<input name="usanceLC" type="number" min="0" value={form.usanceLC} onChange={change} /></label>
              <label>Total cost (LKR)<input name="totalCost" type="number" min="0" value={form.totalCost} onChange={change} /></label>
              <label>Duty (LKR)<input name="duty" type="number" min="0" value={form.duty} onChange={change} /></label>
              <label>DO charges (LKR)<input name="doCharges" type="number" min="0" value={form.doCharges} onChange={change} /></label>
              <label className="form-wide">Clearance status<input name="clearanceStatus" value={form.clearanceStatus} onChange={change} placeholder="Not started" /></label>
            </div>
          </div>
          <div className="form-section">
            <h3>Document checklist</h3>
            <div className="checklist">
              {documentTypes.map((document) => <label key={document} className="check-item"><input type="checkbox" name={`document.${document}`} checked={form.documents[document] === "Received"} onChange={change} /><span className="custom-check"><Check size={12} /></span>{document}</label>)}
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

function Dashboard({ shipments, analytics, onNavigate, onEdit, onAdd }) {
  const maxMonthly = Math.max(1, ...((analytics?.monthly || []).map((item) => item.shipments)));
  return (
    <>
      <PageTitle eyebrow="OVERVIEW" title="Good morning, team" subtitle="Here's what's happening with your shipments today." action={<button className="button secondary date-button"><CalendarDays size={16} /> {new Date().toLocaleDateString("en", { month: "long", year: "numeric" })} <ChevronDown size={15} /></button>} />
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
          <div className="panel-heading"><div><h2>Recent shipments</h2><p>Latest updates across your imports</p></div><button className="text-button" onClick={() => onNavigate("shipments")}>View all <ArrowRight size={15} /></button></div>
          <ShipmentTable rows={shipments.slice(0, 5)} mode="shipments" onEdit={onEdit} onAdd={onAdd} />
        </section>
        <section className="panel company-panel">
          <div className="panel-heading"><div><h2>Consignee overview</h2><p>Shipments by consignee</p></div><button className="icon-button"><MoreHorizontal size={20} /></button></div>
          <div className="company-list">{(analytics?.byCompany || []).map((company) => <div className="company-row" key={company.company}><span className="company-avatar">{company.company.slice(0, 1)}</span><div className="company-name"><strong>{company.company}</strong><small>{company.total} shipments</small></div><div className="company-progress"><i style={{ width: `${company.total ? Math.max(12, (company.cleared / company.total) * 100) : 0}%` }} /></div><b>{company.cleared}/{company.total}</b></div>)}</div>
          <button className="company-footer" onClick={() => onNavigate("companies")}>View consignee reports <ArrowRight size={15} /></button>
        </section>
      </div>
    </>
  );
}

function DocumentsView({ shipments, onEdit }) {
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
    {!rows.length ? <EmptyState /> : <div className="table-scroll"><table><thead><tr><th>Document</th><th>Import No.</th><th>Consignee</th><th>Supplier</th><th>Document status</th><th>Shipment status</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="clickable-row" onClick={() => onEdit(row.shipment)}><td><span className="doc-icon"><FileText size={15} /></span>{row.document}</td><td><span className="import-id">{row.importNo}</span></td><td><span className="company-tag">{row.company}</span></td><td>{row.supplier}</td><td><StatusBadge>{row.status}</StatusBadge></td><td><StatusBadge>{row.shipment.status}</StatusBadge></td><td><button className="icon-button row-more" aria-label="Edit document status"><MoreHorizontal size={18} /></button></td></tr>)}</tbody></table></div>}
  </section>;
}

function ConsigneeReports({ analytics, shipments, onEdit, onAdd }) {
  return <>
    <section className="company-report-grid">{(analytics?.byCompany || []).map((company) => {
      const ratio = company.total ? Math.round((company.cleared / company.total) * 100) : 0;
      return <article className="company-report-card" key={company.company}><div className="company-card-top"><span className="company-avatar large">{company.company.slice(0, 1)}</span><span className="company-tag">{company.company}</span></div><h2>{company.company}</h2><p>Consignee shipment portfolio</p><div className="company-metrics"><div><strong>{company.total}</strong><span>Total shipments</span></div><div><strong>{ratio}%</strong><span>Clearance rate</span></div></div><div className="company-progress wide"><i style={{ width: `${ratio}%` }} /></div><div className="company-card-bottom"><span>Total value</span><strong>{money(company.totalCost)}</strong></div></article>;
    })}</section>
    <section className="panel table-panel"><div className="panel-heading"><div><h2>All consignee shipments</h2><p>Shipment activity across registered consignees</p></div></div><ShipmentTable rows={shipments} mode="shipments" onEdit={onEdit} onAdd={onAdd} /></section>
  </>;
}

function ConsigneeModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(() => ({
    code: initial?.code || "",
    name: initial?.name || "",
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
    <div className="table-scroll"><table><thead><tr><th>Code</th><th>Consignee name</th><th>Contact person</th><th>Email</th><th>Phone</th><th>Shipments</th><th /></tr></thead><tbody>
      {consignees.map((consignee) => <tr key={consignee.id} className="clickable-row" onClick={() => onEdit(consignee)}>
        <td><span className="company-tag">{consignee.code}</span></td><td><span className="import-id">{consignee.name}</span></td><td>{consignee.contactName || "—"}</td><td>{consignee.email || "—"}</td><td>{consignee.phone || "—"}</td><td>{shipments.filter((shipment) => shipment.company === consignee.code).length}</td>
        <td><button className="icon-button row-more" aria-label={`Edit ${consignee.name}`} onClick={(event) => { event.stopPropagation(); onEdit(consignee); }}><MoreHorizontal size={18} /></button></td>
      </tr>)}
    </tbody></table></div>
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
  const [analytics, setAnalytics] = useState(null);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalShipment, setModalShipment] = useState(undefined);
  const [modalConsignee, setModalConsignee] = useState(undefined);
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
      const [shipmentData, analyticsData, consigneeData] = await Promise.all([
        api.getShipments(),
        api.getAnalytics(),
        api.getConsignees(),
      ]);
      setShipments(shipmentData);
      setAnalytics(analyticsData);
      setConsignees(consigneeData);
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
    if (!accountMenuOpen && !confirmSignOut) return undefined;
    const closeTransientUi = (event) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        setConfirmSignOut(false);
      } else if (event.type === "pointerdown" && !accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("keydown", closeTransientUi);
    document.addEventListener("pointerdown", closeTransientUi);
    return () => {
      document.removeEventListener("keydown", closeTransientUi);
      document.removeEventListener("pointerdown", closeTransientUi);
    };
  }, [accountMenuOpen, confirmSignOut]);

  const filteredShipments = useMemo(() => shipments.filter((shipment) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [shipment.importNo, shipment.supplier, shipment.consignee, shipment.description].join(" ").toLowerCase().includes(query);
    return matchesSearch && (!companyFilter || shipment.company === companyFilter) && (!statusFilter || shipment.status === statusFilter);
  }), [shipments, search, companyFilter, statusFilter]);
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
    if (active === "dashboard") return <Dashboard shipments={shipments} analytics={analytics} onNavigate={setActive} onEdit={openModal} onAdd={() => openModal(null)} />;
    if (active === "companies") return <><PageTitle eyebrow="CONSIGNEES" title="Consignee reports" subtitle="A clear view of imports and clearance progress for each consignee." />{error && <div className="inline-error">{error}</div>}<ConsigneeReports analytics={analytics} shipments={filteredShipments} onEdit={openModal} /></>;
    if (active === "consignees") return <><PageTitle eyebrow="DIRECTORY" title="Consignees" subtitle="Create and manage the consignee records assigned to your shipments." action={<button className="button primary" onClick={() => setModalConsignee(null)}><Plus size={17} /> Create consignee</button>} />{error && <div className="inline-error">{error}</div>}<ConsigneeDirectory consignees={consignees} shipments={shipments} onEdit={setModalConsignee} onAdd={() => setModalConsignee(null)} /></>;
    if (active === "documents") return <><PageTitle eyebrow="PAPERWORK" title="Documents" subtitle="Track required shipping and customs documents in one place." />{error && <div className="inline-error">{error}</div>}<DocumentsView shipments={filteredShipments} onEdit={openModal} /></>;
    if (active === "analytics") return <><PageTitle eyebrow="PERFORMANCE" title="Reports & analytics" subtitle="Monitor shipment delays, landed costs and monthly activity." />{error && <div className="inline-error">{error}</div>}<AnalyticsView analytics={analytics} /></>;
    const pageInfo = {
      shipments: ["OPERATIONS", "Shipment register", "Manage import records from supplier to consignee.", "shipments"],
      tracking: ["OPERATIONS", "Shipment tracking", "Track ETD, ETA, arrival and final delivery milestones.", "tracking"],
      payments: ["FINANCE", "Payment tracking", "Review Advance TT, Sight LC, Usance LC and payment status.", "payments"],
      customs: ["CLEARANCE", "Customs clearance", "Track import duty, delivery order charges and clearance progress.", "customs"],
    }[active];
    return <>
      <PageTitle eyebrow={pageInfo[0]} title={pageInfo[1]} subtitle={pageInfo[2]} action={<button className="button primary" onClick={() => openModal(null)}><Plus size={17} /> Add shipment</button>} />
      {error && <div className="inline-error">{error}</div>}
      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="table-title"><h2>{active === "shipments" ? "All shipments" : activeTitle}</h2><span className="count-pill">{filteredShipments.length}</span></div>
          <div className="table-actions"><label className="table-search"><Search size={16} /><input placeholder="Search shipments..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="filter-select"><SlidersHorizontal size={15} /><select aria-label="Filter by consignee" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}><option value="">All consignees</option>{consigneeOptions.map((consignee) => <option key={consignee.id} value={consignee.code}>{consignee.code}</option>)}</select></label>{active !== "tracking" && active !== "payments" && <label className="filter-select"><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All statuses</option>{shipmentStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>}</div>
        </div>
        <ShipmentTable rows={filteredShipments} mode={pageInfo[3]} onEdit={openModal} />
        <div className="table-footer"><span>Showing <strong>{filteredShipments.length}</strong> of <strong>{shipments.length}</strong> shipments</span><span>Data saved automatically</span></div>
      </section>
    </>;
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
        <header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><span>Workspace</span><span className="crumb-slash">/</span><strong>{activeTitle}</strong></div><div className="topbar-right"><div className={`system-status ${error ? "offline" : ""}`}><i /> {error ? "Connection issue" : "All systems operational"}</div><button className="icon-button theme-toggle" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`} onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button><button className="top-icon icon-button" aria-label="Notifications" onClick={() => setNotice("You're all caught up.")}><Bell size={18} /><i /></button><div className="top-divider" /><div className="account-menu-wrap" ref={accountMenuRef}><button className="top-user account-trigger" aria-expanded={accountMenuOpen} aria-haspopup="menu" aria-label="Open account menu" onClick={() => setAccountMenuOpen((open) => !open)}><span className="profile-avatar small">FM</span><ChevronDown size={15} /></button>{accountMenuOpen && <div className="account-menu" role="menu"><div className="account-menu-user"><strong>{authState.username}</strong><span>Super administrator</span></div><button className="account-menu-signout" role="menuitem" onClick={() => { setAccountMenuOpen(false); setConfirmSignOut(true); }}><LogOut size={16} />Sign out</button></div>}</div></div></header>
        <main className="content">
          {renderContent()}
          <footer className="app-footer"><span>© 2026 FMJ ShipTrack</span><span>Shipment management, made simpler.</span></footer>
        </main>
      </div>
      {sidebarOpen && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      {modalShipment !== undefined && <ShipmentModal initial={modalShipment} consignees={consigneeOptions} onClose={() => setModalShipment(undefined)} onSave={saveShipment} />}
      {modalConsignee !== undefined && <ConsigneeModal initial={modalConsignee} onClose={() => setModalConsignee(undefined)} onSave={saveConsignee} />}
      {confirmSignOut && <div className="modal-backdrop signout-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmSignOut(false); }}><section className="signout-dialog" role="alertdialog" aria-modal="true" aria-labelledby="signout-title" aria-describedby="signout-description"><div className="signout-icon"><LogOut size={19} /></div><h2 id="signout-title">Sign out of ShipTrack?</h2><p id="signout-description">Are you sure you want to sign out? You’ll need to verify your email again to access your shipment workspace.</p><div className="signout-actions"><button className="button secondary" onClick={() => setConfirmSignOut(false)}>No, stay signed in</button><button className="button signout-confirm" onClick={signOut}>Yes, sign out</button></div></section></div>}
      {notice && <div className="toast"><CheckCircle2 size={17} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}
    </div>
  );
}
