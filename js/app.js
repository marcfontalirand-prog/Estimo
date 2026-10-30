import { estimate } from './engine.js';
import { DEFAULT_SECTEURS, SOURCE_NOTE } from './data.js';

const K = { draft: 'estimo.v2.draft', hist: 'estimo.v2.history', sect: 'estimo.v2.secteurs' };
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { alert('Stockage local plein ou indisponible.'); } };
const eur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const f = document.getElementById('f');
let secteurs = load(K.sect, DEFAULT_SECTEURS);

function readForm() {
  const o = {};
  for (const el of f.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'number') o[el.name] = el.value === '' ? '' : Number(el.value);
    else o[el.name] = el.value;
  }
  return o;
}
function fillForm(o) {
  for (const el of f.elements) {
    if (!el.name || !(el.name in o)) continue;
    if (el.type === 'checkbox') el.checked = !!o[el.name]; else el.value = o[el.name];
  }
  syncType();
}
function syncType() {
  const t = f.type.value;
  document.body.classList.toggle('is-maison', t === 'maison');
  document.body.classList.toggle('is-appart', t === 'appartement');
}
function renderSecteurs() {
  const cur = f.secteur.value;
  f.secteur.innerHTML = secteurs.map((s) => `<option value="${esc(s.id)}">${esc(s.nom)}${s.verifie ? ' ✓' : ''}</option>`).join('');
  if (cur) f.secteur.value = cur;
}
function applySecteur() {
  const s = secteurs.find((x) => x.id === f.secteur.value);
  if (!s) return;
  const p = s[f.type.value];
  if (p > 0) f.prixM2.value = p;
  f.prixVerifie.checked = !!s.verifie;
}

function showErrors(errors) {
  for (const el of f.querySelectorAll('.bad')) el.classList.remove('bad');
  const box = document.getElementById('errors');
  const list = Object.entries(errors || {});
  box.innerHTML = list.length ? '<ul>' + list.map(([k, m]) => `<li>${esc(m)}</li>`).join('') + '</ul>' : '';
  for (const [k] of list) f.elements[k]?.classList.add('bad');
  if (list.length) f.elements[list[0][0]]?.focus();
}

function renderResult(input, r, date) {
  const s = secteurs.find((x) => x.id === input.secteur);
  const rows = r.ajustements.map((a) => `<tr><td>${esc(a.label)}${a.detail ? ` <small>(${esc(a.detail)})</small>` : ''}</td><td class="n">${a.kind === 'coef' ? '×' + a.coef.toFixed(2) : ''}</td><td class="n ${a.value >= 0 ? 'pos' : 'neg'}">${a.value ? (a.value > 0 ? '+' : '') + eur(a.value) : ''}</td></tr>`).join('');
  const el = document.getElementById('result');
  el.hidden = false;
  el.innerHTML = `<div class="card">
    <p>${esc(input.adresse || 'Bien sans référence')} — ${esc(input.type)}, ${input.surface} m², ${input.pieces} p. — ${esc(s?.nom || '')}</p>
    <div class="big">${eur(r.central)}</div>
    <p>Fourchette : <b>${eur(r.basse)}</b> – <b>${eur(r.haute)}</b> (±${(r.incertitude * 100).toFixed(1)} %)<br>
    Soit ${eur(r.prixM2Final)}/m² habitable (référence ${eur(input.prixM2)}/m², coefficient global ×${r.coefTotal.toFixed(3)})</p>
    ${r.manquants.length ? `<p class="note">Données manquantes élargissant la fourchette : ${r.manquants.join(', ')}.</p>` : ''}
    ${input.prixVerifie ? '' : '<p class="note">⚠ Prix/m² de référence non vérifié : fourchette élargie de 3 points.</p>'}
    <table><thead><tr><th>Base</th><th></th><th class="n">${eur(r.base)}</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="note">Estimation du ${new Date(date).toLocaleString('fr-FR')}. Indicative, fondée sur des coefficients paramétrables ; ne vaut pas expertise.</p>
    <div class="actions no-print"><button type="button" onclick="window.print()">Imprimer / PDF</button></div></div>`;
  el.scrollIntoView({ behavior: 'smooth' });
}

