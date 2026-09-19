# 02 — Vitest: The Runner, Configured and Measured

> **Part 13 · Testing · File 2 of 5**

Why this file exists: file 01 decided *what* to test; this file makes it run. Vitest is the natural runner for a Vite + React + TypeScript project because it reuses the same config, transforms and module resolution as your app — no second build pipeline, no jest config drift, native ESM and TSX. This file covers the setup that this book's lab actually uses (measured run: **3 test files, 8 tests, 4.28 s**), the parts of `vitest` you will use daily (`describe`/`it`/`expect`, `vi.fn`, fake timers, module mocking), coverage with v8 (measured: `98.66%` statements, `86.66%` branches), the performance note the runner itself printed about jsdom per file, and the configuration choices that save an afternoon each.

---

## 1. Install and configure

```bash
npm i -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
npm i -D @vitest/coverage-v8           # optional: coverage reports
```

```ts
// vite.config.ts — the test config lives in the same file as the app config
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react({ compiler: true }), tailwindcss()],
  test: {
    environment: 'jsdom',                 // a DOM for component tests (file 03)
    globals: true,                        // describe/it/expect without imports
    setupFiles: ['./src/test/setup.ts'],  // jest-dom matchers + MSW + cleanup
    css: false,                           // don't process CSS in tests (faster)
  },
});
```

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';        // toBeInTheDocument, toHaveTextContent, …
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
afterEach(() => { server.resetHandlers(); cleanup(); });
afterAll(() => { server.close(); });
```

```json
// package.json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc -b --noEmit"
  }
}
```

Four decisions in that config are worth naming:

| Setting | Why |
| --- | --- |
| `environment: 'jsdom'` | component tests need `document`, `window`, events. Pure-logic tests run faster in `node` — use a file-level override or two projects (section 6) |
| `globals: true` | lets `describe`/`it`/`expect` work like Jest; without it you import them from `vitest` (both are fine — pick one and be consistent) |
| `setupFiles` | the place for matchers, MSW lifecycle and `cleanup()`; runs before each test file |
| `css: false` | CSS Modules still resolve to class-name objects (file 12), but the CSS is not processed — a measurable speed-up |

⚠️ **No `jest` types, no `@types/jest`.** If you migrate from Jest, remove the Jest types and use `@testing-library/jest-dom/vitest`; mixing the two produces confusing duplicate matcher errors. Similarly, `vi` replaces `jest` for mocks and timers.

---

## 2. The measured run

```text
$ npx vitest run
 ✓ src/components/SearchBox.test.tsx (3 tests) 361ms
 ✓ src/components/ProductList.test.tsx (3 tests) 222ms
 ✓ src/components/Counter.test.tsx (2 tests) 401ms

 Test Files  3 passed (3)
      Tests  8 passed (8)
   Duration  4.28s (environment 53%, tests 25%, setup 16%, transform 3%, import 2%, worker 1%)
Environment  jsdom was created 3 times · 2.06s total, 53% of tracked time
```

Read the numbers as a budget: the *tests* took 25% of the time and the **jsdom environment took 53%** — more than everything else combined. That is why the runner prints a hint:

```text
create it once per worker with pool: 'vmThreads' (keeps per-file isolation), or isolate: false (shares it across files)
```

Options, honestly weighed:

| Option | Effect | Trade-off |
| --- | --- | --- |
| Default (per-file environment) | full isolation; each file gets a fresh jsdom | slowest startup (measured above) |
| `isolate: false` | shares the environment across files | faster; tests can leak state between files (a real risk) |
| `pool: 'vmThreads'` | one environment per worker | good middle ground on larger suites |
| Split projects (`node` for logic, `jsdom` for components) | pure tests skip jsdom entirely | slightly more config |

💡 On a small suite (seconds), do not optimise. On a 500-test suite, the difference is minutes per run, and the first move is to make sure your *pure* tests are not paying for a DOM they never use.

---

## 3. The core API you will actually use

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('formatMinor', () => {                       // the unit under test
  it('renders minor units as a currency string', () => {
    expect(formatMinor(129950)).toBe('₹1,299.50');
  });

  it('rejects a non-finite number', () => {
    expect(() => formatMinor(Number.NaN)).toThrow(/finite/);
  });
});
```

