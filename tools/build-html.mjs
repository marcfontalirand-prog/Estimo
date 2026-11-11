// Génère index.html (fichier unique) en injectant les modules testés
// (js/dvf.js, js/loyers.js, js/ajust.js, js/snap.js, js/profil.js, js/pdfdoc.js) dans src/app.template.html.
import fs from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
const MODULES = ['js/dvf.js', 'js/loyers.js', 'js/ajust.js', 'js/snap.js', 'js/profil.js', 'js/pdfdoc.js'];
const SUBS = [
  ["new URL('../data/dvf/', import.meta.url).href", "new URL('data/dvf/', document.baseURI).href"],
  ["new URL('../data/loyers/', import.meta.url).href", "new URL('data/loyers/', document.baseURI).href"],
];
const eng = MODULES.map((f) => {
  let src = fs.readFileSync(root + f, 'utf8').replace(/^export (const|function|async function) /gm, '$1 ');
  for (const [a, b] of SUBS) src = src.split(a).join(b);
  if (/^\s*(export |import\.m)/m.test(src)) throw new Error('export ou import.meta résiduel dans ' + f);
  return '// ---- ' + f + ' ----\n' + src;
}).join('\n');
const html = fs.readFileSync(root + 'src/app.template.html', 'utf8').replace('/*DVF_ENGINE*/', () => eng);
fs.writeFileSync(root + 'index.html', html);
console.log('index.html', html.length, 'octets ·', MODULES.length, 'modules injectés');
