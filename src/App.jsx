import { useEffect, useMemo, useRef, useState } from "react";
import { listExpenses, saveExpense, deleteExpense, loadSettings, saveSettings, requestPersistence } from "./lib/db.js";
import { compressImage } from "./lib/image.js";
import { readReceipt, applyVoice, CATEGORIES } from "./lib/claude.js";
import { emptyDraft, mergeFields, toFields } from "./lib/draft.js";
import { TVA_RATES, fmt, toCents, toInput, recompute, isConsistent, totals } from "./lib/money.js";
import { exportCSV, exportHTML } from "./lib/export.js";

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const monthLabel = (ym) => (ym === "all" ? "Tout" : `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const MONTH_KEY = "scan-depenses-mois";
function loadMonth() {
  try {
    return localStorage.getItem(MONTH_KEY) || "all";
  } catch {
    return "all";
  }
}
const frDate = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");

const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function App() {
  const [rows, setRows] = useState([]);
  // Par défaut on affiche toutes les dépenses : une facture datée d'un autre mois
  // ne doit jamais sembler « disparue ».
  const [month, setMonthState] = useState(loadMonth);
  const [draft, setDraft] = useState(null); // dépense en cours d'édition
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(""); // message de chargement
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [undo, setUndo] = useState(null); // dernière dépense supprimée, récupérable quelques secondes
  const undoTimer = useRef(null);
  const cameraRef = useRef();
  const galleryRef = useRef();

  function setMonth(m) {
    setMonthState(m);
    try {
      localStorage.setItem(MONTH_KEY, m);
    } catch {
      /* sans importance */
    }
  }

  useEffect(() => {
    listExpenses().then(setRows).catch(() => setError("Impossible de lire les dépenses enregistrées."));
    requestPersistence();
  }, []);

  const months = useMemo(() => {
    const set = new Set(rows.map((r) => (r.date || "").slice(0, 7)).filter(Boolean));
    set.add(currentMonth());
    return [...[...set].sort().reverse(), "all"];
  }, [rows]);

  const visible = useMemo(() => (month === "all" ? rows : rows.filter((r) => (r.date || "").startsWith(month))), [rows, month]);
  const hiddenCount = rows.length - visible.length;
  const sum = totals(visible);
  const exportLabel = month === "all" ? "toutes" : month;

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    try {
      setBusy("Préparation de la photo…");
      const image = await compressImage(file);
      let d = emptyDraft(image);
      setDraft(d);
      setIsNew(true);
      if (settings.apiKey) {
        setBusy("Lecture du reçu…");
        const fields = await readReceipt(settings, image);
        d = mergeFields(d, fields);
        setDraft(d);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function newManual() {
    setError("");
    setDraft(emptyDraft());
    setIsNew(true);
  }

  async function save(finalDraft) {
    if (!finalDraft) return;
    const toSave = { ...finalDraft, updatedAt: Date.now() };
    try {
      await saveExpense(toSave);
      const fresh = await listExpenses();
      if (!fresh.some((r) => r.id === toSave.id)) throw new Error("La dépense n'a pas été retrouvée après l'enregistrement.");
      setRows(fresh);
    } catch (err) {
      setError(`Enregistrement impossible : ${err.message || err}. Vérifie que tu n'es pas en navigation privée.`);
      return;
    }
    if (month !== "all" && toSave.date && !toSave.date.startsWith(month)) setMonth(toSave.date.slice(0, 7));
    setError("");
    setDraft(null);
  }

  async function remove(expense) {
    const label = `${expense.fournisseur || "Sans nom"} — ${fmt(expense.ttc)} du ${frDate(expense.date)}`;
    if (!confirm(`Supprimer cette dépense et sa photo ?\n\n${label}`)) return;
    try {
      await deleteExpense(expense.id);
      setRows(await listExpenses());
    } catch (err) {
      setError(`Suppression impossible : ${err.message || err}`);
      return;
    }
    setDraft(null);
    clearTimeout(undoTimer.current);
    setUndo(expense);
    undoTimer.current = setTimeout(() => setUndo(null), 8000);
  }

  async function restore() {
    if (!undo) return;
    clearTimeout(undoTimer.current);
    await saveExpense(undo);
    setRows(await listExpenses());
    setUndo(null);
  }


  function updateSettings(s) {
    setSettings(s);
    saveSettings(s);
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Scan dépenses</h1>
          <select className="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mois">
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Réglages" title="Réglages">
          ⚙
        </button>
      </header>

      <section className="totals">
        <div>
          <span>HT</span>
          <b>{fmt(sum.ht)}</b>
        </div>
        <div>
          <span>TVA</span>
          <b>{fmt(sum.tva)}</b>
        </div>
        <div className="ttc">
          <span>TTC</span>
          <b>{fmt(sum.ttc)}</b>
        </div>
      </section>

      {!settings.apiKey && (
        <div className="notice">
          Lecture automatique désactivée : <button className="link" onClick={() => setShowSettings(true)}>ajoute ta clé API</button>.
        </div>
      )}
      {error && !draft && <div className="error">{error}</div>}

      {hiddenCount > 0 && (
        <div className="notice">
          {hiddenCount} autre{hiddenCount > 1 ? "s" : ""} dépense{hiddenCount > 1 ? "s" : ""} dans d'autres mois.{" "}
          <button className="link" onClick={() => setMonth("all")}>Tout afficher</button>
        </div>
      )}

      <section className="list">
        {visible.length === 0 && <p className="empty">{month === "all" ? "Aucune dépense enregistrée." : `Aucune dépense en ${monthLabel(month)}.`} Scanne ton premier reçu ↓</p>}
        {visible.map((r) => (
          <div key={r.id} className="row-wrap">
          <button className="row" onClick={() => { setError(""); setDraft(r); setIsNew(false); }}>
            {r.image ? <img src={r.image} alt="" /> : <div className="noimg">—</div>}
            <div className="row-main">
              <div className="row-top">
                <b>{r.fournisseur || "Sans nom"}</b>
                <b className="amount">{fmt(r.ttc)}</b>
              </div>
              <div className="row-sub">
                <span>{frDate(r.date)} · {r.categorie}</span>
                <span>TVA {fmt(r.tva)}</span>
              </div>
              {!isConsistent(r) && <div className="warn-small">⚠ montants à vérifier</div>}
            </div>
          </button>
          <button className="trash" onClick={() => remove(r)} aria-label={`Supprimer ${r.fournisseur || "la dépense"}`} title="Supprimer">🗑</button>
          </div>
        ))}
      </section>

      {visible.length > 0 && (
        <section className="exports">
          <button className="btn ghost" onClick={() => exportCSV(visible, exportLabel)}>Export CSV</button>
          <button className="btn ghost" onClick={() => exportHTML(visible, exportLabel)}>Rapport + photos</button>
        </section>
      )}

      <footer className="actions">
        <button className="btn ghost" onClick={newManual} disabled={!!busy}>Saisie</button>
        <button className="btn ghost" onClick={() => galleryRef.current?.click()} disabled={!!busy}>Galerie</button>
        <button className="btn primary" onClick={() => cameraRef.current?.click()} disabled={!!busy}>📷 Scanner</button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
        <input ref={galleryRef} type="file" accept="image/*" hidden onChange={handleFile} />
      </footer>

      {draft && (
        <Editor
          draft={draft}
          setDraft={setDraft}
          isNew={isNew}
          busy={busy}
          setBusy={setBusy}
          error={error}
          setError={setError}
          settings={settings}
          onSave={save}
          onCancel={() => { setDraft(null); setError(""); }}
          onDelete={() => remove(draft)}
          onZoom={() => setLightbox(draft.image)}
        />
      )}

      {showSettings && <Settings count={rows.length} settings={settings} onSave={updateSettings} onClose={() => setShowSettings(false)} />}

      {undo && (
        <div className="toast">
          <span>Dépense supprimée</span>
          <button className="link" onClick={restore}>Annuler</button>
        </div>
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="Reçu" />
        </div>
      )}
    </div>
  );
}

