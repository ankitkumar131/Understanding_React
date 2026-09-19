# 04 — Testing Components: Props, State, Forms, Async UI and Hooks

> **Part 13 · Testing · File 4 of 5**

Why this file exists: files 02 and 03 gave you a runner and queries; this one is the catalogue of things React components actually do — take props, hold state, render lists, submit forms, fetch data, use context, and hide logic in custom hooks — plus the test for each. It also covers the two places where component tests go wrong in ways that are hard to see: providers that must wrap the render (context, router, query client), and hooks that are tested in isolation when the component test would have caught more.

Measured material in this file comes from this lab's suite: 8 component tests (3 files) plus 3 hook tests with fake timers (`useDebouncedValue`, 31 ms for the file).

---

## 1. Props and conditional rendering

**Test the contract, not the markup.** For a component with props, the interesting cases are the branches:

```tsx
// src/components/Counter.tsx (this lab)
export function Counter({ initial = 0, step = 1, label = 'Count' }: CounterProps) { … }
```

```tsx
it('uses the step prop when incrementing', async () => {
  const user = userEvent.setup();
  render(<Counter step={5} />);
  await user.click(screen.getByRole('button', { name: 'Increment' }));
  expect(screen.getByTestId('count')).toHaveTextContent('5');
});

it('shows the label the caller passed', () => {
  render(<Counter label="Items" initial={3} />);
  expect(screen.getByText(/Items:/)).toBeInTheDocument();
});
```

| Prop shape | Cases worth testing |
| --- | --- |
| Optional with a default | omitted (the default applies) and provided |
| Union/variant (`variant="ghost"`) | one test per variant, asserting the *behavioural* difference (not the class) |
| Boolean flags | each flag on and off |
| Children | content renders in the right place, and a missing child does not crash |
| Callbacks | called with the right arguments, once, and not called for a no-op |

```tsx
// Callbacks: assert the contract, including the negative
it('does not call onLoad when the request fails', async () => {
  server.use(http.get('/api/products', () => HttpResponse.json({}, { status: 500 })));
  const onLoad = vi.fn();
  render(<ProductList onLoad={onLoad} />);
  await screen.findByRole('alert');
  expect(onLoad).not.toHaveBeenCalled();
});
```

💡 The "does not" tests are the ones that catch regressions. Asserting that a callback fired is easy; asserting it did *not* fire in the failure branch is what protects the error path.

---

## 2. State: the three questions

Every stateful component has three testable properties:

1. **The initial state is what the user sees first.** (Measured: `count` shows `3` before any interaction.)
2. **Interactions change it in the way the UI describes.** (Measured: two clicks → `7` with `step={2}`.)
3. **It resets or persists when the inputs change** — the subtle one:

```tsx
it('keeps the typed query when the item list changes', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<SearchBox items={['Desk Lamp', 'Floor Lamp']} />);
  await user.type(screen.getByLabelText('Search products'), 'lamp');
  rerender(<SearchBox items={['Desk Lamp', 'Floor Lamp', 'Desk Lamp XL']} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByLabelText('Search products')).toHaveValue('lamp');
});

it('resets internal state when the key changes (a deliberate remount)', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<Counter key="a" initial={0} />);
  await user.click(screen.getByRole('button', { name: 'Increment' }));
  rerender(<Counter key="b" initial={0} />);
  expect(screen.getByTestId('count')).toHaveTextContent('0');   // fresh instance
});
```

The second test encodes the Part 10, file 02 lesson about `key`: a changed key remounts, which is a *deliberate* reset. If your app relies on that behaviour for forms (per-record forms), it is worth one test.

---

## 3. Lists, keys and emptiness

```tsx
it('renders one row per item and updates when the list shrinks', async () => {
  const { rerender } = render(<SearchBox items={['Desk Lamp', 'Floor Lamp', 'Wireless Mouse']} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(3);

  rerender(<SearchBox items={['Desk Lamp']} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.queryByText('Wireless Mouse')).not.toBeInTheDocument();
});

it('renders an explicit empty state instead of an empty list', async () => {
  const user = userEvent.setup();
  render(<SearchBox items={['Desk Lamp']} />);
  await user.type(screen.getByLabelText('Search products'), 'nothing-matches');
  expect(screen.getByRole('status')).toHaveTextContent('No products match');
  expect(screen.queryByRole('list')).not.toBeInTheDocument();
});
```

