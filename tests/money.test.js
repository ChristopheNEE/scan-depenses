import { test } from "node:test";
import assert from "node:assert/strict";
import { toCents, fromTTC, fromHT, detectRate, recompute, isConsistent, totals } from "../src/lib/money.js";

test("toCents lit les formats français", () => {
  assert.equal(toCents("12,50"), 1250);
  assert.equal(toCents("1 234,56 €"), 123456);
  assert.equal(toCents(48.6), 4860);
  assert.equal(toCents("0,1"), 10);
  assert.equal(toCents(""), null);
  assert.equal(toCents("abc"), null);
});

test("TTC → HT/TVA : HT + TVA = TTC au centime", () => {
  assert.deepEqual(fromTTC(12000, 20), { ht: 10000, tva: 2000 });
  assert.deepEqual(fromTTC(4860, 10), { ht: 4418, tva: 442 }); // 48,60 TTC à 10 %
  assert.deepEqual(fromTTC(1000, 5.5), { ht: 948, tva: 52 });
  assert.deepEqual(fromTTC(999, 0), { ht: 999, tva: 0 });
  for (let ttc = 1; ttc < 5000; ttc += 7) {
    for (const r of [20, 10, 5.5, 2.1]) {
      const { ht, tva } = fromTTC(ttc, r);
      assert.equal(ht + tva, ttc);
    }
  }
});

test("HT → TVA/TTC", () => {
  assert.deepEqual(fromHT(10000, 20), { tva: 2000, ttc: 12000 });
  assert.deepEqual(fromHT(4418, 10), { tva: 442, ttc: 4860 });
});

test("détection du taux, y compris tolérance d'arrondi et taux mixte", () => {
  assert.equal(detectRate(10000, 2000), 20);
  assert.equal(detectRate(4418, 442), 10);
  assert.equal(detectRate(948, 52), 5.5);
  assert.equal(detectRate(10000, 1500), null); // mélange 10 % / 20 %
});

test("recompute : modifier la TVA garde le TTC payé", () => {
  const d = recompute({ ttc: 4860, ht: 4050, tva: 810, rate: 20 }, "tva");
  assert.equal(d.ttc, 4860);
  assert.equal(d.tva, 810);
  assert.equal(d.ht, 4050);
  assert.equal(d.rate, 20);
  const m = recompute({ ttc: 5000, ht: null, tva: 600, rate: 20 }, "tva");
  assert.equal(m.ht, 4400);
  assert.equal(m.rate, null); // 600/4400 ≈ 13,6 % → mixte
  assert.ok(isConsistent(m));
});

test("recompute : changer le taux recalcule depuis le TTC", () => {
  const d = recompute({ ttc: 4860, ht: 4050, tva: 810, rate: 10 }, "rate");
  assert.deepEqual([d.ht, d.tva], [4418, 442]);
});

test("totaux", () => {
  assert.deepEqual(totals([{ ht: 100, tva: 20, ttc: 120 }, { ht: 4418, tva: 442, ttc: 4860 }]), { ht: 4518, tva: 462, ttc: 4980 });
});
