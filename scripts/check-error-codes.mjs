#!/usr/bin/env node
/**
 * Every `TSxxxx` code quoted in the notes must be a real TypeScript diagnostic.
 *
 * Why this exists: an error table with a plausible-looking wrong code sends a reader to a search
 * engine that finds nothing, and a TypeScript upgrade can retire or renumber codes. Checking them
 * against the TypeScript the lab actually compiles with means the book's error chapters cannot
 * drift away from reality without this failing.
 *
 * What it deliberately does NOT do: pattern-match the message written next to a code. TypeScript's
 * own wording is full of placeholders (`Type '{0}' is not assignable to type '{1}'.`) and chains a
 * detail line under the head message, so a text comparison produces false alarms on correct notes
 * (a quotation may legitimately start at the chained line, be shortened, or reword the placeholder
 * in prose). The codes themselves are checkable exactly, so those are the gate.
 *
 * Usage:
 *   node scripts/check-error-codes.mjs             # check
 *   node scripts/check-error-codes.mjs --verbose   # also print the codes and their official wording
 *
 * Without `react-lab/node_modules` the check degrades to a note instead of failing, so a reader who
 * has cloned only the notes can still run the other audits.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const notesDir = join(root, 'react-notes');
const tsPath = join(root, 'react-lab/node_modules/typescript/lib/typescript.js');
const verbose = process.argv.includes('--verbose');

if (!existsSync(tsPath)) {
  console.log('note: react-lab/node_modules missing — run `npm ci` in react-lab to check the error codes');
  process.exit(0);
}

const ts = await import(tsPath);

/** code -> every message template TypeScript uses for it (a code may carry several). */
const templates = new Map();
for (const diagnostic of Object.values(ts.Diagnostics)) {
  if (!diagnostic || typeof diagnostic.code !== 'number') continue;
  if (!templates.has(diagnostic.code)) templates.set(diagnostic.code, []);
  templates.get(diagnostic.code).push(diagnostic.message);
}

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.md') ? [full] : [];
  });

const failures = [];
const codesSeen = new Map(); // code -> example location
let mentions = 0;

for (const file of walk(notesDir)) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      for (const match of line.matchAll(/TS(\d{4,5})/g)) {
        const code = Number(match[1]);
        mentions += 1;
        if (!codesSeen.has(code)) codesSeen.set(code, `${relative(root, file)}:${index + 1}`);
        if (!templates.has(code)) {
          failures.push(
            `${relative(root, file)}:${index + 1}: TS${code} is not a diagnostic in TypeScript ${ts.version}`,
          );
        }
      }
    });
}

if (verbose) {
  for (const code of [...codesSeen.keys()].sort((a, b) => a - b)) {
    console.log(`  TS${code}  ${templates.get(code).join(' | ')}`);
  }
}

if (failures.length) {
  console.error(`✗ ${failures.length} unknown TypeScript error code(s) quoted in the notes:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(
  `✓ error codes OK — ${mentions} mentions, ${codesSeen.size} distinct codes, every one a real diagnostic`,
);
console.log(`  checked against TypeScript ${ts.version} (react-lab/node_modules)`);
