import React, { useEffect, useState } from "react";
import { Download, Plus, Save, Trash2 } from "lucide-react";
import { api } from "./api.js";
import PreCostingSheet from "./PreCostingSheet.jsx";
import DutyCalculator from "./DutyCalculator.jsx";
import { calculatePreCosting, chargeFields, newPreCosting, preparePreCostingDraft, samplePreCosting, validatePreCosting } from "./preCosting.js";
import { downloadCostingPdf } from "./costingPdf.js";
import { downloadCostingExcel } from "./costingExcel.js";

export default function PreCosting() {
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  useEffect(() => {
    const shortcut = (event) => {
      if (event.key === "F1") { event.preventDefault(); setCalculatorOpen(true); }
    };
    window.addEventListener("keydown", shortcut, true);
    return () => window.removeEventListener("keydown", shortcut, true);
  }, []);
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
  function passCalculation(headers) {
    if (busy) return;
    setDraft((current) => ({ ...current, ...headers }));
    setDirty(true);
    setError("");
    setNotice("Calculation values passed to Exchange rate, CID, PAL, EIC, VAT and SSCL. Save pre costing to keep these changes.");
    setCalculatorOpen(false);
  }
  function replace(value) {
    if (dirty && !window.confirm("Discard unsaved pre costing changes?")) return;
    setDraft(preparePreCostingDraft(value)); setDirty(false); setError(""); setNotice("");
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
    <DutyCalculator open={calculatorOpen} onClose={() => setCalculatorOpen(false)} onPass={passCalculation} busy={busy} />
    <button type="button" className="button secondary" onClick={() => setCalculatorOpen(true)}>Calculation (F1)</button>
    <div className="page-title"><div><span className="eyebrow">IMPORT ESTIMATES</span><h1>Pre costing</h1><p>Estimate landed cost by item, using the SEA C&amp;F costing format.</p></div><div className="page-actions"><button disabled={busy} className="button secondary" onClick={() => replace(samplePreCosting())}>Load reference example</button><button disabled={busy} className="button primary" onClick={() => replace(newPreCosting())}><Plus size={16} /> New pre costing</button></div></div>
    <div className="pre-costing-layout">
      <form className="panel pre-costing-form" onSubmit={save}>
        {error && <div className="inline-error" role="alert">{error}</div>}{notice && <p className="pre-notice" role="status">{notice}</p>}
        <fieldset disabled={busy}>
          <PreCostingSheet draft={draft} result={result} change={change} changeItem={changeItem} />
          {result?.rows.some((row) => !row) && <p className="pre-notice" role="status">Preview charges use completed rows only. Enter quantity and USD value for each new row to calculate its costs.</p>}
          <div className="pre-row-actions">
            <button type="button" className="button secondary" disabled={draft.items.length >= 100} onClick={() => change("items", [...draft.items, { description: "", quantity: "", usdValue: "" }])}><Plus size={14} /> Add item</button>
            <button type="button" className="button secondary" disabled={draft.items.length >= 100} onClick={() => change("items", [...draft.items, ...Array.from({ length: Math.min(5, 100 - draft.items.length) }, () => ({ description: "", quantity: "", usdValue: "" }))])}><Plus size={14} /> Add 5 rows</button>
            <button type="button" className="button secondary" disabled={draft.items.length === 1} onClick={() => change("items", draft.items.slice(0, -1))}>Remove last item</button>
            <span>{dirty ? "Unsaved changes" : draft.id ? "Saved" : "New estimate"}</span>
          </div>
          <div className="pre-actions">{draft.id && <button type="button" className="button secondary" onClick={remove}><Trash2 size={14} /> Delete</button>}<button type="button" className="button secondary" disabled={!result} onClick={() => { const issue = validatePreCosting(draft); if (issue) { setError(issue); return; } try { downloadCostingPdf(draft, result, "Pre costing"); } catch (err) { setError(err.message); } }}><Download size={14} /> Download PDF</button><button type="button" className="button secondary" disabled={!result} onClick={() => { const issue = validatePreCosting(draft); if (issue) { setError(issue); return; } try { downloadCostingExcel(draft, result, "Pre costing"); } catch (err) { setError(err.message); } }}><Download size={14} /> Download Excel</button><button className="button primary" type="submit"><Save size={14} />{busy ? "Saving…" : "Save pre costing"}</button></div>
        </fieldset>
      </form>
      <aside className="panel costing-list"><div className="costing-list-head"><strong>Saved pre costings</strong><span>{records.length}</span></div><div className="costing-filter"><input aria-label="Search pre costings" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search costings…" /></div>{loading ? <p className="costing-empty">Loading…</p> : filtered.length ? filtered.map((item) => <button disabled={busy} type="button" key={item.id} className={draft.id === item.id ? "active" : ""} onClick={() => replace(item)}><strong>{item.reference}</strong><span>{item.material}</span><span>{item.date}</span></button>) : <p className="costing-empty">{query ? "No matching costings." : "No pre costings saved yet."}</p>}</aside>
    </div>
  </section>;
}
