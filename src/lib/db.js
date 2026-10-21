// Stockage local sur le téléphone (IndexedDB) : les dépenses et leurs photos.
// Rien ne part sur un serveur.

const DB_NAME = "scan-depenses";
const DB_VERSION = 1;
const STORE = "expenses";

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("date", "date");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const result = fn(store);
        t.oncomplete = () => resolve(result?.result ?? result);
        t.onerror = () => reject(t.error);
      })
  );
}

export async function listExpenses() {
  const rows = await tx("readonly", (s) => s.getAll());
  return (rows || []).sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.createdAt - a.createdAt);
}

export function saveExpense(expense) {
  return tx("readwrite", (s) => s.put(expense));
}

export function deleteExpense(id) {
  return tx("readwrite", (s) => s.delete(id));
}

// Réglages (clé API, modèle) : localStorage, sur cet appareil uniquement.
const SETTINGS_KEY = "scan-depenses-settings";

export function loadSettings() {
  try {
    return { apiKey: "", model: "claude-sonnet-5-5", ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { apiKey: "", model: "claude-sonnet-5-5" };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* stockage indisponible : on garde en mémoire seulement */
  }
}

/** Demande au navigateur de ne pas effacer les données en cas de manque de place. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    /* sans importance */
  }
}
