import React, { useEffect, useRef, useState } from "react";

export const sheetColumns = [["description", "ITEM DESCRIPTION"], ["quantity", "QTY KG"], ["usdValue", "USD PRICE/C&F"], ["lkrValue", "LKR PRICE"], ["insurance", "INSURANCE"], ["freight", "FREIGHT"], ["cif", "CIF PRICE"], ["cid", "CID"], ["pal", "PAL"], ["eic", "EIC"], ["sscl", "SSCL"], ["vat", "VAT"], ["duty", "TOT DUTY"], ["clearing", "CLEARING/ OTHER CHGS"], ["landed", "TOTAL LANDING COST"], ["perKg", "LANDING COST/KG"], ["withoutVat", "without VAT"]];
const amount = (value) => value === undefined ? "" : Number(value) === 0 ? "-" : Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const defaultWidths = [144, 54, 71, 86, 90, 89, 86, 260, 78, 80, 78, 79, 86, 78, 85, 78, 78];
const widthsStorageKey = "fmj-pre-costing-column-widths";
const clampWidth = (width) => Math.min(800, Math.max(48, Math.round(width)));

export default function PreCostingSheet({ draft, result, change, changeItem }) {
  const [widths, setWidths] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(widthsStorageKey));
      if (Array.isArray(saved) && saved.length === defaultWidths.length && saved.every((width) => typeof width === "number" && Number.isFinite(width))) return saved.map(clampWidth);
    } catch { /* Use the standard widths if browser storage is unavailable. */ }
    return [...defaultWidths];
  });
  const resize = useRef(null);
  const [resizing, setResizing] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(widthsStorageKey, JSON.stringify(widths)); } catch { /* Resizing still works without browser storage. */ }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [widths]);
  function setWidth(index, width) {
    setWidths((current) => current.map((value, column) => column === index ? clampWidth(width) : value));
  }
  function startResize(event, index) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resize.current = { index, x: event.clientX, width: widths[index], pointerId: event.pointerId };
    setResizing(true);
  }
  function moveResize(event) {
    const active = resize.current;
    if (!active || active.pointerId !== event.pointerId) return;
    setWidth(active.index, active.width + event.clientX - active.x);
  }
  function finishResize() { resize.current = null; setResizing(false); }
  function input(key, label, type = "text", extra = {}) {
    return <input aria-label={label} title={label} type={type} value={draft[key] ?? ""} onClick={type === "date" ? (event) => {
      try { event.currentTarget.showPicker?.(); } catch { /* Keep native date entry when the browser cannot open a picker. */ }
    } : undefined} onChange={(event) => change(key, event.target.value)} {...extra} />;
  }
  const chargeKeys = { lkrValue: "exchangeRate", insurance: "insurance", freight: "freight", cid: "cid", pal: "pal", eic: "eic", sscl: "sscl", vat: "vat", clearing: "clearing" };
  const breakdownTotal = ["breakdownClearing", "breakdownOther", "breakdownBank"].reduce((sum, key) => sum + Number(draft[key] || 0), 0);
  return <div className={`pre-sheet-scroll${resizing ? " pre-sheet-resizing" : ""}`}><div className="pre-sheet-paper" style={{ minWidth: widths.reduce((sum, width) => sum + width, 0) }}>
    <table className="pre-sheet" aria-label="Pre costing worksheet" style={{ width: widths.reduce((sum, width) => sum + width, 0) }}>
      <colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
      <thead>
        <tr className="sheet-title-row"><td colSpan={3}></td><td colSpan={8} className="sheet-title">{input("reference", "Costing title", "text", { required: true, maxLength: 200 })}</td><td colSpan={6}></td></tr>
        <tr className="sheet-title-row"><td colSpan={3} className="sheet-hs"><label>HS CODE: {input("hsCode", "HS code", "text", { maxLength: 200 })}</label></td><td colSpan={8} className="sheet-material">{input("material", "Material", "text", { required: true, maxLength: 200 })}</td><td colSpan={3}></td><td colSpan={2}>{input("date", "Date", "date")}</td><td></td></tr>
        <tr className="sheet-assumptions">{sheetColumns.map(([key, label]) => <td key={key}>{chargeKeys[key] && input(chargeKeys[key], key === "lkrValue" ? "Exchange rate (LKR per USD)" : `${label} total (LKR); blank means zero`, "number", { min: key === "lkrValue" ? "0.000001" : "0", step: "any", required: key === "lkrValue", placeholder: key === "lkrValue" ? undefined : "0" })}</td>)}</tr>
        <tr className="sheet-column-headings">{sheetColumns.map(([key, label], index) => <th key={key} scope="col">{label}<button type="button" className="sheet-column-resizer" role="separator" aria-orientation="vertical" aria-label={`Resize ${label} column`} aria-valuemin={48} aria-valuemax={800} aria-valuenow={widths[index]} title="Drag to resize. Double-click to reset." onPointerDown={(event) => startResize(event, index)} onPointerMove={moveResize} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={finishResize} onDoubleClick={() => setWidth(index, defaultWidths[index])} onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setWidth(index, widths[index] + (event.key === "ArrowRight" ? 10 : -10)); }
          if (event.key === "Home") { event.preventDefault(); setWidth(index, defaultWidths[index]); }
        }} /></th>)}</tr>
      </thead>
      <tbody>{draft.items.map((item, index) => <tr key={index}>{sheetColumns.map(([key]) => {
        const editable = ["description", "quantity", "usdValue"].includes(key);
        return <td key={key} className={key === "perKg" || key === "withoutVat" ? "sheet-highlight" : ""}>{editable ? <input aria-label={`Item ${index + 1} ${key}`} title={key === "usdValue" ? "Full USD line value, including invoiced C&F freight" : undefined} type={key === "description" ? "text" : "number"} required min={key === "description" ? undefined : "0.000001"} step="any" maxLength={key === "description" ? 200 : undefined} value={item[key]} onChange={(event) => changeItem(index, key, event.target.value)} /> : amount(result?.rows[index]?.[key])}</td>;
      })}</tr>)}</tbody>
      <tfoot><tr>{sheetColumns.map(([key]) => <td key={key}>{key === "description" ? input("totalLabel", "Description below items", "text", { maxLength: 200 }) : ["quantity", "perKg", "withoutVat"].includes(key) ? "" : amount(result?.totals[key])}</td>)}</tr></tfoot>
    </table>
    <div className="sheet-breakdown">
      <div>Clearing</div><div>{input("breakdownClearing", "Clearing breakdown amount", "number", { min: 0, step: "any" })}</div><div className="sheet-breakdown-detail">{input("breakdownDetails", "Clearing breakdown details", "text", { maxLength: 500 })}</div>
      <div>{input("breakdownLabel", "Other charge label", "text", { maxLength: 80 })}</div><div>{input("breakdownOther", "Other breakdown amount", "number", { min: 0, step: "any" })}</div><div></div>
      <div>Bank Charges</div><div>{input("breakdownBank", "Bank charges", "number", { min: 0, step: "any" })}</div><div></div>
      <div></div><output className="sheet-breakdown-total" aria-label="Clearing breakdown total">{amount(breakdownTotal)}</output><div></div>
    </div>
  </div></div>;
}
