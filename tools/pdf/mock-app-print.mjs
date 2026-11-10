// Simule l'impression de l'application elle-même : page sombre (comme l'app en thème
// sombre) + document A4 monté dans #print-doc, exactement comme le fait avisInPage().
// Sert à vérifier que « Imprimer » depuis le navigateur ne sort que le document, en blanc.
import fs from 'node:fs';
const root = new URL('../../', import.meta.url).pathname;
const doc = fs.readFileSync(root + 'tools/pdf/out/avis-de-valeur-demo-le-cannet.html', 'utf8');
const css = doc.match(/<style>([\s\S]*?)<\/style>/)[1];
const inner = doc.split('<body>')[1].replace(/<\/body>[\s\S]*$/, '');
const appCss = `
html,body{margin:0;overscroll-behavior:none}
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#061226;color:#eef3fa;min-height:100vh}
.glass{background:rgba(20,40,75,.45);border:1px solid rgba(255,255,255,.12);border-radius:1rem;padding:1rem}
#print-doc{display:none}
@media print{html,body{background:#fff !important;color:#111c2e !important}#root,#boot,noscript,#upd{display:none !important}#print-doc{display:block !important}@page{size:A4;margin:0}}
`;
const mock = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<style>${appCss}</style><style>${css}</style></head>
<body class="dark bg-navy-950 text-navy-50"><div id="boot">Estimo…</div>
<div id="root"><header><h1>Estimo</h1><p>Estimation sur site · v2.5.2</p></header>
<div class="glass"><p>Dossiers enregistrés</p><p style="font-size:3rem;margin:0">3</p><p>Stockés sur cet appareil (hors ligne)</p></div>
<div class="glass" style="margin-top:1rem"><p>Comparatif DVF (300 m)</p><p>Médiane 3 907 €/m²</p></div></div>
<div id="print-doc" aria-hidden="true">${inner}</div></body></html>`;
fs.writeFileSync(root + 'tools/pdf/out/mock-app-print.html', mock);
console.log('mock écrit', mock.length, 'octets ·', (inner.match(/class="sheet/g) || []).length, 'pages');
