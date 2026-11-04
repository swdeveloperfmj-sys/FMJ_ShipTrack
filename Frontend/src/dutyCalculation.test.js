import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateDuty, dutyDefaults, dutyHeaderValues, loadDutySession, saveDutySession, parseDutyInput } from "./dutyCalculation.js";
import { calculatePreCosting, samplePreCosting } from "./preCosting.js";

test("Pass maps calculated amounts to matching headers and recalculates costing", () => {
  const headers = dutyHeaderValues(dutyDefaults);
  assert.deepEqual(headers, { exchangeRate: 340, cid: 0, pal: 77792, eic: 0, vat: 168030.72, sscl: 23338 });
  const draft = samplePreCosting();
  const updated = { ...draft, ...headers };
  const result = calculatePreCosting(updated);
  assert.equal(updated.clearing, draft.clearing);
  assert.equal(updated.insurance, draft.insurance);
  assert.equal(updated.freight, draft.freight);
  assert.equal(updated.items, draft.items);
  assert.equal(result.totals.duty, headers.cid + headers.pal + headers.eic + headers.vat + headers.sscl);
  assert.equal(result.rows[0].lkrValue, draft.items[0].usdValue * 340);
  assert.equal(dutyHeaderValues({ ...dutyDefaults, C8: 0 }).pal, 0);
  assert.equal(dutyHeaderValues({ ...dutyDefaults, C8: 0.2 }).pal, 155584);
});

test("Pass rejects invalid headers instead of overwriting costing values", () => {
  for (const inputs of [{ E4: 0 }, { E4: "" }, { E4: NaN }, { C10: NaN }, { C8: -0.1 }]) {
    assert.equal(dutyHeaderValues({ ...dutyDefaults, ...inputs }), null);
  }
});

test("temporary calculator edits restore across remounts, including zero and blank values", (t) => {
  const data = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = { sessionStorage: { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } };
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  assert.deepEqual(loadDutySession(), dutyDefaults);
  const edits = { ...dutyDefaults, D4: 5000, E4: 0, C8: "", C10: 0.15, C9: NaN };
  saveDutySession(edits);
  assert.deepEqual(loadDutySession(), edits);
  saveDutySession(dutyDefaults);
  assert.deepEqual(loadDutySession(), dutyDefaults);
  globalThis.window.sessionStorage.getItem = () => { throw new Error("Storage blocked"); };
  assert.deepEqual(loadDutySession(), dutyDefaults);
});

test("every formula matches the reference workbook cached result", () => {
  const template = JSON.parse(readFileSync(new URL("./dutyTemplate.json", import.meta.url), "utf8"));
  const results = calculateDuty(dutyDefaults);
  for (const [address, cell] of Object.entries(template.cells)) {
    if (cell.formula) assert.ok(Math.abs(results[address] - cell.value) < 0.000001, address);
  }
});

test("input changes propagate through surcharge, rounding, VAT, SSCL and total", () => {
  const result = calculateDuty({ ...dutyDefaults, D4: 100, E4: 10, C6: 0.2, C7: 0.1, C9: 0.03, C13: 0.02 });
  assert.equal(result.D6, 200);
  assert.equal(result.D7, 20);
  assert.equal(result.D8, 100);
  assert.equal(result.B10, 1450);
  assert.equal(result.D10, 261);
  assert.equal(result.D11, 36);
  assert.equal(result.D13, 29);
  assert.equal(result.D14, 4440);
  assert.equal(calculateDuty({ ...dutyDefaults, D4: "" }).D14, 3764);
  assert.equal(calculateDuty({ ...dutyDefaults, E12: 9999, F12: 9999 }).D14, calculateDuty(dutyDefaults).D14);
});

test("spreadsheet input accepts formatted numbers and percentages, exposing invalid input", () => {
  assert.equal(parseDutyInput("C11", "2.5%"), 0.025);
  assert.equal(parseDutyInput("D4", "2,288.00"), 2288);
  assert.equal(parseDutyInput("E4", ""), "");
  assert.ok(Number.isNaN(parseDutyInput("E4", "invalid")));
  assert.ok(Number.isNaN(calculateDuty({ ...dutyDefaults, E4: NaN }).D14));
});
