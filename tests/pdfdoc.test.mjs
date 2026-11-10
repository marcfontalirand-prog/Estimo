// Tests du module « avis de valeur » (js/pdfdoc.js) : logique pure, rejouable hors navigateur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyse, normalizeRow, DATA_CUTOFF } from '../js/dvf.js';
import { computeAjust } from '../js/ajust.js';
import { buildAvis, scoreConfiance, dvfFromApp, makeHelpers } from '../js/pdfdoc.js';

const ROOT = new URL('../', import.meta.url).pathname;
const fixture = (f) => JSON.parse(readFileSync(ROOT + 'tools/pdf/fixtures/' + f, 'utf8'));

// Reproduit ce que fait l'app : ventes locales -> comparatif -> estimation ajustée.
function pipeline(file, { months = 24, tol = 0.2, min = 8 } = {}) {
  const d = fixture(file);
  const commune = JSON.parse(readFileSync(ROOT + 'data/dvf/06/' + (d._commune || '06030') + '.json', 'utf8'));
  const subject = { lat: d._lat, lon: d._lon };
  const sales = commune.rows.map((r) => normalizeRow(r, subject, d._commune)).filter(Boolean);
  const since = (() => { const x = new Date(DATA_CUTOFF); x.setMonth(x.getMonth() - months); return x.toISOString().slice(0, 10); })();
  const pool = (radius) => sales.filter((s) => s.type === 'appartement' && s.date >= since && s.distance <= radius
    && s.surface >= (Number(d.bien.carrez) || 0) * (1 - tol) && s.surface <= (Number(d.bien.carrez) || 0) * (1 + tol)
    && s.prixM2 >= 300 && s.prixM2 <= 60000);
  let radius = 300, comps = pool(radius);
  if (comps.length < min) { radius = 500; comps = pool(500); }
  const st = analyse(comps, { type: 'appartement', surface: Number(d.bien.carrez), radius, sinceDate: since, min, autoWiden: false });
  const dvf = { n: st.n, removed: st.removed, median: st.median, q1: st.q1, q3: st.q3, radius, since, surfaceTol: tol,
    lastSale: st.kept.map((s) => s.date).sort().at(-1) || '', source: 'DVF Etalab (geo-dvf)',
    comps: st.kept.map((s) => ({ date: s.date, prix: s.prix, surface: s.surface, prixM2: Math.round(s.prixM2), distance: s.distance })) };
  const dossier = { ...d, dvf };
  const A = computeAjust({ ...dossier, dvf: { ...dvf } });
  return { dossier, dvf, A };
}

test('Le Cannet 68 m² : les chiffres de la démo sont reproduits par le module', () => {
  const { dossier, A } = pipeline('dossier-demo-le-cannet.json');
  const doc = buildAvis(dossier, { ajust: A, visitDate: '2026-11-10', cutoff: DATA_CUTOFF, params: { months: 24, tol: 0.2, min: 8 } });
  assert.equal(A.valeur, 308176);
  assert.equal(A.bas, 282233);
  assert.equal(A.haut, 344075);
  assert.equal(doc.data.score.total, 86);
  assert.equal(doc.data.score.level, 'élevé');
  assert.equal(doc.data.dvf.n, 40);
  assert.equal(doc.data.dvf.median, 3907);
});

test('Mougins village 70 m² : score 48 et mention « zone peu comparable »', () => {
  const { dossier, A } = pipeline('dossier-demo-mougins-village.json', { months: 30 });
  const doc = buildAvis(dossier, { ajust: A, visitDate: '2026-11-10', cutoff: DATA_CUTOFF, params: { months: 30, tol: 0.2, min: 8 } });
  assert.equal(doc.data.score.total, 48);
  assert.equal(doc.data.score.large, true);
  assert.match(doc.html, /Zone peu comparable/);
});

test('Le document fait 18 pages A4, sans aucune ressource externe', () => {
  const { dossier, A } = pipeline('dossier-demo-le-cannet.json');
  const html = buildAvis(dossier, { ajust: A, visitDate: '2026-11-10' }).html;
  assert.equal((html.match(/<section class="sheet/g) || []).length, 18);
  assert.match(html, /@page\{size:A4;margin:0\}/);
  assert.doesNotMatch(html, /https?:\/\//); // imprimable hors ligne
  assert.doesNotMatch(html, /Laforêt|Laforet/i); // marque non tranchée : jamais dans le document
});

test('Les mentions manquantes restent visibles, jamais inventées', () => {
  const { dossier, A } = pipeline('dossier-demo-le-cannet.json');
  const html = buildAvis(dossier, { ajust: A, visitDate: '2026-11-10' }).html;
  assert.match(html, /\[AGENCE\]/);
  assert.match(html, /non communiqué/);
  assert.match(html, /DOCUMENT DE TEST/); // démo par défaut
  const reel = buildAvis(dossier, { ajust: A, visitDate: '2026-11-10', demo: false }).html;
  assert.doesNotMatch(reel, /DOCUMENT DE TEST/);
});

test('Sans comparatif DVF, l\'export refuse au lieu de produire un document faux', () => {
  const { dossier } = pipeline('dossier-demo-le-cannet.json');
  assert.throws(() => buildAvis({ ...dossier, dvf: null }, { ajust: { ok: false } }), /comparatif DVF/);
  assert.throws(() => buildAvis({ ...dossier, dvf: null }, {}), /comparatif DVF/);
});

test('Barème de Bob : le cas Mougins de référence donne 48/100 (0+15+8+15+10)', () => {
  const D = {
    bien: { carrez: '70', etage: '2', terrasse: '10', balcon: '', cave: '', pieces: '3' },
    technique: { dpe: 'D', notesEtat: 'Bon état', parking: 'Box fermé' },
  };
  const dvf = { n: 4, radius: 500, median: 5245, q1: 5001, q3: 5448, lastSale: '2025-03-14' };
  const s = scoreConfiance(D, dvf, { ok: true }, { visitDate: '2026-11-10', params: { min: 8 } });
  assert.deepEqual(s.criteria.map((c) => c.pts), [0, 15, 8, 15, 10]);
  assert.equal(s.total, 48);
  assert.equal(s.large, true);
});

test('dvfFromApp : le comparatif enregistré est converti sans perte', () => {
  const v = { n: 12, removed: 2, median: 4000, q1: 3600, q3: 4400, radius: 300, lastSale: '2025-06-01', since: '2023-11-10',
    source: 'DVF Etalab (geo-dvf)', surfaceTol: 0.35, comps: [{ date: '2025-06-01', prix: 280000, surface: 70, prixM2: 4000, distance: 120 }] };
  const out = dvfFromApp(v, { cutoff: '2025-12-31' });
  assert.equal(out.cutoff, '2025-12-31');
  assert.equal(out.min, 4000);
  assert.equal(out.max, 4000);
  assert.equal(out.windowN, 14);
  assert.equal(makeHelpers({ dvf: out }).bins.length, 0); // une seule valeur -> pas d'histogramme inventé
});