Two things this style of test protects that markup assertions do not:

- **Identity, not just count.** If the app uses `key={index}` and reorders, a *count* assertion still passes while the UI is wrong (Part 10, file 01). Testing identity means asserting content in order, or typing into rows and checking that the typed value stays with its row.
- **Empty is a designed state.** "No results" is not an edge case; it is a screen users see. When it is missing, the test documents the requirement.

```tsx
// Identity check for a reorderable list: values must travel with their row
it('keeps each row’s notes with the row after a reorder', async () => {
  const user = userEvent.setup();
  const { rerender } = render(<KeyedList rows={[{ id: 'a', name: 'Asha' }, { id: 'b', name: 'Ben' }]} />);
  await user.type(screen.getByLabelText('note-a'), 'call back');
  rerender(<KeyedList rows={[{ id: 'b', name: 'Ben' }, { id: 'a', name: 'Asha' }]} />);
  expect(screen.getByLabelText('note-a')).toHaveValue('call back');   // travelled with A
});
```

---

## 4. Forms

A form test usually has four cases: **happy path, validation failure, server failure, and the disabled/pending state.**

```tsx
it('submits the form and shows the result', async () => {
  const user = userEvent.setup();
  render(<AddProductForm />);

  await user.type(screen.getByLabelText('Name'), 'Desk Lamp');
  await user.type(screen.getByLabelText('Price'), '1299.50');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByText(/Saved/)).toBeInTheDocument();
});

it('shows field errors and keeps the values when validation fails', async () => {
  const user = userEvent.setup();
  render(<AddProductForm />);

  await user.type(screen.getByLabelText('Price'), '-5');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Price must be greater than zero');
  expect(screen.getByLabelText('Price')).toHaveValue('-5');        // ← the value survived
});

it('disables the submit button while the request is in flight', async () => {
  const user = userEvent.setup();
  render(<AddProductForm />);
  await user.type(screen.getByLabelText('Name'), 'Lamp');

  const save = screen.getByRole('button', { name: 'Save' });
  await user.click(save);

  expect(save).toBeDisabled();                                     // pending
  expect(await screen.findByText(/Saved/)).toBeInTheDocument();
  expect(save).toBeEnabled();
});
```

⚠️ Three traps with forms in tests:

