// SOLENNE NIGHTS hand-in program (Node 22, standard library only).
// The game itself is the static site in game/: index.html, its ES modules under game/src/,
// stylesheets under game/styles/ and three.js vendored as game/vendor/three.module.min.js.
// No build step and no network: any static server can host it (`node serve.ts`).
//
// This program copies game/ and screenshots/ into the output folder and writes dossier.json
// with the kit's buildDossier, exactly as the grader expects. The output folder is /output in
// the grader's container; elsewhere set MAKEFUN_OUTPUT_DIR, for example:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Copy one top-level folder of the repository into the output, if it exists. */
function copyFolder(name: string): void {
  const from = join(repoRoot, name);
  const to = join(outputDir, name);
  mkdirSync(to, { recursive: true });
  if (existsSync(from)) cpSync(from, to, { recursive: true });
}

mkdirSync(outputDir, { recursive: true });
copyFolder('game');
copyFolder('screenshots');

// Limits mirror the scorer's gate: 4 screenshots of at most 256 KiB, at most 993 game entries
// and 48 MiB, paths of at most 1000 bytes, and the judge's 160 KiB source text.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
