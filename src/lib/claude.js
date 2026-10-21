// Appels à l'API Claude directement depuis le navigateur, avec la clé saisie
// dans les réglages (stockée sur ce téléphone uniquement).

import { base64FromDataUrl } from "./image.js";

export const CATEGORIES = ["Repas", "Transport", "Carburant", "Hébergement", "Matériel", "Fournitures", "Télécom", "Logiciels", "Formation", "Autre"];

const API_URL = "https://api.anthropic.com/v1/messages";

const FIELDS_SPEC = `{
  "date": "AAAA-MM-JJ ou null",
  "fournisseur": "nom du commerce / fournisseur, court",
  "libelle": "description courte de l'achat",
  "categorie": "une valeur parmi : ${CATEGORIES.join(", ")}",
  "ttc": nombre en euros ou null,
  "ht": nombre en euros ou null,
  "tva": nombre en euros (montant total de TVA) ou null,
  "taux": taux de TVA en % (20, 10, 5.5, 2.1 ou 0) ou null si plusieurs taux,
  "remarque": "écart ou doute éventuel, sinon chaîne vide"
}`;

async function call(apiKey, model, content, maxTokens = 800) {
  if (!apiKey) throw new Error("Ajoute ta clé API dans les réglages (roue dentée) pour activer la lecture automatique.");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
  });
  if (!res.ok) {
    let msg = `Erreur API (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error?.message) msg += ` : ${j.error.message}`;
    } catch {
      /* pas de détail */
    }
    if (res.status === 401) msg = "Clé API refusée. Vérifie-la dans les réglages.";
    throw new Error(msg);
  }
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseJson(text);
}

function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Réponse illisible, réessaie.");
  return JSON.parse(text.slice(start, end + 1));
}

/** Lit un reçu (photo) et renvoie les champs extraits. */
export function readReceipt({ apiKey, model }, dataUrl) {
  return call(apiKey, model, [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64FromDataUrl(dataUrl) } },
    {
      type: "text",
      text: `Tu lis un justificatif de dépense professionnelle français (ticket de caisse, facture, note de restaurant, reçu CB).
Extrais les informations et réponds UNIQUEMENT avec un objet JSON de cette forme :
${FIELDS_SPEC}
Règles :
- Le TTC est le montant réellement payé.
- Si le ticket détaille la TVA, recopie le montant exact de TVA et le HT du ticket, sans recalculer.
- S'il y a plusieurs taux de TVA, additionne les montants de TVA et mets "taux": null.
- Si le HT ou la TVA ne figurent pas, mets null (ne les invente pas).
- Si un montant est illisible, mets null et explique dans "remarque".`,
    },
  ]);
}

/**
 * Applique une correction dictée à la voix sur la dépense en cours.
 * Ex. : "le total c'est 48,60, TVA 4,42, c'est un repas client chez Paul"
 */
export function applyVoice({ apiKey, model }, transcript, current, dataUrl) {
  const content = [];
  if (dataUrl) {
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64FromDataUrl(dataUrl) } });
  }
  content.push({
    type: "text",
    text: `Voici une dépense en cours de saisie (JSON) :
${JSON.stringify(current)}

L'utilisateur vient de dicter : « ${transcript} »

Mets à jour la dépense avec ce qu'il a dit. Ce qu'il dicte est prioritaire sur ce qui a été lu sur le reçu.
${dataUrl ? "Le reçu est joint : si ce qu'il dicte ne correspond pas au reçu, garde sa version mais signale l'écart dans \"remarque\"." : ""}
Les nombres dictés en français ("quarante-huit soixante" = 48,60 ; "4 euros 42" = 4,42) doivent être convertis.
Ne change que les champs qu'il mentionne ; laisse les autres tels quels.
Si il donne un TTC et un taux sans HT/TVA, mets "ht" et "tva" à null (l'app les calcule).
Réponds UNIQUEMENT avec l'objet JSON complet de cette forme :
${FIELDS_SPEC}`,
  });
  return call(apiKey, model, content);
}
