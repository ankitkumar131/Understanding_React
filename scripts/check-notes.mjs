#!/usr/bin/env node
// Checks the notes for the two defects that are easy to introduce and hard to notice:
//   1. a relative link that points at a file which does not exist
//   2. a chapter banner whose "File i of j" disagrees with the directory it sits in
// Run: node scripts/check-notes.mjs      (also runs in CI — see .github/workflows/ci.yml)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'react-notes');

/** Every .md file under react-notes (including subdirectories). */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

/** Markdown inside fenced code blocks is documentation, not links — strip it first. */
const stripFences = (text) => text.replace(/```[\s\S]*?```/g, '');

const failures = [];
const files = walk(root);

// 1. links
let linkCount = 0;
for (const file of files) {
  const text = stripFences(readFileSync(file, 'utf8'));
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].trim();
    if (/^(https?:|mailto:|tel:|#)/.test(target)) continue;
    const pathPart = decodeURIComponent(target.split('#')[0]);
    if (pathPart === '') continue;
    linkCount += 1;
    if (!statSync(resolve(dirname(file), pathPart), { throwIfNoEntry: false })) {
      failures.push(`broken link  ${relative(root, file)} -> ${target}`);
    }
  }
}

// 2. banners in the numbered part directories.
// The invariant is: every chapter carries a banner, the "of j" matches the number of chapters in
// that directory, and the "i" values form a permutation of 1..j (no duplicates, no gaps).
// (Filenames are not always numbered — Part 18's four files are named after their topic — so the
// check must not assume that alphabetical order equals reading order.)
let bannerCount = 0;
for (const dir of readdirSync(root, { withFileTypes: true })) {
  if (!dir.isDirectory() || !/^\d\d-/.test(dir.name)) continue;
  const chapters = walk(join(root, dir.name)).filter((f) => f.endsWith('.md')).sort();
  const seen = new Map();

  for (const file of chapters) {
    const banner = readFileSync(file, 'utf8').split('\n').find((line) => line.startsWith('> **Part'));
    if (!banner) {
      failures.push(`no banner    ${relative(root, file)}`);
      continue;
    }
    const match = /File (\d+) of (\d+)/.exec(banner);
    if (!match) {
      failures.push(`bad banner   ${relative(root, file)}: ${banner.slice(0, 60)}`);
      continue;
    }
    bannerCount += 1;
    const [, index, total] = match.map(Number);
    if (total !== chapters.length) {
      failures.push(
        `banner count ${relative(root, file)}: says "${match[0]}", directory has ${chapters.length} files`,
      );
    }
    if (seen.has(index)) {
      failures.push(`banner index ${relative(root, file)}: file ${index} also claimed by ${relative(root, seen.get(index))}`);
    }
    seen.set(index, file);
  }

  for (let i = 1; i <= chapters.length; i += 1) {
    if (!seen.has(i)) failures.push(`banner index ${dir.name}: no chapter is "File ${i} of ${chapters.length}"`);
  }
}

const counted = `${files.length} files, ${linkCount} relative links, ${bannerCount} banners`;
if (failures.length > 0) {
  console.error(`✗ ${failures.length} problem(s) in ${counted}:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`✓ notes OK — ${counted}`);
