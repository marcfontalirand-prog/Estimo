// Module « avis de valeur » — rendu HTML paginé A4, utilisable dans l'app et sous Node.
// Pur : aucune API DOM, aucun accès réseau, aucune dépendance. Entrée = dossier Estimo + comparatif DVF.
// Source unique du document : tools/pdf/build.mjs (prototype, rendu WeasyPrint) importe ce module.
// Le texte suit le premier jet de Jane (pdf-estimation-texte-type-v1.md) : mêmes rubriques,
// mêmes formulations, variables remplies par les données réelles du dossier et de DVF.
// Les rubriques qu'aucune donnée ne peut alimenter sont affichées comme telles, jamais remplies au hasard.

export const AGENCE_DEFAUT = {
  // Aucune identité réelle en dur : la marque, la carte professionnelle, la garantie
  // financière, l'assurance et le médiateur ne sont pas tranchés (cf. § 18 du texte type).
  // L'app peut injecter un bloc d'agence via buildAvis(dossier, { agence: {...} }).
  nom: null, adresse: null, tel: null, mail: null, site: null,
  raison: null, forme: null, capital: null, rcs: null, tva: null,
  carte: null, garantie: null, assurance: null, mediateur: null,
  agent: null, fonction: null, rsac: null, secteur: null,
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const val = (v) => (v === '' || v == null || v === false ? 'non communiqué' : String(v));
const isSet = (v) => !(v === '' || v == null || v === false);

export function renderAvis(data) {
  const H = data.helpers || makeHelpers(data);
  const AGENCE = data.agence || AGENCE_DEFAUT;
  const DEMO = data.demo !== false;
  const { dossier: D, dvf, ajust: A, score, params, SURF, visitDate } = data;
  const { eur, pct, fm } = H;
  const b = D.bien, t = D.technique, f = D.financier, c = D.client;
  const nom = [c.prenom, c.nom].filter(Boolean).join(' ');
  const adresse = c.adresse || 'Adresse non renseignée';
  const P = Number.isFinite(+f.prixAttendu) ? +f.prixAttendu : null;
  const mF = A.m2 ? (A.m2 / dvf.median - 1) : null;
  const TPAGES = 18;
  const disp = dvf.median ? (dvf.q3 - dvf.q1) / dvf.median : null;
  const lastSale = dvf.lastSale;
  const frDate = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "—");

  const ph = (label, tag = 'AGENCE') => `<span class="ph">${esc(label)} <b>${tag}</b></span>`;
  const na = (label) => `<span class="na">${esc(label)}</span>`;
  const ou = (v) => (isSet(v) && String(v).trim() !== '' ? esc(v) : `<span class="ph">à compléter <b>AGENCE</b></span>`);

  // --- Petits composants -----------------------------------------------------
  const page = (num, kicker, title, body, opts = {}) => `
  <section class="sheet${opts.cover ? ' cover' : ''}">
    ${opts.cover ? '' : `<header class="ph-head">
      <div class="brand"><svg width="20" height="20" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#fff" stroke="#0b1f3a" stroke-width="4"/><path d="M12 31 32 14l20 17" fill="none" stroke="#0b1f3a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 28v22h28V28" fill="none" stroke="#0b1f3a" stroke-width="5" stroke-linejoin="round"/></svg><span>ESTIMO</span></div>
      <div class="head-right">Avis de valeur · ${esc(adresse.split(',')[0])}</div>
    </header>
    <div class="pg-title"><p class="kicker">${esc(kicker)}</p><h1>${esc(title)}</h1></div>`}
    <div class="pg-body">${body}</div>
    <footer class="pg-foot"><span>${DEMO ? 'Avis de valeur · document de test, données de démonstration' : 'Avis de valeur · estimation indicative, non contractuelle'} · ${esc(D.meta_version || 'Estimo 2.4')} · DVF arrêté au ${frDate(dvf.cutoff)}</span><span>page ${num} / ${TPAGES}</span></footer>
  </section>`;

  const table = (head, rows, cls = '') => `<table class="t ${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  // --- Histogramme -----------------------------------------------------------
  const histo = () => {
    const W = 640, Hh = 150, pad = 26, bw = H.bins.length ? (W - pad * 2) / H.bins.length : 0;
    const max = Math.max(1, ...H.bins.map((x) => x.n));
    const bars = H.bins.map((x, i) => {
      const h = (x.n / max) * (Hh - 34);
      const cx = pad + i * bw;
      return `<rect x="${cx + 1}" y="${Hh - 24 - h}" width="${Math.max(1, bw - 2)}" height="${h}" fill="#c3d6ee" stroke="#9db8d8" stroke-width=".4" rx="1.5"/>
      <text x="${cx + bw / 2}" y="${Hh - 10}" font-size="7" text-anchor="middle" fill="#5b6b82">${x.from}</text>`;
    }).join('');
    const pos = (v) => { const lo = H.bins[0].from, hi = H.bins.at(-1).to; return pad + ((v - lo) / (hi - lo)) * (W - pad * 2); };
    const vm = pos(A.m2);
    return `<svg viewBox="0 0 ${W} ${Hh}" class="histo" role="img" aria-label="Distribution des prix au m² des ventes retenues">
      ${bars}
      <line x1="${pad}" y1="${Hh - 24}" x2="${W - pad}" y2="${Hh - 24}" stroke="#dde5ef"/>
      <line x1="${vm}" y1="6" x2="${vm}" y2="${Hh - 24}" stroke="#0f9d6e" stroke-width="1.6" stroke-dasharray="4 3"/>
      <text x="${vm + 5}" y="16" font-size="8" fill="#0f9d6e" font-weight="700">valeur retenue ${eur(A.m2)}/m²</text>
    </svg>`;
  };

  // --- Jauge du score --------------------------------------------------------
  const gauge = () => {
    const W = 620, Hh = 66, x = 20, w = W - 40;
    const p = score.total / 100;
    const cols = [[0, 0.5, '#e6b3ae'], [0.5, 0.8, '#f2d39a'], [0.8, 1, '#9fd8c1']];
    return `<svg viewBox="0 0 ${W} ${Hh}" class="gauge" role="img" aria-label="Score de confiance ${score.total} sur 100">
      ${cols.map(([a, bb, col]) => `<rect x="${x + a * w}" y="18" width="${(bb - a) * w}" height="20" fill="${col}"/>`).join('')}
      <rect x="${x + p * w - 1.5}" y="10" width="3" height="36" fill="#0b1f3a" rx="1.5"/>
      <text x="${x + p * w}" y="60" font-size="10" font-weight="700" text-anchor="middle" fill="#0b1f3a">${score.total} / 100</text>
      <text x="${x}" y="60" font-size="8" fill="#5b6b82">0</text>
      <text x="${x + 0.5 * w}" y="60" font-size="8" fill="#5b6b82" text-anchor="middle">50</text>
      <text x="${x + 0.8 * w}" y="60" font-size="8" fill="#5b6b82" text-anchor="middle">80</text>
      <text x="${x + w}" y="60" font-size="8" fill="#5b6b82" text-anchor="end">100</text>
    </svg>`;
  };

  // --- Barre de fourchette ---------------------------------------------------
  const range = () => {
    const W = 620, Hh = 78, x = 16, w = W - 32;
    const lo = A.bas, hi = A.haut, mid = A.valeur;
    const span = hi - lo || 1;
    const p = (v) => x + ((v - lo) / span) * w;
    return `<svg viewBox="0 0 ${W} ${Hh}" class="range" role="img" aria-label="Fourchette d'estimation">
      <rect x="${x}" y="22" width="${w}" height="14" rx="7" fill="#eef3f9"/>
      <rect x="${p(lo)}" y="22" width="${p(hi) - p(lo)}" height="14" rx="7" fill="#c9dbf3"/>
      <circle cx="${p(mid)}" cy="29" r="8" fill="#0f9d6e"/>
      <text x="${p(lo)}" y="16" font-size="8" text-anchor="start" fill="#5b6b82">${eur(lo)}</text>
      <text x="${p(hi)}" y="16" font-size="8" text-anchor="end" fill="#5b6b82">${eur(hi)}</text>
      <text x="${p(mid)}" y="56" font-size="9" text-anchor="middle" font-weight="700" fill="#0f9d6e">${eur(mid)}</text>
      <text x="${x}" y="72" font-size="7.5" fill="#5b6b82">valeur basse (25e percentile)</text>
      <text x="${x + w}" y="72" font-size="7.5" fill="#5b6b82" text-anchor="end">valeur haute (75e percentile)</text>
    </svg>`;
  };

  // --- Comparables -----------------------------------------------------------
  const compRow = (s, i) => {
    const ecart = A.valeur ? (s.prixM2 / A.m2 - 1) : null;
    return [
      `<b>${i}</b>`, fm(s.date), `${s.distance} m`, `${s.surface} m²`, eur(s.prix), `<b>${eur(s.prixM2)}</b>`,
      `<span class="${ecart >= 0 ? 'up' : 'down'}">${pct(ecart, true)}</span>`,
    ];
  };
  const comps = dvf.kept;
  const comps1 = comps.slice(0, 12), comps2 = comps.slice(12, 24);
  const compsReste = Math.max(0, comps.length - 24);

  // --- Diagnostic filtré -----------------------------------------------------
  const diagAll = [
    ['DPE avec GES', t.dpe ? `Oui — classe ${t.dpe} connue` : 'Oui (tout bien mis en vente)', '10 ans', 'Diagnostiqueur certifié'],
    ['Audit énergétique', ['F', 'G'].includes(String(t.dpe)) ? 'Oui — classe F ou G' : 'Non — DPE D, hors seuil F/G de la loi Climat', '5 ans', 'Diagnostiqueur certifié'],
    ['Mesurage loi Carrez', 'Oui — lot de copropriété', 'à chaque modification', 'Géomètre ou diagnostiqueur'],
    ['Amiante', `Oui — permis de construire ${t.annee || '?'}, antérieur au 1er juillet 1997`, 'variable', 'Diagnostiqueur certifié'],
    ['Plomb (CREP)', `Non — permis de construire ${t.annee || '?'}, postérieur au 1er janvier 1949`, '1 an si présence', 'Diagnostiqueur certifié'],
    ['Gaz', 'Oui — installation de plus de 15 ans', '3 ans', 'Diagnostiqueur certifié'],
    ['Électricité', 'Oui — installation de plus de 15 ans', '3 ans', 'Diagnostiqueur certifié'],
    ['Assainissement non collectif', 'Non — bien raccordé au réseau (à confirmer)', '3 ans', 'Service public d\'assainissement'],
    ['Termites', 'À vérifier — zone délimitée par arrêté préfectoral', '6 mois', 'Diagnostiqueur certifié'],
    ['État des risques et pollutions', 'Oui — tout bien', 'moins de 5 mois à la signature', 'Agence / vendeur'],
    ['Nuisances sonores aériennes', 'À vérifier — zone de plan d\'exposition au bruit', 'moins de 5 mois', 'Vendeur'],
    ['Radon, mérule', 'À vérifier — zone classée par arrêté', 'selon arrêté', 'Diagnostiqueur certifié'],
  ];
  const diagRows = diagAll.map((r) => [`<b>${r[0]}</b>`, r[1], r[2], r[3], na('coût non renseigné')]);

  // --- Lexique ---------------------------------------------------------------
  const lexique = [
    ['Avis de valeur', 'Estimation indicative d\'un bien, établie par un professionnel, à la demande de son propriétaire. Ce n\'est ni une expertise, ni un mandat, ni une promesse de vente.'],
    ['Surface privative loi Carrez', 'Surface mesurée à l\'intérieur d\'un lot de copropriété, selon la loi du 18 décembre 1996. Seule surface opposable dans un acte pour un lot de copropriété.'],
    ['DPE', 'Diagnostic de performance énergétique. Deux étiquettes : énergie (A à G, en kWh/m²/an) et gaz à effet de serre (A à G, en kgCO2/m²/an).'],
    ['ERP', 'État des risques et pollutions. Formulaire obligatoire annexé au compromis, fondé sur l\'arrêté préfectoral du secteur.'],
    ['DVF', 'Demandes de valeurs foncières : base publique des ventes notariées, publiée par Etalab. Ce sont des prix d\'actes, pas des prix affichés.'],
    ['Médiane', 'Valeur qui sépare une série en deux moitiés. Moins sensible que la moyenne aux ventes extrêmes.'],
    ['Écart interquartile', 'Écart entre le 25e et le 75e percentile d\'une série. Il mesure la dispersion des ventes : plus il est large, moins le marché du secteur est homogène.'],
    ['Vente VEFA', 'Vente en l\'état futur d\'achèvement : achat d\'un logement non terminé. Écartée des comparables, son prix ne décrivant pas l\'ancien.'],
    ['Honoraires TTC', 'Rémunération de l\'agence, exprimée toutes taxes comprises. Elle est due à la conclusion de la vente, jamais avant.'],
    ['Prix net vendeur', 'Somme effectivement perçue par le vendeur, une fois les honoraires déduits du prix payé par l\'acquéreur.'],
    ['Droits de mutation', 'Impôts et taxes perçus lors de la vente (« frais de notaire »), à la charge de l\'acquéreur dans l\'ancien. Ils s\'ajoutent au prix.'],
    ['Loi Hoguet', 'Loi du 2 janvier 1970 qui encadre les professions immobilières : carte professionnelle, mandat écrit, garantie financière, comptes séparés.'],
    ['Score de confiance', 'Indicateur interne de solidité statistique d\'une estimation. Il ne préjuge pas du prix qui sera obtenu.'],
    ['Plan pluriannuel de travaux', 'Programme de travaux voté en copropriété, obligatoire pour certains immeubles depuis la loi Climat et Résilience. Il pèse sur les charges futures.'],
  ];

  // ==========================================================================
  // 1. Couverture
  // ==========================================================================
  const cover = `
  <section class="sheet cover">
    <div class="cov-top">
      <div class="cov-logo"><svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#fff"/><path d="M12 31 32 14l20 17" fill="none" stroke="#0b1f3a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 28v22h28V28" fill="none" stroke="#0b1f3a" stroke-width="5" stroke-linejoin="round"/></svg>
        <div><p class="cov-brand">ESTIMO</p><p class="cov-brand-sub">Avis de valeur</p></div>
      </div>
      ${DEMO ? '<p class="cov-test">DOCUMENT DE TEST</p>' : ''}
    </div>
    <div class="cov-main">
      <h1>AVIS<br>DE VALEUR</h1>
      <p class="cov-sub">Dossier d'estimation</p>
      <div class="cov-line"></div>
      <p class="cov-addr">${esc(adresse)}</p>
      <p class="cov-meta">Établi le ${frDate(visitDate)}<br>À la demande de ${esc(nom)}</p>
    </div>
    <div class="cov-foot">
      <div>
        <p class="cov-lbl">Remis par</p>
        <p class="cov-strong">${ou(AGENCE.agent)}</p>
        <p>${ou(AGENCE.fonction)} · ${ou(AGENCE.nom)}</p>
        <p>${ou(AGENCE.adresse)}</p>
      </div>
      <div class="cov-disc">
        <p><b>Estimation indicative, non contractuelle.</b></p>
        <p>Ce document n'est ni une expertise immobilière, ni un mandat, ni une promesse de vente.</p>
      </div>
    </div>
    ${DEMO ? `<div class="cov-testbar">Jeu de test du ${esc(visitDate)} : les ventes DVF sont réelles, le bien et le client sont une démonstration. Ne pas remettre à un client.</div>` : ''}
  </section>`;

  // ==========================================================================
  // 2. Sommaire
  // ==========================================================================
  const sommaire = page(2, 'Sommaire', 'Ce que contient ce document', `
    <div class="grid2">
      <div>
        ${table(['', 'Rubrique', 'Page'], [
          ['1', 'Votre bien', '4'],
          ['2', 'Votre secteur', '6'],
          ['3', 'Le marché', '7'],
          ['4', 'Notre méthode', '8'],
          ['5', 'L\'estimation', '9'],
          ['6', 'Les comparables', '11'],
        ], 'toc')}
      </div>
      <div>
        ${table(['', 'Rubrique', 'Page'], [
          ['7', 'Délais de vente et positionnement', '13'],
          ['8', 'Diagnostics à réaliser', '14'],
          ['9', 'Honoraires et frais', '15'],
          ['10', 'Lexique', '16'],
          ['11', 'Conditions d\'usage et données personnelles', '17'],
          ['12', 'Journal des données', '18'],
        ], 'toc')}
      </div>
    </div>
    <div class="note">
      <p class="note-t">Comment lire ce document</p>
      <p>Chaque montant est calculé à partir des ventes enregistrées dans la base DVF, autour de votre bien. Les rubriques que les données disponibles ne permettent pas d'alimenter sont signalées en clair : elles ne sont jamais remplies par une valeur d'ambiance.</p>
    </div>
    <div class="warn">
      <p class="warn-t">Ce que cette version de test permet de vérifier</p>
      <ul>
        <li><b>Produit réellement :</b> marché DVF, estimation et fourchette, score de confiance, comparables anonymisés, diagnostics filtrés, lexique, journal des données.</li>
        <li><b>Produit partiellement :</b> votre bien (l'outil ne collecte pas encore le nombre de lots, le syndic, les procédures, la date du DPE ni celle du mesurage Carrez).</li>
        <li><b>Non produit :</b> secteur et environnement (cadastre, PLU, Sitadel, INSEE, points d'intérêt), offre en vente, délais de vente, honoraires, mentions de l'éditeur. Ces blocs restent des emplacements balisés.</li>
      </ul>
    </div>
    <p class="card-t mt">Trois dates, jamais une seule</p>
    <div class="grid3">
      <div class="kpi small"><p class="kpi-l">Arrêt des données DVF</p><p class="kpi-n sm">${frDate(dvf.cutoff)}</p></div>
      <div class="kpi small"><p class="kpi-l">Date de la visite</p><p class="kpi-n sm">${frDate(visitDate)}</p></div>
      <div class="kpi small"><p class="kpi-l">Décalage données / visite</p><p class="kpi-n sm">${monthsBetween(dvf.cutoff, visitDate)} mois</p></div>
    </div>
    <p class="tiny">Trois dates distinctes, jamais une seule : c'est ce qui permet de dire plus tard sur quelles données l'estimation a été faite. Les modèles d'agence n'en affichent qu'une.</p>

  `);

  // ==========================================================================
  // 3. Agence et conseiller
  // ==========================================================================
  const agence = page(3, 'Votre interlocuteur', 'Votre agence et votre conseiller', `
    <div class="grid2 gap">
      <div class="card">
        <p class="card-t">Votre agence</p>
        <p class="lead">${ou(AGENCE.nom)}</p>
        <p>${ou(AGENCE.adresse)}</p>
        <p class="mt">${ph('téléphone', 'AGENCE')} · ${ph('courriel', 'AGENCE')}<br>${ph('site internet', 'AGENCE')}</p>
        <p class="mt"><b>Activités :</b> ${ph('transaction, location, gestion, neuf', 'AGENCE')}</p>
        <p><b>Horaires :</b> ${ph('jours et heures', 'AGENCE')}</p>
      </div>
      <div class="card">
        <p class="card-t">Votre conseiller</p>
        <p class="lead">${ou(AGENCE.agent)}</p>
        <p>${ou(AGENCE.fonction)}</p>
        <p class="mt">${ph('téléphone mobile', 'AGENCE')} · ${ph('courriel', 'AGENCE')}</p>
        <p class="mt"><b>Secteur d'intervention :</b> ${ou(AGENCE.secteur)}</p>
        <p><b>Ancienneté dans le secteur :</b> ${ph('nombre d\'années', 'AGENCE')}</p>
      </div>
    </div>
    <div class="note">
      <p class="note-t">Ce que ce chapitre ne contient pas, volontairement</p>
      <p>Les chiffres de notoriété du réseau, les labels, les enquêtes de satisfaction, le nombre d'agences. Ces éléments figurent dans le modèle 2021 et n'ont pas leur place dans un document de valeur : ils vieillissent mal, ne sont pas vérifiables par le client, et exposent l'éditeur si le chiffre est faux.</p>
    </div>
    <div class="warn">
      <p class="warn-t">Marque et identité — à trancher avant tout usage réel</p>
      <p>La présentation de l'agence et l'usage des marques du réseau relèvent de l'accord de franchise. Dans la version vendue à des agents hors réseau, ce bloc doit être remplacé par la fiche de l'utilisateur, sans aucune référence à un réseau. <b>[RÉSEAU]</b> Les champs en pointillés sont les données d'entreprise que je n'ai pas : carte professionnelle, garantie financière, assurance, médiateur de la consommation.</p>
    </div>
  `);

  // ==========================================================================
  // 4-5. Votre bien
  // ==========================================================================
  const bien1 = page(4, 'Chapitre 1', 'Votre bien', `
    <p class="lead">${esc(c.type || 'Bien')} de ${val(b.pieces)} pièces, ${val(b.chambres)} chambres.</p>
    <p class="sub">Situé ${esc(adresse)}, quartier centre-ville.</p>

    <p class="card-t mt">Immeuble</p>
    ${table(['Élément', 'Constat'], [
      ['Année de construction', val(t.annee)],
      ['Nombre de niveaux', na('non renseigné')],
      ['Étage du bien', val(b.etage)],
      ['Ascenseur', b.ascenseur ? 'oui' : 'non'],
      ['Chauffage', [t.chauffage, t.energie].filter(isSet).join(' — ') || na('non communiqué')],
      ['Eau chaude', na('non communiqué')],
    ])}

    <p class="card-t mt">Surfaces et annexes</p>
    ${table(['Désignation', 'Surface'], [
      ['Surface privative loi Carrez', `${SURF} m²`],
      ['Surface habitable déclarée', isSet(b.habitable) ? `${b.habitable} m²` : na('non communiquée')],
      ['Balcon', isSet(b.balcon) ? `${b.balcon} m²` : na('—')],
      ['Terrasse', isSet(b.terrasse) ? `${b.terrasse} m²` : na('—')],
      ['Jardin', isSet(b.jardin) ? `${b.jardin} m²` : na('—')],
      ['Cave', isSet(b.cave) ? `${b.cave} m²` : na('—')],
      ['Parking / garage', isSet(t.parking) ? esc(t.parking) : na('—')],
    ])}

    <div class="foot-note">
      <p><b>Surface Carrez.</b> La surface retenue pour le calcul est la surface privative loi Carrez (loi n° 96-1107 du 18 décembre 1996, décret n° 97-532). La surface habitable ne la remplace pas et ne peut pas être présentée comme équivalente. Le mesurage doit être daté et signé. <b>[JURISTE]</b></p>
    </div>
  `);

  const bien2 = page(5, 'Chapitre 1 — suite', 'Votre bien : état, copropriété et charges', `
    <div class="grid2 gap">
      <div>
        <p class="card-t">Caractéristiques</p>
        ${table(['Élément', 'Constat'], [
          ['État déclaré', val(t.notesEtat)],
          ['Travaux récents', val(t.travaux)],
          ['Exposition', val(b.exposition)],
          ['Vis-à-vis', val(b.visavis)],
          ['Bruit', val(b.bruit)],
          ['Vue', val(b.vue)],
          ['Menuiseries', val(t.menuiseries)],
          ['Isolation', val(t.isolation)],
          ['Cuisine équipée', t.cuisine ? 'oui' : 'non'],
          ['Climatisation', t.climatisation ? 'oui' : 'non'],
          ['Occupation', na('non communiquée')],
        ])}
      </div>
      <div>
        <p class="card-t">Copropriété</p>
        ${table(['Élément', 'Constat'], [
          ['Nombre total de lots', na('non renseigné')],
          ['Lots principaux', na('non renseigné')],
          ['Charges annuelles', isSet(f.charges) ? `${eur(Number(f.charges))} / an, soit ${eur(Number(f.charges) / 12)} / mois` : na('non renseignées')],
          ['Syndic en exercice', na('non renseigné')],
          ['Procédures en cours', na('non renseignées')],
          ['Travaux votés non commencés', na('non renseignés')],
          ['Plan pluriannuel de travaux', na('non renseigné')],
        ])}
        <p class="card-t mt">Fiscalité et énergie</p>
        ${table(['Élément', 'Constat'], [
          ['Taxe foncière 2025', isSet(f.taxeFonciere) ? eur(Number(f.taxeFonciere)) : na('non renseignée')],
          ['DPE', isSet(t.dpe) ? `classe ${esc(t.dpe)}` : na('non renseigné')],
          ['Consommation', na('kWh/m²/an non renseigné')],
          ['GES', na('classe et kgCO2/m²/an non renseignés')],
          ['Dates des diagnostics', na('non renseignées')],
        ])}
      </div>
    </div>
    <div class="warn">
      <p class="warn-t">Règle appliquée : aucun champ vide, aucune valeur par défaut</p>
      <p>Tout champ absent s'affiche « non communiqué ». Une surface, une charge ou une année inventées dans un avis de valeur sont le risque juridique le plus direct de l'outil. <b>[MODÈLE]</b></p>
      <p class="mt"><b>À collecter pour que ce chapitre soit complet :</b> nombre de lots, lots principaux, syndic, procédures, travaux votés, plan pluriannuel, date du DPE et du mesurage Carrez, occupation. Aucun de ces champs n'existe aujourd'hui dans Estimo 2.4.</p>
    </div>
  `);

  // ==========================================================================
  // 6. Secteur et environnement
  // ==========================================================================
  const secteur = page(6, 'Chapitres 2 et 3', 'Votre secteur et son environnement', `
    <div class="warn big">
      <p class="warn-t">Rubrique non alimentée dans cette version</p>
      <p>Aucune des données de cette page n'est aujourd'hui branchée dans Estimo. Le texte type demande un plan cadastral, un zonage PLU, des autorisations d'urbanisme, un profil INSEE, des points d'intérêt et des temps de trajet. L'outil ne sait produire aucun de ces éléments : les afficher vides serait plus honnête que les remplir à la main, mais un chapitre vide en rendez-vous n'a aucune valeur. Deux décisions sont à prendre : brancher les sources, ou supprimer le chapitre.</p>
    </div>
    <p class="card-t mt">Ce que le texte type demande, et où le trouver</p>
    ${table(['Donnée attendue', 'Source', 'Statut'], [
      ['Parcelle, section, contenance', 'Cadastre, Etalab (API ou fichiers)', na('non branché')],
      ['Zonage PLU, prescriptions, contraintes', 'Géoportail de l\'urbanisme (GPU)', na('non branché')],
      ['Autorisations d\'urbanisme à 500 m', 'Sitadel, Etalab', na('non branché')],
      ['Typologie du bâti, périodes, propriétaires / locataires', 'Recensement INSEE, IRIS', na('non branché')],
      ['Commerces, écoles, santé, transports, distances', 'Base permanente des équipements, OSM, service d\'itinéraire', na('non branché')],
      ['Exposition aux risques', 'API Cerema', na('licence commerciale non vérifiée')],
    ])}
    <div class="note">
      <p class="note-t">Ce que cela coûte</p>
      <p>Trois des six sources sont libres (licence ouverte) mais demandent un travail de raccordement : cadastre et GPU par API, Sitadel par fichier annuel, INSEE par IRIS. Les points d'intérêt et les temps de trajet exigent en plus un service de calcul d'itinéraire, donc une clé et un quota. Ce n'est pas un chantier de rédaction, c'est un chantier de données.</p>
    </div>
  `);

  // ==========================================================================
  // 7. Le marché
  // ==========================================================================
  const tranches = [['moins de 60 m²', 0, 60], ['60 à 70 m²', 60, 70], ['70 à 82 m²', 70, 82]];
  const rowsT = tranches.map(([lab, a, bb]) => {
    const v = dvf.kept.filter((s) => s.surface >= a && s.surface < bb).map((s) => s.prixM2);
    return [lab, String(v.length), v.length ? eur(Math.round(medianOf(v))) + ' /m²' : na('effectif insuffisant')];
  });

  const marche = page(7, 'Chapitre 3', 'Le marché autour de votre bien', `
    <div class="kpis">
      <div class="kpi"><p class="kpi-n">${dvf.n}</p><p class="kpi-l">ventes retenues</p></div>
      <div class="kpi"><p class="kpi-n">${eur(dvf.median)}</p><p class="kpi-l">prix médian / m²</p></div>
      <div class="kpi"><p class="kpi-n">${eur(dvf.q1)} – ${eur(dvf.q3)}</p><p class="kpi-l">intervalle interquartile</p></div>
      <div class="kpi"><p class="kpi-n">${dvf.radius} m</p><p class="kpi-l">rayon · ${params.months} mois</p></div>
    </div>

    <p class="sub mt">Sur les ${params.months} derniers mois précédant l'arrêt des données (${dvf.cutoff.split('-').reverse().join('/')}), ${dvf.n} ventes d'appartements de surface comparable ont été enregistrées dans un rayon de ${dvf.radius} m, pour un prix médian de <b>${eur(dvf.median)} /m²</b> (intervalle interquartile : ${eur(dvf.q1)} à ${eur(dvf.q3)} /m²). Source : base DVF, Etalab, ventes notariées enregistrées jusqu'au ${dvf.cutoff.split('-').reverse().join('/')}.</p>

    <p class="card-t mt">Distribution des prix au m² des ventes retenues</p>
    ${histo()}

    <div class="grid2 gap mt">
      <div>
        <p class="card-t">Prix médian par tranche de surface</p>
        ${table(['Tranche', 'Ventes', 'Médiane'], rowsT)}
        <p class="tiny">Le texte type demande une ventilation par nombre de pièces : la base DVF ne contient pas le nombre de pièces. La ventilation par surface est donc la seule disponible.</p>
      </div>
      <div>
        <p class="card-t">Ce que le texte type demande et que je ne peux pas produire</p>
        ${table(['Rubrique', 'Raison'], [
          ['Offre actuellement en vente', na('aucune donnée d\'annonces')],
          ['Ancienneté moyenne des annonces', na('aucune donnée d\'annonces')],
          ['Délai de vente médian', na('aucune source de délai')],
          ['Taux de crédit en cours', na('aucune source branchée')],
        ])}
      </div>
    </div>
    <div class="note mt">
      <p class="note-t">En trois phrases</p>
      <p>Sur ${params.months} mois, ${dvf.n} ventes d'appartements de surface comparable ont été enregistrées dans un rayon de ${dvf.radius} m autour du bien.</p>
      <p>Les prix au m² s'échelonnent de ${eur(dvf.min)} à ${eur(dvf.max)}, pour une médiane de ${eur(dvf.median)} : l'écart interquartile de ${(disp * 100).toFixed(1).replace('.', ',')} % mesure l'hétérogénéité réelle du secteur, et interdit de parler d'un prix unique.</p>
      <p>La dernière vente retenue date de ${lastSale ? frDate(lastSale) : '—'}. En revanche, aucune donnée d'annonces ni de délai de vente n'est disponible : le positionnement par rapport à l'offre concurrente ne peut pas être établi.</p>
    </div>

  `);

  // ==========================================================================
  // 8. Méthode
  // ==========================================================================
  const methode = page(8, 'Chapitre 4', 'Notre méthode', `
    <p class="sub">Nous retenons les ventes enregistrées dans un rayon de ${dvf.radius} mètres autour du bien, étendu lorsque le nombre de ventes exploitables est inférieur à ${params.min}. <b>[MODÈLE]</b></p>
    <p class="sub">Critères de sélection : même type de bien, surface comprise entre 80 % et 120 % de celle du bien estimé, vente conclue au cours des ${params.months} derniers mois. Les ventes en bloc, entre proches, de parts et les biens atypiques sont écartées.</p>

    <p class="card-t mt">Comment nous calculons</p>
    <ol class="steps">
      <li><b>Surface de référence.</b> La surface privative loi Carrez pour un lot de copropriété, soit ${SURF} m².</li>
      <li><b>Prix au m² réel.</b> Chaque vente est ramenée à un prix au m² calculé sur le prix d'acte enregistré, jamais sur un prix affiché.</li>
      <li><b>Ajustement au bien.</b> Chaque vente est corrigée des différences constatées : ${A.rows.length} critère(s) retenu(s) ici, détaillés au chapitre suivant.</li>
      <li><b>Plafonds.</b> Chaque ajustement est borné et justifié.</li>
      <li><b>Valeur centrale.</b> Médiane des prix au m² ajustés, multipliée par la surface retenue.</li>
      <li><b>Fourchette.</b> 25e percentile pour la valeur basse, 75e pour la valeur haute, arrondis au millier d'euros.</li>
    </ol>

    <p class="card-t mt">Paramètres réellement appliqués par cette version</p>
    ${table(['Paramètre', 'Texte type (v1)', 'Appliqué ici', 'Dans le code de l\'app'], [
      ['Rayon de recherche', '300 m, étendu à 1 000 m si &lt; 8 ventes', `${dvf.radius} m`, '300 m, élargi par paliers jusqu\'à 2 000 m'],
      ['Fenêtre de ventes', '24 mois', `${params.months} mois`, '<b>3 ans</b>'],
      ['Tolérance de surface', '80 % – 120 %', '80 % – 120 %', '<b>65 % – 135 %</b>'],
      ['Minimum de comparables', '8', `${params.min}`, '8'],
      ['Plafond par ajustement', '15 %', '8 %', '8 %'],
      ['Plafond total', 'non prévu', '20 %', '20 %'],
      ['Valeurs aberrantes', 'non prévu', 'écartées (Tukey 1,5 IQR) : ' + dvf.removed, 'écartées (Tukey 1,5 IQR)'],
    ], 'params')}
    <div class="warn">
      <p class="warn-t">Le point le plus exposé du document</p>
      <p>Chaque étape annoncée doit être réellement appliquée par le code, sinon la description est fausse. Trois écarts existent aujourd'hui entre le texte et le code : la fenêtre (24 mois écrits, 3 ans codés), la tolérance de surface (±20 % écrits, ±35 % codés) et le plafond par ajustement (15 % écrits, 8 % codés). À trancher ensemble avant impression : c'est le texte qui doit décrire le code, pas l'inverse. <b>[MODÈLE]</b></p>
    </div>
    <div class="foot-note"><p><b>Ce que cette estimation ne fait pas.</b> Elle ne remplace pas une expertise immobilière, ni un diagnostic technique, ni un mesurage contradictoire. Elle ne tient pas compte d'éléments non visibles ou non déclarés : humidité, structure, réseaux, servitudes, contentieux de voisinage. Elle ne préjuge pas du prix effectivement obtenu, qui dépendra de l'état du marché au jour de la vente, du délai souhaité et de la négociation.</p></div>
  `);

  // ==========================================================================
  // 9. L'estimation
  // ==========================================================================
  const estimation = page(9, 'Chapitre 5', 'L\'estimation', `
    <div class="values">
      <div class="vcard"><p class="vl">Valeur basse</p><p class="vn">${eur(A.bas)}</p><p class="vm">${eur(A.bas / SURF)} / m²</p></div>
      <div class="vcard main"><p class="vl">Valeur retenue</p><p class="vn">${eur(A.valeur)}</p><p class="vm">${eur(A.m2)} / m²</p></div>
      <div class="vcard"><p class="vl">Valeur haute</p><p class="vn">${eur(A.haut)}</p><p class="vm">${eur(A.haut / SURF)} / m²</p></div>
    </div>
    ${range()}
    <p class="tiny center">Les valeurs ci-dessus sont exprimées ${ph('honoraires d\'agence inclus ou hors honoraires — à trancher', 'JURISTE')}. Cette précision figure obligatoirement en regard des montants.</p>

    <div class="grid2 gap mt">
      <div>
        <p class="card-t">Comment on passe de la médiane à la valeur retenue</p>
        ${table(['Étape', 'Valeur'], [
          ['Médiane DVF du secteur', `${eur(dvf.median)} / m²`],
          ...A.rows.map((r) => [esc(r.label), `<span class="${r.pct >= 0 ? 'up' : 'down'}">${pct(r.pct, true)}</span>`]),
          ...(A.manuel ? [['Positionnement de l\'agent', pct(A.manuel, true)]] : []),
          ['<b>Total ajusté</b>', `<b>${pct(A.total, true)}</b>${A.cappedTotal ? ' (plafonné)' : ''}`],
          ['<b>Prix au m² retenu</b>', `<b>${eur(A.m2)} / m²</b>`],
          ['<b>Surface retenue</b>', `<b>${SURF} m²</b>`],
          ['<b>Valeur retenue</b>', `<b>${eur(A.valeur)}</b>`],
        ])}
      </div>
      <div>
        <p class="card-t">Lecture</p>
        <p>Le marché du secteur ressort à <b>${eur(dvf.median)} /m²</b> sur ${dvf.n} ventes. Les caractéristiques du bien conduisent à un ajustement de <b>${pct(A.total, true)}</b>, soit <b>${eur(A.m2)} /m²</b> et <b>${eur(A.valeur)}</b> pour ${SURF} m².</p>
        ${P ? `<p class="mt">Le prix attendu par le propriétaire (${eur(P)}, soit ${eur(P / SURF)} /m²) se situe à <b class="${P / SURF >= A.m2 ? 'up' : 'down'}">${pct(P / A.valeur - 1, true)}</b> de la valeur retenue.</p>` : ''}
        <p class="mt">La valeur basse et la valeur haute encadrent la dispersion réelle des ventes du secteur. Elles ne sont pas une marge de négociation : elles décrivent l'écart entre les ventes les moins chères et les plus chères à caractéristiques comparables.</p>
        <div class="warn small mt">
          <p><b>Plancher de fiabilité.</b> En dessous de trois comparables, l'outil doit basculer en « estimation sans fourchette » et l'écrire sur le document. Ici : ${dvf.n} comparables, fourchette calculée.</p>
        </div>
        ${score.large ? `<div class="warn small mt"><p><b>Zone peu comparable.</b> ${dvf.n} ventes seulement dans un rayon de ${dvf.radius} m, alors que le seuil est de ${params.min}. Le score de confiance est plafonné et la fourchette ci-dessus doit être présentée à dire d'expert, pas comme un résultat statistique.</p></div>` : ''}
      </div>
    </div>
  `);

  // ==========================================================================
  // 10. Score de confiance
  // ==========================================================================
  const scorePage = page(10, 'Chapitre 5 — suite', `Score de confiance : ${score.total} / 100, ${score.level}`, `
    ${gauge()}
    ${table(['Critère', 'Constat', 'Points'], score.criteria.map((cr) => [cr.label, esc(cr.constat), `<b>${cr.pts}</b> / ${cr.max}`]))}
    <div class="grid2 gap mt">
      <div class="note">
        <p class="note-t">Ce que le score mesure</p>
        <p>La solidité statistique de l'estimation : le nombre, la dispersion et la fraîcheur des ventes comparables, la qualité des informations dont nous disposons sur le bien et sur sa surface. Le score plafonne en pratique autour de 80 : ce n'est pas une note sur 20, et 100 n'est pas atteignable sur ce secteur.</p>
      </div>
      <div class="note">
        <p class="note-t">Ce que le score ne mesure pas</p>
        <p>L'état réel du marché au jour de la vente, la qualité de la négociation, l'évolution des taux, ni la valeur d'attachement du propriétaire. Un score élevé ne garantit pas un prix, un score faible ne condamne pas le bien.</p>
      </div>
    </div>
    <p class="card-t mt">Barème appliqué</p>
    <p class="sub">Barème de Bob du 10/11/2026, calibré sur les ventes réelles du Cannet et de Mougins. La date d'arrêt des données (${frDate(dvf.cutoff)}) et la date de valorisation (${frDate(visitDate)}) sont affichées ensemble : un score sans date est une fausse précision.</p>
    ${table(['Critère', 'Poids', 'Barème'], [
      ['Comparables retenus (même type, Carrez ±20 %, 300 m, 24 mois)', '25', '≥ 20 → 25 · 12-19 → 19 · 8-11 → 12 · 5-7 → 6 · &lt; 5 → 0'],
      ['Dispersion (IQR / médiane)', '30', '≤ 15 % → 30 · 15-22 % → 22 · 22-30 % → 14 · 30-38 % → 7 · &gt; 38 % → 0'],
      ['Fraîcheur de la dernière vente', '20', '≤ 6 mois → 20 · 7-12 → 14 · 13-24 → 8 · &gt; 24 → 3'],
      ['Complétude de la fiche', '15', '6/6 → 15 · 4-5 → 9 · 2-3 → 4 · &lt; 2 → 0'],
      ['Qualité de la donnée de surface', '10', 'Carrez + DPE → 10 · un seul → 5 · aucun → 0'],
    ])}
    <p class="tiny">Deux écarts entre ce barème et le texte type, à trancher : (1) la fraîcheur est comptée depuis la <b>date de valorisation</b> et non depuis l'arrêt des données — sinon toute estimation paraît fraîche alors que la dernière vente publiée a dix mois ; (2) le barème de Bob est calibré sans exclusion des valeurs aberrantes, alors que le moteur applique un filtre de Tukey. Ici, avec exclusion : dispersion ${disp == null ? '—' : (disp * 100).toFixed(1).replace('.', ',')} %. Sans exclusion, le score serait plus bas. <b>[MODÈLE]</b></p>
  `);

  // ==========================================================================
  // 11-12. Comparables
  // ==========================================================================
  const compHead = ['N°', 'Vente', 'Distance', 'Surface', 'Prix de vente', 'Prix / m²', 'Écart'];
  const comps1Page = page(11, 'Chapitre 6', 'Les comparables', `
    <p class="sub">Les adresses exactes des ventes ne sont pas communiquées. Chaque ligne est une vente enregistrée, issue de la base DVF publiée par Etalab (licence ouverte), et non une annonce.</p>
    ${table(compHead, comps1.map((s, i) => compRow(s, i + 1)), 'comps')}
    <p class="tiny mt">La colonne « Écart » exprime l'écart entre le prix au m² de la vente et le prix au m² retenu pour votre bien. Les ventes sont triées de la plus récente à la plus ancienne.</p>
    <div class="note">
      <p class="note-t">Anonymisation</p>
      <p>Une vente reste identifiable par recoupement si l'on donne le numéro, l'étage, la surface exacte et la date exacte. Ici : mois et année seulement, surface au m², distance arrondie, aucune adresse, aucune référence de parcelle. Les quatre éléments identifiants ne sont jamais affichés ensemble. <b>[JURISTE]</b></p>
    </div>
  `);

  const comps2Page = page(12, 'Chapitre 6 — suite', 'Les comparables : annexe et limites', `
    ${comps2.length ? table(compHead, comps2.map((s, i) => compRow(s, i + 13)), 'comps') : '<p class="sub">Toutes les ventes retenues tiennent sur la page précédente.</p>'}
    <p class="tiny">${compsReste ? compsReste + " vente(s) supplémentaire(s) ne sont pas imprimées ici : elles restent consultables dans l’application, et le détail complet peut être joint en annexe numérique sur demande." : ""}</p>
    <div class="grid2 gap mt">
      <div>
        <p class="card-t">Ventes écartées du calcul</p>
        ${table(['Motif', 'Ventes'], [
          ['Prix au m² hors plage de plausibilité ou aberrant (Tukey 1,5 IQR)', String(dvf.removed)],
          ['Ventes hors fenêtre de ' + params.months + ' mois', String(dvf.windowN ? Math.max(0, dvf.windowN - dvf.n - dvf.removed) : 0)],
          ['Ventes de type différent ou hors rayon', na('non comptées')],
        ])}
        <p class="tiny">Le texte type ne décrit pas l'exclusion des valeurs aberrantes. Elle est pourtant appliquée par le code et change le résultat : elle doit figurer dans la méthode.</p>
      </div>
      <div>
        <p class="card-t">Colonnes demandées par le texte type, non disponibles</p>
        ${table(['Colonne', 'Raison'], [
          ['Quartier', na('DVF ne le fournit pas')],
          ['Nombre de pièces', na('absent de DVF')],
          ['Étage', na('absent de DVF')],
          ['Extérieur', na('absent de DVF')],
          ['Ajustement par ligne', na('le code applique un ajustement global')],
        ])}
        <p class="tiny">L'ajustement est calculé une fois pour le bien, puis appliqué à la médiane. Il n'existe pas d'ajustement vente par vente : la colonne demandée par le texte type ne peut pas être remplie sans fausser le document.</p>
      </div>
    </div>
    <div class="warn mt">
      <p class="warn-t">Biens actuellement en vente</p>
      <p>Le texte type demande un tableau de la concurrence avec prix affichés, source et date de relevé. Estimo n'a aucune donnée d'annonces : ce tableau ne peut pas être produit, et il ne doit pas être rempli à la main dans un document généré. À brancher, ou à retirer du PDF.</p>
    </div>
  `);

  // ==========================================================================
  // 13. Délais
  // ==========================================================================
  const delais = page(13, 'Chapitre 7', 'Délais de vente et positionnement', `
    <div class="warn big">
      <p class="warn-t">Chapitre non calculable en l'état</p>
      <p>Trois des quatre données de ce chapitre n'existent dans aucune source branchée : les délais de vente constatés, l'offre concurrente et le nombre de visites par mois. Le texte type le dit lui-même : la colonne « visites par mois » doit être supprimée plutôt que remplie par une estimation d'ambiance.</p>
    </div>
    <p class="card-t mt">Ce qui est calculable, et l'est</p>
    ${table(['Élément', 'Valeur', 'Statut'], [
      ['Prix au m² retenu pour votre bien', `${eur(A.m2)} / m²`, 'calculé'],
      ['Prix médian du secteur', `${eur(dvf.median)} / m²`, 'calculé'],
      ['Positionnement par rapport à la médiane', `<b>${pct(A.m2 / dvf.median - 1, true)}</b>`, 'calculé'],
      ['Positionnement par rapport à la fourchette du secteur', `entre ${eur(dvf.q1)} et ${eur(dvf.q3)} / m²`, A.m2 >= dvf.q1 && A.m2 <= dvf.q3 ? 'dans la fourchette' : 'hors fourchette'],
      ['Délai de vente médian du secteur', na('aucune source'), 'manquant'],
      ['Rang parmi les biens en vente', na('aucune donnée d\'annonces'), 'manquant'],
    ])}
    <p class="card-t mt">Trois scénarios de délai</p>
    ${table(['Prix de mise en vente', 'Écart à l\'estimation', 'Délai de vente estimé', 'Visites attendues / mois'], [
      [`${eur(A.valeur)}`, '0 %', na('non calculable'), na('non calculable')],
      [`${eur(A.valeur * 1.05)}`, '+ 5 %', na('non calculable'), na('non calculable')],
      [`${eur(A.valeur * 0.95)}`, '− 5 %', na('non calculable'), na('non calculable')],
    ])}
    <p class="tiny">Les prix sont calculés, les délais ne le sont pas. Un tableau à moitié vide dans un document client vaut moins qu'un tableau absent : c'est la première chose à trancher sur ce chapitre avec le chapitre 2.</p>
    <div class="note mt">
      <p class="note-t">Ce que je propose, à défaut</p>
      <p>Remplacer ce chapitre par une page unique « positionnement » : le prix au m² retenu, sa place dans la fourchette du secteur, l'écart au prix attendu, et deux phrases sur ce qui fait vendre au prix dans le secteur (état, photos, délai). Factuel, calculable, et suffisant en rendez-vous.</p>
    </div>
  `);

  // ==========================================================================
  // 14. Diagnostics
  // ==========================================================================
  const diagnostics = page(14, 'Chapitre 8', 'Diagnostics à réaliser', `
    <p class="sub">Avant la mise en vente, les diagnostics suivants sont à produire. La liste est filtrée selon la date du permis de construire (${val(t.annee)}), la situation de copropriété et la localisation du bien.</p>
    ${table(['Diagnostic', 'Applicable à votre bien', 'Validité', 'Fourni par', 'Coût'], diagRows, 'diag')}
    <div class="warn">
      <p class="warn-t">Deux réserves à lever avant mise en service</p>
      <p><b>[JURISTE]</b> Toutes les durées de validité et les dates de bascule ci-dessus doivent être revérifiées : elles changent à chaque loi, et un tableau faux dans un document client est une faute qui se retourne contre l'agence.</p>
      <p class="mt"><b>[MODÈLE]</b> Les colonnes « fourni par » et « coût » ne doivent s'afficher que si les données sont renseignées. Un coût inventé se paie en crédibilité : ici, aucun coût n'est renseigné, donc aucun coût n'est affiché.</p>
    </div>
  `);

  // ==========================================================================
  // 15. Honoraires
  // ==========================================================================
  const honoraires = page(15, 'Chapitre 9', 'Honoraires et frais', `
    <div class="warn big">
      <p class="warn-t">Barème non tranché</p>
      <p>Le barème d'honoraires de l'agence n'est pas dans les données du dossier, et les deux variantes du texte type ne doivent jamais être présentées l'une sous l'autre : un avis de valeur qui affiche deux grilles est illisible et juridiquement ambigu. L'outil doit produire une seule variante, celle du mandat. <b>[JURISTE]</b> <b>[AGENCE]</b></p>
    </div>
    <div class="grid2 gap mt">
      <div class="card">
        <p class="card-t">Variante 1 — honoraires à la charge du vendeur</p>
        <p>Prix de vente exprimé honoraires inclus : <b>${eur(A.valeur)}</b> TTC.</p>
        <p>Honoraires d'agence à la charge du vendeur : ${ph('taux %', 'AGENCE')} du prix, soit ${ph('montant', 'AGENCE')} TTC.</p>
        <p>Prix net vendeur : ${ph('montant', 'AGENCE')}.</p>
      </div>
      <div class="card">
        <p class="card-t">Variante 2 — honoraires à la charge de l'acquéreur</p>
        <p>Prix de vente hors honoraires : <b>${eur(A.valeur)}</b>.</p>
        <p>Honoraires d'agence à la charge de l'acquéreur : ${ph('taux %', 'AGENCE')} du prix, soit ${ph('montant', 'AGENCE')} TTC.</p>
        <p>Prix de vente honoraires inclus : ${ph('montant', 'AGENCE')} TTC.</p>
      </div>
    </div>
    <p class="sub mt">Le barème d'honoraires de l'agence est affiché en agence et annexé au mandat. Aucun honoraire n'est dû si la vente n'est pas conclue.</p>
    <p class="card-t mt">Frais à prévoir en plus du prix</p>
    ${table(['Poste', 'Montant estimé', 'À la charge de'], [
      ['Droits de mutation, émoluments et débours', `${ph('fourchette en %', 'MODÈLE')} du prix`, 'Acquéreur'],
      ['Diagnostics obligatoires', na('non chiffré'), 'Vendeur'],
      ['Travaux de présentation avant vente', na('sur devis'), 'Vendeur'],
      ['Frais de syndic (assemblée, état daté)', na('non chiffré'), 'Vendeur'],
    ])}
    <p class="tiny">L'indication TTC est obligatoire. Les frais d'acquisition sont calculés par tranches et dépendent du département et du type de bien : tant que l'outil ne les calcule pas correctement, une fourchette en pourcentage suffit, à condition de la nommer comme telle.</p>
  `);

  // ==========================================================================
  // 16. Lexique
  // ==========================================================================
  const lexiquePage = page(16, 'Chapitre 10', 'Lexique', `
    <div class="lex">
      ${lexique.map(([k, v]) => `<p><b>${esc(k)}.</b> ${esc(v)}</p>`).join('')}
    </div>
  `);

  // ==========================================================================
  // 17. Mentions
  // ==========================================================================
  const mentions = page(17, 'Chapitre 11', 'Conditions d\'usage et données personnelles', `
    <div class="warn">
      <p class="warn-t">Page à faire valider par un juriste avant tout usage réel</p>
      <p>Aucune des informations d'entreprise ci-dessous n'est renseignée : raison sociale, RCS, TVA, carte professionnelle, garantie financière, assurance, médiateur. Je ne les ai pas et je ne les inventerai pas. <b>[JURISTE]</b> <b>[AGENCE]</b></p>
    </div>
    <p class="card-t mt">Éditeur du document</p>
    <p class="legal">${ph('raison sociale, forme juridique, capital', 'AGENCE')}, dont le siège social est ${ou(AGENCE.adresse)}, immatriculée au RCS de ${ph('ville', 'AGENCE')} sous le numéro ${ph('numéro', 'AGENCE')}, numéro de TVA intracommunautaire ${ph('numéro', 'AGENCE')}.<br>
    Carte professionnelle ${ph('transaction / gestion', 'AGENCE')} n° ${ph('numéro', 'AGENCE')}, délivrée par ${ph('autorité', 'AGENCE')}.<br>
    Garantie financière : ${ph('organisme, adresse', 'AGENCE')}. Assurance responsabilité civile professionnelle : ${ph('assureur, police', 'AGENCE')}.<br>
    Médiateur de la consommation : ${ph('nom, adresse, site', 'AGENCE')}.</p>

    <p class="card-t mt">Rédacteur du document</p>
    <p class="legal">${ou(AGENCE.agent)}, ${ou(AGENCE.fonction)}, immatriculé au registre spécial des agents commerciaux de ${ph('ville', 'AGENCE')} sous le numéro ${ph('numéro', 'AGENCE')}, mandataire de ${ph('raison sociale', 'AGENCE')}.</p>

    <p class="card-t mt">Nature du document</p>
    <p class="legal">Avis de valeur établi à la demande de ${esc(nom)}, à titre d'information et sans caractère contractuel. Il ne constitue pas une expertise immobilière, ni un mandat de vente, ni une promesse synallagmatique de vente. Il ne peut être utilisé comme base de négociation avec un tiers sans l'accord écrit de son auteur.</p>

    <p class="card-t mt">Informations sur le bien et non-opposabilité</p>
    <p class="legal">Les informations relatives au bien proviennent des déclarations du propriétaire et de la visite du ${esc(visitDate)} ; elles n'ont pas fait l'objet de vérifications techniques. Surface privative loi Carrez : ${SURF} m², mesurage ${ph('date et auteur', 'AGENCE')}. DPE : classe ${val(t.dpe)}, établi le ${ph('date', 'AGENCE')}.<br>
    L'estimation est établie à la date du ${esc(visitDate)} et ne vaut que pour cette date. Elle ne peut être opposée ni au propriétaire, ni à l'acquéreur, ni à un tiers.</p>

    <p class="card-t mt">Données personnelles</p>
    <p class="legal">Les données de ce dossier (identité, coordonnées, adresse du bien) sont utilisées pour la seule réalisation de l'estimation et la relation commerciale qui en découle. Elles sont conservées ${ph('durée', 'JURISTE')} et ne sont cédées à aucun tiers sans accord. Vous disposez d'un droit d'accès, de rectification, d'effacement et d'opposition, exerçable auprès de ${ph('contact', 'AGENCE')}.</p>
  `);

  // ==========================================================================
  // 18. Journal des données
  // ==========================================================================
  const journal = page(18, 'Chapitre 12', 'Journal des données', `
    <p class="sub">Ce que l'estimation a réellement utilisé, et avec quelle licence. Une donnée dont la licence n'est pas vérifiée n'est pas utilisée : elle est signalée « bloqué » et n'apparaît nulle part ailleurs dans le document.</p>
    ${table(['Source', 'Usage', 'Millésime', 'Licence', 'Statut'], [
      ['DVF, Etalab', 'ventes comparables, médianes', `ventes jusqu'au ${dvf.cutoff.split('-').reverse().join('/')}`, 'Licence ouverte 2.0, attribution obligatoire', '<span class="ok">vérifié</span>'],
      ['Cadastre, Etalab', 'parcelle, plan', '—', 'Licence ouverte', na('non branché')],
      ['Sitadel, Etalab', 'autorisations d\'urbanisme', '—', 'Licence ouverte', na('non branché')],
      ['Recensement, INSEE', 'profil du quartier', '—', 'Licence ouverte', na('non branché')],
      ['Carte des loyers, ANIL', 'loyers de référence', '—', '<b>usage commercial non vérifié</b>', '<span class="ko">bloqué</span>'],
      ['API Cerema', 'exposition aux risques', '—', '<b>usage commercial non vérifié</b>', '<span class="ko">bloqué</span>'],
    ])}
    <div class="grid3 mt">
      <div class="kpi small"><p class="kpi-l">Arrêt des données DVF</p><p class="kpi-n sm">${dvf.cutoff.split('-').reverse().join('/')}</p></div>
      <div class="kpi small"><p class="kpi-l">Date de la visite</p><p class="kpi-n sm">${visitDate.split('-').reverse().join('/')}</p></div>
      <div class="kpi small"><p class="kpi-l">Décalage données / visite</p><p class="kpi-n sm">${monthsBetween(dvf.cutoff, visitDate)} mois</p></div>
    </div>
    <p class="sub mt">Le décalage entre la date de valorisation et la dernière vente disponible est normal : les actes sont publiés avec un délai administratif. Trois dates distinctes sont affichées, jamais une seule : c'est ce qui permet de dire plus tard sur quelles données l'estimation a été faite.</p>
    <p class="card-t mt">Points à trancher avant intégration</p>
    ${table(['N°', 'Point', 'Qui tranche'], [
      ['1', 'Marque apposée sur le PDF : identité de l\'agence, ou bloc neutre par défaut', 'Marc + réseau'],
      ['2', 'Bloc éditeur, responsable de traitement, mentions légales', 'Juriste'],
      ['3', 'Durées de validité des diagnostics', 'Juriste'],
      ['4', 'Barème d\'honoraires et variante à afficher', 'Marc'],
      ['5', 'Paramètres de méthode : rayon, filtres, plafonds, percentiles', 'Bob et Mike'],
      ['6', 'Barème du score de confiance', 'Bob'],
      ['7', 'Licences ANIL et Cerema', 'Mike'],
      ['8', 'Propriété du document produit', 'Juriste + réseau'],
    ], 'todo')}
    <p class="tiny">Généré par Estimo 2.4 le ${visitDate.split('-').reverse().join('/')} — ${dvf.source}, arrêt des données ${dvf.cutoff}.${DEMO ? ' Document de test : ne pas diffuser.' : ''}</p>
  `);

  // ==========================================================================
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Avis de valeur — ${esc(adresse)} — TEST</title>
<style>${CSS}</style></head><body>
${cover}${sommaire}${agence}${bien1}${bien2}${secteur}${marche}${methode}${estimation}${scorePage}${comps1Page}${comps2Page}${delais}${diagnostics}${honoraires}${lexiquePage}${mentions}${journal}
</body></html>`;
}

function medianOf(a) { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function monthsBetween(a, b) { const d = (new Date(b) - new Date(a)) / 2.6298e9; return Math.round(d); }

const CSS = `:root{--navy:#0b1f3a;--navy2:#16305a;--ink:#111c2e;--muted:#5b6b82;--line:#dde5ef;--soft:#f4f7fb;--tint:#eef3f9;--green:#0f9d6e;--amber:#8a5a00;--amber-bg:#fffaef;--red:#b42318}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff}
body{font-family:'Liberation Sans','DejaVu Sans',Arial,sans-serif;color:var(--ink);font-size:9.3pt;line-height:1.42;-webkit-print-color-adjust:exact;print-color-adjust:exact}
/* Document d'impression : pas d'aplat sombre, le bleu sert de texte et de filet.
   Les seuls fonds colorés sont des teintes claires (>= 90 % de blanc). */
@page{size:A4;margin:0}
.sheet{width:210mm;height:296.6mm;position:relative;overflow:hidden;padding:15mm 15mm 13mm;page-break-after:always;background:#fff}
.sheet:last-child{page-break-after:auto}
p{margin:0 0 3.2mm}
b{font-weight:700}
/* en-tête / pied */
.ph-head{display:flex;align-items:center;justify-content:space-between;border-bottom:.4pt solid var(--line);padding-bottom:2.4mm;margin-bottom:5mm}
.brand{display:flex;align-items:center;gap:2mm}
.brand span{font-size:7.4pt;font-weight:700;letter-spacing:.16em;color:var(--navy)}
.head-right{font-size:7.6pt;color:var(--muted)}
.pg-title{margin-bottom:4mm}
.kicker{font-size:7.2pt;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);margin:0 0 1mm}
h1{font-size:16.5pt;line-height:1.15;margin:0;color:var(--navy);letter-spacing:-.01em}
.pg-body{height:calc(296.6mm - 15mm - 13mm - 14mm - 12mm);overflow:hidden}
.pg-foot{position:absolute;left:15mm;right:15mm;bottom:7mm;display:flex;justify-content:space-between;font-size:6.8pt;color:#8494a8;border-top:.4pt solid var(--line);padding-top:1.6mm}
/* couverture claire */
.cover{padding:0;background:#fff;color:var(--ink);border-top:3mm solid var(--navy)}
.cov-top{display:flex;align-items:flex-start;justify-content:space-between;padding:14mm 16mm 0}
.cov-logo{display:flex;gap:3mm;align-items:center}
.cov-brand{font-size:10.5pt;font-weight:700;letter-spacing:.22em;margin:0;color:var(--navy)}
.cov-brand-sub{font-size:8pt;color:var(--muted);margin:0;letter-spacing:.06em}
.cov-test{font-size:7pt;letter-spacing:.18em;border:.6pt solid var(--navy);color:var(--navy);border-radius:2mm;padding:1.2mm 2.4mm;margin:0}
.cov-main{padding:32mm 16mm 0}
.cov-main h1{font-size:44pt;line-height:.98;letter-spacing:-.03em;color:var(--navy);margin:0}
.cov-sub{font-size:12pt;color:var(--navy2);margin:3mm 0 0;letter-spacing:.02em}
.cov-line{width:26mm;height:1.4mm;background:var(--navy);margin:6mm 0}
.cov-addr{font-size:13pt;margin:0;color:var(--ink)}
.cov-meta{font-size:9pt;color:var(--muted);margin-top:2.5mm}
.cov-foot{position:absolute;left:16mm;right:16mm;bottom:22mm;display:flex;justify-content:space-between;gap:8mm;align-items:flex-end;border-top:.4pt solid var(--line);padding-top:4mm}
.cov-lbl{font-size:6.8pt;text-transform:uppercase;letter-spacing:.14em;color:var(--muted);margin:0}
.cov-strong{font-weight:700;font-size:9.6pt;margin:0;color:var(--navy)}
.cov-foot p{font-size:8.4pt;color:var(--ink);margin:0}
.cov-disc{max-width:76mm;background:var(--soft);border-left:1.2mm solid var(--navy);padding:3mm 4mm;font-size:7.8pt;color:var(--ink)}
.cov-testbar{position:absolute;left:0;right:0;bottom:0;background:#fdf1d1;color:#6b4700;border-top:.5pt solid #e6c483;font-size:7.2pt;padding:2.4mm 16mm;text-align:center;font-weight:600}
/* tableaux */
.t{width:100%;border-collapse:collapse;font-size:8.2pt;margin-bottom:2mm}
.t th{background:var(--tint);color:var(--navy);text-align:left;padding:1.6mm 2mm;font-size:7.4pt;font-weight:700;letter-spacing:.02em;border-bottom:.9pt solid var(--navy)}
.t td{padding:1.5mm 2mm;border-bottom:.4pt solid var(--line);vertical-align:top}
.t tbody tr:nth-child(even) td{background:#fafcfe}
.t td:first-child{color:var(--navy)}
.t.toc td:first-child{width:6mm;color:var(--muted)}
.t.toc td:last-child{text-align:right;width:12mm;font-weight:700}
.t.params{font-size:7.5pt}
.t.comps td{font-size:7.9pt;padding:1.35mm 2mm}
.t.diag{font-size:7.5pt}
.t.todo{font-size:7.6pt}
.t td:last-child{white-space:normal}
.up{color:var(--green);font-weight:700}
.down{color:var(--red);font-weight:700}
.ok{color:var(--green);font-weight:700}
.ko{color:var(--red);font-weight:700}
/* blocs */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:5mm}
.grid2.gap{gap:6mm}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
.card{border:.5pt solid var(--line);border-radius:2mm;padding:4mm;background:#fff}
.card-t{font-size:8.6pt;font-weight:700;color:var(--navy);margin:0 0 2mm}
.lead{font-size:11pt;font-weight:700;color:var(--navy);margin:0 0 1mm}
.sub{color:#33445c}
.mt{margin-top:4mm}
.note{background:var(--soft);border-radius:2mm;padding:3.5mm 4mm;font-size:8.4pt}
.note-t{font-weight:700;color:var(--navy);margin:0 0 1.4mm;font-size:8.6pt}
.warn{background:var(--amber-bg);border:.5pt solid #f0d9a8;border-left:1.2mm solid #c98f2a;border-radius:1.5mm;padding:3.5mm 4mm;font-size:8.2pt}
.warn.big{padding:4.5mm 5mm;font-size:8.6pt}
.warn.small{padding:2.5mm 3mm;font-size:7.8pt}
.warn-t{font-weight:700;color:var(--amber);margin:0 0 1.4mm}
.warn ul{margin:0;padding-left:4.5mm}
.warn li{margin-bottom:1.2mm}
.foot-note{border-top:.5pt solid var(--line);padding-top:2.5mm;font-size:7.8pt;color:#33445c}
.tiny{font-size:7.2pt;color:var(--muted);line-height:1.35;margin:1.4mm 0 0}
.center{text-align:center}
.legal{font-size:7.9pt;line-height:1.45}
.ph{display:inline-block;border:.5pt dashed #c98f2a;background:#fffaef;color:var(--amber);border-radius:1mm;padding:0 1.2mm;font-size:7.4pt}
.ph b{font-size:6pt;letter-spacing:.06em;opacity:.85}
.na{color:#8a97a8;font-style:italic;font-size:7.6pt}
/* kpi : carte claire, filet bleu en haut */
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-bottom:2mm}
.kpi{background:#fff;color:var(--ink);border:.5pt solid var(--line);border-top:1.2mm solid var(--navy);border-radius:1.5mm;padding:3mm;text-align:center}
.kpi-n{font-size:12.5pt;font-weight:700;margin:0;letter-spacing:-.01em;color:var(--navy)}
.kpi-n.sm{font-size:10.5pt}
.kpi-l{font-size:6.8pt;color:var(--muted);margin:.6mm 0 0;text-transform:uppercase;letter-spacing:.06em}
.kpi.small{padding:2.5mm 2mm}
/* visuels */
.histo{width:100%;height:auto;margin:1mm 0 0}
.gauge{width:100%;height:auto;margin:0 0 3mm}
.range{width:100%;height:auto;margin:0 0 1mm}
.steps{margin:0 0 2mm;padding-left:5mm;font-size:8.4pt}
.steps li{margin-bottom:1.4mm}
/* estimation : la valeur retenue ressort par le cadre, pas par un aplat */
.values{display:grid;grid-template-columns:1fr 1.14fr 1fr;gap:3mm;margin-bottom:4mm}
.vcard{border:.5pt solid var(--line);border-radius:2mm;padding:3.5mm 3mm;text-align:center;background:#fff}
.vcard.main{background:var(--tint);border:1pt solid var(--navy);color:var(--navy);padding:5mm 3mm}
.vl{font-size:7pt;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:0 0 1.2mm}
.vcard.main .vl{color:var(--navy2)}
.vn{font-size:19pt;font-weight:700;margin:0;letter-spacing:-.02em;color:var(--navy)}
.vcard.main .vn{font-size:23pt;color:var(--navy)}
.vm{font-size:8pt;color:var(--muted);margin:.8mm 0 0}
.vcard.main .vm{color:var(--navy2)}
/* lexique */
.lex{columns:2;column-gap:7mm;font-size:7.9pt;line-height:1.4}
.lex p{margin:0 0 2.6mm;break-inside:avoid}
.lex b{color:var(--navy)}
`;

// ===========================================================================
// Adaptateur : dossier Estimo + comparatif DVF -> document prêt à imprimer.
// Rien ici ne touche au DOM : testable sous Node (tests/pdfdoc.test.mjs) et
// utilisable tel quel dans l'app (fonction exportAvis de src/app.template.html).
// ===========================================================================

export const PDFDOC_VERSION = '1.0';
export const CUTOFF_DEFAUT = '2025-12-31'; // DATA_CUTOFF de js/dvf.js

const nOf = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return Number.isFinite(x) ? x : null; };
const todayISO = () => new Date().toISOString().slice(0, 10);

export const fmtEur = (v) => (v == null || !Number.isFinite(+v) ? '—' : Math.round(v).toLocaleString('fr-FR') + ' €');
export const fmtPct = (x, signed = false) => { if (x == null) return '—'; const s = (x * 100).toFixed(1).replace('.', ','); return (signed && x >= 0 ? '+' : '') + s + ' %'; };
export const fmtDateFr = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—');
export const fmtMonth = (iso) => (iso ? iso.slice(0, 4) + '-' + iso.slice(5, 7) : '—');

// Histogramme des prix/m² + formateurs utilisés par le gabarit.
export function makeHelpers(data) {
  const kept = (data && data.dvf && data.dvf.kept) || [];
  const vals = kept.map((s) => Number(s.prixM2)).filter((v) => v > 0);
  const bins = [];
  if (vals.length) {
    const lo = Math.floor(Math.min(...vals) / 250) * 250;
    const hi = Math.ceil(Math.max(...vals) / 250) * 250;
    for (let x = lo; x < hi; x += 250) bins.push({ from: x, to: x + 250, n: vals.filter((v) => v >= x && v < x + 250).length });
  }
  return { bins, eur: fmtEur, pct: fmtPct, fm: fmtMonth };
}

// Barème de Bob (10/11/2026), 5 critères / 100 points.
// Fraîcheur comptée depuis la date de valorisation (visite), pas depuis l'arrêt des données.
export function scoreConfiance(D, dvf, A, opts) {
  const o = opts || {};
  const visitDate = o.visitDate || todayISO();
  const params = o.params || { min: 8, months: 24 };
  const b = (D && D.bien) || {}, t = (D && D.technique) || {};
  const SURF = o.SURF != null ? o.SURF : (nOf(b.carrez) || nOf(b.habitable));
  const lastSale = dvf && dvf.lastSale ? dvf.lastSale : null;
  const monthsAtVisit = lastSale ? Math.max(0, Math.round((new Date(visitDate) - new Date(lastSale)) / 2.6298e9)) : null;

  const completude = [
    ['surface', !!SURF],
    ['étage', b.etage !== '' && b.etage != null],
    ['extérieur', !!(nOf(b.terrasse) || nOf(b.balcon))],
    ['état', !!(t.notesEtat || t.travaux)],
    ['annexes', !!(nOf(b.cave) || t.parking)],
    ['DPE / GES', !!t.dpe],
  ];
  const nbChamps = completude.filter(([, ok]) => ok).length;
  const dispRaw = dvf && dvf.median ? (dvf.q3 - dvf.q1) / dvf.median : null;
  const dispPct = dispRaw == null ? null : Math.round(dispRaw * 1000) / 10;
  const large = !!dvf && dvf.n < params.min;

  const ptsN0 = dvf.n >= 20 ? 25 : dvf.n >= 12 ? 19 : dvf.n >= 8 ? 12 : dvf.n >= 5 ? 6 : 0;
  const ptsN = Math.max(0, ptsN0 - (dvf.radius > 300 ? 6 : 0));
  const ptsD0 = dispPct == null ? 0 : dispPct <= 15 ? 30 : dispPct <= 22 ? 22 : dispPct <= 30 ? 14 : dispPct <= 38 ? 7 : 0;
  const ptsD = large ? Math.min(ptsD0, 15) : ptsD0;
  const ptsF = monthsAtVisit == null ? 0 : monthsAtVisit <= 6 ? 20 : monthsAtVisit <= 12 ? 14 : monthsAtVisit <= 24 ? 8 : 3;
  const ptsC = nbChamps === 6 ? 15 : nbChamps >= 4 ? 9 : nbChamps >= 2 ? 4 : 0;
  const surfOk = !!nOf(b.carrez), dpeOk = !!t.dpe;
  const ptsQ = surfOk && dpeOk ? 10 : (surfOk || dpeOk) ? 5 : 0;
  const total = ptsN + ptsD + ptsF + ptsC + ptsQ;
  const level = total >= 75 ? 'élevé' : total >= 45 ? 'moyen' : 'faible';

  return {
    total, level, large, carrezManquant: !surfOk, bareme: 'Bob 10/11/2026',
    criteria: [
      { label: 'Comparables retenus', constat: `${dvf.n} vente(s) à ${dvf.radius} m`, pts: ptsN, max: 25 },
      { label: 'Dispersion (IQR / médiane)', constat: dispPct == null ? 'non calculable' : `${dispPct.toFixed(1).replace('.', ',')} %${large ? ' — non significative (n < 8)' : ''}`, pts: ptsD, max: 30 },
      { label: 'Fraîcheur de la dernière vente', constat: monthsAtVisit == null ? 'aucune vente' : `${monthsAtVisit} mois au ${fmtDateFr(visitDate)}`, pts: ptsF, max: 20 },
      { label: 'Complétude de la fiche', constat: `${nbChamps} champs sur 6`, pts: ptsC, max: 15 },
      { label: 'Qualité de la donnée de surface', constat: `${surfOk ? 'Carrez renseigné' : 'pas de Carrez'} · ${dpeOk ? 'DPE renseigné' : 'pas de DPE'}`, pts: ptsQ, max: 10 },
    ],
    champs: completude.map(([k, ok]) => ({ k, ok })),
    monthsAtVisit,
  };
}

// Comparatif enregistré par DvfPanel -> structure attendue par le gabarit.
// v.comps est plafonné à 40 ventes : min/max portent donc sur les 40 plus proches.
export function dvfFromApp(v, opts) {
  const o = opts || {};
  const comps = ((v && v.comps) || []).map((c) => ({ date: c.date, prix: c.prix, surface: c.surface, prixM2: c.prixM2, distance: c.distance }));
  const m2s = comps.map((c) => Number(c.prixM2)).filter((x) => x > 0);
  return {
    n: v && v.n != null ? v.n : comps.length,
    removed: (v && v.removed) || 0,
    median: v && v.median, q1: v && v.q1, q3: v && v.q3,
    min: m2s.length ? Math.round(Math.min(...m2s)) : null,
    max: m2s.length ? Math.round(Math.max(...m2s)) : null,
    radius: (v && v.radius) || 300,
    kept: comps, excluded: [],
    lastSale: (v && v.lastSale) || '',
    since: (v && v.since) || '',
    cutoff: o.cutoff || (v && v.cutoff) || CUTOFF_DEFAUT,
    source: (v && v.source) || 'DVF Etalab (geo-dvf)',
    windowN: ((v && v.n) || comps.length) + ((v && v.removed) || 0),
  };
}

export function avisFileName(D) {
  const c = (D && D.client) || {};
  const nom = [c.prenom, c.nom].filter(Boolean).join('-') || 'client';
  return 'avis-de-valeur-' + nom.replace(/[^\p{L}\p{N}-]+/gu, '_') + '-' + todayISO();
}

// Point d'entrée unique de l'app. opts : { ajust (obligatoire), visitDate, cutoff, min, demo, appVersion }
export function buildAvis(D, opts) {
  const o = opts || {};
  const A = o.ajust;
  if (!A || !A.ok) throw new Error("Lancez d'abord le comparatif DVF et renseignez la surface : sans médiane ni surface, aucun avis de valeur ne peut être produit.");
  const visitDate = o.visitDate || todayISO();
  const v = D.dvf || {};
  const monthsRaw = v.since ? Math.round((new Date(visitDate) - new Date(v.since)) / 2.6298e9) : null;
  const params = {
    radius: v.radius || 300,
    months: monthsRaw && monthsRaw > 0 ? monthsRaw : 36,
    tol: Number.isFinite(v.surfaceTol) ? v.surfaceTol : 0.35,
    min: o.min || 8,
    ...(o.params || {}),
  };
  const dvf = dvfFromApp(v, { cutoff: o.cutoff || CUTOFF_DEFAUT });
  const score = scoreConfiance(D, dvf, A, { visitDate, params, SURF: A.surface });
  const dossier = { ...D, meta_version: o.appVersion || D.meta_version || 'Estimo 2.5' };
  const data = { dossier, dvf, ajust: A, score, params, SURF: A.surface, visitDate, demo: o.demo !== false, agence: o.agence };
  return { html: renderAvis({ ...data, helpers: makeHelpers({ dvf }) }), data, filename: avisFileName(D) };
}
