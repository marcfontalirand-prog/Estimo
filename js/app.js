import { estimate } from './engine.js';
import { geocode, priceNear, MIN_COMPARABLES } from './dvf.js';

const K = { draft: 'estimo.v3.draft', hist: 'estimo.v2.history', dvf: 'estimo.v3.dvfcache', theme: 'estimo.theme', addr: 'estimo.v3.revgeo' };
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };
const eur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const nf = (n) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);
const fdate = (d) => new Date(d).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
const parcelle = (id) => (id && id.length >= 14 ? `Section ${id.slice(8, 10).replace(/^0/, '')} n°${Number(id.slice(10))}` : '');

const f = $('f');
let dvf = null; // dernier résultat DVF affiché
let dvfSeq = 0;

// ---------- Thème ----------
$('theme').onclick = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; localStorage.setItem(K.theme, next);
};

// ---------- Formulaire ----------
function readForm() {
  const o = {};
  for (const el of f.elements) {
    if (!el.name) continue;
    if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; else if (!(el.name in o)) o[el.name] = ''; }
    else if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'number' || el.type === 'range') o[el.name] = el.value === '' ? '' : Number(el.value);
    else o[el.name] = el.value;
  }
  return o;
}
function fillForm(o) {
  for (const el of f.elements) {
    if (!el.name || !(el.name in o)) continue;
    if (el.type === 'radio') el.checked = String(o[el.name]) === el.value;
    else if (el.type === 'checkbox') el.checked = !!o[el.name]; else el.value = o[el.name];
  }
  syncType(); syncRange(); syncSrc();
}
const type = () => f.querySelector('input[name=type]:checked')?.value || 'appartement';
function syncType() {
  document.body.classList.toggle('is-maison', type() === 'maison');
  document.body.classList.toggle('is-appart', type() === 'appartement');
}
function syncRange() {
  const r = f.rayon; $('rayon-o').textContent = `${nf(r.value)} m`;
  r.style.setProperty('--p', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
}
function syncSrc() {
  const s = f.prixSource.value;
  $('prixSrc').textContent = s === 'dvf' ? '✓ Médiane DVF' : s === 'cache' ? '⟳ DVF (cache hors ligne)' : s === 'manuel' ? '✎ Saisie manuelle' : '—';
}
function setPrix(v, src) {
  f.prixM2.value = v || ''; f.prixSource.value = src; f.prixVerifie.checked = src === 'dvf' && dvf?.n >= MIN_COMPARABLES; syncSrc(); saveDraft();
}
const saveDraft = () => save(K.draft, readForm());

// ---------- Autocomplétion adresse ----------
const sugg = $('sugg'); let suggItems = [], suggIdx = -1, tGeo;
function closeSugg() { sugg.hidden = true; f.adresse.setAttribute('aria-expanded', 'false'); suggIdx = -1; }
function renderSugg() {
  sugg.innerHTML = suggItems.map((s, i) => `<li role="option" id="sg${i}" data-i="${i}" aria-selected="${i === suggIdx}">${esc(s.label.replace(/ \d{5} .*/, ''))}<br><small>${esc(s.label.match(/\d{5} .*/)?.[0] || s.city)}</small></li>`).join('');
  sugg.hidden = !suggItems.length; f.adresse.setAttribute('aria-expanded', String(!!suggItems.length));
  if (suggIdx >= 0) f.adresse.setAttribute('aria-activedescendant', 'sg' + suggIdx);
}
function pickAddr(s) {
  f.adresse.value = s.label; f.lat.value = s.lat; f.lon.value = s.lon; f.citycode.value = s.citycode;
  closeSugg(); saveDraft(); runDvf();
}
f.adresse.addEventListener('input', () => {
  f.lat.value = f.lon.value = ''; clearTimeout(tGeo);
  const q = f.adresse.value.trim();
  if (q.length < 4) { suggItems = []; renderSugg(); return; }
  tGeo = setTimeout(async () => { try { suggItems = await geocode(q); suggIdx = -1; renderSugg(); } catch { suggItems = []; renderSugg(); } }, 220);
});
f.adresse.addEventListener('keydown', (e) => {
  if (sugg.hidden) return;
  if (e.key === 'ArrowDown') { suggIdx = Math.min(suggItems.length - 1, suggIdx + 1); renderSugg(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { suggIdx = Math.max(0, suggIdx - 1); renderSugg(); e.preventDefault(); }
  else if (e.key === 'Enter') { e.preventDefault(); pickAddr(suggItems[Math.max(0, suggIdx)]); }
  else if (e.key === 'Escape') closeSugg();
});
f.adresse.addEventListener('blur', () => setTimeout(closeSugg, 150));
sugg.addEventListener('mousedown', (e) => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pickAddr(suggItems[li.dataset.i]); } });

// ---------- DVF ----------
const cacheKey = (p) => [Number(p.lat).toFixed(4), Number(p.lon).toFixed(4), p.type, Math.round(p.surface / 5) * 5, p.radius, p.years, p.autoWiden].join('|');
function slim(r) { return { ...r, kept: r.kept.map(({ id, date, prix, surface, prixM2, lat, lon, distance, parcelle }) => ({ id, date, prix, surface, prixM2, lat, lon, distance, parcelle })), outliers: undefined }; }
function cachePut(k, p, r) {
  const c = load(K.dvf, {}); c[k] = { ...slim(r), lat: p.lat, lon: p.lon, type: p.type };
  const keys = Object.keys(c).sort((a, b) => c[b].at - c[a].at); for (const x of keys.slice(25)) delete c[x];
  save(K.dvf, c);
}
function cacheFind(k, p) {
  const c = load(K.dvf, {}); if (c[k]) return c[k];
  // repli : résultat en cache le plus proche (même type, < 1,5 km)
  let best = null, bd = 1500;
  for (const v of Object.values(c)) {
    if (v.type !== p.type) continue;
    const d = Math.hypot((v.lat - p.lat) * 111320, (v.lon - p.lon) * 80600);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}
let tDvf;
const runDvfSoon = () => { clearTimeout(tDvf); tDvf = setTimeout(runDvf, 650); };
async function runDvf() {
  const i = readForm();
  const box = $('dvf');
  if (!i.lat || !(i.surface >= 9)) {
    box.className = 'dvf full'; box.innerHTML = `<p class="muted">${!i.lat ? 'Choisissez une adresse dans la liste proposée' : 'Indiquez la surface habitable'} pour interroger les ventes DVF.</p>`; return;
  }
  const p = { lat: Number(i.lat), lon: Number(i.lon), type: type(), surface: i.surface, radius: i.rayon, years: i.annees3 ? 3 : 2, autoWiden: i.autoWiden };
  const seq = ++dvfSeq, k = cacheKey(p);
  box.className = 'dvf full'; box.innerHTML = `<p class="muted"><span class="spinner" aria-hidden="true"></span>Recherche des ventes DVF autour du bien…</p>`;
  try {
    const r = await priceNear({ ...p, onProgress: (n) => { if (seq === dvfSeq) box.querySelector('p').lastChild.textContent = `Recherche des ventes DVF… ${n} mutations lues`; } });
    if (seq !== dvfSeq) return;
    dvf = { ...slim(r), offline: false }; cachePut(k, p, r);
  } catch (err) {
    if (seq !== dvfSeq) return;
    const c = cacheFind(k, p);
    if (!c) { box.className = 'dvf full'; box.innerHTML = `<p class="muted">⚠ Ventes DVF indisponibles (${esc(err.message)}). Hors ligne et sans valeur en cache : saisissez le prix/m² manuellement.</p>`; dvf = null; return; }
    dvf = { ...c, offline: true };
  }
  renderDvf();
  if (f.prixSource.value !== 'manuel' && dvf.n) setPrix(dvf.median, dvf.offline ? 'cache' : 'dvf');
}
function renderDvf() {
  const box = $('dvf'), d = dvf;
  if (!d || !d.n) { box.className = 'dvf full'; box.innerHTML = `<p class="muted">Aucune vente comparable trouvée${d ? ` jusqu'à ${nf(d.radius)} m` : ''}. Saisissez le prix/m² manuellement.</p>`; return; }
  box.className = 'dvf full ready';
  box.innerHTML = `<div class="dvf-head"><div class="dvf-med">${nf(d.median)} €<small>/m² médian</small></div>
    ${f.prixSource.value === 'manuel' ? `<button type="button" class="btn sm" id="useDvf">Utiliser la médiane</button>` : ''}</div>
    <div class="chips"><span class="chip"><b>${d.n}</b> ventes comparables</span><span class="chip">Q1–Q3 <b>${nf(d.q1)}–${nf(d.q3)} €</b></span>
    <span class="chip">Rayon <b>${nf(d.radius)} m</b>${d.widened ? ' (élargi)' : ''}</span><span class="chip">Depuis <b>${fdate(d.since)}</b></span>
    ${d.removed ? `<span class="chip">${d.removed} valeur${d.removed > 1 ? 's' : ''} aberrante${d.removed > 1 ? 's' : ''} exclue${d.removed > 1 ? 's' : ''}</span>` : ''}
    ${d.n < MIN_COMPARABLES ? '<span class="chip warn">Échantillon faible</span>' : ''}
    ${d.offline ? `<span class="chip warn">Hors ligne · cache du ${new Date(d.at).toLocaleDateString('fr-FR')}</span>` : ''}</div>`;
  $('useDvf')?.addEventListener('click', () => { setPrix(d.median, d.offline ? 'cache' : 'dvf'); renderDvf(); });
}
f.prixM2.addEventListener('input', () => { f.prixSource.value = 'manuel'; f.prixVerifie.checked = false; syncSrc(); renderDvf(); });

// ---------- Résultat ----------
function heat(p, lo, hi) { const t = Math.max(0, Math.min(1, (p - lo) / ((hi - lo) || 1))); return `hsl(${220 - t * 220} 75% 50%)`; }
function mapSvg(d, lat, lon) {
  const W = 600, H = 360, R = Math.max(d.radius, ...d.kept.map((c) => c.distance)) * 1.08;
  const sc = (H / 2 - 12) / R, kx = 111320 * Math.cos(lat * Math.PI / 180);
  const pts = d.kept.map((c) => { const x = W / 2 + (c.lon - lon) * kx * sc, y = H / 2 - (c.lat - lat) * 111320 * sc;
    return `<circle class="pt" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${heat(c.prixM2, d.q1, d.q3)}"><title>${fdate(c.date)} · ${nf(c.surface)} m² · ${eur(c.prix)} · ${nf(c.prixM2)} €/m² · ${c.distance} m</title></circle>`; }).join('');
  const rr = d.radius * sc;
  return `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Carte schématique des ${d.n} ventes comparables autour du bien">
    <line class="grid" x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}"/><line class="grid" x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}"/>
    <circle class="ring" cx="${W / 2}" cy="${H / 2}" r="${rr}"/><text x="${W / 2 + rr * 0.72 + 4}" y="${H / 2 - rr * 0.72}" font-size="12" fill="currentColor" opacity=".6">${nf(d.radius)} m</text>
    ${pts}<circle class="subj" cx="${W / 2}" cy="${H / 2}" r="9"><title>Bien estimé</title></circle>
    <text x="${W - 10}" y="22" text-anchor="end" font-size="13" font-weight="700" fill="currentColor" opacity=".6">N ↑</text></svg>`;
}
function compRows(d, all) {
  const list = [...d.kept].sort((a, b) => a.distance - b.distance).slice(0, all ? 500 : 15);
  return list.map((c) => `<tr><td>${fdate(c.date)}</td><td><span data-rev="${c.lat},${c.lon}">${esc(parcelle(c.parcelle))}</span></td><td class="n">${nf(c.surface)} m²</td><td class="n">${eur(c.prix)}</td><td class="n"><b>${nf(c.prixM2)}</b></td><td class="n">${nf(c.distance)} m</td></tr>`).join('');
}
async function reverseAddresses(root) {
  const cache = load(K.addr, {});
  await Promise.all([...root.querySelectorAll('[data-rev]')].slice(0, 30).map(async (el) => {
    const k = el.dataset.rev; let a = cache[k];
    if (!a) {
      try { const [lat, lon] = k.split(','); const r = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lat=${lat}&lon=${lon}&limit=1`); const j = await r.json();
        const p = j.features?.[0]?.properties; a = p ? (p.name || p.label) : ''; if (a) cache[k] = a; } catch { a = ''; }
    }
    if (a) el.innerHTML = `${esc(a)}<br><small>${el.textContent}</small>`;
  }));
  save(K.addr, cache);
}
function renderResult(input, r, date, d) {
  const el = $('result');
  const pos = (v) => ((v - r.basse) / (r.haute - r.basse)) * 100;
  const rows = r.ajustements.map((a) => `<tr><td>${esc(a.label)}${a.detail ? `<br><small>${esc(a.detail)}</small>` : ''}</td><td class="n">${a.kind === 'coef' ? '×' + a.coef.toFixed(2) : ''}</td><td class="n ${a.value >= 0 ? 'pos' : 'neg'}">${a.value ? (a.value > 0 ? '+' : '') + eur(a.value) : ''}</td></tr>`).join('');
  const src = input.prixSource === 'dvf' ? 'médiane DVF' : input.prixSource === 'cache' ? 'DVF en cache' : 'saisie manuelle';
  el.hidden = false;
  el.innerHTML = `<div class="card res-hero">
      <p class="ref">${esc(input.adresse || 'Bien sans adresse')} · ${input.type === 'maison' ? 'Maison' : 'Appartement'} · ${nf(input.surface)} m² · ${input.pieces} p.</p>
      <p class="k">Valeur estimée</p>
      <div class="price">${eur(r.central)}</div>
      <p class="ppm">${eur(r.prixM2Final)}/m² · base ${eur(input.prixM2)}/m² (${src}) · coef ×${r.coefTotal.toFixed(3)}</p>
      <div class="range" aria-label="Fourchette de ${eur(r.basse)} à ${eur(r.haute)}">
        <div class="range-track"><div class="range-fill" style="left:0;right:0"></div><div class="range-dot" style="left:${pos(r.central)}%"></div></div>
        <div class="range-l"><div><span>Basse</span><b>${eur(r.basse)}</b></div><div><span>±${(r.incertitude * 100).toFixed(1)} %</span></div><div><span>Haute</span><b>${eur(r.haute)}</b></div></div>
      </div>
      <div class="chips">${d ? `<span class="chip"><b>${d.n}</b> ventes DVF · ${nf(d.radius)} m</span>` : ''}<span class="chip">${new Date(date).toLocaleDateString('fr-FR')}</span></div>
      <div class="res-actions no-print"><button type="button" class="btn sm" onclick="window.print()">Imprimer / PDF</button><button type="button" class="btn sm" id="edit">Modifier</button></div>
    </div>
    <div class="card panel"><h3>Détail du calcul</h3><div class="tablewrap"><table><thead><tr><th>Base</th><th></th><th class="n">${eur(r.base)}</th></tr></thead><tbody>${rows || '<tr><td colspan="3"><small>Aucun ajustement</small></td></tr>'}</tbody></table></div>
      <ul class="notes">${r.manquants.length ? `<li>Données manquantes élargissant la fourchette : ${r.manquants.join(', ')}.</li>` : ''}${input.prixVerifie ? '' : '<li>Prix/m² non issu d’un échantillon DVF suffisant : fourchette élargie de 3 points.</li>'}<li>Estimation indicative fondée sur des coefficients paramétrables ; ne vaut pas expertise.</li></ul></div>
    ${d && d.n ? `<div class="card panel"><h3>Ventes comparables (${d.n})</h3>${mapSvg(d, Number(input.lat), Number(input.lon))}
      <div class="legend"><span>${nf(d.q1)} €/m²</span><i></i><span>${nf(d.q3)} €/m²</span></div>
      <div class="tablewrap"><table id="comps"><thead><tr><th>Date</th><th>Adresse / parcelle</th><th class="n">Surf.</th><th class="n">Prix</th><th class="n">€/m²</th><th class="n">Dist.</th></tr></thead><tbody>${compRows(d)}</tbody></table></div>
      ${d.n > 15 ? `<button type="button" class="btn sm ghost" id="allComps">Voir les ${d.n} ventes</button>` : ''}
      <ul class="notes"><li>Source : DVF (DGFiP) via l’API open data du Cerema, mutations d’un seul logement, ${d.removed} valeur(s) exclue(s) par la règle 1,5 × IQR. Adresses approximatives (géocodage inverse du centroïde de parcelle).</li></ul></div>` : ''}`;
  $('edit').onclick = () => f.scrollIntoView({ behavior: 'smooth' });
  $('allComps')?.addEventListener('click', (e) => { $('comps').tBodies[0].innerHTML = compRows(d, true); e.target.remove(); reverseAddresses(el); });
  if (d && d.n && navigator.onLine !== false) reverseAddresses(el);
  if (matchMedia('(max-width: 979px)').matches) el.scrollIntoView({ behavior: 'smooth' }); else el.scrollTop = 0;
}
function showErrors(errors) {
  for (const el of f.querySelectorAll('.bad')) el.classList.remove('bad');
  const list = Object.entries(errors || {});
  $('errors').innerHTML = list.length ? '<ul>' + list.map(([, m]) => `<li>${esc(m)}</li>`).join('') + '</ul>' : '';
  for (const [k] of list) f.elements[k]?.classList?.add('bad');
  if (list.length) f.elements[list[0][0]]?.focus?.();
}
f.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = { ...readForm(), type: type() };
  const r = estimate(input);
  if (!r.ok) { showErrors(r.errors); return; }
  showErrors({});
  const date = Date.now(), d = input.prixSource === 'manuel' ? null : dvf;
  renderResult(input, r, date, d);
  const h = load(K.hist, []);
  h.unshift({ id: date, date, input, dvf: d, result: { central: r.central, basse: r.basse, haute: r.haute } });
  save(K.hist, h.slice(0, 200));
});
f.addEventListener('input', (e) => {
  saveDraft();
  if (e.target.name === 'rayon') syncRange();
  if (e.target.name === 'type') syncType();
  if (['type', 'surface', 'rayon', 'autoWiden', 'annees3'].includes(e.target.name)) runDvfSoon();
});
$('reset').onclick = () => { f.reset(); localStorage.removeItem(K.draft); dvf = null; f.lat.value = f.lon.value = ''; f.prixSource.value = ''; syncType(); syncRange(); syncSrc(); runDvf(); $('result').hidden = true; showErrors({}); };

// ---------- Historique ----------
function renderHistory() {
  const h = load(K.hist, []);
  $('hist').innerHTML = h.length ? h.map((x) => `<div class="card hist-item"><div><b>${esc(x.input.adresse || 'Sans adresse')}</b><br><small>${new Date(x.date).toLocaleString('fr-FR')} · ${esc(x.input.type)} ${x.input.surface} m²</small><br><span class="p">${eur(x.result.central)}</span> <small>${eur(x.result.basse)} – ${eur(x.result.haute)}</small></div><div class="acts"><button class="btn sm" data-open="${x.id}">Ouvrir</button><button class="btn sm ghost" data-del="${x.id}" aria-label="Supprimer">✕</button></div></div>`).join('') : '<div class="card empty">Aucune estimation enregistrée pour l’instant.</div>';
}
$('hist').addEventListener('click', (e) => {
  const h = load(K.hist, []);
  const o = e.target.dataset.open, dl = e.target.dataset.del;
  if (o) { const x = h.find((i) => String(i.id) === o); if (x) { fillForm(x.input); dvf = x.dvf || null; renderDvf(); show('form'); const r = estimate(x.input); if (r.ok) renderResult(x.input, r, x.date, dvf); } }
  if (dl && confirm('Supprimer cette estimation ?')) { save(K.hist, h.filter((i) => String(i.id) !== dl)); renderHistory(); }
});
function show(v) {
  for (const n of ['form', 'history']) $('view-' + n).hidden = n !== v;
  for (const b of document.querySelectorAll('nav button')) { const on = b.dataset.view === v; b.classList.toggle('active', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); }
  if (v === 'history') renderHistory();
}
for (const b of document.querySelectorAll('nav button')) b.onclick = () => show(b.dataset.view);

const draft = load(K.draft, null);
if (draft) fillForm(draft);
syncType(); syncRange(); syncSrc();
if (f.lat.value) runDvf();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
