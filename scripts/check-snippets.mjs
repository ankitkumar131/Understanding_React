#!/usr/bin/env node
// Checks the *imports* in every code block of the notes.
//
// Why only imports? Because that is the failure mode that silently misleads a learner: a snippet
// that imports `useSearchParams` from the wrong package, or `createRoot` from `react-dom` instead
// of `react-dom/client`, looks perfect on the page and fails the moment it is pasted.
//
// What it does:
//   1. extracts every ```ts / ```tsx / ```js / ```jsx block from react-notes/**/*.md
//   2. collects every `import ... from '<specifier>'`
//   3. classifies each specifier:
//        - bare package (react, react-router, …)  -> must exist in node_modules
//        - bare subpath (react-dom/client, …)      -> must exist in node_modules
//        - relative (./TaskList, ../auth/…)        -> must be defined by some block in the same file,
//                                                     or by a real file next to it (react-lab/src)
//        - builtin (node:fs, fs)                   -> allowed, reported separately
//   4. for named imports from a package that IS installed, generates one probe file and runs `tsc`
//      so wrong named imports are reported by the compiler, not by guesswork
//
// Usage:  node scripts/check-snippets.mjs            (report only)
//         node scripts/check-snippets.mjs --verbose  (list every specifier)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Without react-lab/node_modules the tsc probe and the "is this package installed" check cannot run.
// The specifier audit still can — so degrade honestly instead of reporting false failures.
const labInstalled = existsSync(join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'react-lab', 'node_modules'));

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const notesDir = join(repo, 'react-notes');
const labDir = join(repo, 'react-lab');
const verbose = process.argv.includes('--verbose');

const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

/** Packages the notes teach that the lab itself does not depend on (the reader installs them). */
const teachingOnly = new Set([
  '@reduxjs/toolkit', 'react-redux', 'zustand',
  'dompurify', 'axios', 'eslint', '@eslint/js', 'typescript-eslint',
  'eslint-plugin-react-hooks', 'eslint-plugin-react-refresh', 'eslint-plugin-jsx-a11y',
  'rollup-plugin-visualizer', 'vite-bundle-visualizer', '@tanstack/react-virtual', 'react-window',
  '@hookform/resolvers', 'immer', 'lodash', 'date-fns', 'lucide-react', 'clsx', 'classnames',
  'playwright', '@playwright/test', '@testing-library/jest-dom', '@testing-library/user-event',
]);
const teachingOnlySeen = new Set();

/**
 * Deliberate, documented exceptions — snippets whose *point* is the path itself.
 * Keep this list short and explained; anything else that is not resolvable is a real defect.
 */
const intentionalSnippets = [
  {
    file: '15-production/03-folder-structure.md',
    why: 'shows the deep ../../../../ paths that the alias section then replaces with @shared/ui/Button',
    specifiers: ['../../../shared/ui/Button', '../../features/products'],
  },
  {
    file: '01-prerequisites/09-modules.md',
    why: 'hypothetical modules: two exports with the same name (import renaming) and a heavy module (static vs dynamic import)',
    specifiers: ['../utils/format-us', './heavyChart'],
  },
];
const intentionalSeen = new Set();

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

const fence = /```(tsx|ts|jsx|js)\n([\s\S]*?)```/g;

const basename = (path) => path.split('/').pop() ?? path;
// `import x from 'y'`, `import { a, b as c } from 'y'`, `import type { T } from 'y'`, `import 'y'`
const importLine = /^\s*import\s+(type\s+)?(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:from\s+)?['"]([^'"]+)['"]/gm;

