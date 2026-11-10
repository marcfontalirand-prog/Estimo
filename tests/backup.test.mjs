// Test des fonctions de sauvegarde extraites de src/app.template.html (aucun DOM requis).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../src/app.template.html', import.meta.url), 'utf8');
const grab = (name) => {
  const start = src.indexOf('const ' + name);
  if (start < 0) throw new Error('fonction ' + name + ' absente');
  // fin de la fonction = ';' suivi d'un saut de ligne au niveau 0
  let i = start, depth = 0, inS = null;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (inS) { if (ch === '\\') i++; else if (ch === inS) inS = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { inS = ch; continue; }
    if ('{(['.includes(ch)) depth++;
    else if ('})]'.includes(ch)) depth--;
    else if (ch === ';' && depth === 0) break;
  }
  return src.slice(start, i + 1);
};

const code = grab('readBackup') + '\n' + grab('mergeDossiers') + '\nexport { readBackup, mergeDossiers };';
const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const { readBackup, mergeDossiers } = mod;

const dos = (id, updated, nom = 'Dupont') => ({ id, updated, client: { nom, prenom: '', type: 'Appartement' }, bien: {} });

// 1. fichier au format Estimo
const payload = JSON.stringify({ app: 'Estimo', format: 'estimo.v2.backup', dossiers: [dos('a', 1)] });
assert.equal((await readBackup({ text: async () => payload })).length, 1);

// 2. tableau nu accepté
assert.equal((await readBackup({ text: async () => JSON.stringify([dos('b', 1)]) })).length, 1);

// 3. fichier étranger refusé
await assert.rejects(() => readBackup({ text: async () => JSON.stringify({ hello: 1 }) }), /non reconnu/);
// 4. JSON invalide refusé
await assert.rejects(() => readBackup({ text: async () => 'pas du json' }), /JSON|Unexpected/);
// 5. dossier sans id/client ignoré
await assert.rejects(() => readBackup({ text: async () => JSON.stringify({ dossiers: [{ foo: 1 }] }) }), /aucun dossier valide/);

// 6. fusion : ajout, mise à jour si plus récent, sinon on garde l'existant
const cur = [dos('a', 100, 'Ancien'), dos('b', 500)];
const inc = [dos('a', 200, 'Récent'), dos('b', 300, 'Vieux'), dos('c', 10)];
const r = mergeDossiers(cur, inc);
assert.equal(r.added, 1);
assert.equal(r.upd, 1);
assert.equal(r.list.length, 3);
assert.equal(r.list.find((d) => d.id === 'a').client.nom, 'Récent'); // version plus récente gagnante
assert.equal(r.list.find((d) => d.id === 'b').updated, 500);        // l'existant plus récent est conservé
assert.deepEqual(r.list.map((d) => d.updated), [500, 200, 10]);      // tri du plus récent au plus ancien

// 7. fusion idempotente (restaurer deux fois le même fichier ne duplique rien)
const r2 = mergeDossiers(r.list, inc);
assert.equal(r2.list.length, 3);
assert.equal(r2.added, 0);

// 8. aucun dossier : la fusion ne perd rien
assert.equal(mergeDossiers([], [dos('z', 1)]).list.length, 1);

console.log('8/8 tests sauvegarde OK');
