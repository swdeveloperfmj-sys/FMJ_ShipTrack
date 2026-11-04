import React, { useEffect, useRef, useState } from "react";

export const sheetColumns = [["description", "ITEM DESCRIPTION"], ["quantity", "QTY KG"], ["usdValue", "USD PRICE/C&F"], ["lkrValue", "LKR PRICE"], ["insurance", "INSURANCE"], ["freight", "FREIGHT"], ["cif", "CIF PRICE"], ["cid", "CID"], ["pal", "PAL"], ["eic", "EIC"], ["sscl", "SSCL"], ["vat", "VAT"], ["duty", "TOT DUTY"], ["clearing", "CLEARING/ OTHER CHGS"], ["landed", "TOTAL LANDING COST"], ["perKg", "LANDING COST/KG"], ["withoutVat", "without VAT"]];
const amount = (value) => value === undefined ? "" : Number(value) === 0 ? "-" : Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const defaultWidths = [144, 54, 71, 86, 90, 89, 86, 260, 78, 80, 78, 79, 86, 78, 85, 78, 78];
const widthsStorageKey = "fmj-pre-costing-column-widths";
const usdColumnLabelStorageKey = "fmj-pre-costing-usd-column-label";
const defaultUsdColumnLabel = "USD PRICE/C&F";
const editableColumnLabels = {
  quantity: { storageKey: "fmj-pre-costing-quantity-column-label", defaultValue: "QTY KG" },
  perKg: { storageKey: "fmj-pre-costing-per-kg-column-label", defaultValue: "LANDING COST/KG" },
};
const clampWidth = (width) => Math.min(800, Math.max(48, Math.round(width)));

