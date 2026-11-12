import { strict as assert } from 'node:assert';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve('dist');
const list = async directory => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => {
  const path = resolve(directory, entry.name);
  return entry.isDirectory() ? list(path) : [path];
}))).flat();
const files = await list(root);
const forbidden = /\.(?:md|mdx|docx?|pptx?|pdf|xlsx?|jsonl|map|pem|key|p12|pfx|zip|7z|rar|ts|tsx)$/i;
for (const file of files) {
  assert(!forbidden.test(file), `Non-runtime file in Pages artifact: ${file}`);
  assert(!/(?:^|[\\/])(?:md-doc|reference-records|docs-private|research|artifacts|tests|node_modules|\.git)(?:[\\/]|$)/i.test(file.slice(root.length)), `Private directory in Pages artifact: ${file}`);
  assert(!/^\.env(?:\.|$)/.test(file.split(sep).at(-1)), `Environment file in Pages artifact: ${file}`);
}
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const base = process.env.PAGES_BASE_PATH || './';
for (const [, value] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (/^(?:[a-z][\w+.-]*:|#|\/\/)/i.test(value)) continue;
  const path = value.split(/[?#]/)[0];
  if (!path) continue;
  let relative = path;
  if (path.startsWith('/')) {
    assert(base.startsWith('/') && path.startsWith(base), `Asset is outside Pages base ${base}: ${path}`);
    relative = path.slice(base.length);
  }
  const target = resolve(root, decodeURIComponent(relative));
  assert(target.startsWith(root + sep), `Asset escapes output directory: ${path}`);
  assert((await stat(target)).isFile(), `Missing built asset: ${path}`);
}
const scripts = files.filter(file => extname(file) === '.js');
assert(scripts.length > 0, 'No compiled scripts were produced');
for (const file of scripts) {
  const code = await readFile(file, 'utf8');
  assert(!code.includes('__journey'), `Development fixture exposed in ${file}`);
  assert(!code.includes('sourceMappingURL='), `Source map reference exposed in ${file}`);
}
assert((await stat(resolve(root, 'THIRD_PARTY_NOTICES.txt'))).isFile(), 'Third-party license notice is missing');
console.log(`Pages artifact checked: ${files.length} runtime files; base ${base}; no private documents, source maps or development fixtures.`);