f.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = readForm();
  const r = estimate(input);
  if (!r.ok) { showErrors(r.errors); return; }
  showErrors({});
  const date = Date.now();
  renderResult(input, r, date);
  const h = load(K.hist, []);
  h.unshift({ id: date, date, input, result: { central: r.central, basse: r.basse, haute: r.haute } });
  save(K.hist, h.slice(0, 200));
});
f.addEventListener('input', () => save(K.draft, readForm()));
f.type.addEventListener('change', () => { syncType(); applySecteur(); });
f.secteur.addEventListener('change', applySecteur);
document.getElementById('reset').onclick = () => { localStorage.removeItem(K.draft); f.reset(); renderSecteurs(); applySecteur(); syncType(); document.getElementById('result').hidden = true; showErrors({}); };

function renderHistory() {
  const h = load(K.hist, []);
  const box = document.getElementById('hist');
  box.innerHTML = h.length ? h.map((x) => `<div class="card hist-item"><div><b>${esc(x.input.adresse || 'Sans référence')}</b><br><small>${new Date(x.date).toLocaleString('fr-FR')} — ${esc(x.input.type)} ${x.input.surface} m²</small><br>${eur(x.result.central)} <small>(${eur(x.result.basse)} – ${eur(x.result.haute)})</small></div><div><button data-open="${x.id}">Ouvrir</button> <button data-del="${x.id}">✕</button></div></div>`).join('') : '<p>Aucune estimation enregistrée.</p>';
}
document.getElementById('hist').addEventListener('click', (e) => {
  const h = load(K.hist, []);
  const o = e.target.dataset.open, d = e.target.dataset.del;
  if (o) { const x = h.find((i) => String(i.id) === o); if (x) { fillForm(x.input); show('form'); const r = estimate(x.input); if (r.ok) renderResult(x.input, r, x.date); } }
  if (d && confirm('Supprimer cette estimation ?')) { save(K.hist, h.filter((i) => String(i.id) !== d)); renderHistory(); }
});

function renderSettings() {
  for (const id of ['srcnote', 'srcnote2']) document.getElementById(id).textContent = SOURCE_NOTE;
  document.getElementById('sect').innerHTML = `<table><thead><tr><th>Secteur</th><th>Appart. €/m²</th><th>Maison €/m²</th><th>Vérifié</th></tr></thead><tbody>${secteurs.map((s, i) => `<tr><td>${esc(s.nom)}</td><td><input type="number" data-i="${i}" data-k="appartement" value="${s.appartement}"></td><td><input type="number" data-i="${i}" data-k="maison" value="${s.maison}"></td><td><input type="checkbox" data-i="${i}" data-k="verifie" ${s.verifie ? 'checked' : ''}></td></tr>`).join('')}</tbody></table>`;
}
document.getElementById('saveSect').onclick = () => {
  for (const el of document.querySelectorAll('#sect input')) {
    const s = secteurs[el.dataset.i];
    s[el.dataset.k] = el.type === 'checkbox' ? el.checked : Math.max(0, Number(el.value) || 0);
  }
  save(K.sect, secteurs); renderSecteurs(); applySecteur(); alert('Prix/m² enregistrés.');
};
document.getElementById('resetSect').onclick = () => { if (confirm('Revenir aux valeurs par défaut ?')) { secteurs = structuredClone(DEFAULT_SECTEURS); save(K.sect, secteurs); renderSettings(); renderSecteurs(); } };

function show(v) {
  for (const n of ['form', 'history', 'settings']) document.getElementById('view-' + n).hidden = n !== v;
  for (const b of document.querySelectorAll('nav button')) b.classList.toggle('active', b.dataset.view === v);
  if (v === 'history') renderHistory();
  if (v === 'settings') renderSettings();
}
for (const b of document.querySelectorAll('nav button')) b.onclick = () => show(b.dataset.view);

renderSecteurs(); renderSettings();
const draft = load(K.draft, null);
if (draft) fillForm(draft); else applySecteur();
syncType();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
