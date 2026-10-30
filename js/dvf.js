// Module DVF — prix/m² à proximité à partir des ventes DVF (Cerema « DVF open data », CORS ouvert).
// Logique pure (filtres, médiane, IQR) testable sous Node ; fonctions réseau isolées.
export const GEOCODE_URL = 'https://api-adresse.data.gouv.fr/search/';
export const DVF_URL = 'https://apidf-preprod.cerema.fr/dvf_opendata/geomutations/';
// codtypbien Cerema : 111 = une maison, 121 = un appartement (mutation d'un seul logement).
export const TYPE_CODES = { appartement: '121', maison: '111' };
export const MAX_TILE = 0.019; // l'API refuse une emprise > 0,02° × 0,02°
export const RADIUS_STEPS = [300, 500, 750, 1000, 1500, 2000];
export const MIN_COMPARABLES = 8;

const R = 6371000;
export function distance(lat1, lon1, lat2, lon2) {
  const t = Math.PI / 180, dLat = (lat2 - lat1) * t, dLon = (lon2 - lon1) * t;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
export function centroid(geom) {
  if (!geom) return null;
  if (geom.type === 'Point') return { lon: geom.coordinates[0], lat: geom.coordinates[1] };
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let sx = 0, sy = 0, n = 0;
  for (const p of polys) for (const [x, y] of p[0] || []) { sx += x; sy += y; n++; }
  return n ? { lon: sx / n, lat: sy / n } : null;
}
export function bboxTiles(lat, lon, radius) {
  lat = Number(lat); lon = Number(lon);
  const dLat = radius / 111320, dLon = radius / (111320 * Math.cos(lat * Math.PI / 180));
  const [w, s, e, n] = [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
  const nx = Math.ceil((e - w) / MAX_TILE), ny = Math.ceil((n - s) / MAX_TILE);
  const sx = (e - w) / nx, sy = (n - s) / ny, out = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push([w + i * sx, s + j * sy, w + (i + 1) * sx, s + (j + 1) * sy].map((v) => v.toFixed(5)));
  return out;
}
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export const median = (arr) => quantile([...arr].sort((a, b) => a - b), 0.5);
// Exclusion des valeurs aberrantes par la règle de Tukey (1,5 × IQR).
export function iqrFilter(values, k = 1.5) {
  const s = [...values].sort((a, b) => a - b);
  if (s.length < 4) return { kept: s, low: -Infinity, high: Infinity, removed: 0 };
  const q1 = quantile(s, 0.25), q3 = quantile(s, 0.75), iqr = q3 - q1;
  const low = q1 - k * iqr, high = q3 + k * iqr;
  const kept = s.filter((v) => v >= low && v <= high);
  return { kept, low, high, removed: s.length - kept.length };
}
// Feature GeoJSON Cerema -> vente normalisée
export function normalize(f, subject) {
  const p = f.properties || {};
  const c = centroid(f.geometry);
  const prix = Number(p.valeurfonc), surface = Number(p.sbati);
  if (!c || !(prix > 0) || !(surface > 0)) return null;
  return {
    id: p.idmutinvar || p.idopendata, date: p.datemut, prix, surface, prixM2: prix / surface,
    type: p.codtypbien === '111' ? 'maison' : p.codtypbien === '121' ? 'appartement' : 'autre',
    nature: p.libnatmut, vefa: !!p.vefa, parcelle: (p.l_idpar || [])[0] || '', terrain: Number(p.sterr) || 0,
    lat: c.lat, lon: c.lon, distance: subject ? Math.round(distance(subject.lat, subject.lon, c.lat, c.lon)) : null,
  };
}
// Sélection des comparables : même type, ventes récentes, rayon, surface proche, bornes de plausibilité.
export function selectComparables(sales, { type, surface, radius, sinceDate, surfaceTol = 0.35 }) {
  return sales.filter((s) => s && s.type === type && /^Vente/.test(s.nature || 'Vente')
    && (!sinceDate || s.date >= sinceDate) && (radius == null || s.distance <= radius)
    && (!surface || (s.surface >= surface * (1 - surfaceTol) && s.surface <= surface * (1 + surfaceTol)))
    && s.prixM2 >= 300 && s.prixM2 <= 60000);
}
export function stats(comps) {
  const f = iqrFilter(comps.map((c) => c.prixM2));
  const kept = comps.filter((c) => c.prixM2 >= f.low && c.prixM2 <= f.high);
  const s = f.kept;
  return { n: kept.length, removed: f.removed, median: Math.round(quantile(s, 0.5)), q1: Math.round(quantile(s, 0.25)), q3: Math.round(quantile(s, 0.75)),
    min: Math.round(s[0]), max: Math.round(s[s.length - 1]), kept, outliers: comps.filter((c) => !kept.includes(c)) };
}
// Élargissement automatique : rayon puis tolérance de surface, jusqu'à MIN_COMPARABLES.
export function analyse(sales, { type, surface, radius = 500, sinceDate, min = MIN_COMPARABLES, autoWiden = true }) {
  const radii = autoWiden ? [radius, ...RADIUS_STEPS.filter((r) => r > radius)] : [radius];
  const tols = autoWiden ? [0.35, 0.6, Infinity] : [0.35];
  let best = null;
  for (const tol of tols) for (const r of radii) {
    const comps = selectComparables(sales, { type, surface: tol === Infinity ? 0 : surface, radius: r, sinceDate, surfaceTol: tol });
    const st = comps.length ? stats(comps) : { n: 0, removed: 0, kept: [], outliers: [] };
    best = { ...st, radius: r, surfaceTol: tol, widened: r !== radius || tol !== 0.35 };
    if (st.n >= min) return best;
  }
  return best;
}
export function sinceDate(years = 3, now = new Date()) {
  const d = new Date(now); d.setFullYear(d.getFullYear() - years); return d.toISOString().slice(0, 10);
}

// ---------- Réseau ----------
export async function geocode(q, { limit = 5, fetchFn = fetch } = {}) {
  const r = await fetchFn(`${GEOCODE_URL}?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!r.ok) throw new Error(`Géocodage indisponible (${r.status})`);
  const j = await r.json();
  return (j.features || []).map((f) => ({ label: f.properties.label, city: f.properties.city, citycode: f.properties.citycode, score: f.properties.score, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
}
// GET JSON avec 2 nouvelles tentatives (l'API Cerema est parfois lente ou coupe la connexion).
async function getJson(url, fetchFn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchFn(url, { cache: 'no-store' });
      if (r.ok) return await r.json();
      last = new Error(`API DVF indisponible (${r.status})`);
      if (r.status < 500 && r.status !== 429) break;
    } catch (e) { last = e; }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, 800 * (i + 1)));
  }
  throw last;
}
async function fetchTile(t, { minYear, type, fetchFn, lat, lon, seen, onProgress }) {
  let url = `${DVF_URL}?in_bbox=${t.join(',')}&anneemut_min=${minYear}&codtypbien=${TYPE_CODES[type]}&page_size=500`;
  for (let guard = 0; url && guard < 20; guard++) {
    const j = await getJson(url, fetchFn);
    for (const f of j.features || []) { const s = normalize(f, { lat, lon }); if (s && !seen.has(s.id)) seen.set(s.id, s); }
    onProgress?.(seen.size);
    url = j.next ? j.next.replace(/^http:/, 'https:') : null;
  }
}
export async function fetchSales({ lat, lon, radius, type, years = 3, fetchFn = fetch, onProgress }) {
  const minYear = new Date().getFullYear() - years;
  const seen = new Map();
  await Promise.all(bboxTiles(lat, lon, radius).map((t) => fetchTile(t, { minYear, type, fetchFn, lat, lon, seen, onProgress })));
  return [...seen.values()];
}
// Recherche complète : rayon demandé d'abord, puis élargissement (rayon, puis tolérance de surface) si trop peu de ventes.
export async function priceNear({ lat, lon, type, surface, radius = 500, years = 3, autoWiden = true, fetchFn = fetch, onProgress }) {
  const since = sinceDate(years);
  let sales = await fetchSales({ lat, lon, radius, type, years, fetchFn, onProgress });
  let res = analyse(sales, { type, surface, radius, sinceDate: since, autoWiden: false });
  if (autoWiden && res.n < MIN_COMPARABLES) {
    for (const r of RADIUS_STEPS.filter((x) => x > radius)) {
      sales = await fetchSales({ lat, lon, radius: r, type, years, fetchFn, onProgress });
      res = analyse(sales, { type, surface, radius, sinceDate: since, autoWiden: true });
      if (res.n >= MIN_COMPARABLES || r >= 1500) break;
    }
  }
  return { ...res, requestedRadius: radius, fetched: sales.length, since, source: 'DVF (Cerema / DGFiP)', at: Date.now() };
}