| API | Use |
| --- | --- |
| `describe` / `it` / `test` | grouping and cases (`it` and `test` are the same function) |
| `expect(...).toBe/toEqual/toMatchObject` | primitives / deep equality / subset |
| `toMatchInlineSnapshot()` | small, readable snapshots for pure output (use deliberately — file 01, section 7) |
| `beforeEach` / `afterEach` / `beforeAll` / `afterAll` | setup and teardown; reset what you mutated |
| `vi.fn()` | a spy/stub: `expect(fn).toHaveBeenCalledWith(...)` |
| `vi.spyOn(object, 'method')` | wrap an existing method and restore it later |
| `vi.mock('./module', () => ({ … }))` | replace a module (hoisted to the top of the file) |
| `vi.useFakeTimers()` / `vi.advanceTimersByTime(ms)` | control time deterministically |
| `expect.soft(...)` | collect several failures in one test instead of stopping at the first |
| `it.each([...])` | table-driven cases without copy-paste |

```tsx
// vi.fn and fake timers, the two you will reach for most
it('debounces the value by 300 ms', () => {
  vi.useFakeTimers();
  const onChange = vi.fn();
  const { result, rerender } = renderHook(() => useDebouncedValue('a', 300));

  expect(result.current).toBe('a');
  vi.advanceTimersByTime(299);
  expect(result.current).toBe('a');       // not yet
  vi.advanceTimersByTime(1);
  renderHook(() => useDebouncedValue('b', 300));   // …see file 04 for the full hook-test pattern
  vi.useRealTimers();
  expect(onChange).not.toHaveBeenCalled();
});
```

⚠️ **Fake timers and async code**: `userEvent` (file 03) internally awaits timers, so a test that uses both must configure `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })` — otherwise `await user.click(...)` hangs. The rule: either use fake timers with `userEvent`'s `advanceTimers` option, or use fake timers only in tests that do not use `userEvent`.

---

## 4. Mocking, from the least to the most invasive

| Technique | Example | Use when |
| --- | --- | --- |
| **Real code** (default) | `render(<Counter />)` | always, unless something below forces a mock |
| **Inject a dependency** | `render(<ProductList onLoad={spy} />)` | the cleanest mock: the component takes the collaborator as a prop |
| **Network-level mock (MSW)** | `server.use(http.get('/api/products', …))` | anything that fetches — this is the preferred boundary (file 05) |
| **`vi.spyOn`** | `vi.spyOn(storage, 'getItem')` | assert/observe a real object's method |
| **`vi.mock('module')`** | `vi.mock('../analytics', () => ({ track: vi.fn() }))` | heavy or global modules (analytics, feature flags, `window.matchMedia`) |
| **Fake timers** | `vi.useFakeTimers()` | debounce, retry/backoff, timeouts, animations |

```tsx
// A module mock worth keeping: matchMedia is missing in jsdom and components read it
vi.mock('../lib/media', () => ({
  prefersReducedMotion: vi.fn(() => false),
}));

// A module mock that is a smell: mocking the component you are testing
// vi.mock('./ProductList')  ← the test then proves nothing about ProductList
```

💡 Mocks are a form of technical debt: each one is a small lie about reality. Prefer the boundary that produces the least lying — props first, then network, then modules.

---

## 5. Coverage, configured

```bash
npm i -D @vitest/coverage-v8
```

```ts
// vite.config.ts
export default defineConfig({
  test: {
    /* … */
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],        // text for CI, html/lcov for humans and tools
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
      thresholds: { statements: 70, branches: 70, functions: 70, lines: 70 },
      reportsDirectory: './coverage',
    },
  },
});
```

Measured (`npx vitest run --coverage`) in this lab:

```text
 % Coverage report from v8
File              | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
All files         |   98.66 |    86.66 |     100 |     100 |
  Counter.tsx     |     100 |    89.47 |     100 |     100 | 13
  ProductList.tsx |   95.65 |       75 |     100 |     100 | 23-24
  SearchBox.tsx   |     100 |    92.85 |     100 |     100 | 8
```

Three practical notes: the **`html` reporter** is the one humans actually use (click through the source to see which branches are red); **thresholds fail the CI job**, which is what turns coverage into a floor rather than a nice-to-have; and **exclude generated/config files** (`main.tsx`, `.d.ts`, test utilities), or your numbers are dominated by code no test can sensibly cover.

---

## 6. Two environments, one config (when the suite grows)

```ts
// vite.config.ts — projects: pure logic in node, components in jsdom
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', environment: 'node', include: ['src/**/*.unit.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'dom', environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], include: ['src/**/*.test.tsx'] },
      },
    ],
  },
});
```

