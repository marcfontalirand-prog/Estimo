// Tests du profil d'agence (js/profil.js) et de son injection dans l'avis de valeur.
// Deux exigences distinctes : ce que l'utilisateur saisit sort sur le document, et
// ce qu'il ne saisit pas n'est jamais remplacé par une valeur inventée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PROFIL_GROUPES, PROFIL_CHAMPS, PROFIL_CLES, PROFIL_VERSION,
  profilVide, nettoyerProfil, profilAgence, completude, resumeProfil, envelopper, deverser,
} from '../js/profil.js';
import { analyse, normalizeRow, DATA_CUTOFF } from '../js/dvf.js';
import { computeAjust } from '../js/ajust.js';
import { buildAvis } from '../js/pdfdoc.js';

const ROOT = new URL('../', import.meta.url).pathname;

// ---------- le module ----------

test('profil : tous les champs existent, vides, et rien n’a de valeur par défaut', () => {
  const v = profilVide();
  assert.equal(Object.keys(v).length, PROFIL_CLES.length);
  for (const k of PROFIL_CLES) assert.equal(v[k], '', k);
  // Aucun champ ne porte de valeur d'exemple : ce serait une identité inventée.
  for (const g of PROFIL_GROUPES) for (const c of g.champs) {
    assert.equal(typeof c.l, 'string');
    assert.ok(!('value' in c) && !('defaut' in c), 'pas de valeur par défaut sur ' + c.k);
  }
  assert.equal(PROFIL_VERSION, 1);
});

test('profil : nettoyage stable, champs inconnus ignorés, rien de deviné', () => {
  const p = nettoyerProfil({ nom: '  Laforêt Le Cannet  ', agent: 'Marc\nFontalirand', pirate: 'x', tel: 4 });
  assert.equal(p.nom, 'Laforêt Le Cannet');
  assert.equal(p.agent, 'Marc\nFontalirand');
  assert.ok(!('pirate' in p));
  assert.equal(p.tel, '4');
  assert.deepEqual(nettoyerProfil(p), p, 'nettoyer deux fois donne le même objet');
  assert.deepEqual(nettoyerProfil(null), profilVide());
  assert.deepEqual(nettoyerProfil('texte'), profilVide());
});

test('profil : la traduction en bloc agence met null là où rien n’est saisi', () => {
  const a = profilAgence({ nom: 'Laforêt Le Cannet', agent: 'Marc Fontalirand', tva: '   ' });
  assert.equal(a.nom, 'Laforêt Le Cannet');
  assert.equal(a.agent, 'Marc Fontalirand');
  assert.equal(a.tva, null, 'un champ blanc devient null, pas une chaîne vide');
  assert.equal(a.mediateur, null);
});

test('profil : avancement de la saisie, champs obligatoires nommés', () => {
  const vide = completude({});
  assert.equal(vide.faits, 0);
  assert.equal(vide.ok, false);
  assert.ok(vide.total >= 10);
  assert.ok(vide.manquants.includes('Nom de l’agence'));
  assert.ok(vide.manquants.includes('Médiateur de la consommation'));

  const plein = profilVide();
  for (const f of PROFIL_CHAMPS) if (f.req) plein[f.k] = 'x';
  const c = completude(plein);
  assert.equal(c.ok, true);
  assert.equal(c.faits, c.total);
  assert.deepEqual(c.manquants, []);
  assert.equal(c.mentionsOk, true);
  assert.equal(c.essentielsOk, true);
});

test('profil : le résumé d’en-tête ne bricole pas un nom absent', () => {
  assert.equal(resumeProfil({ agent: 'Marc Fontalirand', nom: 'Laforêt Le Cannet' }), 'Marc Fontalirand · Laforêt Le Cannet');
  assert.equal(resumeProfil({ agent: 'Marc Fontalirand' }), 'Marc Fontalirand');
  assert.equal(resumeProfil({}), '');
});

