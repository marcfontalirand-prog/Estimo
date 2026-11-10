// Génère _seed.html (temporaire, non commité) : injecte un dossier de démonstration
// avec son comparatif DVF réel dans le localStorage de l'app servie en local.
import { readFileSync, writeFileSync } from 'node:fs';
import { analyse, normalizeRow, DATA_CUTOFF } from '../../js/dvf.js';

const d = JSON.parse(readFileSync('tools/pdf/fixtures/dossier-demo-le-cannet.json', 'utf8'));
const commune = JSON.parse(readFileSync('data/dvf/06/' + d._commune + '.json', 'utf8'));
const sales = commune.rows.map((r) => normalizeRow(r, { lat: d._lat, lon: d._lon }, d._commune)).filter(Boolean);
const since = (() => { const x = new Date(DATA_CUTOFF); x.setMonth(x.getMonth() - 24); return x.toISOString().slice(0, 10); })();
const S = Number(d.bien.carrez);
const comps = sales.filter((s) => s.type === 'appartement' && s.date >= since && s.distance <= 300
  && s.surface >= S * 0.8 && s.surface <= S * 1.2 && s.prixM2 >= 300 && s.prixM2 <= 60000);
const st = analyse(comps, { type: 'appartement', surface: S, radius: 300, sinceDate: since, min: 8, autoWiden: false });
d.dvf = {
  type: 'appartement', citycode: d._commune, adresse: d.client.adresse, lat: d._lat, lon: d._lon,
  n: st.n, median: st.median, q1: st.q1, q3: st.q3, removed: st.removed, radius: 300, surfaceTol: 0.35,
  since, source: 'DVF Etalab (geo-dvf)', fallback: false, fallbackReason: '',
  lastSale: st.kept.map((s) => s.date).sort().at(-1) || '', at: Date.now(),
  comps: st.kept.sort((a, b) => a.distance - b.distance).slice(0, 40)
    .map((c) => ({ date: c.date, prix: c.prix, surface: c.surface, prixM2: Math.round(c.prixM2), distance: c.distance })),
};
d.updated = Date.now();

const html = '<!doctype html><meta charset="utf-8"><title>seed</title><script>' +
  'localStorage.setItem("estimo.v2.dossiers", ' + JSON.stringify(JSON.stringify([d])) + ');' +
  'location.replace("index.html");</script>seed';
writeFileSync('_seed.html', html);
console.log('seed ok ·', st.n, 'comparables · médiane', st.median);