⚠️ Do not do this on day one. It is worth it when (a) the suite takes long enough to matter, and (b) you genuinely have both kinds of test. A simpler interim step is a per-file comment at the top:

```ts
// @vitest-environment node
import { expect, it } from 'vitest';
import { formatMinor } from '../lib/money';       // no DOM needed: skip jsdom entirely
```

---

## 7. CI and watch-mode habits

| Command | When |
| --- | --- |
| `vitest` | local development: watch mode, re-runs affected files on save |
| `vitest run` | CI and pre-push: run once and exit |
| `vitest run --coverage` | CI job that publishes coverage |
| `vitest related --run src/components/Button.tsx` | run only tests that import a file (fast local check) |
| `vitest --ui` | optional browser UI for exploring a large suite |
| `vitest run -t "empty state"` | run tests whose name matches — useful while fixing one failure |

```yaml
# .github/workflows/ci.yml (excerpt)
- run: npm ci
- run: npm run typecheck
- run: npx oxlint .          # or eslint — see Part 15
- run: npm run test:run
- run: npm run build
```

💡 Order matters for developer experience: **typecheck and lint first** (fast, and they catch the boring mistakes), then tests, then the build. A pipeline that spends four minutes on a build before revealing a typo wastes everyone's morning.

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Jest config/types in a Vitest project | duplicate matchers, confusing errors | Vitest config + `@testing-library/jest-dom/vitest` |
| 2 | `test.environment: 'jsdom'` for pure logic | pays the measured 50%+ environment cost for nothing | `node` for logic, or per-file override |
| 3 | No `cleanup()` between tests | DOM accumulates; queries find stale elements | `afterEach(cleanup)` in setup (this lab) |
| 4 | Fake timers + `userEvent` without `advanceTimers` | the test hangs | configure `userEvent.setup({ advanceTimers })` |
| 5 | `vi.mock` of the component under test | the test proves nothing | mock boundaries only |
| 6 | Forgetting `vi.restoreAllMocks()`/`resetHandlers()` | tests leak behaviour into each other | resets in `afterEach` |
| 7 | Assertions on `snapshot` for big trees | blind updates, no defect detection | targeted behaviour assertions |
| 8 | Coverage thresholds on all files including generated ones | an impossible number to satisfy | exclude config/generated files |
| 9 | Tests sharing a module-level mutable object | order-dependent failures | create fresh state per test |
| 10 | Running only `vitest` (watch) in CI | the job never exits | `vitest run` |
| 11 | Skipping `typecheck` in CI | tests pass, build fails | run `tsc -b --noEmit` before tests |
| 12 | Long, unmocked imports in every test (analytics, i18n) | slow suite, mysterious failures | module-mock the heavy/global ones deliberately |

---

## 9. Best practices

1. **One config file**: the app and the tests share `vite.config.ts`, so aliases and plugins cannot drift.
2. **Keep setup in `src/test/setup.ts`** — matchers, MSW lifecycle, cleanup — and nothing project-specific that tests should control.
3. **Match the environment to the test**: `node` for logic, `jsdom` for components.
4. **Use `vi.fn` for callbacks and `vi.spyOn` for observations**; inject dependencies instead of mocking modules when you can.
5. **Use fake timers only for time-dependent logic**, and mind the `userEvent` interaction.
6. **Set coverage thresholds that fail CI**, and read the `html` report when you miss.
7. **Keep the suite fast** — a slow suite stops being run. Watch the environment share the runner reports.
8. **Order CI: typecheck → lint → test → build.**
9. **Run the test you are fixing** (`-t`, `related`) rather than the whole suite.
10. **Upgrade Vitest with Vite**, and re-read the config on major upgrades — options are occasionally renamed.

---

## 10. Practice

### Beginner

1. Install Vitest + Testing Library in a Vite project, add the `test` config and setup file, and make `npx vitest run` execute one test that asserts `1 + 1 === 2` (then delete it).
2. Add scripts for watch, run, and coverage; explain when each is used.
3. Write a unit test for a pure function in your project (a formatter, a validator) with at least three cases including an edge case.

### Intermediate

1. Add coverage with thresholds, run it, and find one uncovered branch. Write the test that covers it and show the new numbers.
2. Write a test for a debounced hook (or any timer-based logic) using fake timers, and prove with an assertion that the early call is ignored and the late one is not.
3. Convert one module mock into dependency injection (a prop or a parameter) and explain what the test gained.

### Challenge

