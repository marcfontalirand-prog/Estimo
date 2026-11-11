// Interface V2.5.5 : onglet Financier nettoyé, avis de valeur en bas, galerie photo.
// Ces tests lisent le template et vérifient des décisions d'interface précises —
// ils échouent si une carte redondante revient ou si un champ média reprend le mauvais sélecteur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tpl = fs.readFileSync(new URL('../src/app.template.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const between = (a, b) => {
  const i = tpl.indexOf(a);
  const j = tpl.indexOf(b, i);
  assert.ok(i >= 0 && j > i, 'bloc introuvable : ' + a);
  return tpl.slice(i, j);
};
const tools = between('function Tools({d,setDvf,update}){', 'function Editor({d,update,back}){');

test('Financier : la carte « Fiche d’estimation » ne double plus le bandeau', () => {
  assert.doesNotMatch(tools, /Card title="Fiche d’estimation"/);
  assert.doesNotMatch(tools, /data-testid="fiche"/);
  // La fiche reste produite et accessible par le bandeau de partage.
  assert.match(app, /const B=\(\{on,href,icon,label,cls=''\}\)/);
  assert.match(tpl, /<B on=\{\(\)=>shareFiche\(d,say\)\} icon="📄" label="Fiche"/);
  // Et par WhatsApp / Email / Copier, qui reprennent le même texte.
  assert.match(tpl, /const waLink=\(d\)=>/);
  assert.match(tpl, /const mailLink=\(d\)=>/);
});

test('Financier : comparatif, ajustements, puis l’avis de valeur en bas', () => {
  const iDvf = tools.indexOf('<DvfPanel');
  const iAjust = tools.indexOf('<AjustPanel');
  const iAvis = tools.indexOf('<AvisCard');
  assert.ok(iDvf >= 0 && iAjust >= 0 && iAvis >= 0, 'un des panneaux manque : ' + tools);
  assert.ok(iDvf < iAjust, 'le comparatif doit précéder les ajustements');
  assert.ok(iAjust < iAvis, 'l’avis de valeur doit être en dernier');
  // Le texte d'aide de l'avis renvoie bien vers un comparatif situé au-dessus.
  assert.match(tpl, /Lancez le comparatif DVF ci-dessus, puis revenez ici\./);
  assert.doesNotMatch(tpl, /Lancez le comparatif DVF ci-dessous/);
});

test('Médias : le bouton Galerie ouvre la galerie, pas le sélecteur de fichiers', () => {
  const gallery = tpl.match(/<input ref=\{fileRef\}[\s\S]*?\/>/);
  assert.ok(gallery, 'champ galerie introuvable');
  const g = gallery[0];
  assert.match(g, /accept="image\/\*"/, 'sans accept image/*, Android ouvre le sélecteur de fichiers');
  assert.doesNotMatch(g, /\bmultiple\b/, 'multiple fait retomber certains navigateurs sur le sélecteur de fichiers');
  assert.doesNotMatch(g, /\bcapture\b/, 'capture ouvrirait l’appareil photo au lieu de la galerie');
  assert.match(g, /data-testid="gallery"/);
});

test('Médias : la sélection multiple reste disponible, à part', () => {
  const multi = tpl.match(/<input ref=\{multiRef\}[\s\S]*?\/>/);
  assert.ok(multi, 'champ multi introuvable');
  assert.match(multi[0], /\bmultiple\b/);
  assert.match(multi[0], /accept="image\/\*"/);
  const refDecl = tpl.match(/const fileRef=useRef\(\),camRef=useRef\(\),multiRef=useRef\(\);/);
  assert.ok(refDecl, 'multiRef doit être déclaré avec les autres champs');
  assert.match(tpl, /onClick=\{\(\)=>multiRef\.current\.click\(\)\}/);
  // Le bouton appareil photo garde son capture, lui.
  const cam = tpl.match(/<input ref=\{camRef\}[\s\S]*?\/>/);
  assert.ok(cam && /capture="environment"/.test(cam[0]));
});

test('les champs média ne fuient pas hors du rendu (les trois inputs sont présents)', () => {
  for (const id of ['gallery', 'gallery-multi']) assert.ok(app.includes('data-testid="' + id + '"'), id);
  assert.ok(app.includes('capture="environment"'));
});
