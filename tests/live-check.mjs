// Verifies the deployed GitHub Pages site serves exactly the files that were
// tested locally, and that every module resolves over HTTPS with the right MIME
// type. Browsers refuse ES modules served as text/plain, so the MIME check is
// the one that actually protects the live game.
//
// Usage: node tests/live-check.mjs [baseUrl]

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const BASE = process.argv[2] || 'https://hiyasinnsu.github.io/test_HY_DS_worker/';
const problems = [];
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

const files = [
  'index.html',
  'sw.js',
  'manifest.webmanifest',
  'assets/styles.css',
  'assets/icon.svg',
  ...readdirSync('src')
    .filter((f) => f.endsWith('.js'))
    .map((f) => `src/${f}`),
];

const JS_TYPES = ['application/javascript', 'text/javascript'];

for (const file of files) {
  const url = BASE + file;
  let res;
  try {
    res = await fetch(url, { redirect: 'follow' });
  } catch (err) {
    problems.push(`${file}: fetch failed (${err.message})`);
    continue;
  }
  if (!res.ok) {
    problems.push(`${file}: HTTP ${res.status}`);
    continue;
  }
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  const body = Buffer.from(await res.arrayBuffer());
  const local = readFileSync(file);
  const sameBytes = sha(body) === sha(local);
  const typeOk =
    file.endsWith('.js')
      ? JS_TYPES.includes(type)
      : file.endsWith('.css')
        ? type === 'text/css'
        : true;
  const ok = sameBytes && typeOk;
  if (!ok) {
    problems.push(
      `${file}: ${sameBytes ? 'content ok' : 'CONTENT DIFFERS'}, mime=${type}${typeOk ? '' : ' (WRONG MIME)'}`,
    );
  }
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${file.padEnd(28)} ${type.padEnd(24)} ${body.length}B`);
}

// The published HTML must point at relative asset paths (repo subpath hosting).
const html = readFileSync('index.html', 'utf8');
if (/src="\/src\//.test(html) || /href="\/assets\//.test(html)) {
  problems.push('index.html uses root-absolute paths, which break on a /<repo>/ Pages URL');
}

if (problems.length) {
  console.log(`\nLIVE CHECK FAILED (${problems.length})`);
  for (const p of problems) console.log(' - ' + p);
  process.exit(1);
}
console.log(`\nLIVE CHECK OK — ${files.length} files match the tested build`);
