import { test } from 'node:test';
import assert from 'node:assert/strict';
import { median, quantile, iqrFilter, stats, selectComparables, analyse, distance, bboxTiles, centroid, normalize, MAX_TILE, priceNear } from '../js/dvf.js';

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
test('priceNear avec API simulée (pagination http->https)', async () => {
  const feat = (i) => ({ geometry: { type: 'Point', coordinates: [7.0165, 43.571] }, properties: { idmutinvar: 'm' + i, datemut: new Date().toISOString().slice(0, 10), valeurfonc: String(240000 + i * 1000), sbati: '60', codtypbien: '121', libnatmut: 'Vente' } });
  const urls = [];
  const fetchFn = async (u) => { urls.push(u); const p2 = u.includes('page=2'); return { ok: true, json: async () => ({ features: p2 ? [5, 6, 7, 8, 9].map(feat) : [0, 1, 2, 3, 4].map(feat), next: p2 ? null : 'http://x/?page=2' }) }; };
  const r = await priceNear({ lat: 43.571, lon: 7.0165, type: 'appartement', surface: 60, radius: 500, fetchFn });
  assert.equal(r.n, 10); assert.equal(r.median, 4075);
  assert.ok(urls.some((u) => u.startsWith('https://x/?page=2')));
});
