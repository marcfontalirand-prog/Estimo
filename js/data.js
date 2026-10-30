// Tables de référence ÉDITABLES. Ce ne sont PAS des données officielles.
// Les prix/m² ci-dessous sont des valeurs de départ indicatives (ordre de grandeur)
// à recaler par l'agent à partir de sources vérifiables :
//  - DVF / Etalab : https://app.dvf.etalab.gouv.fr/
//  - Baromètre des notaires (immobilier.notaires.fr), Meilleurs Agents, références agence.
// Chaque secteur porte `verifie: false` tant que l'utilisateur ne l'a pas validé.
export const SOURCE_NOTE =
  "Valeurs par défaut indicatives, non vérifiées. À recaler avec DVF (app.dvf.etalab.gouv.fr), le baromètre des notaires et vos ventes récentes.";

export const DEFAULT_SECTEURS = [
  { id: 'cannet-centre', nom: 'Le Cannet – Centre / Vieux Cannet', appartement: 4500, maison: 5500, verifie: false },
  { id: 'cannet-rocheville', nom: 'Le Cannet – Rocheville', appartement: 4300, maison: 5200, verifie: false },
  { id: 'cannet-europe', nom: 'Le Cannet – Europe / Tourrades', appartement: 4000, maison: 5000, verifie: false },
  { id: 'cannes-centre', nom: 'Cannes – Centre', appartement: 6000, maison: 7500, verifie: false },
  { id: 'cannes-californie', nom: 'Cannes – Californie', appartement: 7500, maison: 9500, verifie: false },
  { id: 'mougins', nom: 'Mougins', appartement: 5000, maison: 6500, verifie: false },
  { id: 'mandelieu', nom: 'Mandelieu-la-Napoule', appartement: 5000, maison: 6000, verifie: false },
  { id: 'vallauris', nom: 'Vallauris / Golfe-Juan', appartement: 4200, maison: 5200, verifie: false },
  { id: 'personnalise', nom: 'Autre secteur (saisir le prix/m²)', appartement: 0, maison: 0, verifie: false },
];

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
