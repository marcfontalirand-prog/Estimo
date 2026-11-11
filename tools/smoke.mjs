// Contrôle de rendu hors navigateur : compile le JSX d'index.html et exécute réellement les
// composants (Home, Parametres, AjustPanel) avec un React factice. Attrape les erreurs de
// référence et les plantages de rendu sans ouvrir de navigateur.
// Usage : BABEL_PATH=/chemin/babel.min.js node tools/smoke.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const babelPath = process.env.BABEL_PATH || '/tmp/babel.min.js';
if (!fs.existsSync(babelPath)) {
  console.log('IGNORÉ : Babel introuvable (' + babelPath + '). Renseignez BABEL_PATH.');
  process.exit(0);
}
const { createRequire } = await import('node:module');
const Babel = createRequire(import.meta.url)(babelPath);

const html = fs.readFileSync(root + 'index.html', 'utf8');
const m = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
if (!m) throw new Error('script text/babel introuvable dans index.html');
const jsx = m[1];
const compiled = Babel.transform(jsx, { presets: ['react'] }).code;
// Le moteur (dvf, loyers, ajustement, instantanés) est injecté dans un <script> classique séparé.
let moteur = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((x) => x[1]).filter((c) => c.includes('function computeAjust')).join('\n');
if (!moteur) throw new Error('moteur injecté introuvable dans index.html');
// Le moteur est exécuté dans sa propre portée : on en expose les fonctions à l'app.
moteur += ';globalThis.__M={computeAjust,ajustCtx,RULES,CAP_TOTAL,CAP_COEF,CAP_MANUEL,putSnapshot,listSnapshots,getSnapshot,requestPersist,SNAP_MAX,profilVide,PROFIL_GROUPES,PROFIL_CHAMPS,PROFIL_CLES,completude,resumeProfil,profilAgence,nettoyerProfil,deverser,envelopper};Object.assign(globalThis,globalThis.__M);';

// ---- React factice ----
let elCount = 0;
const createElement = (type, props, ...children) => ({ __el: ++elCount, type, props: props || {}, children: children.flat() });
const React = {
  createElement, Fragment: '__Fragment__',
  Component: class { constructor(p) { this.props = p; this.state = {}; } setState(s) { this.state = { ...this.state, ...s }; } },
  createRef: () => ({ current: null }),
};
const noop = () => {};
const hooks = {
  useState: (init) => [typeof init === 'function' ? init() : init, noop],
  useReducer: (r, init) => [init, noop],
  useMemo: (f) => f(),
  useCallback: (f) => f(),
  useRef: (v) => ({ current: v === undefined ? null : v }),
  useEffect: noop, useLayoutEffect: noop,
};
Object.assign(React, hooks);

const store = new Map();
const stubs = {
  React,
  ReactDOM: { createRoot: () => ({ render: () => { } }) },
  document: {
    baseURI: 'http://localhost/',
    getElementById: () => ({ remove: () => { }, content: '' }),
    querySelector: () => ({ content: '' }),
    createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop, click: noop, remove: noop, querySelector: () => ({ onclick: null }) }),
    body: { appendChild: noop },
    documentElement: { classList: { toggle: noop } },
    addEventListener: noop, removeEventListener: noop,
  },
  navigator: {},
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  location: { hash: '', reload: noop },
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  Blob, URL, addEventListener: noop, removeEventListener: noop, setInterval: noop, clearInterval: noop, console,
};

// L app appelle window.addEventListener au chargement (afterprint) : window est globalThis ici.
globalThis.addEventListener = noop; globalThis.removeEventListener = noop; globalThis.matchMedia = stubs.matchMedia; globalThis.scrollTo = noop;
const names = ['Home', 'Parametres', 'ProfilPanel', 'AjustPanel', 'Editor', 'App', 'blank', 'computeAjust', 'fiche', 'profilVide', 'PROFIL_CHAMPS', 'completude', 'loadProfil', 'saveProfil', 'agenceDoc'];
new Function('window', 'document', 'Blob', 'URL', moteur)(globalThis, stubs.document, Blob, URL);
const src = compiled + '\n;globalThis.__E={' + names.join(',') + '};';
stubs.window = globalThis;
new Function(...Object.keys(stubs), src)(...Object.values(stubs));
const E = globalThis.__E;

