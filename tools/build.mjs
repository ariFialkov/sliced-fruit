#!/usr/bin/env node
// Assemble the runtime files into dist/.
//
// There is no bundler here on purpose — the game ships as plain ES modules
// with Three.js vendored in — so the "build" is a copy of exactly the files a
// browser needs, leaving development-only files (workflows, build scripts,
// README) out of what gets uploaded.
//
// Two things this does beyond copying:
//  * Only web-safe file extensions are emitted. Upload targets commonly reject
//    unknown or extensionless files, so anything else is skipped and reported.
//  * Three.js' MIT notice is inlined into the top of its bundle, so the
//    licence travels with the code and no separate licence file is needed.

import { rmSync, mkdirSync, cpSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');

const RUNTIME = ['index.html', 'sw.js', 'manifest.json', 'css', 'js', 'lib', 'icons', 'fonts'];

// Extensions hosts reliably accept for a static site.
const ALLOWED = new Set([
  '.html', '.js', '.mjs', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg',
  '.webp', '.gif', '.ico', '.woff', '.woff2', '.mp3', '.ogg', '.txt',
]);

const skipped = [];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const item of RUNTIME) {
  const src = join(ROOT, item);
  if (!existsSync(src)) {
    console.error(`missing runtime file: ${item}`);
    process.exit(1);
  }
  cpSync(src, join(OUT, item), {
    recursive: true,
    filter(from) {
      if (statSync(from).isDirectory()) return true;
      if (ALLOWED.has(extname(from).toLowerCase())) return true;
      skipped.push(relative(ROOT, from));
      return false;
    },
  });
}

// Inline Three.js' MIT notice so dropping lib/THREE-LICENSE loses no attribution.
const licenseSrc = join(ROOT, 'lib', 'THREE-LICENSE');
const bundle = join(OUT, 'lib', 'three.module.min.js');
if (existsSync(licenseSrc) && existsSync(bundle)) {
  const notice = readFileSync(licenseSrc, 'utf8').trim()
    .split('\n').map((l) => ` * ${l}`.trimEnd()).join('\n');
  const banner = `/*!\n * three.js r160 — https://threejs.org\n *\n${notice}\n */\n`;
  writeFileSync(bundle, banner + readFileSync(bundle, 'utf8'));
}

console.log(`Build complete -> ${OUT}`);
if (skipped.length) {
  console.log(`Skipped ${skipped.length} non-web file(s): ${skipped.join(', ')}`);
}
console.log('Upload the CONTENTS of dist/ so index.html sits at the top level.');
