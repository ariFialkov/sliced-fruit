#!/usr/bin/env node
// Assemble the runtime files into dist/.
//
// There is no bundler here on purpose — the game ships as plain ES modules
// with Three.js vendored in — so the "build" is a copy of exactly the files a
// browser needs, leaving development-only files (workflows, build scripts,
// README) out of what gets uploaded.

import { rmSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'dist');

const RUNTIME = [
  'index.html',
  'sw.js',
  'manifest.json',
  'css',
  'js',
  'lib',
  'icons',
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const item of RUNTIME) {
  const src = join(ROOT, item);
  if (!existsSync(src)) {
    console.error(`missing runtime file: ${item}`);
    process.exit(1);
  }
  cpSync(src, join(OUT, item), { recursive: true });
}

console.log(`Build complete -> ${OUT}`);
console.log('Upload the CONTENTS of dist/ so index.html sits at the top level.');