1. **`user.type` on a number input**: jsdom accepts the text but the DOM value can behave unexpectedly for `type="number"` (Part 8's measurement: it reported `''`). Prefer `inputMode="numeric"` with `type="text"` if you need to assert the value, or assert the error message instead.
2. **The pending assertion is a race.** If the fake server responds immediately, `toBeDisabled()` may run after the request resolved. Make the mock slow (`await delay(50)` in the MSW handler — file 05) or assert with `findBy` on the pending text instead.
3. **Selection inputs use `change`, not `input`**: `await user.selectOptions(screen.getByLabelText('Status'), 'active')`.

---

## 5. Async UI: loading → data → error

The three states from Part 9, tested in one place:

```tsx
it('moves through loading, data and error states', async () => {
  server.use(
    http.get('/api/products', async () => {
      await delay(30);
      return HttpResponse.json(sampleProducts);
    }),
  );

  render(<ProductList />);
  expect(screen.getByText(/Loading products/)).toBeInTheDocument();       // 1. loading

  const list = await screen.findByRole('list', { name: 'products' });     // 2. data
  expect(screen.getAllByRole('listitem')).toHaveLength(2);

  server.use(http.get('/api/products', () => HttpResponse.json({}, { status: 500 })));
  // (in a real component this comes from a retry button or a route change — file 05)
});
```

Rules that make async component tests reliable:

| Rule | Why |
| --- | --- |
| Assert the loading state *synchronously* right after `render` | it exists only before the microtask resolves |
| Use `findBy*` for the arrival | it waits, then fails with a readable message |
| `await` the click that triggers the request | `userEvent` already flushes what it can |
| Mock at the network (MSW), not in the component | the component's own code stays real (file 05) |
| Never sleep | timing-based tests fail on slow CI runners |
| Test the retry path if the component has one | it is where users end up when things go wrong |

💡 For components using **TanStack Query**, wrap the render in a fresh `QueryClientProvider` per test with retries disabled (`retry: false`) and `gcTime: 0`; otherwise a failing test waits through backoff. Part 9, file 06's `queryClient.ts` has the factory; the test version is the same object with test-friendly defaults.

```tsx
function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
```

---

## 6. Providers, context and routing

Any component that reads a context must be rendered **inside a provider**. Build a small custom render helper rather than repeating wrappers in every test:

```tsx
// src/test/render.tsx
import { render as rtlRender, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { ReactElement, ReactNode } from 'react';

function AllProviders({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <ThemeProvider>{children}</ThemeProvider>
    </MemoryRouter>
  );
}

export function render(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return rtlRender(ui, { wrapper: AllProviders, ...options });
}

// re-export everything so tests import from one place
export * from '@testing-library/react';
```

Four rules for the wrapper:

1. **It renders the same providers as the app** (context, router, query client, i18n), or the test is not representative.
2. **It takes per-test overrides** where the provider's value matters: `render(<CartBadge />, { wrapper: ({ children }) => <CartProvider initial={…}>{children}</CartProvider> })`.
3. **Use `MemoryRouter` with `initialEntries`** to test a specific route (Part 6): `initialEntries={['/products/42']}`.
4. **Never mock the provider** — providing a real one with controlled state is the test.

```tsx
it('shows the item count from context', () => {
  render(
    <CartProvider initialItems={[{ id: 'p1', quantity: 2 }]}>
      <CartBadge />
    </CartProvider>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('2');
});
```

---

## 7. Custom hooks: `renderHook`, and when not to use it

```tsx
// src/hooks/useDebouncedValue.test.tsx (this lab, measured: 3 tests, 31 ms)
import { act, renderHook } from '@testing-library/react';

it('updates only after the delay has passed', () => {
  vi.useFakeTimers();
  const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
    initialProps: { value: 'a' },
  });

  rerender({ value: 'b' });
  expect(result.current).toBe('a');

  act(() => { vi.advanceTimersByTime(299); });
  expect(result.current).toBe('a');        // 299 ms is not enough

  act(() => { vi.advanceTimersByTime(1); });
  expect(result.current).toBe('b');        // 300 ms is
});
```

```text
 ✓ src/hooks/useDebouncedValue.test.tsx (3 tests) 31ms
      Tests  3 passed (3)
```

**Line by line.** `renderHook` mounts a tiny test component that calls your hook, so hooks can be tested without inventing a UI. `initialProps` gives the hook its arguments and `rerender` changes them (which is how you test "the value changed"). `result.current` is the hook's latest return value, read **after** `act` flushes the update. The 299 ms/300 ms pair is the boundary test that a debounce needs — anything else passes with a broken implementation.

⚠️ **When not to use `renderHook`:**

| Situation | Better test |
| --- | --- |
| The hook is only used by one component | test the component's behaviour (the hook's result is already observable) |
| The hook's point is rendering (returning JSX, refs to DOM) | a component test |
| The hook needs providers | still fine — pass `wrapper` to `renderHook` |
| The hook is trivial state plumbing | probably no test; test its consumer |

`renderHook` is right when the hook has **logic worth isolating**: timers, subscriptions, derived calculations, reducer-ish transitions. It is wrong when it duplicates a component test that already exists (double coverage with double maintenance).

```tsx
// Providers for a hook that needs them
renderHook(() => useCartTotal(), { wrapper: CartProvider });
```

---

## 8. Accessibility behaviour worth asserting

Because Part 12 made styling a first-class topic, the tests that keep the two honest are the accessibility ones:

