// Module loyers — Carte des loyers ANIL / Ministère du Logement (data/loyers/<dep>.json, cf. tools/build-loyers.py).
export const LOYERS_BASE = new URL('../data/loyers/', import.meta.url).href;
export const MEUBLE_PRIME = 0.15; // hypothèse Estimo : prime meublé +15 % (la carte ne couvre que le non meublé)
// Choix de l'indicateur : maison -> mai ; appartement 1-2 pièces -> app12, 3 pièces et plus -> app3, sinon app.
export function pickIndicator(c, type, pieces) {
  if (!c) return null;
  if (type === 'maison') return c.mai ? { key: 'mai', label: 'Maisons', v: c.mai } : null;
  const k = pieces >= 3 ? 'app3' : pieces >= 1 ? 'app12' : 'app';
  const key = c[k] ? k : 'app';
  return c[key] ? { key, label: { app: 'Appartements', app12: 'Appartements 1-2 pièces', app3: 'Appartements 3 pièces et plus' }[key], v: c[key] } : null;
}
// Loyer mensuel (charges comprises) et rendement brut = loyer annuel / prix de vente.
export function rentEstimate(data, { citycode, type, surface, pieces, prixVente, meublePossible = true }) {
  const c = data?.communes?.[citycode];
  if (!c) throw new Error('Commune absente de la carte des loyers');
  if (!(surface > 0)) throw new Error('Surface requise');
  const ind = pickIndicator(c, type, pieces);
  if (!ind) throw new Error('Pas d’indicateur pour ce type de bien');
  const [m2, lo, hi, typpred, nbobs] = ind.v;
  const vide = Math.round(m2 * surface), meuble = meublePossible ? Math.round(m2 * surface * (1 + MEUBLE_PRIME)) : null;
  const rdt = (l) => (prixVente > 0 && l ? (l * 12) / prixVente : null);
  return { commune: c.nom, citycode, indicateur: ind.label, m2, bas: Math.round(lo * surface), haut: Math.round(hi * surface), loM2: lo, hiM2: hi,
    vide, meuble, rendementVide: rdt(vide), rendementMeuble: rdt(meuble), prixVente: prixVente || null, typpred, nbobs,
    encadrement: !!c.encadrement, encadrementNote: data.encadrement_note, source: data.source, annee: data.annee, reference: data.reference };
}
