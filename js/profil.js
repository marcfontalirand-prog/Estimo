// Module « profil » — identité de l'agence et du conseiller, saisie une fois,
// imprimée sur l'avis de valeur. Pur : aucun DOM, aucun stockage, aucun réseau.
// L'app lit et écrit le profil ; ce module ne fait que le décrire, le nettoyer
// et le traduire en bloc agence pour le document.
//
// Règle de base : un champ vide reste vide. Aucune valeur n'est inventée,
// aucun exemple n'est proposé comme s'il était réel. Vide = « à compléter »
// sur le document, exactement comme avant.
//
// Prêt pour un compte : le profil est un objet JSON simple et versionné.
// Toute la lecture passe par loadProfil() côté app, et toute injection par
// profilAgence(). Le jour où un compte serveur existe, seule loadProfil()
// change : le reste du code et le document ne bougent pas.

export const PROFIL_VERSION = 1;

// Les champs, groupés comme ils s'affichent. `req` = indispensable sur un avis
// de valeur remis à un client (identité, ou mentions légales de l'article 6 de
// la loi Hoguet). `long` = saisie multiligne.
export const PROFIL_GROUPES = [
  {
    id: 'agence',
    titre: 'Agence',
    aide: 'Le bloc qui apparaît en page 3 du document et en pied de mentions.',
    champs: [
      { k: 'nom', l: 'Nom de l’agence', ph: 'ex. Laforêt Le Cannet', req: true },
      { k: 'adresse', l: 'Adresse du siège', ph: '25 boulevard Sadi Carnot, 06110 Le Cannet', req: true, long: true },
      { k: 'tel', l: 'Téléphone', ph: '04 93 00 00 00', req: false, tel: true },
      { k: 'mail', l: 'Courriel', ph: 'agence@exemple.fr', req: false, mail: true },
      { k: 'site', l: 'Site internet', ph: 'www.exemple.fr', req: false },
      { k: 'activites', l: 'Activités', ph: 'transaction, location, gestion, neuf', req: false },
      { k: 'horaires', l: 'Horaires', ph: 'du lundi au vendredi, 9 h – 12 h et 14 h – 18 h', req: false, long: true },
    ],
  },
  {
    id: 'conseiller',
    titre: 'Conseiller',
    aide: 'La personne que le client appelle. Rien n’est pris dans le dossier client.',
    champs: [
      { k: 'agent', l: 'Nom du conseiller', ph: 'Marc Fontalirand', req: true },
      { k: 'fonction', l: 'Fonction', ph: 'agent commercial', req: true },
      { k: 'mobile', l: 'Téléphone mobile', ph: '06 00 00 00 00', req: false, tel: true },
      { k: 'mailAgent', l: 'Courriel du conseiller', ph: 'marc@exemple.fr', req: false, mail: true },
      { k: 'secteur', l: 'Secteur d’intervention', ph: 'Le Cannet · Mougins', req: false },
      { k: 'anciennete', l: 'Ancienneté dans le secteur', ph: '12 ans', req: false },
      { k: 'rsacVille', l: 'RSAC — ville', ph: 'Cannes', req: false },
      { k: 'rsacNum', l: 'RSAC — numéro', ph: '878 607 951', req: false },
    ],
  },
  {
    id: 'mentions',
    titre: 'Mentions légales',
    aide: 'Obligatoires sur un document remis à un client (loi Hoguet, art. 6). À remplir une fois, avec l’aide de ton comptable ou de ton service juridique : je ne les invente pas.',
    champs: [
      { k: 'raison', l: 'Raison sociale', ph: 'ex. Laforêt Immobilier', req: true },
      { k: 'forme', l: 'Forme juridique', ph: 'SAS', req: false },
      { k: 'capital', l: 'Capital social', ph: '300 000 €', req: false },
      { k: 'rcsVille', l: 'RCS — ville', ph: 'Cannes', req: true },
      { k: 'rcsNum', l: 'RCS — numéro', ph: '123 456 789', req: true },
      { k: 'tva', l: 'TVA intracommunautaire', ph: 'FR 00 123456789', req: false },
      { k: 'carteType', l: 'Carte professionnelle — type', ph: 'transaction sur immeubles et fonds de commerce', req: true },
      { k: 'carteNum', l: 'Carte professionnelle — numéro', ph: 'CPI 0601 2024 000 000 000', req: true },
      { k: 'carteAutorite', l: 'Carte professionnelle — délivrée par', ph: 'CCI Nice Côte d’Azur', req: false },
      { k: 'garantie', l: 'Garantie financière', ph: 'organisme, adresse', req: true },
      { k: 'assurance', l: 'Assurance RC professionnelle', ph: 'assureur, numéro de police', req: true },
      { k: 'mediateur', l: 'Médiateur de la consommation', ph: 'nom, adresse, site', req: true },
    ],
  },
];

