import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate, validate } from '../js/engine.js';

const base = { type: 'appartement', surface: 60, prixM2: 5000, pieces: 3, chambres: 2 };

test('estimation neutre = surface × prix/m²', () => {
  const r = estimate(base);
  assert.ok(r.ok);
  assert.equal(r.central, 300000);
  assert.ok(r.basse < r.central && r.haute > r.central);
  assert.equal(r.prixM2Final, 5000);
});
test('validation : champs obligatoires et cohérence', () => {
  assert.equal(validate({ ...base, surface: '' }).ok, false);
  assert.ok(validate({ ...base, chambres: 3 }).errors.chambres);
  assert.ok(validate({ ...base, type: 'chateau' }).errors.type);
  assert.ok(validate({ ...base, annee: 3000 }).errors.annee);
  assert.ok(validate({ ...base, balcon: -5 }).errors.balcon);
});
test('DPE G décote, vue mer surcote', () => {
  assert.ok(estimate({ ...base, dpe: 'G' }).central < 300000);
  assert.ok(estimate({ ...base, vue: 'mer' }).central > 300000);
});
test('annexes pondérées et parking additif', () => {
  const r = estimate({ ...base, terrasse: 10, parking: 'garage' });
  assert.equal(r.central, Math.round((300000 + 10 * 0.4 * 5000 + 35000) / 1000) * 1000);
});
test('étage élevé sans ascenseur décote', () => {
  assert.ok(estimate({ ...base, etage: 5, ascenseur: false }).central < estimate({ ...base, etage: 5, ascenseur: true }).central);
});
test('coefficient global plafonné', () => {
  const r = estimate({ ...base, etat: 'neuf', dpe: 'A', vue: 'mer', exposition: 'sud', piscine: true, coefManuel: 1.3, etage: 6, ascenseur: true, dernierEtage: true });
  assert.ok(r.coefTotal <= 1.4);
});
test('fourchette se resserre avec données complètes et prix vérifié', () => {
  const vague = estimate(base);
  const precis = estimate({ ...base, etat: 'bon', dpe: 'D', exposition: 'ouest', vue: 'standard', annee: 1990, etage: 2, prixVerifie: true });
  assert.ok(precis.incertitude < vague.incertitude);
});
test('maison : terrain au-delà de l’emprise', () => {
  const r = estimate({ type: 'maison', surface: 100, prixM2: 6000, pieces: 4, terrain: 600 });
  assert.equal(r.central, Math.round((600000 + 500 * 0.04 * 6000) / 1000) * 1000);
});
