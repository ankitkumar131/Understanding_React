# 03 — React Testing Library: Querying Like a User

> **Part 13 · Testing · File 3 of 5**

Why this file exists: React Testing Library (RTL) is a small library with one opinion — *the more your tests resemble the way your software is used, the more confidence they can give you*. Everything else (the query priority, `userEvent`, `findBy*`, the absence of tools for reaching into component internals) follows from that opinion. This file teaches the API by teaching the opinion: how `render` and `screen` work, the query priority list and why `getByRole` is first, the difference between `getBy`/`queryBy`/`findBy` (and the async rule that trips everyone up), `userEvent` versus the lower-level `fireEvent`, the measured tests from this book's lab, and the debugging tools that turn "unable to find an element" from a mystery into a message.

---

## 1. The render, and where things end up

```tsx
import { render, screen } from '@testing-library/react';

render(<Counter initial={3} step={2} label="Items" />);
expect(screen.getByTestId('count')).toHaveTextContent('3');
```

`render` mounts the element into a `document.body`-attached container and returns `{ container, unmount, rerender, debug }`. `screen` is a global handle on that document, which is why modern tests use it instead of destructuring queries from `render`:

| From `render` | Equivalent on `screen` | Verdict |
| --- | --- | --- |
| `const { getByText } = render(<X />)` | `render(<X />); screen.getByText(…)` | prefer `screen` — the queries no longer travel through every helper |

Three things worth knowing about `render`:

