// Partage de l'avis de valeur : la carte garde deux sorties (Aperçu, Partager),
// la feuille en propose six. Ces tests échouent si un bouton perdu revient, si un
// envoi part sans geste de l'utilisateur, ou si la feuille se retrouve piégée dans
// le carrousel transformé au lieu d'être montée dans le <body>.
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
const carte = between('function AvisCard({d}){', '// Onglet Financier');
const feuille = between('function AvisPartage({d,A,onClose}){', 'function AvisCard({d}){');
const partage = between('function avisResume(d,A){', 'function AvisPartage({d,A,onClose}){');

test('Carte : deux sorties seulement, Aperçu et Partager', () => {
  const btns = carte.match(/<Btn\b/g) || [];
  assert.equal(btns.length, 2, 'la carte doit porter exactement deux boutons : ' + btns.length);
  assert.match(carte, /🔍 Aperçu<\/Btn>/);
  assert.match(carte, /📤 Partager<\/Btn>/);
  // Les trois anciens boutons ont disparu, pas seulement déplacés dans le texte.
  assert.doesNotMatch(carte, /Avis de valeur \(PDF\)<\/Btn>/);
  assert.doesNotMatch(carte, /Télécharger le .html<\/Btn>/);
  assert.doesNotMatch(tpl, /Télécharger le .html/);
});

test('Carte : Partager sans comparatif renvoie vers le message d’indisponibilité', () => {
  assert.match(carte, /if\(ok\)setPart\(true\);else openAvis\(d,'view'\)/);
  assert.match(carte, /Avis de valeur indisponible\./);
});

test('Feuille : six sorties nommées, une par geste', () => {
  for (const id of ['partage-imprimante', 'partage-whatsapp', 'partage-email', 'partage-fichier', 'partage-copier', 'partage-systeme']) {
    assert.match(feuille, new RegExp("id:'" + id + "'"), 'sortie manquante : ' + id);
  }
  const labels = ['Imprimante', 'WhatsApp', 'E-mail', 'Fichier .html', 'Copier le résumé', 'Autres apps'];
  for (const l of labels) assert.match(feuille, new RegExp("label:'" + l.replace('.', '\\.') + "'"), 'libellé manquant : ' + l);
});

test('Feuille : l’imprimante passe par le chemin d’impression existant', () => {
  assert.match(feuille, /on:\(\)=>\{onClose\(\);openAvis\(d,'print'\)\}/);
  // Et le fichier par le téléchargement existant, sans réécriture.
  assert.match(feuille, /on:\(\)=>\{onClose\(\);saveAvis\(d\)\}/);
});

test('WhatsApp et e-mail : résumé chiffré, encodé, jamais un envoi automatique', () => {
  assert.match(partage, /const waAvisLink=\(d,A\)=>`https:\/\/wa\.me\/\?text=\$\{encodeURIComponent\(avisResume\(d,A\)\)\}`/);
  assert.match(partage, /const mailAvisLink=\(d,A\)=>`mailto:\$\{encodeURIComponent\(d\.client\.email\|\|''\)\}\?subject=/);
  assert.match(partage, /&body=\$\{encodeURIComponent\(avisResume\(d,A\)\)\}/);
  // Ce sont des liens <a> : l'utilisateur clique, l'app n'envoie rien elle-même.
  assert.match(feuille, /href:\s*waAvisLink\(d,A\)/);
  assert.match(feuille, /href:\s*mailAvisLink\(d,A\)/);
  assert.doesNotMatch(partage, /fetch\(|XMLHttpRequest|navigator\.sendBeacon/);
});

test('Feuille du système : fichier proposé seulement si le navigateur l’accepte', () => {
  assert.match(partage, /if\(navigator\.canShare\)\{/);
  assert.match(partage, /navigator\.canShare\(\{files:\[f\]\}\)/);
  assert.match(partage, /await navigator\.share\(\{title:'Avis de valeur',text:txt\}\)/);
  // Sans partage système, le résumé est copié : aucune sortie muette.
  assert.match(partage, /await copyText\(txt\);return 'copy'/);
});

test('Feuille : montée dans le <body>, sinon le carrousel transformé la piège', () => {
  // Le carrousel porte un transform : un fixed à l'intérieur serait calé sur lui.
  assert.match(tpl, /className="track" style=\{\{transform:`translateX\(calc\(/);
  assert.match(feuille, /return dansBody\(<div className="fixed inset-0 z-50/);
  assert.match(tpl, /function dansBody\(el\)\{try\{if\(typeof ReactDOM!=='undefined'&&ReactDOM\.createPortal\)return ReactDOM\.createPortal\(el,document\.body\)/);
  // Repli sans portail : le rendu n'explose pas si createPortal manque.
  assert.match(tpl, /catch\(e\)\{\}return el\}/);
});

test('Mode test : nommé, transmis au document, et annoncé dans la feuille', () => {
  assert.match(tpl, /const AVIS_DEMO=true;/);
  assert.match(tpl, /demo:AVIS_DEMO/);
  assert.match(feuille, /\{AVIS_DEMO&&<p[^>]*><b>Document de test :<\/b>/);
  assert.match(feuille, /ne pas diffuser/);
});

test('Résumé : les chiffres viennent du calcul, les vides ne laissent pas de trou', () => {
  assert.match(partage, /if\(A\.valeur\)L\.push\('Valeur estimée : '/);
  assert.match(partage, /if\(A\.m2\)L\.push\(A\.m2\.toLocaleString\('fr-FR'\)/);
  assert.match(partage, /const contact=\[[\s\S]*?\]\.filter\(Boolean\)/);
  assert.match(partage, /if\(contact\.length\)\{L\.push\(''\);L\.push\(\.\.\.contact\)\}/);
  // Aucune mention du document de 18 pages comme si elle partait avec le message.
  assert.match(partage, /Document détaillé de 18 pages sur demande\./);
  assert.match(feuille, /WhatsApp et l’e-mail emportent les chiffres clés, pas les 18 pages\./);
});

test('Le fichier construit contient bien la nouvelle carte', () => {
  assert.match(app, /function AvisPartage\(/);
  assert.match(app, /📤 Partager/);
  assert.doesNotMatch(app, /Télécharger le .html/);
  assert.doesNotMatch(app, /Avis de valeur \(PDF\)/);
});