function Editor({ draft, setDraft, isNew, busy, setBusy, error, setError, settings, onSave, onCancel, onDelete, onZoom }) {
  // Les montants sont édités en texte puis convertis en centimes à la sortie du champ.
  const [inputs, setInputs] = useState({ ttc: toInput(draft.ttc), ht: toInput(draft.ht), tva: toInput(draft.tva) });
  const dirty = useRef(new Set()); // montants tapés mais pas encore validés
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef(null);

  useEffect(() => {
    setInputs({ ttc: toInput(draft.ttc), ht: toInput(draft.ht), tva: toInput(draft.tva) });
  }, [draft.ttc, draft.ht, draft.tva]);

  const set = (field, value) => setDraft((d) => ({ ...d, [field]: value }));

  function typeAmount(field, value) {
    dirty.current.add(field);
    setInputs((i) => ({ ...i, [field]: value }));
  }

  function commitAmount(field) {
    if (!dirty.current.has(field)) return;
    dirty.current.delete(field);
    const cents = toCents(inputs[field]);
    setDraft((d) => recompute({ ...d, [field]: cents }, field));
  }

  function changeRate(value) {
    const rate = value === "mixte" ? null : Number(value);
    setDraft((d) => recompute({ ...d, rate }, "rate"));
  }

  function startVoice() {
    if (!SpeechRecognition) {
      setError("La dictée n'est pas disponible sur ce navigateur (utilise Chrome).");
      return;
    }
    setError("");
    const rec = new SpeechRecognition();
    rec.lang = "fr-FR";
    rec.interimResults = true;
    rec.continuous = true;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      setTranscript((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setError("Micro refusé : autorise le micro pour ce site dans Chrome.");
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      const text = finalText.trim();
      if (text) sendVoice(text);
    };
    recRef.current = rec;
    setTranscript("");
    setListening(true);
    rec.start();
  }

  function stopVoice() {
    recRef.current?.stop();
  }

  async function sendVoice(text) {
    if (!settings.apiKey) {
      setError("La correction vocale utilise la lecture automatique : ajoute ta clé API dans les réglages.");
      return;
    }
    try {
      setBusy("J'applique ta correction…");
      const fields = await applyVoice(settings, text, toFields(draft), draft.image);
      setDraft((d) => mergeFields(d, fields));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  // Prend en compte un montant tapé mais pas encore validé (champ encore actif)
  function handleSave() {
    let d = draft;
    for (const field of dirty.current) d = recompute({ ...d, [field]: toCents(inputs[field]) }, field);
    dirty.current.clear();
    if (d.ttc === null) {
      setError("Indique au moins le montant TTC.");
      return;
    }
    onSave(d);
  }

  const ok = isConsistent(draft);

  return (
    <div className="sheet-backdrop">
      <div className="sheet">
        <div className="sheet-head">
          <h2>{isNew ? "Nouvelle dépense" : "Modifier"}</h2>
          <button className="icon-btn" onClick={onCancel} aria-label="Fermer">✕</button>
        </div>

        {draft.image && <img className="preview" src={draft.image} alt="Reçu" onClick={onZoom} />}

        {busy && <div className="busy"><span className="spinner" /> {busy}</div>}
        {error && <div className="error">{error}</div>}

        <div className="voice">
          {!listening ? (
            <button className="btn voice-btn" onClick={startVoice} disabled={!!busy}>🎤 Dicter / corriger</button>
          ) : (
            <button className="btn voice-btn on" onClick={stopVoice}>■ Terminer la dictée</button>
          )}
          {transcript && <p className="transcript">« {transcript} »</p>}
          {!transcript && !listening && <p className="hint">Ex. : « total 48,60, TVA 10 %, déjeuner client chez Paul »</p>}
        </div>

        {draft.remarque && <div className="notice">ℹ {draft.remarque}</div>}

        <div className="grid">
          <label>
            Date
            <input type="date" value={draft.date || ""} onChange={(e) => set("date", e.target.value)} />
          </label>
          <label>
            Catégorie
            <select value={draft.categorie} onChange={(e) => set("categorie", e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="full">
            Fournisseur
            <input value={draft.fournisseur} onChange={(e) => set("fournisseur", e.target.value)} placeholder="Ex. SNCF, Boulangerie Paul…" />
          </label>
          <label className="full">
            Libellé
            <input value={draft.libelle} onChange={(e) => set("libelle", e.target.value)} placeholder="Ex. Aller-retour Lyon" />
          </label>
          <label className="full strong">
            Montant TTC (payé)
            <input inputMode="decimal" value={inputs.ttc} onChange={(e) => typeAmount("ttc", e.target.value)} onBlur={() => commitAmount("ttc")} placeholder="0,00" />
          </label>
          <label>
            Taux TVA
            <select value={draft.rate === null ? "mixte" : String(draft.rate)} onChange={(e) => changeRate(e.target.value)}>
              {TVA_RATES.map((r) => <option key={r} value={String(r)}>{String(r).replace(".", ",")} %</option>)}
              <option value="mixte">Mixte</option>
            </select>
          </label>
          <label>
            TVA
            <input inputMode="decimal" value={inputs.tva} onChange={(e) => typeAmount("tva", e.target.value)} onBlur={() => commitAmount("tva")} placeholder="0,00" />
          </label>
          <label className="full">
            Montant HT
            <input inputMode="decimal" value={inputs.ht} onChange={(e) => typeAmount("ht", e.target.value)} onBlur={() => commitAmount("ht")} placeholder="0,00" />
          </label>
        </div>

        {draft.ttc !== null && !ok && (
          <div className="warn">⚠ HT + TVA ≠ TTC ({fmt(draft.ht)} + {fmt(draft.tva)} ≠ {fmt(draft.ttc)}). Vérifie les montants.</div>
        )}

        <div className="sheet-actions">
          {!isNew && <button className="btn danger" onClick={onDelete}>Supprimer</button>}
          <button className="btn primary grow" onClick={handleSave} disabled={!!busy}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

function Settings({ count, settings, onSave, onClose }) {
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [model, setModel] = useState(settings.model);
  const [persisted, setPersisted] = useState(null);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  }, []);
  return (
    <div className="sheet-backdrop">
      <div className="sheet">
        <div className="sheet-head">
          <h2>Réglages</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <label className="full">
          Clé API Claude
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value.trim())} placeholder="sk-ant-…" autoComplete="off" />
        </label>
        <p className="hint">
          À créer sur <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
          Elle reste enregistrée sur ce téléphone uniquement et sert seulement à lire tes reçus.
        </p>
        <label className="full">
          Modèle
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="claude-sonnet-5-5">Sonnet 5.5 — plus précis (recommandé)</option>
            <option value="claude-haiku-5-5">Haiku 5.5 — plus rapide et moins cher</option>
          </select>
        </label>
        <p className="hint">
          {count} dépense{count > 1 ? "s" : ""} enregistrée{count > 1 ? "s" : ""} sur cet appareil
          {persisted === true && " · stockage protégé"}
          {persisted === false && " · stockage non protégé : pense à exporter chaque mois"}.
        </p>
        <div className="sheet-actions">
          <button className="btn primary grow" onClick={() => { onSave({ ...settings, apiKey, model }); onClose(); }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
