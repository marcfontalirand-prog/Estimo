import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, quantile, iqrFilter, stats, selectComparables, analyse, distance, bboxTiles, centroid, normalize, MAX_TILE, priceNear, priceNearCerema } from '../js/dvf.js';

test('médiane et quantiles', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.25), 2);
});
test('IQR : exclut les valeurs aberrantes', () => {
  const r = iqrFilter([4000, 4100, 4200, 4300, 4400, 4500, 20000, 500]);
  assert.equal(r.removed, 2);
  assert.ok(!r.kept.includes(20000) && !r.kept.includes(500));
  assert.equal(iqrFilter([1, 100]).removed, 0); // trop peu de points : rien n'est exclu
});
test('stats : médiane robuste aux aberrations', () => {
  const comps = [4000, 4200, 4400, 4600, 4800, 99000].map((p, i) => ({ id: i, prixM2: p }));
  const s = stats(comps);
  assert.equal(s.n, 5); assert.equal(s.removed, 1); assert.equal(s.median, 4400);
  assert.equal(s.outliers[0].prixM2, 99000);
});
const mk = (o) => ({ type: 'appartement', nature: 'Vente', date: '2025-01-01', surface: 60, prixM2: 4000, distance: 100, ...o });
test('sélection : type, date, rayon, surface', () => {
  const sales = [mk({}), mk({ type: 'maison' }), mk({ date: '2020-01-01' }), mk({ distance: 900 }), mk({ surface: 200 }), mk({ nature: 'Echange' })];
  const c = selectComparables(sales, { type: 'appartement', surface: 60, radius: 500, sinceDate: '2023-01-01' });
  assert.equal(c.length, 1);
});
test('élargissement automatique du rayon', () => {
  const sales = Array.from({ length: 10 }, (_, i) => mk({ distance: 600 + i, prixM2: 4000 + i * 10 }));
  const r = analyse(sales, { type: 'appartement', surface: 60, radius: 500, min: 8 });
  assert.equal(r.radius, 750); assert.ok(r.widened); assert.equal(r.n, 10);
  const strict = analyse(sales, { type: 'appartement', surface: 60, radius: 500, autoWiden: false });
  assert.equal(strict.n, 0);
});
test('géométrie : distance, centroïde, tuiles ≤ 0,02°', () => {
  assert.ok(Math.abs(distance(43.57, 7.0, 43.58, 7.0) - 1112) < 5);
  assert.deepEqual(centroid({ type: 'MultiPolygon', coordinates: [[[[0, 0], [2, 0], [2, 2], [0, 2]]]] }), { lon: 1, lat: 1 });
  for (const t of bboxTiles(43.57, 7.01, 2000)) { assert.ok(t[2] - t[0] <= MAX_TILE + 1e-9 && t[3] - t[1] <= MAX_TILE + 1e-9); }
});
test('normalisation d’une mutation Cerema', () => {
  const s = normalize({ geometry: { type: 'Point', coordinates: [7.0165, 43.571] }, properties: { idmutinvar: 'x', datemut: '2025-02-01', valeurfonc: '300000.00', sbati: '60.00', codtypbien: '121', libnatmut: 'Vente', l_idpar: ['06030000AY0052'] } }, { lat: 43.571, lon: 7.0165 });
  assert.equal(s.prixM2, 5000); assert.equal(s.type, 'appartement'); assert.equal(s.distance, 0);
});
test('priceNearCerema avec API simulée (pagination http->https)', async () => {
  const feat = (i) => ({ geometry: { type: 'Point', coordinates: [7.0165, 43.571] }, properties: { idmutinvar: 'm' + i, datemut: new Date().toISOString().slice(0, 10), valeurfonc: String(240000 + i * 1000), sbati: '60', codtypbien: '121', libnatmut: 'Vente' } });
  const urls = [];
  const fetchFn = async (u) => { urls.push(u); const p2 = u.includes('page=2'); return { ok: true, json: async () => ({ features: p2 ? [5, 6, 7, 8, 9].map(feat) : [0, 1, 2, 3, 4].map(feat), next: p2 ? null : 'http://x/?page=2' }) }; };
  const r = await priceNearCerema({ lat: 43.571, lon: 7.0165, type: 'appartement', surface: 60, radius: 500, fetchFn });
  assert.equal(r.n, 10); assert.equal(r.median, 4075);
  assert.ok(urls.some((u) => u.startsWith('https://x/?page=2')));
});