// Tous les champs à plat, pour le nettoyage et les tests.
export const PROFIL_CHAMPS = PROFIL_GROUPES.flatMap((g) => g.champs.map((c) => ({ ...c, groupe: g.id })));
export const PROFIL_CLES = PROFIL_CHAMPS.map((c) => c.k);

export function profilVide() {
  const p = {};
  for (const k of PROFIL_CLES) p[k] = '';
  return p;
}

// Nettoyage : chaînes seules, espaces retirés aux extrémités, clés inconnues
// ignorées, retours à la ligne ramenés à un seul. Un profil nettoyé est stable :
// nettoyer deux fois donne le même objet.
export function nettoyerProfil(p) {
  const out = profilVide();
  if (!p || typeof p !== 'object') return out;
  for (const k of PROFIL_CLES) {
    const v = p[k];
    if (typeof v === 'string') out[k] = v.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    else if (typeof v === 'number') out[k] = String(v);
  }
  return out;
}

const vide = (v) => !(typeof v === 'string' && v.trim() !== '');

// Traduction en bloc agence attendu par js/pdfdoc.js. Un champ vide devient
// null, pour que le document affiche son « à compléter » habituel.
export function profilAgence(p) {
  const c = nettoyerProfil(p);
  const agence = {};
  for (const k of PROFIL_CLES) agence[k] = vide(c[k]) ? null : c[k];
  return agence;
}

// Avancement de la saisie. `manquants` sert à dire précisément ce qui bloque
// un document complet, jamais à bloquer la génération : un avis de valeur
// reste imprimable, il porte simplement des champs en pointillés.
export function completude(p) {
  const c = nettoyerProfil(p);
  const manquants = PROFIL_CHAMPS.filter((f) => f.req && vide(c[f.k])).map((f) => f.l);
  const faits = PROFIL_CHAMPS.filter((f) => f.req && !vide(c[f.k])).length;
  const total = PROFIL_CHAMPS.filter((f) => f.req).length;
  const remplis = PROFIL_CLES.filter((k) => !vide(c[k])).length;
  return {
    faits, total, manquants, remplis,
    tous: PROFIL_CLES.length,
    essentielsOk: manquants.filter((l) => !groupeDe(l, 'mentions')).length === 0,
    mentionsOk: manquants.filter((l) => groupeDe(l, 'mentions')).length === 0,
    ok: manquants.length === 0,
  };
}

function groupeDe(label, groupe) {
  const f = PROFIL_CHAMPS.find((x) => x.l === label);
  return f ? f.groupe === groupe : false;
}

// Ligne de résumé pour l'en-tête de l'écran Profil : « Marc Fontalirand · Laforêt
// Le Cannet ». Tombe proprement si un seul des deux est rempli, vide si aucun.
export function resumeProfil(p) {
  const c = nettoyerProfil(p);
  const a = vide(c.agent) ? '' : c.agent;
  const b = vide(c.nom) ? '' : c.nom;
  return [a, b].filter(Boolean).join(' · ');
}

// Enveloppe stockée : la version permet une migration sans casser un profil
// déjà saisi. Un enregistrement d'une version inconnue n'est pas deviné, il
// est nettoyé champ par champ (on ne perd rien, on n'invente rien).
export function envelopper(p, at) {
  return { format: 'estimo.profil', v: PROFIL_VERSION, maj: at || null, champs: nettoyerProfil(p) };
}

export function deverser(obj) {
  if (!obj || typeof obj !== 'object') return profilVide();
  if (obj.champs && typeof obj.champs === 'object') return nettoyerProfil(obj.champs);
  return nettoyerProfil(obj);
}
