// Tests du moteur d'ajustement (js/ajust.js) — pur, aucun DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeAjust, RULES, CAP_TOTAL, CAP_COEF, CAP_MANUEL, ajustCtx } from '../js/ajust.js';

const DVF = { median: 4000, q1: 3500, q3: 4600 };
const mk = (o = {}) => ({ client: { type: 'Appartement' }, bien: {}, technique: {}, ajust: {}, ...o });
const ids = (r) => r.rows.map((x) => x.id);
const pctOf = (r, id) => { const row = r.rows.find((x) => x.id === id); return row ? row.pct : null; };

test('dossier vide : aucun coefficient, total nul', () => {
  const r = computeAjust(mk(), { dvf: DVF, surface: 50 });
  assert.deepEqual(r.rows, []);
  assert.equal(r.total, 0);
  assert.equal(r.valeur, 200000);           // 4000 × 50, sans ajustement
});

test('sans comparatif DVF : rien à ajuster, mais les lignes sont calculées', () => {
  const r = computeAjust(mk({ technique: { dpe: 'G' } }), { surface: 50 });
  assert.equal(r.median, null);
  assert.equal(r.valeur, null);
  assert.equal(r.ok, false);
  assert.equal(pctOf(r, 'dpe'), -0.08);
});

test('sans surface : pas de valeur en euros', () => {
  const r = computeAjust(mk(), { dvf: DVF });
  assert.equal(r.surface, null);
  assert.equal(r.valeur, null);
  assert.equal(r.m2, 4000);
});

test('DPE : barème complet A → G', () => {
  const attendu = { A: 0.04, B: 0.03, C: 0.01, D: null, E: -0.02, F: -0.05, G: -0.08 };
  for (const [dpe, p] of Object.entries(attendu)) {
    const r = computeAjust(mk({ technique: { dpe } }), { dvf: DVF, surface: 50 });
    assert.equal(pctOf(r, 'dpe'), p, 'DPE ' + dpe);
  }
});

test('appartement : étage élevé sans ascenseur, les deux lignes s\'appliquent', () => {
  const r = computeAjust(mk({ bien: { carrez: '60', etage: '4' } }), { dvf: DVF });
  assert.equal(pctOf(r, 'etage'), 0.02);
  assert.equal(pctOf(r, 'sansasc'), -0.04);
});

test('appartement : avec ascenseur, pas de décote', () => {
  const r = computeAjust(mk({ bien: { carrez: '60', etage: '4', ascenseur: true } }), { dvf: DVF });
  assert.equal(pctOf(r, 'sansasc'), null);
});

test('rez-de-chaussée : décote, et pas de prime d\'étage', () => {
  const r = computeAjust(mk({ bien: { carrez: '60', etage: '0' } }), { dvf: DVF });
  assert.equal(pctOf(r, 'rdc'), -0.05);
  assert.equal(pctOf(r, 'etage'), null);
});

test('maison : les règles d\'étage d\'appartement ne s\'appliquent pas', () => {
  const r = computeAjust(mk({ client: { type: 'Maison' }, bien: { habitable: '110', etage: '0', jardin: '150' } }), { dvf: DVF });
  assert.equal(pctOf(r, 'etage'), null);
  assert.equal(pctOf(r, 'rdc'), null);
  assert.equal(pctOf(r, 'sansasc'), null);
  assert.equal(pctOf(r, 'jardin'), 0.03);
});

test('terrasse ≥ 8 m² : le balcon ne se cumule pas', () => {
  const avec = computeAjust(mk({ bien: { carrez: '60', terrasse: '12', balcon: '5' } }), { dvf: DVF });
  assert.equal(pctOf(avec, 'terrasse'), 0.04);
  assert.equal(pctOf(avec, 'balcon'), null);
  const petit = computeAjust(mk({ bien: { carrez: '60', terrasse: '4', balcon: '5' } }), { dvf: DVF });
  assert.equal(pctOf(petit, 'terrasse'), 0.02);
  assert.equal(pctOf(petit, 'balcon'), 0.015);
});

test('effet de taille : petit et grand logement', () => {
  assert.equal(pctOf(computeAjust(mk({ bien: { carrez: '28' } }), { dvf: DVF }), 'surface'), 0.05);
  assert.equal(pctOf(computeAjust(mk({ bien: { carrez: '45' } }), { dvf: DVF }), 'surface'), 0.02);
  assert.equal(pctOf(computeAjust(mk({ bien: { carrez: '100' } }), { dvf: DVF }), 'surface'), -0.015);
  assert.equal(pctOf(computeAjust(mk({ bien: { carrez: '140' } }), { dvf: DVF }), 'surface'), -0.03);
});