// ---------- Source Etalab (JSON précalculés) ----------
import { normalizeRow, communesNear, depOf, fetchSalesLocal, SOURCE_LABEL } from '../js/dvf.js';
import { readFileSync } from 'node:fs';
const today = new Date().toISOString().slice(0, 10);
const idx = { derniere_vente: today, communes: { '06030': { bbox: [7.0, 43.56, 7.03, 43.59] }, '06029': { bbox: [6.9, 43.5, 6.98, 43.56] } } };
const rows = Array.from({ length: 10 }, (_, i) => [today, 240000 + i * 1000, 60, 'a', 43.571, 7.0165, 0, 0, 'P' + i]).concat([[today, 500000, 100, 'm', 43.571, 7.0165, 300, 0, 'M']]);
const localFetch = (calls = []) => async (u) => { calls.push(u); if (u.endsWith('index.json')) return { ok: true, json: async () => idx }; if (u.endsWith('06030.json')) return { ok: true, json: async () => ({ commune: '06030', rows }) }; return { ok: false, status: 404 }; };
test('Etalab : normalisation d’une ligne compacte', () => {
  const s = normalizeRow(['2025-12-30', 300000, 60, 'a', 43.571, 7.0165, 0, 1, '06030000AY0052'], { lat: 43.571, lon: 7.0165 }, '06030');
  assert.equal(s.prixM2, 5000); assert.equal(s.type, 'appartement'); assert.equal(s.distance, 0); assert.ok(s.vefa); assert.match(s.nature, /^Vente/);
  assert.equal(normalizeRow(['2025-01-01', 0, 60, 'a', 43, 7, 0, 0, ''], null), null);
});
test('Etalab : communes voisines par emprise + rayon, département', () => {
  assert.deepEqual(communesNear(idx, 43.571, 7.0165, 500), ['06030']);
  assert.deepEqual(communesNear(idx, 43.5625, 6.99, 1000).sort(), ['06029', '06030']);
  assert.equal(depOf('06030'), '06'); assert.equal(depOf('97411'), '974'); assert.equal(depOf(''), '06');
});
test('Etalab : priceNear lit les JSON locaux, sans appel Cerema', async () => {
  const calls = [];
  const r = await priceNear({ lat: 43.571, lon: 7.0165, citycode: '06030', type: 'appartement', surface: 60, radius: 500, fetchFn: localFetch(calls), base: 'https://site/data/dvf/' });
  assert.equal(r.n, 10); assert.equal(r.median, 4075); assert.equal(r.source, SOURCE_LABEL); assert.equal(r.fallback, false); assert.equal(r.lastSale, today);
  assert.ok(calls.every((u) => u.startsWith('https://site/')));
  const { sales } = await fetchSalesLocal({ lat: 43.571, lon: 7.0165, citycode: '06030', type: 'maison', radius: 500, fetchFn: localFetch(), base: 'https://site2/' });
  assert.equal(sales.length, 1);
});
test('Etalab indisponible : repli sur l’API Cerema', async () => {
  const feat = (i) => ({ geometry: { type: 'Point', coordinates: [7.0165, 43.571] }, properties: { idmutinvar: 'c' + i, datemut: today, valeurfonc: String(240000 + i * 1000), sbati: '60', codtypbien: '121', libnatmut: 'Vente' } });
  const fetchFn = async (u) => (u.includes('cerema') ? { ok: true, json: async () => ({ features: Array.from({ length: 10 }, (_, i) => feat(i)), next: null }) } : { ok: false, status: 404 });
  const r = await priceNear({ lat: 43.571, lon: 7.0165, citycode: '06030', type: 'appartement', surface: 60, radius: 500, fetchFn, base: 'https://down/' });
  assert.equal(r.fallback, true); assert.match(r.source, /Cerema/); assert.equal(r.n, 10);
});
test('Données précalculées 06 : index cohérent et Le Cannet présent', () => {
  const index = JSON.parse(readFileSync(new URL('../data/dvf/06/index.json', import.meta.url)));
  assert.equal(index.source, 'DVF Etalab, décembre 2025'); assert.ok(index.communes['06030'].n > 1000);
  const c = JSON.parse(readFileSync(new URL('../data/dvf/06/06030.json', import.meta.url)));
  assert.equal(c.rows.length, index.communes['06030'].n); assert.ok(c.rows.at(-1)[0].startsWith('2025-12'));
});
