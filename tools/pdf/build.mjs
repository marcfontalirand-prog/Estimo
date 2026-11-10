// Prototype PDF « avis de valeur » — test du texte type de Jane (v1 du 10/11/2026).
// Lit un dossier Estimo (JSON) + les ventes DVF locales, calcule l'estimation avec les
// modules réels (js/dvf.js, js/ajust.js), puis écrit un HTML paginé A4 prêt à imprimer.
//
// Usage : node tools/pdf/build.mjs [fixture.json]
// Sortie : tools/pdf/out/avis-de-valeur-<id>.html (+ <id>.data.json pour le contrôle)
//
// Limite assumée : ce prototype n'est pas branché dans l'app. Il rejoue la même logique
// que js/dvf.js et js/ajust.js pour vérifier ce que le texte type permet réellement de produire.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { normalizeRow, analyse, stats, median } from '../../js/dvf.js';
import { computeAjust } from '../../js/ajust.js';
import { buildAvis } from '../../js/pdfdoc.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const fixturePath = process.argv[2] ? resolve(process.argv[2]) : join(HERE, 'fixtures/dossier-demo-le-cannet.json');
const dossier = JSON.parse(readFileSync(fixturePath, 'utf8'));

// --- Paramètres de méthode : ceux du texte type de Jane (v1) -----------------
// Rayon 300 m, 24 mois, surface 80–120 %, minimum 8 ventes. À comparer aux valeurs
// codées dans l'app (rayon 300 m, 3 ans, ±35 %, MIN_COMPARABLES = 8) : voir le rapport.
const PARAMS = { radius: 300, months: 24, tol: 0.2, min: 8 };
const CUTOFF = '2025-12-31'; // DATA_CUTOFF de js/dvf.js
const visitDate = '2026-11-10';

const n = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return Number.isFinite(x) ? x : null; };
const SURF = n(dossier.bien.carrez) || n(dossier.bien.habitable);
const sinceDate = (() => {
  const d = new Date(CUTOFF); d.setMonth(d.getMonth() - PARAMS.months);
  return d.toISOString().slice(0, 10);
})();

// --- Ventes DVF réelles ------------------------------------------------------
const COMM = dossier._commune || '06030';
const commune = JSON.parse(readFileSync(join(ROOT, 'data/dvf/06/' + COMM + '.json'), 'utf8'));
const subject = { lat: dossier._lat || 43.5766, lon: dossier._lon || 7.0193 }; // point de test, pas l'adresse d'un client réel
const sales = commune.rows.map((r) => normalizeRow(r, subject, COMM)).filter(Boolean);

// Règle de Bob : 300 m en priorité ; si moins de 8 ventes exploitables, élargir à 500 m
// (et retirer 6 points au critère « comparables »). Jamais au-delà de 500 m.
const pool = (radius) => sales
  .filter((s) => s.type === 'appartement' && s.date >= sinceDate && s.distance <= radius)
  .filter((s) => s.surface >= SURF * (1 - PARAMS.tol) && s.surface <= SURF * (1 + PARAMS.tol) && s.prixM2 >= 300 && s.prixM2 <= 60000);

let radius = PARAMS.radius;
let comps = pool(radius);
if (comps.length < PARAMS.min) { radius = 500; comps = pool(500); }
const inWindow = sales.filter((s) => s.type === 'appartement' && s.date >= sinceDate && s.distance <= radius);
const filtered = comps;
const st = stats(filtered);
const lastSale = st.kept.length ? st.kept.map((s) => s.date).sort().at(-1) : null;

const dvf = {
  n: st.n, removed: st.removed, median: st.median, q1: st.q1, q3: st.q3, min: st.min, max: st.max,
  radius, months: PARAMS.months, tol: PARAMS.tol, since: sinceDate, lastSale,
  kept: st.kept.slice().sort((a, b) => b.date.localeCompare(a.date)),
  excluded: st.outliers.slice().sort((a, b) => a.date.localeCompare(b.date)),
  communes: commune.nom, cutoff: CUTOFF, source: 'DVF Etalab (geo-dvf)',
  windowN: inWindow.length,
};

// --- Estimation ajustée (module réel de l'app) ------------------------------
const d = { ...dossier, dvf };
const A = computeAjust(d);

// --- Score de confiance : barème de Bob (10/11/2026), 5 critères, 100 points ----
// Fraîcheur mesurée entre la dernière vente retenue et la DATE DE VALORISATION (visite),
// pas depuis l'arrêt des données : sinon tout dossier paraît frais (cf. rapport de test).
const monthsAtVisit = lastSale ? Math.round((new Date(visitDate) - new Date(lastSale)) / 2.6298e9) : null;
const b = dossier.bien, t = dossier.technique;
const completude = [
  ['surface', !!SURF], ['étage', b.etage !== '' && b.etage != null],
  ['extérieur', !!(n(b.terrasse) || n(b.balcon))], ['état', !!(t.notesEtat || t.travaux)],
  ['annexes', !!(n(b.cave) || t.parking)], ['DPE / GES', !!t.dpe],
];
const nbChamps = completude.filter(([, ok]) => ok).length;
const dispRaw = dvf.median ? (dvf.q3 - dvf.q1) / dvf.median : null;
const dispPct = dispRaw == null ? null : Math.round(dispRaw * 1000) / 10;
const large = dvf.n < PARAMS.min;