// ---- Mini moteur de rendu ----
function text(el, out = []) {
  if (el == null || el === false || el === true) return out;
  if (Array.isArray(el)) { el.forEach((x) => text(x, out)); return out; }
  if (typeof el === 'string' || typeof el === 'number') { out.push(String(el)); return out; }
  if (typeof el.type === 'function') {
    const kids = el.children.length ? (el.children.length === 1 ? el.children[0] : el.children) : el.props.children;
    return text(el.type({ ...el.props, children: kids }), out);
  }
  if (el.props && el.props.children !== undefined) text(el.props.children, out);
  el.children.forEach((c) => text(c, out));
  return out;
}
const render = (el) => text(el).join(' ').replace(/\s+/g, ' ').trim();
const has = (el, ...needles) => { const t = render(el); for (const n of needles) if (!t.includes(n)) throw new Error('texte absent : « ' + n + ' » dans :\n' + t.slice(0, 600)); return t; };

let ok = 0; const fails = [];
const check = (name, fn) => { try { fn(); ok++; console.log('ok  ' + name); } catch (e) { fails.push(name); console.log('FAIL ' + name + ' → ' + e.message); } };

const DVFILE = { type: 'appartement', n: 24, median: 4200, q1: 3800, q3: 4700, radius: 300, since: '2023-11-10', lastSale: '2025-12-31', source: 'DVF Etalab', fallback: false, comps: [] };
const mkDos = (o = {}) => ({ ...E.blank(), client: { ...E.blank().client, type: 'Appartement', nom: 'Dupont', adresse: '12 bd Sadi Carnot' }, bien: { ...E.blank().bien, carrez: '65', etage: '4', terrasse: '12', vue: 'Mer' }, technique: { ...E.blank().technique, dpe: 'G' }, ...o });

check('Home vide : un seul bouton de création, aucun téléchargement', () => {
  has(E.Home({ list: [], open: noop, create: noop, del: noop, parametres: noop, snap: null }),
    'Nouvelle estimation', 'Sauvegarde automatique', 'Aucun dossier', '⚙️');
  const t = render(E.Home({ list: [], open: noop, create: noop, del: noop, parametres: noop, snap: null }));
  for (const interdit of ['🌙', '☀️', 'Mode sombre']) if (t.includes(interdit)) throw new Error('raccourci de thème encore sur l accueil : ' + interdit);
  for (const interdit of ['Sauvegarder', 'Restaurer', 'télécharger']) if (t.includes(interdit)) throw new Error('élément retiré encore présent : ' + interdit);
  if (t.includes('Invalid Date')) throw new Error('date DVF non résolue : EstimoDVF.DATA_CUTOFF est-il exposé ?');
  if (!t.includes('31/12/2025')) throw new Error('date d’arrêt des ventes absente de l’accueil');
});

check('Home avec dossier et instantané : date de dernière copie', () => {
  const t = render(E.Home({ list: [mkDos()], open: noop, create: noop, del: noop, parametres: noop, snap: { at: Date.now() } }));
  if (!/dernière copie \d{2}\/\d{2} \d{2}:\d{2}/.test(t)) throw new Error('date de copie absente : ' + t.slice(0, 300));
});

check('AjustPanel sans DVF : invite à lancer le comparatif', () => {
  has(E.AjustPanel({ d: mkDos(), update: noop }), 'Lancez d’abord le comparatif DVF');
});

check('AjustPanel avec DVF : valeur, fourchette et coefficients', () => {
  has(E.AjustPanel({ d: mkDos({ dvf: DVFILE }), update: noop }),
    'Valeur estimée', 'Vue', 'Étage élevé', 'DPE', 'Fourchette', 'Modifier les coefficients', 'plafonnée à ±8');
});

check('AjustPanel : plafond global annoncé quand il mord', () => {
  const d = mkDos({ dvf: DVFILE, bien: { ...E.blank().bien, carrez: '65', etage: '0', visavis: 'Proche', bruit: 'Bruyant' }, technique: { ...E.blank().technique, dpe: 'G', fissures: true, humidite: true, toiture: true } });
  has(E.AjustPanel({ d, update: noop }), '-20,0 %');
});

check('Parametres : quatre sections, sauvegarde automatique dans Donnees', () => {
  has(E.Parametres({ list: [], back: noop, restore: noop, backup: noop, snaps: [], persisted: false, restoreSnap: noop, theme: 'auto', setTheme: noop, sec: 'donnees' }),
    'Profil', 'Donn\u00e9es', 'Affichage', 'Application', 'Sauvegarde automatique', 'Aucune action de votre part', 'Stockage non prot\u00e9g\u00e9', 'Restaurer depuis un fichier');
});

