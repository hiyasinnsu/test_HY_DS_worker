// Static integrity checks that do not need a browser:
//   * every file referenced by index.html / manifest / sw.js exists
//   * every relative import resolves and imports an existing export
//   * no stray debug/TODO markers, no hard-coded localhost

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const problems = [];
const fail = (msg) => problems.push(msg);
const read = (p) => readFileSync(p, 'utf8');

// --- index.html -------------------------------------------------------------
const html = read('index.html');
for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const url = m[1];
  if (/^(https?:|data:|#)/.test(url)) continue;
  if (!existsSync(url)) fail(`index.html references missing file: ${url}`);
}
if (!/viewport-fit=cover/.test(html)) fail('index.html is missing viewport-fit=cover (safe areas)');
if (!/user-scalable=no/.test(html)) fail('index.html should disable pinch-zoom for gameplay');

// --- manifest ---------------------------------------------------------------
const manifest = JSON.parse(read('manifest.webmanifest'));
for (const icon of manifest.icons || []) {
  if (!existsSync(icon.src)) fail(`manifest icon missing: ${icon.src}`);
}
if (manifest.display !== 'fullscreen') console.warn('note: manifest display is not fullscreen');

// --- service worker precache ------------------------------------------------
const sw = read('sw.js');
const precacheBlock = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
if (!precacheBlock) fail('sw.js has no PRECACHE list');
else {
  for (const m of precacheBlock[1].matchAll(/'([^']+)'/g)) {
    const p = m[1];
    if (!existsSync(p)) fail(`sw.js precaches a missing file: ${p}`);
  }
}
const srcFiles = readdirSync('src').filter((f) => f.endsWith('.js'));
for (const f of srcFiles) {
  if (!precacheBlock[1].includes(`./src/${f}`)) fail(`sw.js precache is missing src/${f}`);
}

// --- module graph -----------------------------------------------------------
const exportsOf = new Map();
for (const f of srcFiles) {
  const src = read(join('src', f));
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      const as = t.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  exportsOf.set(f, names);
}

for (const f of srcFiles) {
  const src = read(join('src', f));
  for (const m of src.matchAll(/import\s+([^;]+?)\s+from\s+'([^']+)'/g)) {
    const spec = m[2];
    if (!spec.startsWith('.')) continue;
    const targetPath = resolve('src', spec);
    if (!existsSync(targetPath)) {
      fail(`${f} imports a missing module: ${spec}`);
      continue;
    }
    const targetFile = spec.replace(/^\.\//, '');
    const targetExports = exportsOf.get(targetFile);
    if (!targetExports) continue;
    const clause = m[1];
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const t = part.trim();
        if (!t) continue;
        const local = t.split(/\s+as\s+/)[0].trim();
        if (!targetExports.has(local)) fail(`${f} imports '${local}' which ${targetFile} does not export`);
      }
    }
  }
}

// --- hygiene ----------------------------------------------------------------
for (const f of ['index.html', ...srcFiles.map((s) => `src/${s}`)]) {
  const src = read(f);
  if (/localhost:\d+/.test(src)) fail(`${f} hard-codes a localhost URL`);
  if (/console\.log\(/.test(src) && !f.endsWith('main.js')) fail(`${f} has a leftover console.log`);
}
for (const f of srcFiles) {
  const src = read(join('src', f));
  if (/TODO|FIXME|XXX/.test(src)) fail(`src/${f} still contains a TODO/FIXME marker`);
}

// --- sw.js must only register on https (checked in main.js) -----------------
if (!/location\.protocol === 'https:'/.test(read('src/main.js'))) {
  fail('main.js should register the service worker only over https');
}

if (problems.length) {
  console.log(`STATIC CHECK FAILED (${problems.length})`);
  for (const p of problems) console.log(' - ' + p);
  process.exit(1);
}
console.log(`STATIC CHECK OK (${srcFiles.length} modules, ${(manifest.icons || []).length} icon, service worker in sync)`);
