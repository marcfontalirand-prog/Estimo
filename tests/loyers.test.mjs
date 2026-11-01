import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rentEstimate, pickIndicator } from '../js/loyers.js';
const data = JSON.parse(fs.readFileSync(new URL('../data/loyers/06.json', import.meta.url)));
test('indicateur selon type et pièces', () => {
  const c = data.communes['06030'];
  assert.equal(pickIndicator(c, 'appartement', 2).key, 'app12');
  assert.equal(pickIndicator(c, 'appartement', 3).key, 'app3');
  assert.equal(pickIndicator(c, 'maison', 5).key, 'mai');
});
test('loyer et rendement brut Le Cannet 65 m² T3', () => {
  const r = rentEstimate(data, { citycode: '06030', type: 'appartement', surface: 65, pieces: 3, prixVente: 223535 });
  assert.equal(r.vide, Math.round(data.communes['06030'].app3[0] * 65));
  assert.ok(r.meuble > r.vide && r.rendementVide > 0.04 && r.rendementVide < 0.09);
  assert.equal(r.encadrement, false); assert.equal(r.annee, 2025);
});
test('erreurs', () => { assert.throws(() => rentEstimate(data, { citycode: '75056', type: 'appartement', surface: 50 })); });
