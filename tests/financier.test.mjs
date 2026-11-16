// Écart affiché sous le prix au m² (onglet Financier).
// La formule est extraite du template et exécutée : un prix total comparé à un prix
// au m² (375 000 / 6 000 − 1 = 6 150 %) doit faire échouer ce test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tpl = fs.readFileSync(new URL('../src/app.template.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const ligne = tpl.split('\n').find((l) => l.includes('data-testid="ecartajuste"'));
assert.ok(ligne, 'ligne d’écart ajusté introuvable');
const m = ligne.match(/· écart \{([^}]+)\}/);
assert.ok(m, 'formule d’écart introuvable');
const formule = m[1];

const evalue = (vars) => Function(...Object.keys(vars), 'return ' + formule)(...Object.values(vars));

test('Financier : l’écart compare le prix au m² affiché à l’estimation ajustée', () => {
  // 375 000 € sur 68 m², estimation ajustée 6 000 €/m² (valeur 408 000 €).
  const P = 375000;
  const S = 68;
  const A = { m2: 6000, valeur: 6000 * 68, surface: 68 };
  assert.equal(evalue({ P, S, A }), '-8,1');
  assert.equal(((P / A.m2 - 1) * 100).toFixed(1).replace('.', ','), '6150,0');
  assert.ok(app.includes(formule), 'index.html doit être régénéré après le correctif');
});

test('Financier : sans ajustement, l’écart reste le prix au m² contre la médiane DVF', () => {
  const md = ligne.match(/Médiane DVF : \{eur\(d\.dvf\.median\)\}\/m² · écart \{([^}]+)\}/);
  assert.ok(md, 'formule d’écart DVF introuvable');
  const P = 375000;
  const S = 68;
  const d = { dvf: { median: 6000 } };
  const affiche = Function('P', 'S', 'd', 'return ' + md[1])(P, S, d);
  assert.equal(affiche, '-8,1');
});
