// Moteur d'estimation Estimo — pur, sans DOM, testable sous Node.
import { COEFS, PONDERATION, PARKING } from './data.js';

const TYPES = ['appartement', 'maison'];
const round = (n, step = 1000) => Math.round(n / step) * step;
const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));

export function validate(input) {
  const e = {};
  const y = new Date().getFullYear();
  if (!TYPES.includes(input.type)) e.type = 'Type de bien invalide';
  const s = num(input.surface);
  if (!(s >= 9 && s <= 2000)) e.surface = 'Surface habitable entre 9 et 2000 m²';
  const p = num(input.prixM2);
  if (!(p >= 500 && p <= 50000)) e.prixM2 = 'Prix/m² de référence entre 500 et 50 000 €';
  const pi = num(input.pieces);
  if (!(Number.isInteger(pi) && pi >= 1 && pi <= 30)) e.pieces = 'Nombre de pièces entre 1 et 30';
  const ch = num(input.chambres ?? 0);
  if (!(Number.isInteger(ch) && ch >= 0)) e.chambres = 'Chambres : entier ≥ 0';
  else if (!e.pieces && ch >= pi) e.chambres = 'Chambres doit être inférieur au nombre de pièces';
  for (const k of ['balcon', 'terrasse', 'jardin', 'terrain', 'charges']) {
    if (input[k] !== undefined && input[k] !== '' && !(num(input[k]) >= 0)) e[k] = 'Valeur positive attendue';
  }
  if (input.annee !== undefined && input.annee !== '') {
    const a = num(input.annee);
    if (!(Number.isInteger(a) && a >= 1600 && a <= y + 3)) e.annee = `Année entre 1600 et ${y + 3}`;
  }
  if (input.type === 'appartement' && input.etage !== undefined && input.etage !== '') {
    const et = num(input.etage);
    if (!(Number.isInteger(et) && et >= -1 && et <= 60)) e.etage = 'Étage entre -1 et 60';
  }
  if (input.etat && !(input.etat in COEFS.etat)) e.etat = 'État inconnu';
  if (input.dpe && !(input.dpe in COEFS.dpe)) e.dpe = 'DPE inconnu';
  return { ok: Object.keys(e).length === 0, errors: e };
}

function etageCoef(etage, ascenseur, dernier) {
  if (etage === '' || etage === undefined || Number.isNaN(num(etage))) return { c: 1, label: 'Étage non renseigné' };
  const et = num(etage);
  if (et <= 0) return { c: 0.92, label: 'Rez-de-chaussée' };
  if (!ascenseur && et >= 3) return { c: 1 - 0.03 * (et - 2), label: `${et}e sans ascenseur` };
  let c = 1 + Math.min(et, 6) * 0.01;
  if (dernier) c += 0.03;
  return { c, label: `${et}e étage${ascenseur ? ' avec ascenseur' : ''}${dernier ? ', dernier étage' : ''}` };
}

function anneeCoef(annee) {
  if (annee === '' || annee === undefined) return { c: 1, label: 'Année non renseignée' };
  const a = num(annee); const age = new Date().getFullYear() - a;
  if (age <= 5) return { c: 1.05, label: 'Construction récente (≤ 5 ans)' };
  if (a >= 1949 && a <= 1975) return { c: 0.97, label: 'Construction 1949-1975' };
  if (a < 1949) return { c: 1.0, label: 'Ancien (avant 1949)' };
  return { c: 1, label: `Construction ${a}` };
}

function chargesCoef(charges, surface) {
  const c = num(charges);
  if (!(c > 0)) return { c: 1, label: 'Charges non renseignées' };
  const parM2 = c / surface; // €/m²/an
  if (parM2 > 60) return { c: 0.95, label: `Charges élevées (${parM2.toFixed(0)} €/m²/an)` };
  if (parM2 > 40) return { c: 0.98, label: `Charges soutenues (${parM2.toFixed(0)} €/m²/an)` };
  return { c: 1, label: `Charges ${parM2.toFixed(0)} €/m²/an` };
}