const ptsN0 = dvf.n >= 20 ? 25 : dvf.n >= 12 ? 19 : dvf.n >= 8 ? 12 : dvf.n >= 5 ? 6 : 0;
const ptsN = Math.max(0, ptsN0 - (dvf.radius > 300 ? 6 : 0));
const ptsD0 = dispPct <= 15 ? 30 : dispPct <= 22 ? 22 : dispPct <= 30 ? 14 : dispPct <= 38 ? 7 : 0;
const ptsD = large ? Math.min(ptsD0, 15) : ptsD0;
const ptsF = monthsAtVisit <= 6 ? 20 : monthsAtVisit <= 12 ? 14 : monthsAtVisit <= 24 ? 8 : 3;
const ptsC = nbChamps === 6 ? 15 : nbChamps >= 4 ? 9 : nbChamps >= 2 ? 4 : 0;
const surfOk = !!n(b.carrez), dpeOk = !!t.dpe;
const ptsQ = surfOk && dpeOk ? 10 : (surfOk || dpeOk) ? 5 : 0;
const scoreTotal = ptsN + ptsD + ptsF + ptsC + ptsQ;
const scoreLevel = scoreTotal >= 75 ? 'élevé' : scoreTotal >= 45 ? 'moyen' : 'faible';
const score = {
  total: scoreTotal, level: scoreLevel, large, carrezManquant: !surfOk, barème: 'Bob 10/11/2026',
  criteria: [
    { label: 'Comparables retenus', constat: `${dvf.n} vente(s) à ${dvf.radius} m`, pts: ptsN, max: 25 },
    { label: 'Dispersion (IQR / médiane)', constat: dispPct == null ? 'non calculable' : `${dispPct.toFixed(1).replace('.', ',')} %${large ? ' — non significative (n < 8)' : ''}`, pts: ptsD, max: 30 },
    { label: 'Fraîcheur de la dernière vente', constat: `${monthsAtVisit} mois au ${fmtDate(visitDate)}`, pts: ptsF, max: 20 },
    { label: 'Complétude de la fiche', constat: `${nbChamps} champs sur 6`, pts: ptsC, max: 15 },
    { label: 'Qualité de la donnée de surface', constat: `${surfOk ? 'Carrez renseigné' : 'pas de Carrez'} · ${dpeOk ? 'DPE renseigné' : 'pas de DPE'}`, pts: ptsQ, max: 10 },
  ],
  champs: completude.map(([k, ok]) => ({ k, ok })),
  monthsAtVisit,
};

// --- Histogramme des comparables (SVG généré) -------------------------------
const bins = (() => {
  const vals = dvf.kept.map((s) => s.prixM2);
  if (!vals.length) return [];
  const lo = Math.floor(Math.min(...vals) / 250) * 250, hi = Math.ceil(Math.max(...vals) / 250) * 250;
  const out = [];
  for (let x = lo; x < hi; x += 250) out.push({ from: x, to: x + 250, n: vals.filter((v) => v >= x && v < x + 250).length });
  return out;
})();

const data = { dossier, dvf, ajust: A, score, params: PARAMS, SURF, visitDate };
mkdirSync(join(HERE, 'out'), { recursive: true });
const slug = `avis-de-valeur-${dossier.id}`;
writeFileSync(join(HERE, `out/${slug}.data.json`), JSON.stringify({ dvf: { ...dvf, kept: dvf.kept.length, excluded: dvf.excluded.length }, ajust: A, score, params: PARAMS }, null, 2));
// Le document est produit par le module de l'app (js/pdfdoc.js) : une seule source de vérité.
// On vérifie au passage que le module recalcule exactement le même score que le prototype.
const appDvf = { ...dvf, surfaceTol: PARAMS.tol, since: sinceDate,
  comps: dvf.kept.map((s) => ({ date: s.date, prix: s.prix, surface: s.surface, prixM2: Math.round(s.prixM2), distance: s.distance })) };
const doc = buildAvis({ ...dossier, dvf: appDvf }, { ajust: A, visitDate, cutoff: CUTOFF, params: PARAMS, demo: true });
if (doc.data.score.total !== scoreTotal) throw new Error('divergence de score module/prototype : ' + doc.data.score.total + ' vs ' + scoreTotal);
writeFileSync(join(HERE, `out/${slug}.html`), doc.html);

function fmtEur(v) { return v == null || !Number.isFinite(+v) ? '—' : Math.round(v).toLocaleString('fr-FR') + ' €'; }
function fmtPct(x, signed = false) { if (x == null) return '—'; const s = (x * 100).toFixed(1).replace('.', ','); return (signed && x >= 0 ? '+' : '') + s + ' %'; }
function fmtDate(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; }
function fmtMonth(iso) { return iso ? iso.slice(0, 4) + '-' + iso.slice(5, 7) : '—'; }

console.log(JSON.stringify({
  fixture: fixturePath, surface: SURF, since: sinceDate,
  ventesFenetre: dvf.windowN, comparables: dvf.n, ecartes: dvf.removed,
  mediane: dvf.median, q1: dvf.q1, q3: dvf.q3,
  ajustement: A.total, m2: A.m2, valeur: A.valeur, bas: A.bas, haut: A.haut,
  score: scoreTotal, niveau: scoreLevel,
  sortie: join(HERE, `out/${slug}.html`),
}, null, 2));
