// Calculs HT / TVA / TTC — tout est fait en centimes (entiers) pour éviter
// les erreurs d'arrondi des nombres à virgule.

export const TVA_RATES = [20, 10, 5.5, 2.1, 0];

/** Convertit une saisie ("12,50", "12.5", 12.5, "1 234,56 €") en centimes, ou null. */
export function toCents(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;
  const s = String(value).replace(/[\s €]/g, "").replace(",", ".");
  if (s === "" || s === "." || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Centimes → nombre en euros (2 décimales). */
export function toEuros(cents) {
  return cents === null || cents === undefined ? null : cents / 100;
}

/** Centimes → "1 234,56 €" */
export function fmt(cents) {
  if (cents === null || cents === undefined) return "—";
  return (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

/** Centimes → "1234,56" pour un champ de saisie. */
export function toInput(cents) {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** TTC + taux → { ht, tva } (la TVA est déduite par différence pour que HT + TVA = TTC). */
export function fromTTC(ttc, rate) {
  if (ttc === null || rate === null || rate === undefined) return { ht: null, tva: null };
  const ht = Math.round((ttc * 100) / (100 + rate));
  return { ht, tva: ttc - ht };
}

/** HT + taux → { tva, ttc } */
export function fromHT(ht, rate) {
  if (ht === null || rate === null || rate === undefined) return { tva: null, ttc: null };
  const tva = Math.round((ht * rate) / 100);
  return { tva, ttc: ht + tva };
}

/**
 * Taux qui correspond à HT/TVA (tolérance d'1 centime d'arrondi),
 * ou null si plusieurs taux sont mélangés (ex. restaurant 10 % + 20 %).
 */
export function detectRate(ht, tva) {
  if (ht === null || tva === null || ht <= 0) return null;
  for (const r of TVA_RATES) {
    if (Math.abs(Math.round((ht * r) / 100) - tva) <= 1) return r;
  }
  return null;
}

/**
 * Recalcule une dépense quand un champ change.
 * draft : { ttc, ht, tva, rate } en centimes (rate en %, ou null = taux mixte)
 * field : "ttc" | "ht" | "tva" | "rate"
 */
export function recompute(draft, field) {
  const d = { ...draft };
  if (field === "ttc" || field === "rate") {
    if (d.rate !== null && d.ttc !== null) Object.assign(d, fromTTC(d.ttc, d.rate));
    else if (d.ttc !== null && d.tva !== null) d.ht = d.ttc - d.tva;
  } else if (field === "ht") {
    if (d.rate !== null && d.ht !== null) Object.assign(d, fromHT(d.ht, d.rate));
    else if (d.ht !== null && d.ttc !== null) d.tva = d.ttc - d.ht;
  } else if (field === "tva") {
    // On garde le TTC (c'est ce qui a été payé) et on déduit le HT
    if (d.ttc !== null && d.tva !== null) {
      d.ht = d.ttc - d.tva;
      d.rate = detectRate(d.ht, d.tva);
    } else if (d.ht !== null && d.tva !== null) {
      d.ttc = d.ht + d.tva;
      d.rate = detectRate(d.ht, d.tva);
    }
  }
  return d;
}

/** Contrôle de cohérence : HT + TVA doit égaler TTC au centime près. */
export function isConsistent({ ht, tva, ttc }) {
  if (ht === null || tva === null || ttc === null) return false;
  return ht + tva === ttc;
}

/** Totaux d'une liste de dépenses, en centimes. */
export function totals(rows) {
  return rows.reduce(
    (acc, r) => ({ ht: acc.ht + (r.ht ?? 0), tva: acc.tva + (r.tva ?? 0), ttc: acc.ttc + (r.ttc ?? 0) }),
    { ht: 0, tva: 0, ttc: 0 }
  );
}