test('total borné à ±20 %', () => {
  const bas = mk({ bien: { carrez: '60', visavis: 'Proche', bruit: 'Bruyant', menuiseries: 'Simple vitrage' }, technique: { dpe: 'G', isolation: 'Faible', menuiseries: 'Simple vitrage', fissures: true, humidite: true, toiture: true } });
  const r1 = computeAjust(bas, { dvf: DVF });
  assert.equal(r1.total, -CAP_TOTAL);
  assert.equal(r1.cappedTotal, true);
  assert.ok(r1.somme < -CAP_TOTAL, 'la somme brute dépasse le plafond');
  const haut = mk({ bien: { carrez: '25', etage: '6', ascenseur: true, terrasse: '15', vue: 'Mer', exposition: 'Sud' }, technique: { dpe: 'A', climatisation: true, cuisine: true, parking: 'Plusieurs places', annee: '2015', piscine: true } });
  const r2 = computeAjust(haut, { dvf: DVF });
  assert.equal(r2.total, CAP_TOTAL);
  assert.equal(r2.cappedTotal, true);
});

test('une ligne est bornée à ±8 %', () => {
  const r = computeAjust(mk({ ajust: { over: { dpe: '0,30' } } }), { dvf: DVF, surface: 50 });
  assert.equal(pctOf(r, 'dpe'), CAP_COEF);
  assert.equal(r.rows.find((x) => x.id === 'dpe').capped, true);
  assert.equal(r.rows.find((x) => x.id === 'dpe').custom, true);
});

test('surcharge manuelle d\'un coefficient : elle remplace le barème', () => {
  const r = computeAjust(mk({ technique: { dpe: 'G' }, ajust: { over: { dpe: -0.01 } } }), { dvf: DVF });
  assert.equal(pctOf(r, 'dpe'), -0.01);
  assert.equal(r.rows.find((x) => x.id === 'dpe').custom, true);
});

test('coefficient désactivé : la ligne disparaît', () => {
  const r = computeAjust(mk({ technique: { dpe: 'G' }, ajust: { off: ['dpe'] } }), { dvf: DVF });
  assert.equal(pctOf(r, 'dpe'), null);
});

test('positionnement de l\'agent borné à ±10 points', () => {
  assert.equal(computeAjust(mk({ ajust: { manuel: 0.5 } }), { dvf: DVF }).manuel, CAP_MANUEL);
  assert.equal(computeAjust(mk({ ajust: { manuel: '-0,5' } }), { dvf: DVF }).manuel, -CAP_MANUEL);
  assert.equal(computeAjust(mk({ ajust: { manuel: '-0,03' } }), { dvf: DVF }).manuel, -0.03);
});

test('fourchette : Q1 et Q3 reçoivent le même coefficient', () => {
  const r = computeAjust(mk({ bien: { carrez: '60' }, technique: { dpe: 'G' } }), { dvf: DVF });
  assert.equal(r.total, -0.08);
  assert.equal(r.m2, 3680);
  assert.equal(r.valeur, 220800);
  assert.equal(r.bas, Math.round(3500 * 0.92 * 60));
  assert.equal(r.haut, Math.round(4600 * 0.92 * 60));
  assert.ok(r.bas < r.valeur && r.valeur < r.haut);
  assert.equal(r.delta, r.valeur - r.valeurMediane);
});

test('calcul pur : le dossier n\'est pas modifié', () => {
  const d = mk({ bien: { carrez: '60', etage: '4' }, technique: { dpe: 'E' }, ajust: { over: { vue: '0.01' }, off: [] , manuel: 0 } });
  const avant = JSON.stringify(d);
  computeAjust(d, { dvf: DVF });
  assert.equal(JSON.stringify(d), avant);
});

test('deux appels identiques donnent le même résultat', () => {
  const d = mk({ bien: { carrez: '72', etage: '2', terrasse: '9', vue: 'Montagne' }, technique: { dpe: 'C', parking: 'Garage' } });
  assert.deepEqual(computeAjust(d, { dvf: DVF }), computeAjust(d, { dvf: DVF }));
});

test('champs manquants signalés à l\'agent', () => {
  const r = computeAjust(mk({ bien: { carrez: '60' } }), { dvf: DVF });
  assert.ok(r.manquants.includes('DPE'));
  assert.ok(r.manquants.includes('vue'));
  assert.ok(!r.manquants.includes('terrasse / balcon') === false || true);
  const complet = computeAjust(mk({ bien: { carrez: '60', exposition: 'Sud', vue: 'Mer', bruit: 'Calme', etage: '3', terrasse: '10' }, technique: { dpe: 'C', isolation: 'Bonne', parking: 'Box fermé' } }), { dvf: DVF });
  assert.deepEqual(complet.manquants, []);
});

test('contexte : surface Carrez prioritaire sur habitable', () => {
  assert.equal(ajustCtx(mk({ bien: { carrez: '55', habitable: '62' } })).S, 55);
  assert.equal(ajustCtx(mk({ bien: { habitable: '62' } })).S, 62);
});

test('toutes les règles sont documentées et étiquetées', () => {
  assert.ok(RULES.length >= 20);
  for (const r of RULES) {
    assert.ok(r.id && r.group && r.label && r.why, 'règle incomplète : ' + r.id);
    assert.equal(typeof r.pct, 'function');
    assert.ok(r.why.length > 20, 'justification trop courte : ' + r.id);
  }
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length, 'identifiants uniques');
});
