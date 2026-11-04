import React, { useEffect, useRef, useState } from "react";
import template from "./dutyTemplate.json";
import { calculateDuty, dutyDefaults, dutyHeaderValues, loadDutySession, saveDutySession, parseDutyInput, percentageCells } from "./dutyCalculation.js";
import "./dutyCalculator.css";

const columns = "ABCDEFGH".split("");
const labels = { D4: "Foreign value", E4: "Exchange rate", C6: "CID rate (%)", C7: "SUR rate (%)", C8: "PAL rate (%)", C9: "EIC rate (%)", C10: "VAT rate (%)", C11: "SRL/SSCL rate (%)", D12: "COM", E12: "E12 reference amount", F12: "F12 reference amount", C13: "NBT rate (%)" };
function format(value, formatId) {
  if (typeof value !== "number") return value;
  if (!Number.isFinite(value)) return "#VALUE!";
  const percent = [9, 10, 166].includes(formatId);
  const decimals = formatId === 164 ? 4 : formatId === 9 ? 0 : formatId === 166 ? 1 : 2;
  return (percent ? value * 100 : value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + (percent ? "%" : "");
}

export default function DutyCalculator({ open, onClose, onPass, busy = false }) {
  const dialog = useRef(null);
  const [inputs, setInputs] = useState(loadDutySession);
  const [selected, setSelected] = useState("D4");
  const [editing, setEditing] = useState(null);
  const values = calculateDuty(inputs);
  const headers = dutyHeaderValues(inputs);
  useEffect(() => { saveDutySession(inputs); }, [inputs]);
  useEffect(() => {
    const element = dialog.current;
    if (open && !element.open) { element.showModal(); element.querySelector('[data-cell="D4"]')?.focus(); }
    if (!open && element.open) element.close();
  }, [open]);
  function navigate(event, address) {
    const offsets = { ArrowUp: [0, -1], ArrowDown: [0, 1], Enter: [0, event.shiftKey ? -1 : 1] };
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const column = columns.indexOf(address[0]);
    const row = Number(address.slice(1));
    const target = `${columns[column]}${Math.max(1, Math.min(17, row + offset[1]))}`;
    dialog.current.querySelector(`[data-cell="${target}"]`)?.focus();
  }
  const selectedCell = template.cells[selected];
  return <dialog ref={dialog} className="duty-dialog" aria-labelledby="duty-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <header className="duty-titlebar"><strong id="duty-title">CALCULATION</strong><button type="button" onClick={onClose} aria-label="Close calculation">×</button></header>
    <div className="duty-toolbar"><span>Edit amount and percentage cells to recalculate.</span><button type="button" onClick={() => { setInputs({ ...dutyDefaults }); setEditing(null); }}>Reset template</button></div>
    <div className="duty-formula"><span>{selected}</span><i>fx</i><output>{selectedCell?.formula ? `=${selectedCell.formula}` : labels[selected] || selectedCell?.value || ""}</output></div>
    <div className="duty-grid-scroll"><table className="duty-grid" aria-label="Duty calculation worksheet">
      <colgroup><col style={{ width: 36 }} />{template.widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
      <thead><tr><th></th>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
      <tbody>{Array.from({ length: 17 }, (_, index) => index + 1).map((row) => <tr key={row} style={{ height: row >= 6 && row <= 14 ? 24 : row === 16 ? 31 : 19 }}><th scope="row">{row}</th>{columns.map((column) => {
        const address = `${column}${row}`;
        const cell = template.cells[address];
        const style = template.styles[cell?.style || 0];
        const editable = Object.hasOwn(dutyDefaults, address);
        const value = Object.hasOwn(values, address) ? values[address] : cell?.value ?? "";
        const display = format(value, style.format);
        return <td key={address} className={`${selected === address ? "duty-selected" : ""} ${style.fill ? "duty-total" : ""}`} style={{ color: style.color, fontWeight: style.bold ? 700 : 400, textAlign: typeof value === "string" && value.trim() ? "left" : style.align, border: style.border ? "3px solid red" : undefined }}>
          {editable ? <input data-cell={address} aria-label={`${address} ${labels[address]}`} inputMode="decimal" value={editing?.address === address ? editing.text : display} onFocus={() => { setSelected(address); setEditing({ address, text: String(inputs[address] === "" ? "" : inputs[address] * (percentageCells.has(address) ? 100 : 1)) }); }} onChange={(event) => { const text = event.target.value; setEditing({ address, text }); setInputs((current) => ({ ...current, [address]: parseDutyInput(address, text) })); }} onBlur={() => setEditing(null)} onKeyDown={(event) => navigate(event, address)} /> : <button type="button" data-cell={address} aria-label={`${address} ${display || "Blank"}${cell?.formula ? `, formula ${cell.formula}` : ""}`} onFocus={() => setSelected(address)} onKeyDown={(event) => navigate(event, address)}>{display}</button>}
        </td>;
      })}</tr>)}</tbody>
    </table></div>
    {onPass && <p className="duty-pass-hint">Pass updates Exchange rate, CID, PAL, EIC, VAT and SSCL in Pre costing.{!headers && " Enter a positive exchange rate and valid, non-negative amounts to pass."}</p>}
    <footer className="duty-footer"><span>Duty</span><small>F1 open · Esc close · Enter / ↑ ↓ move</small>{onPass && <button type="button" className="duty-pass" disabled={busy || !headers} onClick={() => { if (headers && !busy) onPass(headers); }}>Pass</button>}<button type="button" onClick={onClose}>Close</button></footer>
  </dialog>;
}
