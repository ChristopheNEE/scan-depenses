# Scan dépenses

App perso pour ne plus perdre les justificatifs de dépenses pro :
photo du reçu → lecture automatique (fournisseur, date, HT / TVA / TTC, catégorie) → correction à la voix si besoin → tableau du mois → export pour le comptable.

**Adresse de l'app :** https://christophenee.github.io/scan-depenses/

## Fonctionnalités

- 📷 **Scanner** (appareil photo) ou **Galerie** (photo déjà prise) ou **Saisie** manuelle
- Lecture du reçu par Claude : fournisseur, date, catégorie, TTC, HT, TVA, taux
- 🎤 **Dicter / corriger** : « total 48,60, TVA 10 %, déjeuner client » — ce que tu dictes est prioritaire, et l'app signale un écart avec le reçu
- Calculs HT / TVA / TTC en centimes (pas d'erreur d'arrondi), contrôle HT + TVA = TTC, taux « mixte » pour les tickets à plusieurs taux
- Tableau par mois avec totaux HT / TVA / TTC
- **Export CSV** (s'ouvre directement dans Excel) et **Rapport + photos** (HTML autonome, imprimable en PDF)
- Installable sur l'écran d'accueil du téléphone, fonctionne hors ligne (sauf la lecture automatique)

## Données et confidentialité

- Les dépenses et les photos restent **sur le téléphone** (IndexedDB du navigateur). Rien n'est stocké sur un serveur.
- La clé API Claude est saisie dans ⚙ Réglages et reste sur le téléphone. Elle sert uniquement à envoyer la photo du reçu à l'API Claude pour la lire.
- ⚠ Vider les données du site dans Chrome efface les dépenses : exporter chaque mois (CSV + rapport).

## Mise en route

1. Créer une clé API sur https://console.anthropic.com/settings/keys
2. Ouvrir l'app dans Chrome sur Android, ⚙ → coller la clé → Enregistrer
3. Menu Chrome ⋮ → **Ajouter à l'écran d'accueil**

## Développement

```bash
npm install
npm run dev     # serveur local
npm test        # tests des calculs HT / TVA / TTC
npm run build   # version de production dans dist/
```

Chaque push sur `main` publie automatiquement l'app sur GitHub Pages (`.github/workflows/deploy.yml`).

## Structure

- `src/App.jsx` — écrans (liste, saisie, réglages)
- `src/lib/money.js` — calculs HT / TVA / TTC (testés dans `tests/`)
- `src/lib/claude.js` — lecture du reçu et correction vocale via l'API Claude
- `src/lib/draft.js` — conversion réponse Claude ↔ dépense
- `src/lib/db.js` — stockage local (IndexedDB) et réglages
- `src/lib/export.js` — exports CSV et rapport HTML
- `public/` — manifeste, service worker et icônes (installation sur téléphone)