test('profil : enveloppe versionnée, relue sans perte, tolérante aux anciens formats', () => {
  const p = { nom: 'Laforêt Le Cannet', agent: 'Marc Fontalirand' };
  const env = envelopper(p, '2026-11-11T09:00:00.000Z');
  assert.equal(env.format, 'estimo.profil');
  assert.equal(env.v, PROFIL_VERSION);
  assert.equal(env.maj, '2026-11-11T09:00:00.000Z');
  assert.deepEqual(deverser(JSON.parse(JSON.stringify(env))), nettoyerProfil(p));
  // Un profil enregistré à plat (sans enveloppe) reste lisible.
  assert.deepEqual(deverser(p), nettoyerProfil(p));
  assert.deepEqual(deverser(null), profilVide());
});

// ---------- le document ----------

// Même chaîne que l'app : ventes locales -> comparatif DVF -> estimation ajustée.
function dossierDemo() {
  const d = JSON.parse(readFileSync(ROOT + 'tools/pdf/fixtures/dossier-demo-le-cannet.json', 'utf8'));
  const commune = JSON.parse(readFileSync(ROOT + 'data/dvf/06/' + (d._commune || '06030') + '.json', 'utf8'));
  const subject = { lat: d._lat, lon: d._lon };
  const sales = commune.rows.map((r) => normalizeRow(r, subject, d._commune)).filter(Boolean);
  const since = (() => { const x = new Date(DATA_CUTOFF); x.setMonth(x.getMonth() - 24); return x.toISOString().slice(0, 10); })();
  const surface = Number(d.bien.carrez) || 0;
  const pool = (radius) => sales.filter((s) => s.type === 'appartement' && s.date >= since && s.distance <= radius
    && s.surface >= surface * 0.8 && s.surface <= surface * 1.2 && s.prixM2 >= 300 && s.prixM2 <= 60000);
  let radius = 300, comps = pool(radius);
  if (comps.length < 8) { radius = 500; comps = pool(500); }
  const st = analyse(comps, { type: 'appartement', surface, radius, sinceDate: since, min: 8, autoWiden: false });
  const dvf = { n: st.n, removed: st.removed, median: st.median, q1: st.q1, q3: st.q3, radius, since, surfaceTol: 0.2,
    lastSale: st.kept.map((s) => s.date).sort().at(-1) || '', source: 'DVF Etalab (geo-dvf)',
    comps: st.kept.map((s) => ({ date: s.date, prix: s.prix, surface: s.surface, prixM2: Math.round(s.prixM2), distance: s.distance })) };
  const dossier = { ...d, dvf };
  return { dossier, A: computeAjust({ ...dossier, dvf: { ...dvf } }) };
}

const PROFIL_COMPLET = {
  nom: 'Laforêt Le Cannet', adresse: '25 boulevard Sadi Carnot, 06110 Le Cannet',
  tel: '04 93 00 00 00', mail: 'lecannet@exemple.fr', site: 'www.exemple.fr',
  activites: 'transaction, location, gestion', horaires: 'du lundi au vendredi, 9 h – 18 h',
  agent: 'Marc Fontalirand', fonction: 'agent commercial', mobile: '06 00 00 00 00',
  mailAgent: 'marc@exemple.fr', secteur: 'Le Cannet · Mougins', anciennete: '12 ans',
  rsacVille: 'Cannes', rsacNum: '878 607 951',
  raison: 'Laforêt Immobilier', forme: 'SAS', capital: '300 000 €',
  rcsVille: 'Cannes', rcsNum: '123 456 789', tva: 'FR 00 123456789',
  carteType: 'transaction sur immeubles et fonds de commerce', carteNum: 'CPI 0601 2024 000 000 000',
  carteAutorite: 'CCI Nice Côte d’Azur', garantie: 'Galian, 89 rue La Boétie, 75008 Paris',
  assurance: 'AXA, police 123456', mediateur: 'Médiateur de la consommation de l’immobilier, 75008 Paris',
};

const pageInterlocuteur = (html) => {
  const i = html.indexOf('Votre interlocuteur');
  return i < 0 ? '' : html.slice(i, i + 2600);
};
const nbPh = (s) => (s.match(/à compléter/g) || []).length;

