// Module instantanés — sauvegarde automatique, silencieuse et locale (IndexedDB).
// Objectif : ne plus rien demander à l'utilisateur, et pouvoir revenir en arrière après
// une fausse manœuvre (dossier supprimé, restauration écrasante, stockage corrompu).
// LIMITE ASSUMÉE : un instantané vit dans le navigateur de cet appareil. Il ne protège pas
// d'une perte du téléphone, d'une réinitialisation ni d'un « vider les données du site ».
export const SNAP_DB = 'estimo-snap';
export const SNAP_STORE = 'snapshots';
export const SNAP_MAX = 8;          // nombre d'instantanés conservés
export const SNAP_WITH_MEDIAS = 2;  // seuls les plus récents gardent les photos
export const SNAP_NOTE = 'Instantanés automatiques conservés sur cet appareil, sans action de votre part.';

export function snapSupported() {
  try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (e) { return false; }
}

// Rétention : trie du plus récent au plus ancien et ne garde que les max premiers.
export function keepLastN(items, max) {
  return items.slice().sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, max);
}

// Retire les photos d'un dossier pour alléger les instantanés anciens (localStorage les garde).
export function stripMedias(d) {
  const medias = Array.isArray(d.medias) ? d.medias : [];
  return { ...d, medias: [], _mediasStripped: true, _mediasCount: medias.length };
}

// Remet un dossier restauré dans un état propre (les marqueurs internes ne doivent pas traîner).
export function cleanDossier(d) {
  if (!d || !d._mediasStripped) return d;
  const c = { ...d, medias: Array.isArray(d.medias) ? d.medias : [] };
  delete c._mediasStripped; delete c._mediasCount;
  return c;
}

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(SNAP_DB, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(SNAP_STORE)) db.createObjectStore(SNAP_STORE, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error || new Error('IndexedDB indisponible'));
  });
}
function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

async function getAll(db) { return req(db.transaction(SNAP_STORE, 'readonly').objectStore(SNAP_STORE).getAll()); }
async function putOne(db, rec) { return req(db.transaction(SNAP_STORE, 'readwrite').objectStore(SNAP_STORE).put(rec)); }
async function delOne(db, id) { return req(db.transaction(SNAP_STORE, 'readwrite').objectStore(SNAP_STORE).delete(id)); }
async function getOne(db, id) { return req(db.transaction(SNAP_STORE, 'readonly').objectStore(SNAP_STORE).get(id)); }

// Enregistre un instantané de la liste complète. Silencieux : aucune interaction, aucun fichier.
// Renvoie le résumé écrit, ou null si IndexedDB n'est pas disponible.
export async function putSnapshot(list) {
  if (!snapSupported() || !Array.isArray(list)) return null;
  const db = await openDB();
  const at = Date.now();
  const rec = {
    id: 's' + at.toString(36) + Math.random().toString(36).slice(2, 6),
    at, nb: list.length,
    photos: list.reduce((s, d) => s + ((d.medias && d.medias.length) || 0), 0),
    dossiers: list,
  };
  await putOne(db, rec);
  // Rétention : on ne garde que SNAP_MAX instantanés, photos seulement sur les plus récents.
  const all = keepLastN(await getAll(db), SNAP_MAX);
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (i >= SNAP_WITH_MEDIAS && !s._stripped) {
      const light = { ...s, dossiers: (s.dossiers || []).map(stripMedias), _stripped: true };
      await putOne(db, light);
    }
  }
  const total = await getAll(db);
  const gardes = new Set(all.map((s) => s.id));
  for (const s of total) if (!gardes.has(s.id)) await delOne(db, s.id);
  return { id: rec.id, at, nb: rec.nb, photos: rec.photos, size: estSize(rec) };
}

export async function listSnapshots() {
  if (!snapSupported()) return [];
  const db = await openDB();
  return keepLastN(await getAll(db), SNAP_MAX).map((s) => ({
    id: s.id, at: s.at, nb: s.nb || (s.dossiers || []).length,
    photos: s.photos || 0, stripped: !!s._stripped, size: estSize(s),
  }));
}

export async function getSnapshot(id) {
  if (!snapSupported()) return null;
  const db = await openDB();
  const s = await getOne(db, id);
  return s ? { at: s.at, dossiers: (s.dossiers || []).map(cleanDossier) } : null;
}

export async function clearSnapshots() {
  if (!snapSupported()) return;
  const db = await openDB();
  for (const s of await getAll(db)) await delOne(db, s.id);
}

export function estSize(o) { try { return new Blob([JSON.stringify(o)]).size; } catch (e) { return 0; } }

// Stockage : demande au navigateur de ne pas purger les données de l'application.
export async function persistState() {
  try {
    if (!navigator.storage || !navigator.storage.persisted) return { supported: false, persisted: false };
    return { supported: true, persisted: await navigator.storage.persisted() };
  } catch (e) { return { supported: false, persisted: false }; }
}
export async function requestPersist() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return { supported: false, persisted: false };
    return { supported: true, persisted: await navigator.storage.persist() };
  } catch (e) { return { supported: false, persisted: false }; }
}
export async function storageEstimate() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage || 0, quota: e.quota || 0 };
  } catch (e) { return null; }
}