```tsx
it('announces the count politely and keeps the buttons reachable', async () => {
  const user = userEvent.setup();
  render(<Counter />);
  expect(screen.getByTestId('count').getAttribute('aria-live')).toBe('polite');   // live region

  await user.tab();
  expect(screen.getByRole('button', { name: 'Increment' })).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByTestId('count')).toHaveTextContent('1');
});

it('labels the search input and exposes an error as an alert', () => {
  render(<SearchBox items={[]} />);
  expect(screen.getByLabelText('Search products')).toBeInTheDocument();
  // …and in a failing form:
  // expect(screen.getByRole('alert')).toBeInTheDocument();
});
```

Three cheap, high-value assertions: **the element is focusable and reachable by keyboard**, **the error is announced** (`role="alert"` or a live region), and **the control has an accessible name**. They cost one line each and they fail when a styling refactor turns a `<button>` into a `<div>`.

---

## 9. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Testing class names or DOM structure | refactors break tests; no defect detection | assert behaviour and content |
| 2 | Testing only the happy path | error/empty/pending states ship broken | one test per state |
| 3 | Missing provider wrappers | "context is null" or an empty router render | a shared `render` helper |
| 4 | Mocking the provider | the test proves the mock | provide real context with controlled values |
| 5 | `renderHook` for everything | duplicated coverage, tests coupled to implementation | hook tests for logic, component tests for behaviour |
| 6 | Asserting a pending state after a fast mock resolves | flaky test | slow the mock or assert the pending text with `findBy` |
| 7 | `type="number"` value assertions in jsdom | empty strings, confusing failures | `inputMode="numeric"` + `type="text"`, or assert messages |
| 8 | Snapshotting a whole page | unmaintainable diffs | targeted assertions |
| 9 | Forgetting `rerender` for prop changes | the new props are never exercised | `rerender(<Comp newProp />)` |
| 10 | `queryBy` for an element that must exist | a `null` slips through as a false pass | `getBy` when it must exist |
| 11 | Retries enabled in a test QueryClient | slow failures, timeouts | `retry: false`, `gcTime: 0` (file 05) |
| 12 | No test for the retry/abort/focus paths | the paths users hit under stress are unverified | cover them explicitly (file 01's coverage example) |

---

## 10. Best practices

1. **One test per behaviour**, named as a specification.
2. **Cover the four states** of any data view: loading, empty, error, success.
3. **Use a shared `render` helper** with the app's providers; override per test when the provider's value matters.
4. **Prefer component tests to hook tests**, unless the hook has isolatable logic.
5. **Mock at the network boundary**, not inside components.
6. **Use `rerender`** to test prop-driven changes and `unmount` to test teardown (aborts, subscriptions).
7. **Assert accessibility properties** (roles, labels, focus, live regions) — they double as regression protection for the UI layer.
8. **Keep the test narrow**: if a test needs three providers, five mocks and a router, it may be an integration test in disguise — that is fine, name it accordingly.
9. **Use fake timers with `act()`** around timer advances, and configure `userEvent` when both are used.
10. **Delete duplicated coverage**: one behaviour tested at two levels is maintenance with no extra confidence.

---

## 11. Practice

### Beginner

1. For `Counter`, write a test for the `step` prop, one for the `label` prop, and one for the disabled state after a reset.
2. Write a test for `SearchBox` that asserts the input's value after typing and one that asserts the empty state.
3. Add a test for a list component proving that the empty array renders an empty-state message rather than nothing.

### Intermediate

1. Test a controlled form with four cases (happy path, validation error, server error, pending). Use MSW for the server error (file 05).
2. Build the `render` helper with providers (router + theme + query client) and convert three existing tests to use it. Then add a per-test QueryClient override.
3. Write a hook test for `useDebouncedValue` (this lab's three cases), then decide — in writing — whether the component test alone would have been enough.

### Challenge

1. Test the identity behaviour of a reorderable list (Part 10, file 01's `KeyedList`): type into a row, reorder, assert the value travelled. Then break the key (use the index) and watch the test fail — record the failure message.
2. Write the tests for a multi-step form (Part 11's order flow): forward navigation, validation per step, going back without losing data, and the pending state on the final submit.
3. Add accessibility assertions to a component suite: keyboard reachability, accessible names, live-region announcements, and focus management after a dialog closes. Then deliberately break each one and confirm the tests fail.

---

## 12. Solutions

### Beginner

1. ```tsx
   it('increments by the step prop', async () => { const user = userEvent.setup(); render(<Counter step={5} />); await user.click(screen.getByRole('button', { name: 'Increment' })); expect(screen.getByTestId('count')).toHaveTextContent('5'); });
   it('renders the label prop', () => { render(<Counter label="Items" />); expect(screen.getByText(/Items:/)).toBeInTheDocument(); });
   it('disables Reset again after resetting', async () => { const user = userEvent.setup(); render(<Counter initial={1} />); const reset = screen.getByRole('button', { name: 'Reset' }); await user.click(screen.getByRole('button', { name: 'Increment' })); await user.click(reset); expect(reset).toBeDisabled(); });
   ```
2. `expect(screen.getByLabelText('Search products')).toHaveValue('lamp');` and `expect(screen.getByRole('status')).toHaveTextContent('No products match');`.
3. `render(<ProductList products={[]} />); expect(screen.getByText(/No products/)).toBeInTheDocument();` — if the component has no empty state yet, the test *is* the requirement.

### Intermediate

1. The four cases map to: successful submit (assert the success message and that the field cleared or kept its value per the design), validation error (assert the message and the preserved value), server error (MSW `HttpResponse.json({}, { status: 500 })`, assert the alert), and pending (delay the handler and assert the disabled button/`aria-busy`). The only one that needs care is pending (section 4's race).
2. The helper in section 6; the per-test override is `render(<CartBadge />, { wrapper: ({ children }) => <CartProvider initialItems={items}>{children}</CartProvider> })`. Converting tests usually *removes* lines from each test and makes the provider configuration visible in one place.
3. The hook test is worth keeping when the hook is used in several places (the debounce is) and when the boundary behaviour (299 vs 300 ms) is the contract. The component test alone would cover the *use case* but not the boundary — and the boundary is what breaks silently when someone changes `<=` to `<`.

### Challenge

1. With id keys the typed value travels; with `key={index}` the value stays with the position, so `getByLabelText('note-a')` after the reorder holds B's text — the test fails with something like `expected "call back" but received ""`, which is a perfect failure message for a real bug.
2. A multi-step form test asserts step transitions by *what is visible* (`getByRole('heading', { name: /step 2/i })`), that step-1 validation blocks moving on, that going back preserves values (they are in state or in the DOM), and that the final submit disables the button and shows the pending state.
3. Typical failures when you break each: a `<div onClick>` instead of `<button>` fails `getByRole('button')`; removing `htmlFor` fails `getByLabelText`; removing `role="alert"` fails `getByRole('alert')`; forgetting to return focus after closing a dialog fails a `toHaveFocus()` assertion. Each test is one line and each failure is a genuine accessibility bug.

---

## 13. Summary

- **Props: test the branches** (defaults, variants, flags, children, callbacks — including the "does not call" case).
- **State: three questions** — the initial value the user sees, the change an interaction causes, and what happens when inputs change (`rerender`) or the component is deliberately remounted (`key`).
- **Lists: test identity, not just length** — a count passes with index keys while the UI is wrong; the reorder test is what catches it, and the empty state is a designed screen.
- **Forms: four cases** — happy path, validation failure (values preserved), server failure, pending. Beware the pending race (slow the mock) and jsdom's `type="number"` value quirks.
- **Wrapping providers belongs in one `render` helper** with the app's router/context/query client; providers are never mocked, they are configured.
- **`renderHook` is for isolatable hook logic** — measured here with the debounce hook's three fake-timer tests (`3 tests, 31 ms`), including the 299/300 ms boundary; everything else is better tested through a component.
- **Assert accessibility behaviour** (focus, names, live regions) — one line each, and they fail the moment a styling refactor removes semantics.

---

**What's next →** [`05-api-testing.md`](./05-api-testing.md) covers the boundary where most real bugs live: the network. MSW handlers and per-test overrides, the measured success/failure/`onLoad` tests from this lab, delays and retries, testing the typed HTTP client from Part 7, TanStack Query with a fresh client per test, and what to test on the server instead of mocking it.