export function estimate(input) {
  const v = validate(input);
  if (!v.ok) return { ok: false, errors: v.errors };
  const type = input.type;
  const surface = num(input.surface);
  const prixM2 = num(input.prixM2);
  const adj = [];
  const base = surface * prixM2;

  // 1. Surfaces annexes (additives, pondérées)
  let surfPond = 0;
  const add = (label, m2, k) => { if (m2 > 0) { const val = m2 * k * prixM2; surfPond += m2 * k; adj.push({ label, kind: 'add', value: val, detail: `${m2} m² × ${k}` }); return val; } return 0; };
  let annexes = 0;
  annexes += add('Balcon', num(input.balcon) || 0, PONDERATION.balcon);
  annexes += add('Terrasse', num(input.terrasse) || 0, PONDERATION.terrasse);
  if (type === 'appartement') annexes += add('Jardin privatif', num(input.jardin) || 0, PONDERATION.jardinAppartement);
  else {
    const terrain = num(input.terrain) || 0;
    const emprise = surface; // approx emprise au sol déjà incluse dans le prix de référence
    annexes += add('Terrain (au-delà de l’emprise)', Math.max(0, terrain - emprise), PONDERATION.terrainMaison);
  }

  // 2. Coefficients multiplicatifs
  const coefs = [];
  const push = (label, c) => { if (c !== 1) coefs.push({ label, c }); };
  if (input.etat) push(`État : ${input.etat}`, COEFS.etat[input.etat]);
  if (input.dpe) push(`DPE ${input.dpe}`, COEFS.dpe[input.dpe]);
  if (input.exposition) push(`Exposition ${input.exposition}`, COEFS.exposition[input.exposition] ?? 1);
  if (input.vue) push(`Vue ${input.vue}`, COEFS.vue[input.vue] ?? 1);
  if (input.piscine) push('Piscine', COEFS.piscine[type]);
  if (type === 'appartement') {
    const e = etageCoef(input.etage, !!input.ascenseur, !!input.dernierEtage); push(e.label, e.c);
    const ch = chargesCoef(input.charges, surface); push(ch.label, ch.c);
  }
  const an = anneeCoef(input.annee); push(an.label, an.c);
  // Pièces : taille moyenne anormale
  const moy = surface / num(input.pieces);
  if (moy < 12) push('Pièces très petites (< 12 m²/pièce)', 0.97);
  const coefManuel = num(input.coefManuel);
  if (coefManuel > 0 && coefManuel !== 1) push('Coefficient manuel agent', Math.min(1.3, Math.max(0.7, coefManuel)));

  let coefTotal = coefs.reduce((a, x) => a * x.c, 1);
  const borne = Math.min(1.4, Math.max(0.6, coefTotal));
  if (borne !== coefTotal) adj.push({ label: 'Coefficient global plafonné (0,60–1,40)', kind: 'info', value: 0 });
  coefTotal = borne;

  const valeurBati = (base + annexes) * coefTotal;
  for (const x of coefs) adj.push({ label: x.label, kind: 'coef', coef: x.c, value: (base + annexes) * (x.c - 1) });

  // 3. Stationnement (additif, non soumis aux coefficients)
  const park = PARKING[input.parking || 'aucun'] ?? 0;
  if (park) adj.push({ label: `Stationnement : ${input.parking}`, kind: 'add', value: park });

  const central = valeurBati + park;

  // 4. Fourchette : incertitude de base 6 %, + 1,5 % par donnée clé manquante, + 3 % si prix/m² non vérifié
  const manquants = ['etat', 'dpe', 'exposition', 'vue', 'annee'].filter((k) => !input[k]);
  if (type === 'appartement' && (input.etage === '' || input.etage === undefined)) manquants.push('etage');
  let incert = 0.06 + 0.015 * manquants.length + (input.prixVerifie ? 0 : 0.03);
  incert = Math.min(incert, 0.2);

  return {
    ok: true,
    central: round(central),
    basse: round(central * (1 - incert)),
    haute: round(central * (1 + incert)),
    prixM2Final: Math.round(central / surface),
    base: Math.round(base),
    coefTotal: Number(coefTotal.toFixed(4)),
    incertitude: incert,
    manquants,
    surfacePonderee: surface + surfPond,
    ajustements: adj.map((a) => ({ ...a, value: Math.round(a.value) })),
  };
}