check('Parametres > Profil : saisie vide, avancement et champs obligatoires', () => {
  const t = has(E.Parametres({ list: [], back: noop, restore: noop, backup: noop, snaps: [], persisted: true, restoreSnap: noop, theme: 'auto', setTheme: noop, profil: E.profilVide(), setProfil: noop, sec: 'profil' }),
    'Identit\u00e9 sur le document', 'Nom de l\u2019agence', 'Nom du conseiller', 'Mentions l\u00e9gales',
    'M\u00e9diateur de la consommation', 'Vider les champs');
  if (!/\d+ \/ \d+ champs obligatoires/.test(t)) throw new Error('avancement absent : ' + t.slice(0, 400));
  if (t.includes('Tous les champs obligatoires sont remplis')) throw new Error('profil vide annonc\u00e9 complet');
});

check('Profil : enregistré sur l appareil, relu net, et traduit pour le document', () => {
  E.saveProfil({ nom: 'Laforêt Le Cannet  ', agent: 'Marc Fontalirand', mediateur: '', pirate: 'x' });
  const p = E.loadProfil();
  if (p.nom !== 'Laforêt Le Cannet') throw new Error('nom non relu : ' + JSON.stringify(p));
  if ('pirate' in p) throw new Error('champ inconnu conservé');
  const a = E.agenceDoc();
  if (a.nom !== 'Laforêt Le Cannet' || a.agent !== 'Marc Fontalirand') throw new Error('bloc agence faux : ' + JSON.stringify(a));
  if (a.mediateur !== null) throw new Error('un champ vide doit sortir en null, pas en chaîne');
  E.saveProfil(E.profilVide());
});

check('Parametres > Profil : profil complet annonc\u00e9 complet, valeurs affich\u00e9es', () => {
  const plein = E.profilVide();
  for (const f of E.PROFIL_CHAMPS) if (f.req) plein[f.k] = 'x';
  plein.agent = 'Marc Fontalirand'; plein.nom = 'Lafor\u00eat Le Cannet';
  has(E.Parametres({ list: [], back: noop, restore: noop, backup: noop, snaps: [], persisted: true, restoreSnap: noop, theme: 'auto', setTheme: noop, profil: plein, setProfil: noop, sec: 'profil' }),
    'Tous les champs obligatoires sont remplis', 'Marc Fontalirand \u00b7 Lafor\u00eat Le Cannet');
});

check('Parametres : copies list\u00e9es, stockage prot\u00e9g\u00e9', () => {
  has(E.Parametres({ list: [mkDos()], back: noop, restore: noop, backup: noop, snaps: [{ id: 's1', at: Date.now(), nb: 1, stripped: false }], persisted: true, restoreSnap: noop }),
    'Stockage prot\u00e9g\u00e9', 'Revenir \u00e0 une copie', 'Exporter les 1 dossier(s)');
});

check('Parametres > Affichage : la mire d impression et le theme', () => {
  has(E.Parametres({ list: [], back: noop, restore: noop, backup: noop, snaps: [], persisted: true, restoreSnap: noop, sec: 'affichage' }),
    'Th\u00e8me', 'Clair', 'Sombre', 'Auto', 'Diagnostic d\u2019impression', 'Imprimer la mire', 'Blanche et color\u00e9e');
});

check('Parametres > Application : version et source des donn\u00e9es', () => {
  has(E.Parametres({ list: [], back: noop, restore: noop, backup: noop, snaps: [], persisted: true, restoreSnap: noop, sec: 'application' }),
    'Version', '2.6.', '31/12/2025', '\u00c0 propos');
});

check('Editor : l’onglet Financier affiche l’écart sur l’estimation ajustée', () => {
  const d = mkDos({ dvf: DVFILE, financier: { ...E.blank().financier, prixAttendu: '300000' } });
  has(E.Editor({ d, update: noop, back: noop }), 'Estimation ajustée', 'Prix au m² (automatique)');
});

check('Editor : plus de carte Fiche d\u2019estimation dans Financier, avis de valeur en bas', () => {
  const t = render(E.Editor({ d: mkDos({ dvf: DVFILE }), update: noop, back: noop }));
  if (t.includes('Fiche d\u2019estimation')) throw new Error('la carte redondante est encore rendue');
  const iDvf = t.indexOf('Comparatif DVF');
  const iAvis = t.indexOf('Avis de valeur');
  if (iDvf < 0 || iAvis < 0) throw new Error('comparatif ou avis absent du rendu');
  if (!(iDvf < iAvis)) throw new Error('l\u2019avis de valeur doit venir apres le comparatif');
  if (!t.includes('Charges et fiscalit\u00e9')) throw new Error('onglet Financier incomplet');
});

console.log('\n' + ok + ' contrôle(s) de rendu OK' + (fails.length ? ', ' + fails.length + ' échec(s)' : ''));
process.exit(fails.length ? 1 : 0);