1. **The container is attached to `document.body`**, so focus, `document.activeElement` and `getBoundingClientRect` behave like they do in a page (within jsdom's limits — there is no real layout).
2. **Every `render` adds a container**; without cleanup, queries can match elements from a previous test. This lab's `setup.ts` runs `cleanup()` in `afterEach` — that is why the measured suite has no cross-test leakage.
3. **`rerender`** is how you test prop changes; **`unmount`** is how you test teardown (effects, subscriptions, abort — measured in file 01's coverage example).

---

## 2. The query priority, and why it is in that order

| Priority | Query | Use it for | Example |
| --- | --- | --- | --- |
| 1 | `getByRole` | anything with a semantic role + accessible name | `getByRole('button', { name: 'Increment' })` |
| 2 | `getByLabelText` | form fields (a label *should* exist) | `getByLabelText('Search products')` |
| 3 | `getByPlaceholderText` | fields with only a placeholder (a smell, but common) | `getByPlaceholderText('Search')` |
| 4 | `getByText` | non-interactive content | `getByText('No products match')` |
| 5 | `getByDisplayValue` | a field's current value | `getByDisplayValue('Desk Lamp')` |
| 6 | `getByAltText` / `getByTitle` | images, iframes, SVGs | `getByAltText('Product photo')` |
| 7 | **`getByTestId`** | last resort: no role, no text | `getByTestId('count')` |

The order is not arbitrary: it mirrors how much confidence each query gives about **what the user experiences**. `getByRole('button', { name: 'Increment' })` fails if the element is a `<div>` with an `onClick`, if it has no accessible name, or if the name is wrong — all real defects. `getByTestId` passes as long as the attribute is present, so it catches nothing about usability and couples the test to a testing-only attribute.

⚠️ Two consequences of using `getByRole` widely:

1. **Your tests become accessibility tests.** In the measured suite, `getByRole('button', { name: 'Reset' })` failing meant a screen-reader user could not find it either.
2. **`getByRole` requires real semantics**, so it will push you toward `<button>`, `<label htmlFor>`, `<ul>`/`<li>` and `aria-*` — the same things Part 12's styling advice required. If a test is hard to write, that is usually information about the markup.

```tsx
// src/components/SearchBox.test.tsx (this lab, measured)
await user.type(screen.getByLabelText('Search products'), 'lamp');
expect(screen.getAllByRole('listitem')).toHaveLength(2);

await user.type(screen.getByRole('searchbox'), 'keyboard');
expect(screen.getByRole('status')).toHaveTextContent('No products match');
```

Note `getByRole('searchbox')`: `<input type="search">` has that role implicitly, so the same element can be reached by two correct queries. Prefer the one that documents intent.

---

## 3. `getBy`, `queryBy`, `findBy` — and the async rule

| Variant | Sync/async | Throws when missing? | Use for |
| --- | --- | --- | --- |
| `getBy…` | sync | yes | things that must be present **now** |
| `queryBy…` | sync | no (returns `null`) | asserting **absence** (`expect(queryByText('x')).not.toBeInTheDocument()`) |
| `findBy…` | async (returns a promise) | yes (after a timeout) | things that appear **after an await** (data, transitions, suspense) |
| `getAllBy…`/`queryAllBy…`/`findAllBy…` | plural forms | — | lists; assert `length` |

The async rule that follows: **never assert a DOM change without awaiting the interaction or the appearance.**

```tsx
// ❌ the classic flake: the state update has not been applied yet
await user.click(screen.getByRole('button', { name: 'Load' }));
expect(screen.getByText('Loaded')).toBeInTheDocument();

// ✅ await the *appearance*
await user.click(screen.getByRole('button', { name: 'Load' }));
expect(await screen.findByText('Loaded')).toBeInTheDocument();
```

`userEvent`'s methods already await the event and the resulting commits, so clicking is covered; what is *not* covered is work that finishes later — a fetch, a `setTimeout`, a transition. Those need `findBy*` (preferred) or `waitFor` (for assertions that are not queries):

```tsx
await waitFor(() => {
  expect(screen.getByRole('alert')).toHaveTextContent('Request failed with 500');
});
```

⚠️ Do not mix `waitFor` with a fixed sleep inside it, and do not wrap `findBy*` in `waitFor` (double waiting, confusing timeouts). If a test needs a sleep to pass, the component is probably not exposing a state you can observe — that is a design signal, not a test problem.

---

## 4. `userEvent` versus `fireEvent`

| | `fireEvent` | `userEvent` |
| --- | --- | --- |
| What it does | dispatches one DOM event | simulates the *sequence* a real user produces |
| Example | `fireEvent.change(input, { target: { value: 'x' } })` | `await user.type(input, 'x')` |
| Pointer events | not modelled | pointer/mouse/focus/keyboard defaults are applied |
| Disabled elements | will happily "click" a disabled button in some cases | respects `disabled`, `pointer-events`, and focus rules |
| Async | synchronous | must be awaited |
| Use for | low-level events with no user equivalent (`scroll`, some `transitionend` cases) | everything a user does |

```tsx
const user = userEvent.setup();          // create once per test
await user.click(screen.getByRole('button', { name: 'Increment' }));
await user.type(screen.getByLabelText('Search products'), 'lamp');
await user.clear(input);
await user.tab();                        // real keyboard navigation → focus assertions
await user.keyboard('{Enter}');
```

💡 `userEvent.setup()` also gives you the fake-timer hook from file 02 (`userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`) and per-test overrides like `{ delay: null }` to make typing instant in large suites.

⚠️ `user.type()` types **into the element**, so a controlled input's `onChange` fires per character — which means a component test that types 20 characters runs 20 renders. For long input, `user.paste()` (one event) is the realistic fast path when you do not need per-keystroke behaviour.

---

## 5. The measured tests, annotated

```tsx
// src/components/Counter.test.tsx — the two tests that pass in this lab
it('shows the initial value and increments by the step', async () => {
  const user = userEvent.setup();
  render(<Counter initial={3} step={2} label="Items" />);

  expect(screen.getByText(/Items:/)).toBeInTheDocument();
  expect(screen.getByTestId('count')).toHaveTextContent('3');

  await user.click(screen.getByRole('button', { name: 'Increment' }));
  expect(screen.getByTestId('count')).toHaveTextContent('5');

  await user.click(screen.getByRole('button', { name: 'Increment' }));
  expect(screen.getByTestId('count')).toHaveTextContent('7');
});

it('disables Reset at the initial value and re-enables it after a change', async () => {
  const user = userEvent.setup();
  render(<Counter />);

  const reset = screen.getByRole('button', { name: 'Reset' });
  expect(reset).toBeDisabled();                       // ← semantics + state in one assertion

  await user.click(screen.getByRole('button', { name: 'Increment' }));
  expect(reset).toBeEnabled();

  await user.click(reset);
  expect(screen.getByTestId('count')).toHaveTextContent('0');
  expect(reset).toBeDisabled();
});
```

Why these are good tests, line by line:

- **`userEvent.setup()`** at the top: the event pipeline is configured once, and the test awaits real click semantics (including that a disabled button is not clickable).
- **`render(<Counter initial={3} step={2} label="Items" />)`** exercises props as the user-facing configuration, not internals.
- **`getByText(/Items:/)`** documents that the label is visible — a behaviour, not a class name.
- **`toHaveTextContent('5')`** asserts the *outcome* the user sees after an interaction, which is the highest-value observation in this component.
- **`toBeDisabled()` / `toBeEnabled()`** are accessibility-aware matchers: they check the element's actual disabled semantics, so a `<div class="disabled">` would fail.
- **`const reset = …` captured once** and asserted three times — the element is the same DOM node across re-renders, which is itself a mild guarantee that React updated in place rather than remounting (Part 10, file 01).
- **No `act()` warnings**: `render`, `userEvent` and `findBy*` all wrap updates correctly. If you see an `act(...)` warning, work is happening outside those helpers — usually a manual `fireEvent` or a resolved promise with no await.

⚠️ One honest caveat visible in the coverage report (file 01): the `Reset`-disabled branch on line 13 was uncovered until a test exercised "reset back to the initial value". Tests that look thorough can still leave a branch behind — which is exactly why coverage is a question generator.

---

## 6. Debugging a query that does not match

| Symptom | First move | Then |
| --- | --- | --- |
| "Unable to find an accessible element with the role …" | `screen.debug()` — print the DOM | check the element's role/name; `logRoles(container)` lists every role |
| "Found multiple elements with …" | `screen.debug()` | narrow with `{ name: … }`, or use `getAllBy…` and assert the length |
| The element exists but the query fails | the element is not `document.body`-attached (a portal!) | portal content is in `document.body` — query `screen`, not `container` |
| Assertion passes locally, fails in CI | a missing `await` | use `findBy*`/`waitFor`; remove fixed sleeps |
| `act(...)` warning | an update happened outside the helpers | await the interaction; avoid manual `fireEvent` where `userEvent` applies |
| "Cannot read properties of null" in a matcher | the query returned `null` (a `queryBy…`) | use `getBy…` when the element must exist |

```tsx
import { logRoles, prettyDOM } from '@testing-library/dom';

screen.debug();                       // prints the current DOM (respects DEBUG_PRINT_LIMIT)
console.log(prettyDOM(element));      // a subtree
logRoles(document.body);              // every role + accessible name — the fastest way to fix a query
```

💡 `logRoles(document.body)` is the tool most people do not know, and it answers the real question ("what role does my element have?") directly instead of by guessing.

---

## 7. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | `getByTestId` for everything | tests couple to test-only attributes; a11y unchecked | `getByRole`/`getByLabelText` first |
| 2 | Asserting right after a click, without awaiting | flaky tests | `await user.click(...)`, then `findBy*` for late work |
| 3 | `getByText` for something split across elements | "unable to find text" | match the container, or use a role + `toHaveTextContent` |
| 4 | Wrapping `findBy*` in `waitFor` | doubled timeouts, confusing failures | one or the other |
| 5 | `fireEvent` for user actions | misses focus/pointer semantics; disabled elements "clickable" | `userEvent` |
| 6 | Not awaiting `userEvent` methods | unhandled promise, assertions race | `await user.…` always |
| 7 | `cleanup()` missing | cross-test contamination | it is in this lab's `setup.ts` |
| 8 | Querying with `container.querySelector` | bypasses accessibility, breaks on markup change | `screen` queries |
| 9 | Fake timers + `userEvent` without `advanceTimers` | hangs | configure (file 02) |
| 10 | Using `screen` after the test ends | errors on stale documents | queries inside the test only |
| 11 | Snapshotting `screen.debug()` output | a huge, unreadable diff that people update blindly | targeted assertions |
| 12 | Testing a portal's content through `container` | portal renders into `document.body`, not the container | query via `screen` |

---

## 8. Best practices

1. **Query by role first, testid last**, and treat a hard-to-write query as feedback about the markup.
2. **One interaction flow per test**, with `Arrange–Act–Assert` visible in the structure.
3. **Always `await` `userEvent`** and use `findBy*` for anything that appears after an await.
4. **Create `userEvent.setup()` per test** (not on a module-level constant), so overrides and timers are per test.
5. **Prefer `user.click`/`type`/`tab`** over `fireEvent`, and `tab` when focus behaviour matters.
6. **Assert outcomes, not text fragments**, with accessibility-aware matchers (`toBeDisabled`, `toBeVisible`, `toHaveAccessibleName`).
7. **Keep queries scoped** where ambiguity is possible (`within(screen.getByRole('dialog'))`), and start with `logRoles` before guessing.
8. **Never sleep.** If nothing is observable, expose a state (a `role="status"`) rather than waiting.
9. **Avoid mocking child components** — rendering them is what makes a component test an integration test that catches real wiring bugs.
10. **Run the same assertions a user would notice**: count of list items, disabled submit button, alert text, focus position.

---

## 9. Practice

### Beginner

1. Render `Counter` and assert: the label and initial value are visible; the count text after one click; that the Increment button is reachable by role and name.
2. Write one assertion with `queryBy` proving something is *not* rendered, and one with `findBy` that waits for text to appear.
3. Replace three `getByTestId` calls in an existing test with role/label queries. Note which ones were impossible and why (that is a markup finding).

### Intermediate

1. Add a test for `SearchBox` asserting that typing "lamp" filters to two items, that an empty query restores all items, and that a no-match query shows the status message. (This lab's measured suite has exactly these three.)
2. Test keyboard interaction: tab to the Increment button and activate it with `{Enter}`, asserting both the count and `document.activeElement`.
3. Use `within()` to scope queries inside a dialog, then explain what would break without it.

### Challenge

1. Write a test that proves an unmounted component stops working: render a component with a subscription (an interval, a fetch), unmount it, advance timers, and assert nothing happens (no state updates, no console errors). This is the `ProductList` abort path from file 01.
2. Build a small "query cookbook" for your project: the five elements you query most, the correct query for each, and the accessibility requirement each query enforces. Add it to the repo's docs.
3. Take a flaky test in an existing suite and fix it properly: identify the missing await, replace fixed sleeps with `findBy*`, and prove stability by running the suite 20 times in a row.

---

## 10. Solutions

### Beginner

1. ```tsx
   render(<Counter initial={3} label="Items" />);
   expect(screen.getByText(/Items:/)).toBeInTheDocument();
   expect(screen.getByTestId('count')).toHaveTextContent('3');
   await user.click(screen.getByRole('button', { name: 'Increment' }));
   expect(screen.getByTestId('count')).toHaveTextContent('4');
   ```
2. Absence: `expect(screen.queryByRole('alert')).not.toBeInTheDocument();`. Appearance: `expect(await screen.findByText(/Loaded/)).toBeInTheDocument();`.
3. Typical substitutions: `getByTestId('submit')` → `getByRole('button', { name: 'Save' })`; `getByTestId('error')` → `getByRole('alert')`; `getByTestId('count')` → `getByRole('status')` if it has a live-region role. Where it fails: a purely presentational element with no role — in that case either give it a role (`<output>`, `role="status"`) or keep the testid and note the exception.

### Intermediate

1. The three tests are exactly the ones measured in this lab: filter (`getAllByRole('listitem')` length 2), clear (`user.clear` → length 3), and empty result (`getByRole('status')` text, and `queryByRole('list')` absent).
2. ```tsx
   const user = userEvent.setup();
   render(<Counter />);
   await user.tab();                                   // focuses the first button
   expect(screen.getByRole('button', { name: 'Increment' })).toHaveFocus();
   await user.keyboard('{Enter}');
   expect(screen.getByTestId('count')).toHaveTextContent('1');
   ```
   This is the cheapest real accessibility test you can write: if the element is not focusable, it fails.
3. `within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' })` scopes the query to the dialog. Without it, an identical "Close" button elsewhere in the page would make `getByRole` throw "found multiple elements" — and, worse, a test could pass by clicking the wrong one.

### Challenge

1. ```tsx
   it('does not update state after unmounting mid-request', async () => {
     const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
     const { unmount } = render(<ProductList />);
     unmount();
     await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
     expect(errors).not.toHaveBeenCalled();
     errors.mockRestore();
   });
   ```
   The assertion is "no errors and no warnings" — React 19 no longer warns on setState-after-unmount, so pair it with the abort assertion (the request should be cancelled) or a spy on `fetch` to prove the controller aborted.
2. A useful cookbook entry looks like: "A save button → `getByRole('button', { name: /save/i })` → requires an accessible name; a form field → `getByLabelText('Price')` → requires a real `<label>`; a list → `getAllByRole('listitem')` → requires `<ul>/<li>`; an error message → `getByRole('alert')` → requires `role="alert"` (or an `aria-live` region); a loading state → `getByRole('status')`". Each line documents both the query and the requirement it enforces.
3. The fix is almost always one of: missing `await` on `userEvent`, an assertion before an awaited state change, a fixed sleep shorter than a slow CI machine's timing, or shared state between tests. Proving it by running the suite 20 times matters: a flake that passes 19 times is still broken, and only repetition proves the fix.

---

## 11. Summary

- **RTL's opinion shapes its API**: query like a user, assert what a user notices, and let the hard-to-write query tell you something about the markup.
- **The query priority ends with `getByTestId`** for a reason: `getByRole`/`getByLabelText` enforce semantics and accessibility, while testids enforce nothing. Measured tests here use roles (`button`, `listitem`, `status`, `searchbox`, `alert`) and label queries throughout.
- **`getBy` vs `queryBy` vs `findBy`** is the synchronous/asynchronous/absence decision: `getBy` for the present, `queryBy` for absence, `findBy` for anything that appears after an await.
- **`userEvent` beats `fireEvent`** for user actions (it models pointer, focus and keyboard behaviour, and respects `disabled`), and it must be awaited; `fireEvent` is for events with no user equivalent.
- **Debug with `screen.debug()` and `logRoles(document.body)`**, and remember portals render outside `container` — query with `screen`.
- **`cleanup()` in setup prevents cross-test contamination**, and capturing an element once then asserting it across re-renders asserts that React updated in place.
- **Never sleep; if nothing is observable, expose a state** (`role="status"`, `aria-busy`) — a test that cannot observe the loading state is usually a UI that cannot announce it either.

---

**What's next →** [`04-component-testing.md`](./04-component-testing.md) puts the queries to work on real component shapes: props and conditional rendering, forms and validation, lists and keys, async states (loading → data → error), providers and context wrappers, hooks with `renderHook` (measured: the debounce hook's three fake-timer tests), and testing the accessibility behaviour that styling often breaks.