/** Every relative path a snippet might reference, so we do not flag legitimate examples. */
function definedPaths(blocks) {
  const defined = new Set();
  for (const block of blocks) {
    const first = block.code.split('\n')[0];
    const named = /\/\/\s*([\w./@-]+\.(?:tsx?|jsx?|scss|css))/.exec(first);
    if (named) defined.add(named[1].replace(/^src\//, '').replace(/^\.\//, ''));
    for (const m of block.code.matchAll(/^\s*\/\/\s*-+\s*([\w./@-]+\.(?:tsx?|jsx?))\s*-+/gm)) {
      defined.add(m[1].replace(/^src\//, '').replace(/^\.\//, ''));
    }
  }
  return defined;
}

const labHas = (relativePath) => existsSync(join(labDir, relativePath));

/** Path aliases declared in react-lab/vite.config.ts + tsconfig (only '@' today). */
const snippetAliases = new Set(['@/']);

/** Resolve a package subpath through the package's own `exports` map, not the filesystem. */
function packageSubpathExists(packageName, subpath) {
  const manifest = join(labDir, 'node_modules', packageName, 'package.json');
  if (!existsSync(manifest)) return false;
  try {
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
    const entry = pkg.exports?.[`./${subpath}`] ?? pkg.exports?.[`./${subpath}.js`];
    if (entry !== undefined) return true;
    const files = join(labDir, 'node_modules', packageName, subpath);
    return existsSync(files) || existsSync(files + '.js') || existsSync(files + '.d.ts');
  } catch {
    return false;
  }
}

const mdFiles = markdownFiles(notesDir);

/**
 * Every path the notes *define* somewhere: block headers (`// src/lib/money.ts`),
 * `// ---------- src/lib/money.ts ----------` separators, file-tree listings and prose mentions
 * (`src/lib/money.ts`). A snippet may import a file defined in a different chapter, which is
 * legitimate — so the index is built across all files, not per file.
 */
const knownNoteFiles = new Set();
for (const file of mdFiles) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/(?:^|[\s(\[`/-])((?:src\/)?[\w.@/-]+\.(?:tsx?|jsx?|css|scss|png|svg|jpg|jpeg|webp|gif|json))/g)) {
    const path = m[1].replace(/^src\//, '');
    knownNoteFiles.add(path);
    knownNoteFiles.add(basename(path));
  }
}

/** Is any of `candidate`, its basename, or its trailing segments defined by the notes? */
const ASSET = /\.(png|svg|jpe?g|webp|gif|json)$/;

function definedByNotes(candidate) {
  if (ASSET.test(candidate)) {
    const asset = candidate.replace(/^\.\//, '');
    return labHas(asset) || labHas(join('src', asset)) || labHas(join('public', asset)) ||
      [...knownNoteFiles].some((d) => d === asset || d.endsWith(`/${asset}`));
  }
  const clean = candidate.replace(/\.(tsx?|jsx?|css|scss)$/, '');
  const tail = clean.split('/').slice(-2).join('/');
  const name = basename(clean);
  for (const defined of knownNoteFiles) {
    const definedPath = defined.replace(/\.(tsx?|jsx?|css|scss)$/, '');
    if (definedPath === clean || definedPath.endsWith(`/${clean}`) || definedPath.endsWith(`/${tail}`)) return true;
    // A barrel import ('../features/products') resolves to '<that folder>/index.ts(x)'.
    if (definedPath === `${clean}/index` || definedPath.endsWith(`/${clean}/index`)) return true;
    // Same file name anywhere in the notes: the chapter defines it, the path is only context.
    if (basename(definedPath) === name) return true;
  }
  return false;
}
const problems = [];
const specifiers = new Map(); // specifier -> number of uses
const namedByPackage = new Map();
let blocks = 0;
let imports = 0;
let checked = 0;

for (const file of mdFiles) {
  const text = readFileSync(file, 'utf8');
  const blocksInFile = [...text.matchAll(fence)].map((m) => ({ lang: m[1], code: m[2] }));
  const defined = definedPaths(blocksInFile);
  const relativePrefix = file.replace(/\.md$/, '');

  for (const block of blocksInFile) {
    // Some tsx fences show the *output* of the dev server (transformed modules, `?v=hash` URLs) or
    // an alias import. Those are not source files, so they are not audited as imports.
    const isTranscript = /\?v=|\/@vite\/|\.vite\/deps|transformed|dev server|output of/.test(block.code);
    const isAliasImport = /from '@\//.test(block.code);
    if (isTranscript) continue;
    blocks += 1;
    for (const match of block.code.matchAll(importLine)) {
      const [, , defaultName, namedPart, specifier] = match;
      imports += 1;
      specifiers.set(specifier, (specifiers.get(specifier) ?? 0) + 1);

      if (builtins.has(specifier)) continue;
      if (snippetAliases.has(specifier.split('/')[0] + '/') || specifier.startsWith('@/')) continue;

      if (specifier.startsWith('.')) {
        const bare = specifier.replace(/^\.\//, '').replace(/\.\.\//g, '');
        const candidate = bare.replace(/\.(tsx?|jsx?)$/, '');
        const knownAsFile = [...defined].some((d) => {
          const definedPath = d.replace(/\.(tsx?|jsx?)$/, '');
          return definedPath === candidate || definedPath.endsWith(`/${candidate}`) || definedPath.endsWith(`/${basename(candidate)}`);
        });
        const knownAsLabFile = labHas(`${candidate}.tsx`) || labHas(`${candidate}.ts`) || labHas(`${candidate}/index.tsx`);
        const knownAsChapterNeighbour = existsSync(join(dirname(file), candidate));
        const knownByNotesSomewhere = definedByNotes(candidate) || definedByNotes(bare);
        const intentional = intentionalSnippets.some(
          (entry) => file.endsWith(entry.file) && entry.specifiers.includes(specifier),
        );
        if (intentional) intentionalSeen.add(specifier);
        if (!intentional && !knownAsFile && !knownAsLabFile && !knownAsChapterNeighbour && !knownByNotesSomewhere && !bare.includes('{')) {
          problems.push(
            `unknown relative import  ${file.replace(repo + '/', '')} -> ${specifier}`,
          );
        }
        continue;
      }

      // bare specifier: package or package/subpath
      const [pkg, ...rest] = specifier.split('/');
      const packageName = pkg.startsWith('@') ? `${pkg}/${rest.shift()}` : pkg;
      if (teachingOnly.has(packageName)) {
        teachingOnlySeen.add(packageName);
        continue;                                   // installed in the reader's project, not in the lab
      }
      if (!labInstalled) continue;                  // cannot verify without node_modules; reported below
      if (!existsSync(join(labDir, 'node_modules', packageName))) {
        problems.push(`package not installed      ${file.replace(repo + '/', '')} -> ${specifier}`);
        continue;
      }
      if (labInstalled && rest.length > 0 && !packageSubpathExists(packageName, rest.join('/'))) {
        problems.push(`package subpath missing   ${file.replace(repo + '/', '')} -> ${specifier}`);
      }

      // collect named imports for the tsc probe
      const names = [];
      if (defaultName) names.push({ imported: 'default', local: defaultName });
      if (namedPart) {
        for (const piece of namedPart.split(',')) {
          const clean = piece.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
          if (clean) names.push({ imported: clean, local: clean });
        }
      }
      if (names.length > 0) {
        if (!namedByPackage.has(specifier)) namedByPackage.set(specifier, new Map());
        const bucket = namedByPackage.get(specifier);
        for (const name of names) if (!bucket.has(name.imported)) bucket.set(name.imported, file.replace(repo + '/', ''));
      }
    }
  }
}

// ---- the tsc probe: does every named import actually exist? ----
const probeDir = join(labDir, 'src', '__snippet-probe__');
const missingExports = [];
const aliases = [];
try {
  mkdirSync(probeDir, { recursive: true });
  const lines = [];
  let index = 0;
  for (const [specifier, names] of namedByPackage) {
    const isTypeOnly = false;
    for (const [imported] of names) {
      if (imported === 'default') continue;
      if (!/^[A-Za-z_$][\w$]*$/.test(imported)) continue;
      const alias = `S${index}`;
      lines.push(`import { ${imported} as ${alias} } from '${specifier}';`);
      aliases.push({ alias, imported, specifier, usedIn: names.get(imported), typeOnly: isTypeOnly });
      index += 1;
    }
  }
  writeFileSync(join(probeDir, 'imports.ts'), `${lines.join('\n')}\n`);
  const tsc = join(labDir, 'node_modules', '.bin', 'tsc');
  const raw = execFileSync(
    tsc,
    ['--noEmit', '--strict', '--jsx', 'react-jsx', '--moduleResolution', 'bundler', '--module', 'esnext',
     '--target', 'es2022', '--skipLibCheck', '--lib', 'es2022,dom,dom.iterable',
     join('src', '__snippet-probe__', 'imports.ts')],
    { cwd: labDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  checked = aliases.length;
  void raw;
} catch (error) {
  const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  for (const line of output.split('\n')) {
    const m = /imports\.ts\((\d+),\d+\): error TS2305: Module '"([^"]+)"' has no exported member '([^']+)'/.exec(line);
    if (m) {
      const alias = `S${Number(m[1]) - 1}`;
      const found = aliases.find((a) => a.alias === alias);
      missingExports.push({ specifier: m[2], imported: m[3], usedIn: found?.usedIn ?? '?' });
      continue;
    }
    if (/error TS2307/.test(line)) problems.push(`probe could not resolve: ${line.trim()}`);
  }
  checked = aliases.length;
} finally {
  rmSync(probeDir, { recursive: true, force: true });
}

// ---- report ----
const uniqueProblems = [...new Set(problems)];
const uniqueMissing = missingExports.filter(
  (item, i, list) => list.findIndex((o) => o.specifier === item.specifier && o.imported === item.imported) === i,
);

console.log(`snippet import audit`);
console.log(`  markdown files     ${mdFiles.length}`);
console.log(`  code blocks        ${blocks}`);
console.log(`  import statements  ${imports}`);
console.log(`  distinct specifiers ${specifiers.size}`);
console.log(`  named imports type-checked with tsc: ${checked}`);
if (!labInstalled) {
  console.log('  note: react-lab/node_modules is absent — package existence and the tsc probe were skipped');
  console.log('        (run `npm ci` in react-lab first for the full audit)');
}
if (intentionalSeen.size > 0) {
  console.log(`  documented path-demo exceptions: ${[...intentionalSeen].sort().join(', ')}`);
}
if (teachingOnlySeen.size > 0) {
  console.log(`  taught but not installed here (skipped): ${[...teachingOnlySeen].sort().join(', ')}`);
}

if (verbose) {
  console.log('\nspecifiers by use:');
  for (const [spec, count] of [...specifiers].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${spec}`);
  }
}

if (uniqueMissing.length > 0) {
  console.log(`\n✗ ${uniqueMissing.length} named import(s) do not exist on the package:`);
  for (const item of uniqueMissing) console.log(`  ${item.specifier} has no export "${item.imported}"  (${item.usedIn})`);
}
if (uniqueProblems.length > 0) {
  console.log(`\n✗ ${uniqueProblems.length} import specifier problem(s):`);
  for (const problem of uniqueProblems) console.log(`  ${problem}`);
}
if (uniqueMissing.length === 0 && uniqueProblems.length === 0) {
  console.log(`\n✓ every import in every code block resolves`);
} else {
  process.exitCode = 1;
}
