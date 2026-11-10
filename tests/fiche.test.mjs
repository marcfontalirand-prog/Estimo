// Test de la fiche d'estimation remise au client (function fiche de src/app.template.html).
// La fiche est le livrable visible du produit : on vérifie son contenu réel, pas son intention.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tpl = fs.readFileSync(new URL('../src/app.template.html', import.meta.url), 'utf8');
const aj = fs.readFileSync(new URL('../js/ajust.js', import.meta.url), 'utf8').replace(/^export (const|function|async function) /gm, '$1 ');

const START = 'function fiche(d){';
const END = "return L.join('\\n')}";
const i = tpl.indexOf(START);
const j = tpl.indexOf(END, i);
assert.ok(i >= 0 && j > i, 'function fiche introuvable dans le template');
const ficheSrc = tpl.slice(i, j + END.length);

const HELPERS = `
const n=(v)=>{const x=parseFloat(String(v??'').replace(',','.').replace(/\\s/g,''));return isFinite(x)?x:null};
const eur=(v)=>v==null?'—':Math.round(v).toLocaleString('fr-FR')+' €';
const pct=(x)=>x==null?'—':(x*100).toFixed(2).replace('.',',')+' %';
const ajPct=(x)=>x==null?'—':(x>=0?'+':'')+(x*100).toFixed(1).replace('.',',')+' %';
const fmtDate=(t)=>new Date(t).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
const surfRef=(d)=>n(d.bien.carrez)||n(d.bien.habitable);
`;
const code = aj + HELPERS + ficheSrc + '\nexport { fiche, eur, ajPct };';
const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const { fiche, eur, ajPct } = mod;

const DVF = { type: 'appartement', n: 24, median: 4200, q1: 3800, q3: 4700, radius: 300, since: '2023-11-10', lastSale: '2025-12-31', source: 'DVF Etalab', fallback: false, comps: [] };
const base = (o = {}) => ({
  client: { type: 'Appartement', nom: 'Dupont', prenom: 'Marie', tel: '06 12 34 56 78', email: '', adresse: '12 boulevard Sadi Carnot, 06110 Le Cannet' },
  bien: { carrez: '65', habitable: '', etage: '4', terrasse: '12', vue: 'Mer', exposure: '' },
  technique: { dpe: 'G' }, financier: { prixAttendu: '' }, medias: [], dvf: null, loyer: null, ajust: {},
  ...o,
});

test('fiche sans comparatif DVF : pas de bloc estimation ajustée', () => {
  const txt = fiche(base());
  assert.ok(!txt.includes('ESTIMATION AJUSTÉE'));
  assert.ok(txt.includes('FICHE D’ESTIMATION'));
  assert.ok(txt.trim().endsWith('Estimation indicative, non contractuelle.'));
});

test('fiche avec DVF : bloc estimation ajustée présent et chiffré', () => {
  const d = base({ dvf: DVF });
  const txt = fiche(d);
  assert.ok(txt.includes('ESTIMATION AJUSTÉE'), 'bloc absent');
  // coefficients : étage +2 %, sans ascenseur -4 %, terrasse +4 %, vue mer +6 %, DPE G -8 % => total nul
  assert.ok(txt.includes('Étage élevé +2,0 %'), txt);
  assert.ok(txt.includes('Vue +6,0 %'));
  assert.ok(txt.includes('DPE -8,0 %'));
  assert.ok(txt.includes('Total ajustement : +0,0 %'));
  assert.ok(txt.includes('Prix au m² ajusté : ' + eur(4200)));
  assert.ok(txt.includes('Valeur estimée : ' + eur(273000)), 'valeur estimée absente');
  assert.ok(txt.includes('fourchette ' + eur(247000) + ' à ' + eur(305500)));
});

test('fiche : les décotes se répercutent sur la valeur', () => {
  const d = base({ bien: { carrez: '65', etage: '0' }, technique: { dpe: 'G', fissures: true }, dvf: DVF });
  const txt = fiche(d);
  // -5 % (RDC) -8 % (DPE) -5 % (fissures) = -18 %, pas de plafond
  assert.ok(txt.includes('Total ajustement : -18,0 %'), txt);
  assert.ok(txt.includes('Prix au m² ajusté : ' + eur(Math.round(4200 * 0.82))));
});

test('fiche : plafond de ±20 % signalé sur le document client', () => {
  const d = base({ bien: { carrez: '65', etage: '0', visavis: 'Proche', bruit: 'Bruyant' }, technique: { dpe: 'G', fissures: true, humidite: true, toiture: true }, dvf: DVF });
  const txt = fiche(d);
  assert.ok(txt.includes('(plafonné)'), 'le plafond doit être explicitement écrit');
  assert.ok(txt.includes('Total ajustement : -20,0 % (plafonné)'));
});

test('fiche : positionnement de l’agent visible et écart avec le prix attendu', () => {
  const d = base({ dvf: DVF, ajust: { manuel: 0.05 }, financier: { prixAttendu: '300000' } });
  const txt = fiche(d);
  assert.ok(txt.includes('Positionnement de l’agent : +5,0 %'));
  assert.ok(txt.includes('Écart prix attendu / estimation ajustée'));
  assert.ok(/Écart prix attendu \/ estimation ajustée : \d+,\d %/.test(txt));
});

test('fiche : sans surface, aucun chiffre en euros n’est avancé', () => {
  const d = base({ bien: { carrez: '', habitable: '' }, dvf: DVF });
  const txt = fiche(d);
  assert.ok(!txt.includes('ESTIMATION AJUSTÉE'), 'sans surface, pas de valeur estimée');
  assert.ok(!txt.includes('Valeur estimée'));
  assert.ok(txt.includes('Prix médian : ' + eur(4200) + ' /m²'), 'le marché brut reste cité');
});

test('ajPct : signe et format français', () => {
  assert.equal(ajPct(0.06), '+6,0 %');
  assert.equal(ajPct(-0.08), '-8,0 %');
  assert.equal(ajPct(0), '+0,0 %');
});
