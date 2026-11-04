// Formula order and rounding mirror CALCULATION.xlsx, Duty!A1:H17.
export const dutyDefaults = { D4: 2288, E4: 340, C6: 0, C7: 0, C8: 0.1, C9: 0, C10: 0.18, C11: 0.025, D12: 3764, E12: 3764, F12: 5250, C13: 0 };
export const percentageCells = new Set(["C6", "C7", "C8", "C9", "C10", "C11", "C13"]);
const sessionKey = "fmj-duty-calculation-v1";

export function loadDutySession() {
  const inputs = { ...dutyDefaults };
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(sessionKey));
    for (const key of Object.keys(inputs)) {
      const value = saved?.[key];
      if (value === "" || (typeof value === "number" && Number.isFinite(value))) inputs[key] = value;
      // JSON represents an invalid numeric input as null; keep its error visible.
      else if (value === null) inputs[key] = NaN;
    }
  } catch { /* Keep the calculator usable when browser storage is unavailable. */ }
  return inputs;
}

export function saveDutySession(inputs) {
  try { window.sessionStorage.setItem(sessionKey, JSON.stringify(inputs)); }
  catch { /* React state still retains edits while this page remains open. */ }
}

const round = (value) => Math.sign(value) * Math.round(Math.abs(value));

export function calculateDuty(inputs) {
  const c = Object.fromEntries(Object.keys(dutyDefaults).map((key) => [key, Number(inputs[key] ?? dutyDefaults[key])]));
  c.F4 = c.D4 * c.E4;
  for (const row of [6, 7, 8, 9]) c[`B${row}`] = c.F4;
  c.D6 = c.B6 * c.C6;
  c.D7 = c.D6 * c.C7;
  c.D8 = round(c.B8 * c.C8);
  c.D9 = c.C9 * c.B9;
  c.B10 = c.F4 * 1.1 + c.D6 + c.D7 + c.D8 + c.D9;
  c.D10 = c.C10 * c.B10;
  c.B11 = c.B10;
  c.D11 = round(c.B11 * c.C11);
  c.B13 = c.B10;
  c.D13 = round(c.C13 * c.B13);
  c.D14 = Array.from({ length: 8 }, (_, index) => c[`D${index + 6}`]).reduce((sum, value) => sum + value, 0);
  return c;
}

export function parseDutyInput(address, text) {
  const value = text.trim().replaceAll(",", "").replace(/%$/, "");
  if (value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) ? number / (percentageCells.has(address) ? 100 : 1) : NaN;
}

export function dutyHeaderValues(inputs) {
  const values = calculateDuty(inputs);
  // Transfer amounts, not percentage rates. SUR, COM and NBT have no matching header.
  const headers = { exchangeRate: values.E4, cid: values.D6, pal: values.D8, eic: values.D9, vat: values.D10, sscl: values.D11 };
  if (headers.exchangeRate <= 0 || Object.values(headers).some((value) => !Number.isFinite(value) || value < 0)) return null;
  return headers;
}
