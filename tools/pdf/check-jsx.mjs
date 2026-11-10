// Vérifie que le bloc JSX de l'app compile, sans navigateur : on rejoue Babel
// (même version que le CDN utilisé par index.html) sur le script type="text/babel".
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const html = readFileSync('index.html', 'utf8');
const m = html.match(/<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/);
if (!m) throw new Error('bloc text/babel introuvable');
writeFileSync('/tmp/app.jsx', m[1]);

execSync('curl -sfL -o /tmp/babel.min.js https://unpkg.com/@babel/standalone@7.26.4/babel.min.js', { stdio: 'inherit' });
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
globalThis.window = globalThis;
const Babel = require('/tmp/babel.min.js');
const out = Babel.transform(m[1], { presets: ['react'], filename: 'app.jsx' });
writeFileSync('/tmp/app.transformed.js', out.code);
execSync('node --check /tmp/app.transformed.js', { stdio: 'inherit' });
console.log('JSX compilé :', m[1].length, 'octets ->', out.code.length, 'octets, syntaxe valide');
