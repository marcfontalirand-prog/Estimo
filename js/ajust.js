// Module ajustement — traduit les champs qualitatifs saisis par l'agent en coefficients
// explicites appliqués à la médiane DVF (€/m²). Pur : aucun DOM, testé par tests/ajust.test.mjs.
//
// MÉTHODE ET LIMITE, à ne pas masquer : la médiane DVF décrit le marché d'un rayon donné,
// toutes qualités confondues — elle contient donc déjà l'état moyen des biens vendus.
// Les coefficients ci-dessous ne remplacent pas cette réalité : ils mesurent un écart
// raisonnablement documenté par rapport au bien moyen du secteur.
// D'où deux garde-fous : chaque ligne est bornée à ±8 %, le total à ±20 %.
export const AJUST_VERSION = 1;
export const CAP_TOTAL = 0.2;   // dérive maximale de la valeur finale vs médiane DVF
export const CAP_COEF = 0.08;   // dérive maximale d'une ligne
export const CAP_MANUEL = 0.1;  // positionnement libre de l'agent

export function ajustNum(v) {
  if (v === true) return 1;
  if (v === false || v == null || v === '') return null;
  const x = parseFloat(String(v).replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(x) ? x : null;
}
function clampUnit(x, c) { return Math.max(-c, Math.min(c, x)); }
function same(v, ...opts) { return opts.includes(String(v || '').trim()); }

const AJR = (id, group, label, why, pct) => ({ id, group, label, why, pct });

export const RULES = [
  // ---- Le bien ----
  AJR('etage', 'Bien', 'Étage élevé',
    'Au-dessus du 2e, étage élevé = calme et vue ; écart constaté sur les ventes du secteur.',
    (d, c) => { if (c.type !== 'appartement') return null; const e = ajustNum(d.bien && d.bien.etage); if (e == null || e < 3) return null; return e >= 5 ? 0.04 : 0.02; }),
  AJR('rdc', 'Bien', 'Rez-de-chaussée',
    'Un rez-de-chaussée se commercialise moins bien : sécurité, vis-à-vis, lumière.',
    (d, c) => { if (c.type !== 'appartement') return null; const e = ajustNum(d.bien && d.bien.etage); return e === 0 ? -0.05 : null; }),
  AJR('sansasc', 'Bien', 'Sans ascenseur (étage ≥ 2)',
    'L\'absence d\'ascenseur pénalise les étages hauts, en particulier au-delà du 2e.',
    (d, c) => { if (c.type !== 'appartement') return null; const e = ajustNum(d.bien && d.bien.etage); if (e == null || e < 2) return null; return (d.bien && d.bien.ascenseur) ? null : -0.04; }),
  AJR('terrasse', 'Bien', 'Terrasse',
    'La terrasse est le premier critère de prime sur la Côte d\'Azur, devant le balcon.',
    (d) => { const t = ajustNum(d.bien && d.bien.terrasse); if (t == null) return null; if (t >= 8) return 0.04; if (t >= 3) return 0.02; return null; }),
  AJR('balcon', 'Bien', 'Balcon',
    'Un balcon compte, mais moins qu\'une terrasse : pas de cumul si une terrasse est déjà primée.',
    (d) => { const b = ajustNum(d.bien && d.bien.balcon); const t = ajustNum(d.bien && d.bien.terrasse); if (b == null || b < 3) return null; if (t != null && t >= 8) return null; return 0.015; }),
  AJR('jardin', 'Bien', 'Jardin',
    'Sur une maison, le jardin privatif pèse sur le prix au m² bâti.',
    (d, c) => { if (c.type !== 'maison') return null; const j = ajustNum(d.bien && d.bien.jardin); if (j == null) return null; if (j >= 100) return 0.03; if (j >= 30) return 0.015; return null; }),
  AJR('cave', 'Bien', 'Cave / annexes',
    'Une cave ou un cellier est un plus attendu, mais marginal sur le prix au m².',
    (d) => { const v = ajustNum(d.bien && d.bien.cave); return v != null && v >= 3 ? 0.01 : null; }),
  AJR('surface', 'Bien', 'Effet de taille',
    'Les petits logements se vendent plus cher au m², les grands moins cher : effet mesurable sur DVF.',
    (d, c) => { const s = c.S; if (s == null) return null; if (s < 35) return 0.05; if (s < 50) return 0.02; if (s > 120) return -0.03; if (s > 90) return -0.015; return null; }),
  // ---- L'environnement ----
  AJR('expo', 'Environnement', 'Exposition',
    'Plein sud ou traversant : lumière et confort de vie, argument de vente récurrent.',
    (d) => { const x = d.bien && d.bien.exposition; if (same(x, 'Sud', 'Sud-Ouest', 'Traversant')) return 0.02; if (same(x, 'Nord', 'Nord-Est')) return -0.02; return null; }),
  AJR('visavis', 'Environnement', 'Vis-à-vis',
    'Un vis-à-vis proche réduit l\'intimité et se négocie.',
    (d) => { const x = d.bien && d.bien.visavis; if (same(x, 'Proche')) return -0.03; if (same(x, 'Aucun')) return 0.015; return null; }),
  AJR('bruit', 'Environnement', 'Bruit',
    'Le bruit est un motif de refus explicite en visite : il se paie.',
    (d) => { const x = d.bien && d.bien.bruit; if (same(x, 'Bruyant')) return -0.04; if (same(x, 'Calme')) return 0.015; return null; }),
  AJR('vue', 'Environnement', 'Vue',
    'La vue mer est la prime la plus forte du marché local ; une vue sur cour la pénalise.',
    (d) => { const x = d.bien && d.bien.vue; if (same(x, 'Mer')) return 0.06; if (same(x, 'Montagne')) return 0.03; if (same(x, 'Dégagée')) return 0.02; if (same(x, 'Jardin / verdure')) return 0.015; if (same(x, 'Cour')) return -0.02; return null; }),
  // ---- La technique ----
  AJR('dpe', 'Technique', 'DPE',
    'Depuis l\'interdiction de location des passoires, le DPE est devenu un critère de prix.',
    (d) => { const x = String((d.technique && d.technique.dpe) || '').trim(); const m = { A: 0.04, B: 0.03, C: 0.01, E: -0.02, F: -0.05, G: -0.08 }; return m[x] != null ? m[x] : null; }),
  AJR('isolation', 'Technique', 'Isolation',
    'Une isolation bonne ou faible se retrouve dans les charges et le confort réel.',
    (d) => { const x = d.technique && d.technique.isolation; if (same(x, 'Bonne')) return 0.01; if (same(x, 'Faible')) return -0.02; return null; }),
  AJR('menuiseries', 'Technique', 'Menuiseries',
    'Simple vitrage = travaux à prévoir ; triple vitrage = argument énergétique.',
    (d) => { const x = d.technique && d.technique.menuiseries; if (same(x, 'Simple vitrage')) return -0.02; if (same(x, 'Triple vitrage')) return 0.01; return null; }),
  AJR('chauffage', 'Technique', 'Chauffage',
    'Une pompe à chaleur est un équipement valorisé ; le poêle à un degré moindre.',
    (d) => { const x = d.technique && d.technique.chauffage; if (same(x, 'Pompe à chaleur')) return 0.015; if (same(x, 'Poêle / insert')) return 0.005; return null; }),
  AJR('clim', 'Technique', 'Climatisation',
    'La climatisation est un équipement attendu dans le secteur, elle se valorise.',
    (d) => ((d.technique && d.technique.climatisation) ? 0.02 : null)),
  AJR('cuisine', 'Technique', 'Cuisine équipée',
    'Une cuisine équipée évite des travaux immédiats au primo-accédant.',
    (d) => ((d.technique && d.technique.cuisine) ? 0.01 : null)),
  AJR('piscine', 'Technique', 'Piscine',
    'Piscine privative : valeur d\'usage forte sur une maison, plus rare et moins déterminante en appartement.',
    (d, c) => { if (!(d.technique && d.technique.piscine)) return null; return c.type === 'appartement' ? 0.02 : 0.03; }),
  AJR('parking', 'Technique', 'Stationnement',
    'Sur Le Cannet et Mougins, le stationnement privatif est un argument de vente majeur.',
    (d) => { const x = d.technique && d.technique.parking; if (same(x, 'Garage')) return 0.04; if (same(x, 'Box fermé')) return 0.03; if (same(x, 'Parking couvert')) return 0.02; if (same(x, 'Place extérieure')) return 0.01; if (same(x, 'Plusieurs places')) return 0.05; return null; }),
  AJR('annee', 'Technique', 'Époque de construction',
    'Le bâti récent rassure (normes, charges) ; l\'ancien non rénové se négocie.',
    (d) => { const a = ajustNum(d.technique && d.technique.annee); if (a == null) return null; if (a >= 2010) return 0.02; if (a < 1949) return -0.02; return null; }),
  // ---- Points d'attention : ils se déduisent du prix, jamais l'inverse ----
  AJR('toiture', 'Points d\'attention', 'Toiture à reprendre', 'Poste de travaux lourd et chiffrable : il se retranche.', (d) => (d.technique && d.technique.toiture ? -0.03 : null)),
  AJR('fissures', 'Points d\'attention', 'Fissures', 'Signe de désordre structurel possible : décote forte et expertise à prévoir.', (d) => (d.technique && d.technique.fissures ? -0.05 : null)),
  AJR('humidite', 'Points d\'attention', 'Humidité', 'Traitement coûteux et récurrent : décote attendue par l\'acheteur.', (d) => (d.technique && d.technique.humidite ? -0.04 : null)),
  AJR('amiante', 'Points d\'attention', 'Amiante / plomb à diagnostiquer', 'Diagnostic à produire et travaux éventuels : à retrancher par prudence.', (d) => (d.technique && d.technique.amiante ? -0.02 : null)),
];

export const CHAMPS_UTILES = [
  ['dpe', 'DPE', (d) => d.technique && d.technique.dpe],
  ['exposition', 'exposition', (d) => d.bien && d.bien.exposition],
  ['vue', 'vue', (d) => d.bien && d.bien.vue],
  ['bruit', 'bruit', (d) => d.bien && d.bien.bruit],
  ['etage', 'étage', (d) => d.bien && d.bien.etage],
  ['isolation', 'isolation', (d) => d.technique && d.technique.isolation],
  ['parking', 'stationnement', (d) => d.technique && d.technique.parking],
  ['terrasse', 'terrasse / balcon', (d) => (d.bien && d.bien.terrasse) || (d.bien && d.bien.balcon)],
];

// Contexte partagé par toutes les règles.
export function ajustCtx(d) {
  const b = (d && d.bien) || {};
  const t = (d && d.client && d.client.type) || '';
  return {
    type: t === 'Appartement' ? 'appartement' : t === 'Maison' ? 'maison' : null,
    S: ajustNum(b.carrez) || ajustNum(b.habitable),
  };
}

// Calcule l'estimation ajustée. options : {dvf, surface, type} pour forcer une valeur.
export function computeAjust(d, options) {
  const o = options || {};
  const ctx = ajustCtx(d || {});
  if (o.surface !== undefined) ctx.S = ajustNum(o.surface);
  if (o.type !== undefined) ctx.type = o.type;
  const dvf = o.dvf !== undefined ? o.dvf : ((d && d.dvf) || null);
  const A = (d && d.ajust) || {};
  const over = A.over || {};
  const off = Array.isArray(A.off) ? A.off : [];
  const rows = [];
  for (const r of RULES) {
    if (off.includes(r.id)) continue;
    const custom = over[r.id];
    const customOn = custom !== undefined && custom !== null && custom !== '';
    const p = customOn ? ajustNum(custom) : r.pct(d || {}, ctx);
    if (p == null || p === 0) continue;
    const capped = Math.abs(p) > CAP_COEF;
    rows.push({ id: r.id, group: r.group, label: r.label, why: r.why, pct: clampUnit(p, CAP_COEF), capped, custom: customOn });
  }
  const somme = rows.reduce((s, r) => s + r.pct, 0);
  const manuel = clampUnit(ajustNum(A.manuel) || 0, CAP_MANUEL);
  const brut = somme + manuel;
  const total = clampUnit(brut, CAP_TOTAL);
  const cappedTotal = Math.abs(brut) > CAP_TOTAL + 1e-9;
  const median = ajustNum(dvf && dvf.median);
  const q1 = ajustNum(dvf && dvf.q1);
  const q3 = ajustNum(dvf && dvf.q3);
  const facteur = 1 + total;
  const S = ctx.S;
  const m2 = median ? Math.round(median * facteur) : null;
  const valeur = (m2 && S) ? Math.round(m2 * S) : null;
  const valeurMediane = (median && S) ? Math.round(median * S) : null;
  const bas = (q1 && S) ? Math.round(q1 * facteur * S) : null;
  const haut = (q3 && S) ? Math.round(q3 * facteur * S) : null;
  const manquants = CHAMPS_UTILES.filter(([, , get]) => { const v = get(d || {}); return v === '' || v == null || v === false; }).map(([, label]) => label);
  return {
    version: AJUST_VERSION,
    type: ctx.type, surface: S,
    rows, somme, manuel, total, cappedTotal,
    median, m2, valeur, valeurMediane,
    bas, haut,
    delta: (valeur != null && valeurMediane != null) ? valeur - valeurMediane : null,
    ecartPct: median ? facteur - 1 : null,
    manquants,
    ok: !!(median && S),
  };
}
