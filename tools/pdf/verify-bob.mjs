// Vérification des cas de test du barème de Bob (10/11/2026) sur les données de l'app.
// Aucune donnée inventée : on recalcule n, médiane, Q1, Q3, dispersion, score attendus.
import { readFileSync } from 'node:fs';
import { normalizeRow, stats, median } from '../../js/dvf.js';

const CUTOFF = '2025-12-31';
const since = (months) => { const d = new Date(CUTOFF); d.setMonth(d.getMonth() - months); return d.toISOString().slice(0, 10); };
const load = (c) => JSON.parse(readFileSync(new URL(`../../data/dvf/06/${c}.json`, import.meta.url), 'utf8'));

function run({ commune, lat, lon, surface, months, label }) {
  const data = load(commune);
  const subject = { lat, lon };
  const sales = data.rows.map((r) => normalizeRow(r, subject, commune)).filter(Boolean);
  const pick = (radius) => {
    const w = sales.filter((s) => s.type === 'appartement' && s.date >= since(months) && s.distance <= radius);
    const f = w.filter((s) => s.surface >= surface * 0.8 && s.surface <= surface * 1.2 && s.prixM2 >= 300 && s.prixM2 <= 60000);
    return { f, w };
  };
  const a = pick(300);
  const b = pick(500);
  const use = a.f.length >= 8 ? a : b;
  const radius = a.f.length >= 8 ? 300 : 500;
  const st = stats(use.f);
  const disp = (st.q3 - st.q1) / st.median;
  const lastSale = st.kept.map((s) => s.date).sort().at(-1);
  const monthsSince = lastSale ? Math.round((new Date(CUTOFF) - new Date(lastSale)) / 2.6298e9) : null;
  const n = st.n;
  const pN = n >= 20 ? 25 : n >= 12 ? 19 : n >= 8 ? 12 : n >= 5 ? 6 : 0;
  const dp = Math.round(disp * 1000) / 10;
  const pD0 = dp <= 15 ? 30 : dp <= 22 ? 22 : dp <= 30 ? 14 : dp <= 38 ? 7 : 0;
  const pD = n < 8 ? Math.min(pD0, 15) : pD0;
  const pF = monthsSince <= 6 ? 20 : monthsSince <= 12 ? 14 : monthsSince <= 24 ? 8 : 3;
  const pC = 15, pQ = 10; // fiche complète + Carrez et DPE renseignés
  const total = pN + pD + pF + pC + pQ;
  const level = total >= 75 ? 'élevé' : total >= 45 ? 'moyen' : 'faible';
  return { label, radius, n300: a.f.length, n500: b.f.length, n, median: st.median, q1: st.q1, q3: st.q3, disp: dp, lastSale, monthsSince, score: total, level, parts: { pN, pD, pF, pC, pQ } };
}

const cases = [
  { label: 'Cas A Le Cannet 65 m² Sadi Carnot', commune: '06030', lat: 43.5765, lon: 7.0185, surface: 65, months: 36 },
  { label: 'Cas B Le Cannet 55 m² Californie ouest', commune: '06030', lat: 43.5680, lon: 6.9985, surface: 55, months: 36 },
  { label: 'Cas C Mougins 70 m² village', commune: '06085', lat: 43.6005, lon: 6.9950, surface: 70, months: 36 },
];
for (const c of cases) console.log(JSON.stringify(run(c)));