export default function PreCostingSheet({ draft, result, change, changeItem, title = "Pre costing" }) {
  const [usdColumnLabel, setUsdColumnLabel] = useState(() => {
    try { return localStorage.getItem(usdColumnLabelStorageKey) ?? defaultUsdColumnLabel; } catch { return defaultUsdColumnLabel; }
  });
  const [columnLabels, setColumnLabels] = useState(() => Object.fromEntries(Object.entries(editableColumnLabels).map(([key, config]) => {
    try { return [key, localStorage.getItem(config.storageKey) ?? config.defaultValue]; } catch { return [key, config.defaultValue]; }
  })));
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
  function changeUsdColumnLabel(value) {
    setUsdColumnLabel(value);
    try { localStorage.setItem(usdColumnLabelStorageKey, value); } catch { /* The label remains editable for this session. */ }
  }
  function changeColumnLabel(key, value) {
    setColumnLabels((current) => ({ ...current, [key]: value }));
    try { localStorage.setItem(editableColumnLabels[key].storageKey, value); } catch { /* The label remains editable for this session. */ }
  }
  function input(key, label, type = "text", extra = {}) {
    return <input aria-label={label} title={label} type={type} value={draft[key] ?? ""} onClick={type === "date" ? (event) => {
      try { event.currentTarget.showPicker?.(); } catch { /* Keep native date entry when the browser cannot open a picker. */ }
    } : undefined} onFocus={type === "number" && Number(draft[key]) === 0 ? () => change(key, "") : undefined} onWheel={type === "number" ? (event) => event.currentTarget.blur() : undefined} onChange={(event) => change(key, event.target.value)} {...extra} />;
  }
  const chargeKeys = { lkrValue: "exchangeRate", insurance: "insurance", freight: "freight", cid: "cid", pal: "pal", eic: "eic", sscl: "sscl", vat: "vat", clearing: "clearing" };
  const breakdownOther = (result?.totals.lkrValue || 0) * 0.03;
  const breakdownBank = (result?.totals.lkrValue || 0) * 0.01;
  const breakdownTotal = Number(draft.breakdownClearing || 0) + breakdownOther + breakdownBank;
  return <div className={`pre-sheet-scroll${resizing ? " pre-sheet-resizing" : ""}`}><div className="pre-sheet-paper" style={{ minWidth: widths.reduce((sum, width) => sum + width, 0) }}>
    <table className="pre-sheet" aria-label={`${title} worksheet`} style={{ width: widths.reduce((sum, width) => sum + width, 0) }}>
      <colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
      <thead>
        <tr className="sheet-title-row"><td colSpan={3}></td><td colSpan={8} className="sheet-title">{input("reference", "Costing title", "text", { required: true, maxLength: 200 })}</td><td colSpan={6}></td></tr>
        <tr className="sheet-title-row"><td colSpan={3} className="sheet-hs"><label>HS CODE: {input("hsCode", "HS code", "text", { maxLength: 200 })}</label></td><td colSpan={8} className="sheet-material">{input("material", "Material", "text", { required: true, maxLength: 200 })}</td><td colSpan={3}></td><td colSpan={2}>{input("date", "Date", "date")}</td><td></td></tr>
        <tr className="sheet-assumptions">{sheetColumns.map(([key, label]) => <td key={key}>{chargeKeys[key] && (key === "clearing" ? <output className="sheet-assumption-value" aria-label="Clearing and other charges total">{result ? amount(result.totals.clearing) : "-"}</output> : input(chargeKeys[key], key === "lkrValue" ? "Exchange rate (LKR per USD)" : `${label} total (LKR); blank means zero`, "number", { min: key === "lkrValue" ? "0.000001" : "0", step: "any", required: key === "lkrValue", placeholder: key === "lkrValue" ? undefined : "0" }))}</td>)}</tr>
        <tr className="sheet-column-headings">{sheetColumns.map(([key, label], index) => <th key={key} scope="col">{key === "usdValue" ? <input className="sheet-column-name-input" type="text" aria-label="USD PRICE/C&F column name" title="Edit this column name" maxLength={60} value={usdColumnLabel} onChange={(event) => changeUsdColumnLabel(event.target.value)} /> : editableColumnLabels[key] ? <input className="sheet-column-name-input" type="text" aria-label={`${label} column name`} title="Edit this column name" maxLength={60} value={columnLabels[key]} onChange={(event) => changeColumnLabel(key, event.target.value)} /> : label}<button type="button" className="sheet-column-resizer" role="separator" aria-orientation="vertical" aria-label={`Resize ${key === "usdValue" ? usdColumnLabel || defaultUsdColumnLabel : editableColumnLabels[key] ? columnLabels[key] || label : label} column`} aria-valuemin={48} aria-valuemax={800} aria-valuenow={widths[index]} title="Drag to resize. Double-click to reset." onPointerDown={(event) => startResize(event, index)} onPointerMove={moveResize} onPointerUp={finishResize} onPointerCancel={finishResize} onLostPointerCapture={finishResize} onDoubleClick={() => setWidth(index, defaultWidths[index])} onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setWidth(index, widths[index] + (event.key === "ArrowRight" ? 10 : -10)); }
          if (event.key === "Home") { event.preventDefault(); setWidth(index, defaultWidths[index]); }
        }} /></th>)}</tr>
      </thead>
      <tbody>{draft.items.map((item, index) => <tr key={index}>{sheetColumns.map(([key]) => {
        const editable = ["description", "quantity", "usdValue"].includes(key);
        return <td key={key} className={key === "perKg" || key === "withoutVat" ? "sheet-highlight" : ""}>{editable ? <input aria-label={`Item ${index + 1} ${key}`} title={key === "usdValue" ? "Full USD line value, including invoiced C&F freight" : undefined} type={key === "description" ? "text" : "number"} onFocus={key !== "description" && Number(item[key]) === 0 ? () => changeItem(index, key, "") : undefined} onWheel={key !== "description" ? (event) => event.currentTarget.blur() : undefined} required min={key === "description" ? undefined : "0.000001"} step="any" maxLength={key === "description" ? 200 : undefined} value={item[key]} onChange={(event) => changeItem(index, key, event.target.value)} /> : amount(result?.rows[index]?.[key])}</td>;
      })}</tr>)}<tr className="sheet-total-row"><th scope="row">TOTAL</th>{sheetColumns.slice(1).map(([key]) => <td key={key}>{amount(result?.totals[key])}</td>)}</tr></tbody>
    </table>
    <div className="sheet-breakdown">
      <div>Clearing</div><div>{input("breakdownClearing", "Clearing breakdown amount", "number", { min: 0, step: "any" })}</div><div className="sheet-breakdown-detail">{input("breakdownDetails", "Clearing breakdown details", "text", { maxLength: 500 })}</div>
      <div>{input("breakdownLabel", "Other charge label", "text", { maxLength: 80 })}</div><div>{amount(breakdownOther)}</div><div></div>
      <div>Bank Charges</div><div>{amount(breakdownBank)}</div><div></div>
      <div></div><output className="sheet-breakdown-total" aria-label="Clearing breakdown total">{amount(breakdownTotal)}</output><div></div>
    </div>
  </div></div>;
}