1. Split a growing suite into `node` and `jsdom` projects, measure the runtime before and after, and report the environment share change.
2. Add a CI pipeline (typecheck → lint → test → coverage → build) and make one deliberately broken commit to prove the pipeline fails at the right step with a readable message.
3. Take a slow test file (the one that dominates your suite) and make it 3× faster without weakening it. Document each change and what it bought.

---

## 11. Solutions

### Beginner

1. Config as in section 1, setup file importing `@testing-library/jest-dom/vitest`, and a first test; the smoke test proves the runner, transform and environment all work before you invest in real tests.
2. `vitest` (watch, during development), `vitest run` (CI, pre-push), `vitest run --coverage` (CI job that publishes numbers). Using watch mode in CI is the classic mistake that times out the job.
3. ```ts
   describe('formatMinor', () => {
     it('formats a normal amount', () => { expect(formatMinor(129950)).toBe('₹1,299.50'); });
     it('formats zero', () => { expect(formatMinor(0)).toBe('₹0.00'); });
     it('rejects NaN', () => { expect(() => formatMinor(Number.NaN)).toThrow(); });
   });
   ```

### Intermediate

1. After adding coverage, a typical uncovered branch is the fallback in a formatter or an error path in a component. Writing the test should raise `% Branch` for that file; if it does not, check whether the branch is reachable at all (a defensive `default` may be genuinely dead code — then remove it rather than test it).
2. The pattern is: fake timers on → advance to just before the delay (assert the old value) → advance past it (assert the new value) → fake timers off in `afterEach`. Any assertion that passes at 299 ms but not at 300 ms is the whole point of the test.
3. Converting `vi.mock('../analytics')` to `render(<ProductList onLoad={track} />)` (or a `useAnalytics()` context) means the test asserts your component's *contract* instead of the mock's implementation: the component calls the callback you gave it, once, with the data. Mocking a module tells you "it called the module"; injecting tells you "it called it correctly".

### Challenge

1. Expect pure-logic projects to run in tens of milliseconds and component files to dominate; the environment share the runner prints should fall noticeably. Report both numbers and note which files you *kept* in jsdom despite not needing it (over-splitting is a cost too).
2. A useful pipeline fails fast and clearly: `typecheck` catches type errors in seconds, lint catches the boring stuff, tests catch behaviour, the build catches bundling/asset problems. Proving it with a deliberate error per step (a type error, an unused import, a wrong expectation, a bad import path) also validates that the messages are readable — the pipeline is a product for your team.
3. Common wins: moving pure tests out of jsdom; replacing `fireEvent` with `userEvent` only where interactions matter (userEvent is slower but more realistic); avoiding `waitFor` around things that can be awaited directly with `findBy*`; and cutting a heavy import chain by mocking one module at the boundary. Measure each change; do not guess.

---

## 12. Summary

- **Vitest is configured inside `vite.config.ts`**, so tests share the app's transforms, aliases and plugins: `environment: 'jsdom'`, `globals`, `setupFiles`, `css: false`, plus `@testing-library/jest-dom/vitest` for matchers and MSW lifecycle in setup.
- **The measured run**: 3 files, 8 tests, **4.28 s**, of which the **jsdom environment is 53%** and the tests themselves 25% — the runner even suggests `pool: 'vmThreads'` or `isolate: false` when that matters.
- **The daily API is small**: `describe`/`it`/`expect`, `vi.fn`/`vi.spyOn`, fake timers, and occasionally `vi.mock`. Prefer dependency injection, then network-level mocks (file 05), then module mocks.
- **Fake timers and `userEvent` must be configured together** (`advanceTimers`), or an `await user.click()` hangs — a five-minute mystery avoided by one option.
- **Coverage with v8** measured `98.66%` statements / `86.66%` branches here, and the uncovered lines (`ProductList.tsx 23-24`, the abort path) were the actionable output — the number matters less than the specific gap. Thresholds make it a floor in CI.
- **Match the environment to the test** and split projects only when the suite is large enough to justify it.
- **CI order: typecheck → lint → test → build**, with `vitest run` (never watch) and coverage published.

---

**What's next →** [`03-react-testing-library.md`](./03-react-testing-library.md) covers the library that makes component tests readable: `render`, the query priority list (`getByRole` first, `getByTestId` last), `userEvent` versus `fireEvent`, `findBy*`/`waitFor` for async UI, the measured tests from this lab, and the debugging tools (`screen.debug`, `logRoles`) for when a query does not match.
