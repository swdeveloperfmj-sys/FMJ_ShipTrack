import test from "node:test";
import assert from "node:assert/strict";
import { calculatePreCosting, chargeFields, samplePreCosting, newPreCosting, validatePreCosting } from "./preCosting.js";
import { normalizePreCosting } from "../../Backend/src/preCostings.js";

test("reference worksheet reconciles through landed cost and VAT exclusion", () => {
  const draft = samplePreCosting();
  assert.equal(validatePreCosting(draft), "");
  const { totals } = calculatePreCosting(draft);
  for (const [key, value] of Object.entries({ lkrValue: 375480, cif: 376980, duty: 134865, landed: 569845, perKg: 22793.8, withoutVat: 19503.8 })) assert.equal(totals[key], value, key);
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
