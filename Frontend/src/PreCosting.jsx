import React, { useEffect, useState } from "react";
import { Download, Plus, Save, Trash2 } from "lucide-react";
import { jsPDF } from "jspdf";
import { api } from "./api.js";
import PreCostingSheet from "./PreCostingSheet.jsx";
import { calculatePreCosting, chargeFields, newPreCosting, samplePreCosting, validatePreCosting } from "./preCosting.js";

const money = (value) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const columns = [["description", "Item description"], ["quantity", "Qty kg"], ["usdValue", "USD value / C&F"], ["lkrValue", "LKR value"], ["insurance", "Insurance"], ["freight", "Freight"], ["cif", "CIF value"], ["cid", "CID"], ["pal", "PAL"], ["eic", "EIC"], ["sscl", "SSCL"], ["vat", "VAT"], ["duty", "Total duty"], ["clearing", "Clearing / other"], ["landed", "Landed cost"], ["perKg", "Cost / kg"], ["withoutVat", "Cost / kg excl. VAT"]];

function downloadPdf(draft, result) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  const width = 396 / columns.length;
  let y;
  const startPage = () => {
    pdf.setFontSize(16); pdf.text("FMJ ShipTrack - Pre costing", 12, 15);
    pdf.setFontSize(10);
    pdf.text(`${draft.reference} | ${draft.date}`, 12, 23);
    pdf.text(pdf.splitTextToSize(`${draft.material} | HS ${draft.hsCode} | USD/LKR ${draft.exchangeRate}`, 390), 12, 30);
    y = 44;
    pdf.setFontSize(7);
    columns.forEach(([, label], index) => pdf.text(pdf.splitTextToSize(label, width - 2), 13 + index * width, y));
    y += 14;
  };
  startPage();
  for (const [index, row] of [...result.rows, { ...result.totals, description: "TOTAL" }].entries()) {
    const lines = pdf.splitTextToSize(row.description, width - 2);
    const height = Math.max(10, lines.length * 3.5 + 4);
    if (y + height > 270) { pdf.addPage(); startPage(); }
    pdf.setFillColor(index === result.rows.length ? 224 : 247, 243, 252);
    pdf.rect(12, y - 4, 396, height, "F");
    columns.forEach(([key], column) => {
      if (key === "description") pdf.text(lines, 13 + column * width, y);
      else pdf.text(money(row[key]), 12 + (column + 1) * width - 1, y, { align: "right" });
    });
    y += height;
  }
  const notes = pdf.splitTextToSize("Charges in LKR allocated by USD invoice value. USD values are full item totals. Cost / kg excl. VAT = (landed cost - VAT) / kg.", 390);
  for (const line of notes) {
    if (y > 277) { pdf.addPage(); y = 20; }
    pdf.text(line, 12, y + 5); y += 4;
  }
  pdf.save(`Pre-costing-${draft.reference.replace(/[^a-z0-9_-]/gi, "-")}.pdf`);
}

export default function PreCosting() {
  const [draft, setDraft] = useState(newPreCosting);
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const result = calculatePreCosting(draft);
  useEffect(() => {
    let active = true;
    api.getPreCostings().then((items) => { if (active) setRecords(items); }).catch((err) => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(key, value) { setDraft((current) => ({ ...current, [key]: value })); setDirty(true); setNotice(""); }
  function replace(value) {
    if (dirty && !window.confirm("Discard unsaved pre costing changes?")) return;
    setDraft(value); setDirty(false); setError(""); setNotice("");
  }
  function changeItem(index, key, value) { change("items", draft.items.map((item, i) => i === index ? { ...item, [key]: value } : item)); }
  async function save(event) {
    event.preventDefault();
    const issue = validatePreCosting(draft);
    if (issue) { setError(issue); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await (draft.id ? api.updatePreCosting(draft.id, draft) : api.createPreCosting(draft));
      setRecords((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraft(saved); setDirty(false); setNotice("Pre costing saved.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete pre costing ${draft.reference}?`)) return;
    setBusy(true); setError("");
    try { await api.deletePreCosting(draft.id); setRecords((current) => current.filter((item) => item.id !== draft.id)); setDraft(newPreCosting()); setDirty(false); setNotice("Pre costing deleted."); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const filtered = records.filter((item) => `${item.reference} ${item.material}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="pre-costing-page">
    <div className="page-title"><div><span className="eyebrow">IMPORT ESTIMATES</span><h1>Pre costing</h1><p>Estimate landed cost by item, using the SEA C&amp;F costing format.</p></div><div className="page-actions"><button disabled={busy} className="button secondary" onClick={() => replace(samplePreCosting())}>Load reference example</button><button disabled={busy} className="button primary" onClick={() => replace(newPreCosting())}><Plus size={16} /> New pre costing</button></div></div>
    <div className="pre-costing-layout">
      <form className="panel pre-costing-form" onSubmit={save}>
        {error && <div className="inline-error" role="alert">{error}</div>}{notice && <p className="pre-notice" role="status">{notice}</p>}
        <fieldset disabled={busy}>
          <PreCostingSheet draft={draft} result={result} change={change} changeItem={changeItem} />
          <div className="pre-row-actions"><button type="button" className="button secondary" disabled={draft.items.length >= 100} onClick={() => change("items", [...draft.items, { description: "", quantity: "", usdValue: "" }])}><Plus size={14} /> Add item</button><button type="button" className="button secondary" disabled={draft.items.length === 1} onClick={() => change("items", draft.items.slice(0, -1))}>Remove last item</button><span>{dirty ? "Unsaved changes" : draft.id ? "Saved" : "New estimate"}</span></div>
          <div className="pre-actions">{draft.id && <button type="button" className="button secondary" onClick={remove}><Trash2 size={14} /> Delete</button>}<button type="button" className="button secondary" disabled={!result} onClick={() => { const issue = validatePreCosting(draft); if (issue) { setError(issue); return; } try { downloadPdf(draft, result); } catch (err) { setError(err.message); } }}><Download size={14} /> Download PDF</button><button className="button primary" type="submit"><Save size={14} />{busy ? "Saving…" : "Save pre costing"}</button></div>
        </fieldset>
      </form>
      <aside className="panel costing-list"><div className="costing-list-head"><strong>Saved pre costings</strong><span>{records.length}</span></div><div className="costing-filter"><input aria-label="Search pre costings" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search costings…" /></div>{loading ? <p className="costing-empty">Loading…</p> : filtered.length ? filtered.map((item) => <button disabled={busy} type="button" key={item.id} className={draft.id === item.id ? "active" : ""} onClick={() => replace(item)}><strong>{item.reference}</strong><span>{item.material}</span><span>{item.date}</span></button>) : <p className="costing-empty">{query ? "No matching costings." : "No pre costings saved yet."}</p>}</aside>
    </div>
  </section>;
}
