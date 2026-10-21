// Passage entre les champs renvoyés par Claude et une dépense de l'app.

import { CATEGORIES } from "./claude.js";
import { toCents, toEuros, detectRate, fromTTC } from "./money.js";

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function emptyDraft(image = null) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2),
    date: today(),
    fournisseur: "",
    libelle: "",
    categorie: "Autre",
    ttc: null,
    ht: null,
    tva: null,
    rate: 20,
    remarque: "",
    image,
    createdAt: Date.now(),
  };
}

/** Champs Claude ({ttc, ht, tva, taux…} en euros) → dépense (centimes), en complétant ce qui manque. */
export function mergeFields(draft, f) {
  const d = { ...draft };
  if (f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) d.date = f.date;
  if (f.fournisseur) d.fournisseur = String(f.fournisseur);
  if (f.libelle !== undefined && f.libelle !== null) d.libelle = String(f.libelle);
  if (f.categorie && CATEGORIES.includes(f.categorie)) d.categorie = f.categorie;
  d.remarque = f.remarque ? String(f.remarque) : "";

  const ttc = toCents(f.ttc);
  let ht = toCents(f.ht);
  let tva = toCents(f.tva);
  const rate = f.taux === null || f.taux === undefined || f.taux === "" ? undefined : Number(f.taux);

  d.ttc = ttc;
  d.ht = ht;
  d.tva = tva;

  // Compléter les montants manquants
  if (d.ttc !== null && d.ht !== null && d.tva === null) d.tva = d.ttc - d.ht;
  else if (d.ttc !== null && d.tva !== null && d.ht === null) d.ht = d.ttc - d.tva;
  else if (d.ttc === null && d.ht !== null && d.tva !== null) d.ttc = d.ht + d.tva;

  if (d.ht !== null && d.tva !== null) {
    d.rate = detectRate(d.ht, d.tva);
  } else if (d.ttc !== null) {
    d.rate = rate !== undefined && Number.isFinite(rate) ? rate : draft.rate ?? 20;
    Object.assign(d, fromTTC(d.ttc, d.rate));
  } else if (rate !== undefined) {
    d.rate = rate;
  }
  return d;
}

/** Dépense → format envoyé à Claude pour une correction vocale. */
export function toFields(d) {
  return {
    date: d.date,
    fournisseur: d.fournisseur,
    libelle: d.libelle,
    categorie: d.categorie,
    ttc: toEuros(d.ttc),
    ht: toEuros(d.ht),
    tva: toEuros(d.tva),
    taux: d.rate,
    remarque: d.remarque,
  };
}
