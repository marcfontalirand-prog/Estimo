// Génère index.html (fichier unique) en injectant le moteur DVF testé (js/dvf.js) dans src/app.template.html.
import fs from 'node:fs';
const root=new URL('..',import.meta.url).pathname;
let eng=fs.readFileSync(root+'js/dvf.js','utf8').replace(/^export (const|function|async function) /gm,'$1 ')
 .replace("new URL('../data/dvf/', import.meta.url).href","new URL('data/dvf/', document.baseURI).href");
eng+='\n'+fs.readFileSync(root+'js/loyers.js','utf8').replace(/^export (const|function|async function) /gm,'$1 ').replace("new URL('../data/loyers/', import.meta.url).href","new URL('data/loyers/', document.baseURI).href");
if(/export |import\.meta/.test(eng)) throw new Error('export résiduel');
const html=fs.readFileSync(root+'src/app.template.html','utf8').replace('/*DVF_ENGINE*/',()=>eng);
fs.writeFileSync(root+'index.html',html);console.log('index.html',html.length,'octets');
