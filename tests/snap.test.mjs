// Tests des instantanés automatiques (js/snap.js) — seules les parties pures sont testées ici ;
// IndexedDB n'existe pas sous Node, la disponibilité est donc vérifiée explicitement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepLastN, stripMedias, cleanDossier, snapSupported, listSnapshots, putSnapshot, SNAP_MAX, SNAP_WITH_MEDIAS } from '../js/snap.js';

const dos = (id, at, medias = []) => ({ id, updated: at, at, client: { nom: id }, bien: {}, medias });

test('IndexedDB absent sous Node : le module se déclare indisponible sans lever', async () => {
  assert.equal(snapSupported(), false);
  assert.deepEqual(await listSnapshots(), []);
  assert.equal(await putSnapshot([dos('a', 1)]), null);
});

test('rétention : garde les plus récents, quel que soit l\'ordre d\'entrée', () => {
  const items = [dos('a', 10), dos('b', 40), dos('c', 30), dos('d', 20)];
  assert.deepEqual(keepLastN(items, 2).map((x) => x.id), ['b', 'c']);
  assert.deepEqual(keepLastN(items, 4).map((x) => x.id), ['b', 'c', 'd', 'a']);
  assert.deepEqual(keepLastN(items, SNAP_MAX).length, 4);
  assert.deepEqual(keepLastN([], 3), []);
});

test('rétention : stable à date égale', () => {
  const items = [dos('x', 5), dos('y', 5)];
  assert.equal(keepLastN(items, 1).length, 1);
});

test('photos retirées des instantanés anciens, compteur conservé', () => {
  const d = dos('a', 1, [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);
  const s = stripMedias(d);
  assert.deepEqual(s.medias, []);
  assert.equal(s._mediasCount, 3);
  assert.equal(s._mediasStripped, true);
  assert.equal(s.client.nom, 'a');         // le reste du dossier est intact
  assert.equal(d.medias.length, 3);        // l'original n'est pas modifié
});

test('restauration d\'un instantané : marqueurs internes retirés', () => {
  const s = stripMedias(dos('a', 1, [{ id: 'p1' }]));
  const c = cleanDossier(s);
  assert.equal(c._mediasStripped, undefined);
  assert.equal(c._mediasCount, undefined);
  assert.deepEqual(c.medias, []);
  const plein = dos('b', 2, [{ id: 'p9' }]);
  assert.equal(cleanDossier(plein), plein);
});

test('constantes de rétention cohérentes', () => {
  assert.ok(SNAP_MAX >= 3 && SNAP_MAX <= 20);
  assert.ok(SNAP_WITH_MEDIAS >= 1 && SNAP_WITH_MEDIAS < SNAP_MAX);
});
