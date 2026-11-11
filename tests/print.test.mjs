// Tests du passage à l'impression : le papier doit rester blanc, quoi qu'affiche l'écran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyse, normalizeRow, DATA_CUTOFF } from '../js/dvf.js';
import { computeAjust } from '../js/ajust.js';
import { buildAvis } from '../js/pdfdoc.js';

const ROOT = new URL('../', import.meta.url).pathname;
const fixture = (f) => JSON.parse(readFileSync(ROOT + 'tools/pdf/fixtures/' + f, 'utf8'));

function doc(file) {
  const d = fixture(file);
  const commune = JSON.parse(readFileSync(ROOT + 'data/dvf/06/' + (d._commune || '06030') + '.json', 'utf8'));
  const subject = { lat: d._lat, lon: d._lon };
  const sales = commune.rows.map((r) => normalizeRow(r, subject, d._commune)).filter(Boolean);
  const since = (() => { const x = new Date(DATA_CUTOFF); x.setMonth(x.getMonth() - 24); return x.toISOString().slice(0, 10); })();
  const S = Number(d.bien.carrez);
  const pool = (radius) => sales.filter((s) => s.type === 'appartement' && s.date >= since && s.distance <= radius
    && s.surface >= S * 0.8 && s.surface <= S * 1.2 && s.prixM2 >= 300 && s.prixM2 <= 60000);
  let radius = 300, comps = pool(300);
  if (comps.length < 8) { radius = 500; comps = pool(500); }
  const st = analyse(comps, { type: 'appartement', surface: S, radius, sinceDate: since, min: 8, autoWiden: false });
  const dvf = { n: st.n, removed: st.removed, median: st.median, q1: st.q1, q3: st.q3, radius, since, surfaceTol: 0.2,
    lastSale: st.kept.map((s) => s.date).sort().at(-1) || '', source: 'DVF Etalab (geo-dvf)',
    comps: st.kept.map((s) => ({ date: s.date, prix: s.prix, surface: s.surface, prixM2: Math.round(s.prixM2), distance: s.distance })) };
  const dossier = { ...d, dvf };
  const A = computeAjust(dossier);
  return buildAvis(dossier, { ajust: A, visitDate: '2026-11-10', appVersion: 'Estimo 2.5.2' }).html;
}

