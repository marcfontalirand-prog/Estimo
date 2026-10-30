// Tables de coefficients ÉDITABLES (hypothèses de travail, pas des données officielles).
// Le prix/m² de référence provient désormais des ventes DVF à proximité (js/dvf.js),
// avec saisie manuelle possible et repli hors ligne sur la dernière valeur en cache.

// Coefficients multiplicatifs (1 = neutre). Hypothèses de travail, modifiables.
export const COEFS = {
  etat: { neuf: 1.10, refait: 1.05, bon: 1.00, rafraichir: 0.93, travaux: 0.82, renover: 0.70 },
  dpe: { A: 1.06, B: 1.04, C: 1.02, D: 1.00, E: 0.97, F: 0.91, G: 0.86, NC: 0.97 },
  exposition: { sud: 1.03, 'sud-ouest': 1.02, 'sud-est': 1.02, ouest: 1.00, est: 1.00, nord: 0.96, traversant: 1.03, inconnu: 1.00 },
  vue: { mer: 1.15, 'mer-partielle': 1.07, degagee: 1.04, jardin: 1.02, standard: 1.00, 'vis-a-vis': 0.95 },
  piscine: { appartement: 1.02, maison: 1.07 }, // appartement = piscine de résidence
};
// Pondération des surfaces extérieures (part du prix/m² habitable).
export const PONDERATION = { balcon: 0.30, terrasse: 0.40, jardinAppartement: 0.15, terrainMaison: 0.04 };
export const PARKING = { aucun: 0, exterieur: 15000, box: 30000, garage: 35000 }; // € hypothèses éditables
