import React, { useEffect, useState } from "react";
import { Download, Plus, Save, Trash2 } from "lucide-react";
import { api } from "./api.js";
import PreCostingSheet from "./PreCostingSheet.jsx";
import { calculateDoublePreCosting, newDoublePreCosting, validateDoublePreCosting } from "./preCosting.js";
import { downloadCostingPdf } from "./costingPdf.js";
import { downloadCostingExcel } from "./costingExcel.js";

export default function DoublePreCosting() {
  const [draft, setDraft] = useState(newDoublePreCosting);
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const result = calculateDoublePreCosting(draft);

  useEffect(() => {
    let active = true;
    api.getDoublePreCostings().then((items) => { if (active) setRecords(items); }).catch((err) => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const warn = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(key, value) { setDraft((current) => ({ ...current, [key]: value })); setDirty(true); setNotice(""); }
  function changeItem(index, key, value) { change("items", draft.items.map((item, i) => i === index ? { ...item, [key]: value } : item)); }
  function replace(value) {
    if (dirty && !window.confirm("Discard unsaved double pre costing changes?")) return;
    setDraft(value); setDirty(false); setError(""); setNotice("");
  }
  async function save(event) {
    event.preventDefault();
    const issue = validateDoublePreCosting(draft);
    if (issue) { setError(issue); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const saved = await (draft.id ? api.updateDoublePreCosting(draft.id, draft) : api.createDoublePreCosting(draft));
      setRecords((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraft(saved); setDirty(false); setNotice("Double pre costing saved.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete double pre costing ${draft.reference}?`)) return;
    setBusy(true); setError("");
    try { await api.deleteDoublePreCosting(draft.id); setRecords((current) => current.filter((item) => item.id !== draft.id)); setDraft(newDoublePreCosting()); setDirty(false); setNotice("Double pre costing deleted."); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const filtered = records.filter((item) => `${item.reference} ${item.material}`.toLowerCase().includes(query.toLowerCase()));

  return <section className="pre-costing-page double-pre-costing-page">
    <div className="page-title"><div><span className="eyebrow">IMPORT ESTIMATES</span><h1>Double pre costing</h1><p>Under USD PRICE/C&amp;F, enter the dollar rate on the left and bank charges USD amount on the right. LKR Price is their product. Additional Bank Charges defaults to 1% and can be edited.</p></div><div className="page-actions"><button disabled={busy} className="button primary" onClick={() => replace(newDoublePreCosting())}><Plus size={16} /> New double pre costing</button></div></div>
    <div className="pre-costing-layout">
      <form className="panel pre-costing-form" onSubmit={save}>
        {error && <div className="inline-error" role="alert">{error}</div>}{notice && <p className="pre-notice" role="status">{notice}</p>}
        <fieldset disabled={busy}>
          <PreCostingSheet draft={draft} result={result} change={change} changeItem={changeItem} title="Double pre costing" double />
          {result?.rows.some((row) => !row) && <p className="pre-notice" role="status">LKR Price is calculated as dollar rate × bank charges amount in USD. Complete both values and quantity for each item.</p>}
          <div className="pre-row-actions">
            <button type="button" className="button secondary" disabled={draft.items.length >= 100} onClick={() => change("items", [...draft.items, { description: "", quantity: "", dollarRate: "", bankAmount: "" }])}><Plus size={14} /> Add item</button>
            <button type="button" className="button secondary" disabled={draft.items.length >= 100} onClick={() => change("items", [...draft.items, ...Array.from({ length: Math.min(5, 100 - draft.items.length) }, () => ({ description: "", quantity: "", dollarRate: "", bankAmount: "" }))])}><Plus size={14} /> Add 5 rows</button>
            <button type="button" className="button secondary" disabled={draft.items.length === 1} onClick={() => change("items", draft.items.slice(0, -1))}>Remove last item</button>
            <span>{dirty ? "Unsaved changes" : draft.id ? "Saved" : "New estimate"}</span>
          </div>
          <div className="pre-actions">{draft.id && <button type="button" className="button secondary" onClick={remove}><Trash2 size={14} /> Delete</button>}<button type="button" className="button secondary" disabled={!result} onClick={() => { const issue = validateDoublePreCosting(draft); if (issue) { setError(issue); return; } try { downloadCostingPdf(draft, result, "Double pre costing", true); } catch (err) { setError(err.message); } }}><Download size={14} /> Download PDF</button><button type="button" className="button secondary" disabled={!result} onClick={() => { const issue = validateDoublePreCosting(draft); if (issue) { setError(issue); return; } try { downloadCostingExcel(draft, result, "Double pre costing", true); } catch (err) { setError(err.message); } }}><Download size={14} /> Download Excel</button><button className="button primary" type="submit"><Save size={14} />{busy ? "Saving…" : "Save double pre costing"}</button></div>
        </fieldset>
      </form>
      <aside className="panel costing-list"><div className="costing-list-head"><strong>Saved double pre costings</strong><span>{records.length}</span></div><div className="costing-filter"><input aria-label="Search double pre costings" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search costings…" /></div><div className="costing-list-columns" aria-hidden="true"><span>Costing title</span><span>Material</span><span>Date</span></div>{loading ? <p className="costing-empty">Loading…</p> : filtered.length ? filtered.map((item) => <button disabled={busy} type="button" key={item.id} className={draft.id === item.id ? "active" : ""} onClick={() => replace(item)} title={`${item.reference} · ${item.material} · ${item.date}`}><strong>{item.reference}</strong><span>{item.material}</span><span>{item.date}</span></button>) : <p className="costing-empty">{query ? "No matching costings." : "No double pre costings saved yet."}</p>}</aside>
    </div>
  </section>;
}