test('document : profil vide = champs en pointillés, aucune identité inventée', () => {
  const { dossier, A } = dossierDemo();
  const doc = buildAvis(dossier, { ajust: A, visitDate: '2026-11-10', cutoff: DATA_CUTOFF, agence: profilAgence({}) });
  const page = pageInterlocuteur(doc.html);
  assert.ok(nbPh(page) >= 6, 'les champs vides restent visibles en pointillés');
  assert.doesNotMatch(doc.html, /undefined/);
  assert.doesNotMatch(doc.html, />null</);
  // Aucun nom d'agence réel ne sort sans saisie.
  assert.doesNotMatch(doc.html, /Laforêt/);
});

test('document : profil complet = agence, conseiller et mentions renseignés', () => {
  const { dossier, A } = dossierDemo();
  const doc = buildAvis(dossier, { ajust: A, visitDate: '2026-11-10', cutoff: DATA_CUTOFF, agence: profilAgence(PROFIL_COMPLET) });
  const page = pageInterlocuteur(doc.html);
  assert.equal(nbPh(page), 0, 'plus aucun pointillé sur la page agence/conseiller');
  for (const v of ['Laforêt Le Cannet', '25 boulevard Sadi Carnot', '04 93 00 00 00', 'Marc Fontalirand',
    'agent commercial', '06 00 00 00 00', 'Le Cannet · Mougins', '12 ans', 'du lundi au vendredi']) {
    assert.ok(page.includes(v), 'page 3 doit contenir : ' + v);
  }
  // Mentions légales : RCS, TVA, carte professionnelle, garantie, assurance, médiateur.
  for (const v of ['Laforêt Immobilier', 'SAS', '300 000 €', 'Cannes', '123 456 789', 'FR 00 123456789',
    'CPI 0601 2024 000 000 000', 'CCI Nice Côte d’Azur', 'Galian', 'AXA, police 123456', 'Médiateur de la consommation']) {
    assert.ok(doc.html.includes(v), 'mentions doivent contenir : ' + v);
  }
  assert.doesNotMatch(doc.html, /undefined/);
});

test('document : profil partiel = le saisi sort, le reste reste en pointillés', () => {
  const { dossier, A } = dossierDemo();
  const partiel = profilAgence({ nom: 'Laforêt Le Cannet', agent: 'Marc Fontalirand', fonction: 'agent commercial' });
  const doc = buildAvis(dossier, { ajust: A, visitDate: '2026-11-10', cutoff: DATA_CUTOFF, agence: partiel });
  const page = pageInterlocuteur(doc.html);
  assert.ok(page.includes('Laforêt Le Cannet'));
  assert.ok(nbPh(page) > 0, 'les champs non saisis restent en pointillés');
  // Pas de virgule orpheline quand forme et capital manquent mais que la raison sociale est là.
  const partiel2 = buildAvis(dossier, { ajust: A, visitDate: '2026-11-10', cutoff: DATA_CUTOFF,
    agence: profilAgence({ raison: 'Laforêt Immobilier', rcsVille: 'Cannes', rcsNum: '123 456 789', tva: 'FR 00 123456789' }) });
  assert.ok(partiel2.html.includes('Laforêt Immobilier, dont le siège social est'));
  assert.doesNotMatch(partiel2.html, /, ,/);
  assert.doesNotMatch(partiel2.html, /au capital de ,/);
});

test('document : sans bloc agence, le comportement d’avant est inchangé', () => {
  const { dossier, A } = dossierDemo();
  const sans = buildAvis(dossier, { ajust: A, visitDate: '2026-11-10', cutoff: DATA_CUTOFF });
  const vide = buildAvis(dossier, { ajust: A, visitDate: '2026-11-10', cutoff: DATA_CUTOFF, agence: profilAgence({}) });
  assert.equal(nbPh(pageInterlocuteur(sans.html)), nbPh(pageInterlocuteur(vide.html)));
});
