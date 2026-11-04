import test from "node:test";
import assert from "node:assert/strict";
import { calculatePreCosting, chargeFields, samplePreCosting, newPreCosting, preparePreCostingDraft, validatePreCosting } from "./preCosting.js";
import { normalizePreCosting } from "../../Backend/src/preCostings.js";

test("reference worksheet reconciles through landed cost and VAT exclusion", () => {
  const draft = samplePreCosting();
  assert.equal(validatePreCosting(draft), "");
  const { totals } = calculatePreCosting(draft);
  for (const [key, value] of Object.entries({ lkrValue: 375480, cif: 376980, duty: 134865, landed: 569845, perKg: 22793.8, withoutVat: 19503.8 })) assert.equal(totals[key], value, key);
});

test("legacy footer description becomes an editable item and survives saving once completed", () => {
  const original = samplePreCosting();
  const draft = preparePreCostingDraft(original);
  assert.equal(original.totalLabel, "RED");
  assert.equal(draft.totalLabel, "");
  assert.deepEqual(draft.items[1], { description: "RED", quantity: "", usdValue: "" });
  assert.equal(calculatePreCosting(draft).rows[1], null);
  draft.items[1] = { ...draft.items[1], quantity: 10, usdValue: 100 };
  assert.equal(validatePreCosting(draft), "");
  const saved = normalizePreCosting(draft).data;
  assert.equal(preparePreCostingDraft(saved).items.length, 2);
  assert.equal(calculatePreCosting(saved).rows[1].lkrValue, 33600);
});
test("multiple items allocate charges by invoice value and reconcile", () => {
  const draft = { ...samplePreCosting(), items: [{ description: "A", quantity: 10, usdValue: 100 }, { description: "B", quantity: 30, usdValue: 300 }] };
  const { rows, totals } = calculatePreCosting(draft);
  assert.equal(rows[0].insurance, 375);
  assert.equal(rows[1].clearing, 43500);
  assert.equal(totals.landed, 400 * 336 + 1500 + 37615 + 15000 + 82250 + 58000);
  assert.equal(totals.perKg, totals.landed / 40);
  assert.equal(totals.withoutVat, (totals.landed - 82250) / 40);
});
test("incomplete, zero and invalid inputs cannot produce misleading results", () => {
  assert.equal(calculatePreCosting(newPreCosting()), null);
  for (const draft of [{ ...samplePreCosting(), exchangeRate: 0 }, { ...samplePreCosting(), exchangeRate: "" }, { ...samplePreCosting(), vat: -1 }, { ...samplePreCosting(), items: [{ description: "A", quantity: 0, usdValue: 10 }] }]) {
    assert.ok(validatePreCosting(draft)); assert.equal(calculatePreCosting(draft), null);
    assert.throws(() => normalizePreCosting(draft));
  }
  const zeroCharges = { ...samplePreCosting(), insurance: 0, freight: 0, cid: 0, pal: 0, eic: 0, sscl: 0, vat: 0, clearing: 0 };
  assert.equal(calculatePreCosting(zeroCharges).totals.landed, 375480);
});
test("clearing any charge keeps other calculations and can be saved as zero", () => {
  for (const [key] of chargeFields) {
    const draft = { ...samplePreCosting(), [key]: "" };
    const expected = calculatePreCosting({ ...draft, [key]: 0 });
    assert.equal(validatePreCosting(draft), "", key);
    assert.deepEqual(calculatePreCosting(draft), expected, key);
    assert.equal(normalizePreCosting(draft).data[key], 0, key);
  }
  const draft = { ...samplePreCosting(), eic: "" };
  const { totals } = calculatePreCosting(draft);
  assert.equal(totals.lkrValue, 375480);
  assert.equal(totals.pal, 37615);
  assert.equal(totals.landed, 569845);
  assert.equal(totals.perKg, 22793.8);
  const allBlank = { ...draft, ...Object.fromEntries(chargeFields.map(([key]) => [key, ""])) };
  assert.equal(calculatePreCosting(allBlank).totals.landed, 375480);
});
test("server persists only normalized input fields", () => {
  const normalized = normalizePreCosting({ ...samplePreCosting(), exchangeRate: "336", id: "forged", landed: 1 });
  assert.equal(normalized.data.exchangeRate, 336);
  assert.equal(normalized.data.id, undefined);
  assert.equal(normalized.data.landed, undefined);
  assert.throws(() => normalizePreCosting({ ...samplePreCosting(), items: [] }));
  assert.throws(() => normalizePreCosting({ ...samplePreCosting(), vat: true }));
});

test("adding one or five blank rows preserves existing calculations", () => {
  const draft = samplePreCosting();
  const expected = calculatePreCosting(draft);
  for (const count of [1, 5]) {
    const expanded = { ...draft, items: [...draft.items, ...Array.from({ length: count }, () => ({ description: "", quantity: "", usdValue: "" }))] };
    const result = calculatePreCosting(expanded);
    assert.deepEqual(result.rows[0], expected.rows[0]);
    assert.deepEqual(result.rows.slice(1), Array(count).fill(null));
    assert.deepEqual(result.totals, expected.totals);
    assert.ok(validatePreCosting(expanded));
    assert.throws(() => normalizePreCosting(expanded));
  }
});

test("unfinished rows keep their positions and recalculate allocations when completed", () => {
  const first = { description: "A", quantity: 10, usdValue: 100 };
  const last = { description: "C", quantity: 30, usdValue: 300 };
  const baseline = calculatePreCosting({ ...samplePreCosting(), items: [first, last] });
  for (const partial of [
    { description: "B", quantity: "", usdValue: 200 },
    { description: "B", quantity: 20, usdValue: "" },
    { description: "B", quantity: 0, usdValue: 200 },
    { description: "B", quantity: 20, usdValue: "invalid" },
  ]) {
    const result = calculatePreCosting({ ...samplePreCosting(), items: [first, partial, last] });
    assert.deepEqual(result.rows, [baseline.rows[0], null, baseline.rows[1]]);
    assert.deepEqual(result.totals, baseline.totals);
  }
  const result = calculatePreCosting({ ...samplePreCosting(), items: [first, { description: "B", quantity: 20, usdValue: 200 }, last] });
  assert.deepEqual(result.rows.map((row) => row.insurance), [250, 500, 750]);
  assert.equal(result.totals.quantity, 60);
  assert.equal(result.totals.usdValue, 600);
  assert.equal(result.totals.insurance, 1500);
  assert.equal(result.rows[1].perKg, result.rows[1].landed / 20);
});
