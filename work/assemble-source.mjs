import fs from 'node:fs';

const work = new URL('./', import.meta.url);
const read = path => fs.readFileSync(new URL(path, work), 'utf8');

function readEntry(entry) {
  if (typeof entry === 'string') return read(entry);
  if (typeof entry.text === 'string') return entry.text;
  const source = read(entry.file);
  const open = '/* @source ' + entry.section + ' */\n';
  const close = '\n/* @end-source ' + entry.section + ' */';
  const start = source.indexOf(open), end = source.indexOf(close, start + open.length);
  if (start < 0 || end < start) throw new Error('Missing source section: ' + entry.file + '#' + entry.section);
  return source.slice(start + open.length, end);
}

export function sourceManifest() {
  return JSON.parse(read('source/manifest.json'));
}

// Feature fragments share one application scope. Keep their order and hoisting
// when bundling; they are source includes rather than browser ES modules.
export function readSource() {
  const manifest = sourceManifest();
  let html = read('base.html');
  for (const group of [...manifest.styles, ...manifest.scripts]) {
    const marker = '<!-- source:' + group.id + ' -->';
    if (!html.includes(marker)) throw new Error('Missing source include: ' + group.id);
    const contents = group.files.map(readEntry).join('');
    html = html.replace(marker, () => group.open + contents + group.close);
  }
  return html.replace(/BUILD='party30-[^']*'/g, "BUILD='" + manifest.build + "'");
}
