import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const app = readFileSync(ROOT + 'index.html', 'utf8');
const param = app.slice(app.indexOf('function Parametres('), app.indexOf('function App(){'));

test('paramètres : quatre sections rangées, plus une seule page en vrac', () => {
  assert.match(app, /const PARAM_SECS=\[\[.profil.,.Profil.\],\[.donnees.,.Données.\],\[.affichage.,.Affichage.\],\[.application.,.Application.\]\]/);
  assert.match(param, /data-testid="param-nav"/);
  for (const s of ["sec==='profil'", "sec==='donnees'", "sec==='affichage'", "sec==='application'"]) assert.ok(param.includes(s), s);
  // La sauvegarde automatique et les fichiers restent dans Données.
  assert.match(param, /Card title="Sauvegarde automatique"/);
  assert.match(param, /Card title="Fichier de sauvegarde"/);
});

test('paramètres : la mire d’impression est dans Affichage et lance openMire', () => {
  const aff = param.slice(param.indexOf("sec==='affichage'"), param.indexOf("sec==='application'"));
  assert.match(aff, /Card title="Diagnostic d’impression"/);
  assert.match(aff, /<Btn primary on=\{openMire\}>/);
  // Elle n'est plus un bouton de la fiche d'avis.
  assert.doesNotMatch(app, /<Btn on=\{openMire\}>/);
});

test('paramètres : thème à trois états, mémorisé tel quel et appliqué', () => {
  assert.match(app, /const THEMES=\[\[.light.,.Clair.\],\[.dark.,.Sombre.\],\[.auto.,.Auto.\]\]/);
  assert.match(app, /const dark=theme==='auto'\?sysDark:theme==='dark';/);
  assert.match(app, /localStorage\.setItem\(THEME,theme\)/);
  // Le theme ne se change plus que dans les parametres : plus de raccourci sur l accueil.
  const accueil = app.slice(app.indexOf('function Home('), app.indexOf('function Editor('));
  assert.ok(accueil.length > 500, 'section accueil introuvable');
  assert.ok(!accueil.includes('Mode sombre'), 'le bouton lune est encore present sur l accueil');
  assert.ok(!accueil.includes('🌙'), 'l icone lune est encore presente sur l accueil');
  assert.ok(accueil.includes('aria-label="Param\u00e8tres"'), 'le bouton Parametres doit rester sur l accueil');
  assert.ok(!/setDark=/.test(app), 'un raccourci de theme subsiste sur l accueil');
  assert.match(app, /<Parametres [^>]*theme=\{theme\} setTheme=\{setTheme\}/);
});

test('paramètres : la version et la date DVF sont dans Application', () => {
  const ap = param.slice(param.indexOf("sec==='application'"));
  assert.match(ap, /Version/);
  assert.match(ap, /fmtDate\(EstimoDVF\.DATA_CUTOFF\)/);
  assert.match(ap, /À propos/);
});

test('paramètres : la détection du mode sombre forcé est dans Affichage', () => {
  assert.match(app, /function forceDarkDetect\(\)/);
  // Technique documentée par Chrome : un élément « canvas » déclaré clair doit rester blanc.
  assert.match(app, /background-color:canvas;color-scheme:light/);
  const aff = param.slice(param.indexOf("sec==='affichage'"), param.indexOf("sec==='application'"));
  assert.match(aff, /data-testid="forcage"/);
});

test('détection : assombri, normal, ou non testable', () => {
  // La tranche s'arrête au premier composant qui suit la détection, sans dépendre de son nom.
  const fin = ['function ProfilPanel(', 'function Parametres('].map((x) => app.indexOf(x)).filter((x) => x > 0).sort((a, b) => a - b)[0];
  const src = app.slice(app.indexOf('// Mode sombre force'), fin);
  const evalWith = (bg) => {
    const el = { style: {}, remove() {} };
    const doc = { createElement: () => el, body: { appendChild() {} } };
    const gcs = () => { if (bg === 'boom') throw new Error('nope'); return { backgroundColor: bg }; };
    return new Function('document', 'getComputedStyle', src + '\nreturn forceDarkDetect()')(doc, gcs);
  };
  assert.equal(evalWith('rgb(36, 36, 36)'), true, 'page assombrie : doit alerter');
  assert.equal(evalWith('rgb(1, 1, 1)'), true, 'noir forcé : doit alerter');
  assert.equal(evalWith('rgb(255, 255, 255)'), false, 'blanc : rien à signaler');
  assert.equal(evalWith('boom'), null, 'navigateur muet : pas de conclusion');
  assert.equal(evalWith('rgba(255, 255, 255, 0.9)'), false, 'blanc translucide : rien à signaler');
});
