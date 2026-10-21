// Exports pour le comptable : CSV (Excel FR) et rapport HTML avec les photos.

import { fmt, totals } from "./money.js";

function centsCsv(c) {
  return c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(".", ",");
}

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function frDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV séparé par des « ; » avec BOM : s'ouvre directement dans Excel français. */
export function exportCSV(rows, label) {
  const head = ["Date", "Fournisseur", "Libellé", "Catégorie", "HT", "Taux TVA", "TVA", "TTC", "Remarque"];
  const lines = rows.map((r) =>
    [frDate(r.date), r.fournisseur, r.libelle, r.categorie, centsCsv(r.ht), r.rate === null ? "mixte" : `${String(r.rate).replace(".", ",")} %`, centsCsv(r.tva), centsCsv(r.ttc), r.remarque]
      .map(csvCell)
      .join(";")
  );
  const t = totals(rows);
  lines.push(["TOTAL", "", "", "", centsCsv(t.ht), "", centsCsv(t.tva), centsCsv(t.ttc), ""].join(";"));
  download(`depenses-${label}.csv`, "﻿" + [head.join(";"), ...lines].join("\r\n"), "text/csv;charset=utf-8");
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/** Rapport HTML autonome (tableau + toutes les photos), à envoyer ou imprimer en PDF. */
export function exportHTML(rows, label) {
  const t = totals(rows);
  const body = rows
    .map(
      (r, i) => `<tr><td>${i + 1}</td><td>${frDate(r.date)}</td><td>${esc(r.fournisseur)}<br><small>${esc(r.libelle)}</small></td><td>${esc(r.categorie)}</td><td class="n">${fmt(r.ht)}</td><td class="n">${r.rate === null ? "mixte" : esc(r.rate) + " %"}</td><td class="n">${fmt(r.tva)}</td><td class="n"><b>${fmt(r.ttc)}</b></td></tr>`
    )
    .join("");
  const photos = rows
    .filter((r) => r.image)
    .map((r) => `<figure><img src="${r.image}" alt=""><figcaption>${rows.indexOf(r) + 1}. ${frDate(r.date)} — ${esc(r.fournisseur)} — ${fmt(r.ttc)}</figcaption></figure>`)
    .join("");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dépenses ${esc(label)}</title><style>
body{font-family:system-ui,sans-serif;color:#1b1b1b;max-width:960px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}p{color:#666;margin:0 0 20px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid #ddd;padding:6px;text-align:left;vertical-align:top}
th{background:#f3f3f3}.n{text-align:right;white-space:nowrap}tfoot td{font-weight:700;border-top:2px solid #333}
small{color:#777}figure{break-inside:avoid;margin:24px 0}img{max-width:100%;max-height:900px;border:1px solid #ddd}
figcaption{font-size:13px;color:#444;margin-top:4px}@media print{h2{break-before:page}}
</style></head><body>
<h1>Justificatifs de dépenses — ${esc(label)}</h1><p>${rows.length} dépense(s) · généré le ${new Date().toLocaleDateString("fr-FR")}</p>
<table><thead><tr><th>#</th><th>Date</th><th>Fournisseur</th><th>Catégorie</th><th class="n">HT</th><th class="n">Taux</th><th class="n">TVA</th><th class="n">TTC</th></tr></thead>
<tbody>${body}</tbody><tfoot><tr><td colspan="4">Total</td><td class="n">${fmt(t.ht)}</td><td></td><td class="n">${fmt(t.tva)}</td><td class="n">${fmt(t.ttc)}</td></tr></tfoot></table>
<h2>Justificatifs</h2>${photos || "<p>Aucune photo.</p>"}
</body></html>`;
  download(`justificatifs-${label}.html`, html, "text/html;charset=utf-8");
}
