import fs from 'node:fs';

const project = new URL('../', import.meta.url);

// VM and isolated QA fixtures need the actual shipped scripts and styles in one
// string. Production still loads the versioned external assets normally.
export function readProduction() {
  let html = fs.readFileSync(new URL('index.html', project), 'utf8');
  const asset = path => {
    if (!/^assets\/[\w.-]+$/.test(path)) throw new Error('Unexpected production asset: ' + path);
    return fs.readFileSync(new URL(path, project), 'utf8');
  };
  html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi,
    (_, path) => '<style>' + asset(path) + '</style>');
  html = html.replace(/<script\b[^>]*src="([^"]+)"[^>]*>\s*<\/script>/gi,
    (_, path) => '<script>' + asset(path) + '</script>');
  return html;
}