test('le document déclare un thème clair : aucun navigateur ne peut le forcer en sombre', () => {
  const html = doc('dossier-demo-le-cannet.json');
  assert.match(html, /<meta name="color-scheme" content="only light">/);
  assert.match(html, /:root\{color-scheme:only light/);
});

test('aucun aplat sombre ne subsiste dans le document', () => {
  const html = doc('dossier-demo-le-cannet.json');
  assert.doesNotMatch(html, /linear-gradient\(160deg,#0b1f3a/); // ancienne couverture sombre
  // Seuls des traits d'accent restent en marine : aucun bloc (couverture, KPI, en-tête, carte) n'est rempli.
  assert.doesNotMatch(html, /\.t th\{background:(var\(--navy\)|#0b1f3a)/);
  assert.doesNotMatch(html, /\.(cover|kpi|vcard|card)\{[^}]*background:(var\(--navy\)|#0b1f3a)/);
  const pleins = (html.match(/background:(var\(--navy\)|#0b1f3a|#061226)/g) || []).length;
  assert.ok(pleins <= 2, 'aplats marine restants : ' + pleins);
});

test('l’impression force le fond blanc, quel que soit le média', () => {
  const html = doc('dossier-demo-le-cannet.json');
  assert.match(html, /@media print\{html,body\{background:#fff !important/);
  assert.match(html, /\.sheet\{background:#fff !important\}/);
});

test('la version de l’application est imprimée sur le document', () => {
  const html = doc('dossier-demo-le-cannet.json');
  assert.match(html, /Document de test — Estimo 2\.5\.2/);
  assert.match(html, /Généré par Estimo 2\.5\.2/);
});

test('l’app imprime le document depuis sa propre page (pas de fenêtre surgissante)', () => {
  const app = readFileSync(ROOT + 'index.html', 'utf8');
  assert.match(app, /<div id="print-doc" aria-hidden="true">/);
  assert.match(app, /#root,#boot,noscript,#upd,#print-bar\{display:none !important\}/);
  assert.match(app, /#print-doc\{display:block !important/);
  assert.match(app, /function avisInPage\(html\)/);
  assert.match(app, /if\(mode==='print'\)\{try\{avisInPage\(avisDoc\(d,A\)\.html\)/);
});

test('impression : l’interface quitte la page avant les dialogues, écran comme papier', () => {
  const app = readFileSync(ROOT + 'index.html', 'utf8');
  // Le mode impression retire #root de la page : même un moteur qui rend l écran ne sort pas les onglets sombres.
  assert.match(app, /html\.printing #root,html\.printing #boot,html\.printing noscript,html\.printing #upd\{display:none !important\}/);
  assert.match(app, /html\.printing,html\.printing body\{background:#fff !important/);
  assert.match(app, /function enterPrintMode\(\)/);
  assert.match(app, /addEventListener\('beforeprint'/);
  assert.match(app, /#print-doc \.sheet,#print-doc section\{background:#fff !important\}/);
  assert.match(app, /<meta name="color-scheme" content="only light">/);
});

test('mire d’impression : une page blanche qui démasque un assombrissement de l’appareil', () => {
  const app = readFileSync(ROOT + 'index.html', 'utf8');
  assert.match(app, /function mireDoc\(\)/);
  assert.match(app, /function openMire\(\)/);
  // La mire vit dans Parametres > Affichage ; elle a quitte la fiche d avis le 11/11/2026.
  assert.match(app, /<Btn primary on=\{openMire\}>/);
  assert.match(app, /Card title="Diagnostic d’impression">/);
  assert.doesNotMatch(app, /<Btn on=\{openMire\}>/);
  const m = app.slice(app.indexOf('function mireDoc()'), app.indexOf('function openMire()'));
  assert.match(m, /width:210mm/);
  assert.match(m, /background:#fff/);
  for (const c of ['#ffffff', '#000000', '#e60012', '#00a04a', '#0068b7', '#0b1f3a']) assert.ok(m.includes(c), c);
  // Aucun aplat pleine page sombre dans la mire.
  assert.doesNotMatch(m, /height:296\.6mm;background:#0b1f3a/);
});

test('la version affichée dans l’app est la version servie, pas une étiquette figée', () => {
  const app = readFileSync(ROOT + 'index.html', 'utf8');
  const sw = readFileSync(ROOT + 'sw.js', 'utf8');
  const v = app.match(/window\.ESTIMO_VERSION='([0-9.]+)'/);
  assert.ok(v, 'version absente de index.html');
  assert.match(sw, new RegExp('estimo-v' + v[1].replace(/\./g, '\\.')));
  assert.match(app, /Estimation sur site · v\{window\.ESTIMO_VERSION/);
  assert.doesNotMatch(app, /Estimation sur site · V2\.5</); // l'ancienne étiquette figée
});

test('le mode impression retire l’interface de la page, même sans @media print', () => {
  const app = readFileSync(ROOT + 'index.html', 'utf8');
  // L'interface est masquée par une classe appliquée avant window.print() : un moteur
  // qui rend l'écran (iOS) ne peut donc pas sortir les onglets sombres sur le papier.
  assert.match(app, /html\.printing #root,html\.printing #boot,html\.printing noscript,html\.printing #upd\{display:none !important\}/);
  assert.match(app, /html\.printing #print-doc\{display:block !important/);
  assert.match(app, /function enterPrintMode\(\)\{document\.documentElement\.classList\.add\('printing'\)/);
  assert.match(app, /function exitPrintMode\(\)/);
  assert.match(app, /addEventListener\('afterprint',exitPrintMode\)/);
  assert.match(app, /enterPrintMode\(\);setTimeout\(printAvis/);
  assert.match(app, /id="print-bar"/);
});
