import fs from 'node:fs';
import vm from 'node:vm';
import { readSource, sourceManifest } from './assemble-source.mjs';

const root = new URL('../', import.meta.url);
const manifest = sourceManifest();
const source = readSource();
if (source.includes('\uFFFD')) throw new Error('Invalid source encoding');
if (source.includes('<!-- source:')) throw new Error('Unresolved source include');

const styles = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]);
const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
for (const [index, script] of scripts.entries()) new vm.Script(script, { filename: 'source-script-' + index });
// The transport, application and decorative theme retain their original IIFEs.
// In particular, the application remains one scope so legacy function hoisting
// and feature wrappers behave exactly as in the original document.
const js = scripts.join('\n;\n');
const css = styles.join('\n');
new vm.Script(js, { filename: manifest.assets.js });

let firstStyle = true, firstScript = true;
let html = source.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, () => {
  if (!firstStyle) return '';
  firstStyle = false;
  return '<link rel="stylesheet" href="' + manifest.assets.css + '">';
});
html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, () => {
  if (!firstScript) return '';
  firstScript = false;
  return '<script src="' + manifest.assets.js + '"></script>';
});

const lobbyStyles = 'assets/lobbies.css';
const files = {
  'index.html': html,
  [manifest.assets.css]: css,
  [manifest.assets.js]: js,
  [lobbyStyles]: fs.readFileSync(new URL(lobbyStyles, root), 'utf8'),
  'assets/hoonjung-studio-wordmark.png': fs.readFileSync(new URL('assets/hoonjung-studio-wordmark.png', root)),
};
for (const directory of ['', 'dist/']) {
  for (const [path, contents] of Object.entries(files)) {
    const target = new URL(directory + path, root);
    fs.mkdirSync(new URL('./', target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
}
console.log(JSON.stringify({ build: manifest.build, files: Object.fromEntries(Object.entries(files).map(([path, contents]) => [path, Buffer.byteLength(contents)])) }));
