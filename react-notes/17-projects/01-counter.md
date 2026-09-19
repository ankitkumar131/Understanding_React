# 01 — Project: Counter (Components, State, Events, Props)

> **Part 17 · Projects · File 1 of 7**

Why this project: the counter is the "hello world" of interactive React, and it is deceptively complete. Building it properly forces you to decide what lives in state and what is a prop, how an event handler updates state safely, what "disabled" means for a user who cannot use a mouse, and how to test behaviour instead of implementation. Everything later in this part is a larger version of these same decisions — which is why the first project is small, finished and *correct*, not a fragment.

Measured: the finished project's tests run in **347 ms** (7 tests) as part of this lab's suite — `/home/user/lab/part17-projects.txt`.

---

## 1. What you are building (requirements)

| # | Requirement | Why it is in the list |
| --- | --- | --- |
| 1 | Shows the current count | the visible behaviour |
| 2 | A button increases by a configurable `step` | state + events |
| 3 | A button decreases by `step` | the same state, another path |
| 4 | A Reset button returns to the initial value | proves you know what "initial" means |
| 5 | The count cannot go below `min` or above `max` | bounds are a *rule*, not a UI accident |
| 6 | Boundary buttons are disabled | prevent the invalid action instead of ignoring it |
| 7 | `onChange` fires after every real change | the component is usable inside a larger app |
| 8 | The value is announced to screen readers | accessibility is part of "done" |
| 9 | Rapid clicks cannot lose a count | the functional-updater rule from Part 5 |
| 10 | Every requirement has a test | the part's habit: a requirement without a test is a hope |

**Not** in this project: persistence, an API, routing, styling systems. Adding features to a counter is how people learn to over-engineer; the counter's job is to be *about* state and events.

---

## 2. The file tree

```text
src/projects/counter/
├── Counter.tsx         # the whole component (one file, one component)
└── Counter.test.tsx    # 7 tests, one per behaviour above
```

Two files. A folder is justified because the test is colocated (Part 15, file 03) — one component plus its test is the smallest unit that has a home.

---

## 3. The complete code

```tsx
// src/projects/counter/Counter.tsx
import { useState } from 'react';

export interface CounterProps {
  /** Starting value. Default 0. */
  initial?: number;
  /** How much one press changes the value. Default 1. */
  step?: number;
  /** Never go below this (default 0 — a counter of "things" is never negative). */
  min?: number;
  /** Never go above this. */
  max?: number;
  /** Called after every successful change, with the new value. */
  onChange?: (value: number) => void;
  /** Label for the value, used by tests and screen readers. */
  label?: string;
}

export function Counter({
  initial = 0,
  step = 1,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  onChange,
  label = 'Count',
}: CounterProps) {
  const [count, setCount] = useState(initial);

  const apply = (delta: number) => {
    // The functional updater reads the *current* value, so rapid clicks cannot lose an update.
    setCount((current) => {
      const next = Math.min(max, Math.max(min, current + delta));
      if (next !== current) onChange?.(next);
      return next;
    });
  };

  return (
    <div className="counter">
      {/* aria-live announces changes to screen readers without stealing focus */}
      <output data-testid="value" aria-live="polite">
        {label}: {count}
      </output>

      <div className="counter__buttons">
        <button type="button" onClick={() => apply(-step)} disabled={count <= min} aria-label="Decrease">
          −
        </button>
        <button type="button" onClick={() => apply(step)} disabled={count >= max} aria-label="Increase">
          +
        </button>
        <button type="button" onClick={() => { setCount(initial); onChange?.(initial); }} disabled={count === initial}>
          Reset
        </button>
      </div>
    </div>
  );
}
```

---

## 4. Line by line

| Line | What it does | Why it is written that way |
| --- | --- | --- |
| `export interface CounterProps` | declares the component's contract | consumers get completion and type errors (Part 4) |
| `initial = 0` (destructuring default) | a default for a prop | in modern React, defaults belong in the signature — `defaultProps` is legacy (Part 4) |
| `max = Number.POSITIVE_INFINITY` | "no maximum" without a special case | `count >= Infinity` is always false, so the button stays enabled |
| `const [count, setCount] = useState(initial)` | the only state | `initial` is the *starting* value; changing the prop later does not reset state, which is what "initial" means |
| `setCount((current) => …)` | functional updater | reads the value React has, not the value captured when the closure was created — this is the fix for "clicks are lost" |
| `Math.min(max, Math.max(min, current + delta))` | clamps the result | one expression, testable at the boundaries |
| `if (next !== current) onChange?.(next)` | notify only on real change | pressing a disabled-in-effect button should not fire events |
| `onChange?.(next)` | optional call | the prop is optional, so callers that do not care pass nothing |
| `<output … aria-live="polite">` | the value is text, announced politely | screen readers read changes without interrupting the user |
| `disabled={count <= min}` | prevents an invalid action | better than silently ignoring the click, which looks broken |
| `disabled={count === initial}` on Reset | nothing to reset | the UI tells the truth |
| `type="button"` | prevents form submission | a bare `<button>` inside a form submits it — a classic bug |
| `aria-label="Increase"` | the visible label is `+` | a symbol is not a name; assistive tech and tests need a real one |

---

## 5. Run it

```bash
npm install                  # react, react-dom, vite, vitest, @testing-library/*
npm run dev                  # then render <Counter /> anywhere in the app
npm test -- --run src/projects/counter
```

If you are building this standalone, the smallest setup is a Vite `react-ts` project (Part 1) with `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom` and `vitest`, and a `src/test/setup.ts` that imports the DOM matchers (Part 13, file 02).

---

## 6. The tests (and what each one proves)

```tsx
// src/projects/counter/Counter.test.tsx (complete)
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Counter } from './Counter';

describe('<Counter />', () => {
  it('renders the initial value', () => {
    render(<Counter initial={5} />);
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 5');
  });

  it('increments and decrements by the step', async () => {
    const user = userEvent.setup();
    render(<Counter initial={5} step={2} />);
    await user.click(screen.getByRole('button', { name: 'Increase' }));
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 7');
    await user.click(screen.getByRole('button', { name: 'Decrease' }));
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 5');
  });

  it('cannot go below the minimum (the button is disabled)', async () => {
    const user = userEvent.setup();
    render(<Counter initial={0} min={0} />);
    const decrease = screen.getByRole('button', { name: 'Decrease' });
    expect(decrease).toBeDisabled();
    await user.click(decrease);
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 0');
  });

  it('cannot go above the maximum', async () => {
    const user = userEvent.setup();
    render(<Counter initial={9} max={10} />);
    await user.click(screen.getByRole('button', { name: 'Increase' }));
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 10');
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
  });

  it('reports every change through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Counter initial={0} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Increase' }));
    await user.click(screen.getByRole('button', { name: 'Increase' }));
    expect(onChange).toHaveBeenNthCalledWith(1, 1);
    expect(onChange).toHaveBeenNthCalledWith(2, 2);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('resets to the initial value and disables Reset when unchanged', async () => {
    const user = userEvent.setup();
    render(<Counter initial={3} />);
    const reset = screen.getByRole('button', { name: 'Reset' });
    expect(reset).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Increase' }));
    await user.click(reset);
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 3');
  });

  it('loses no clicks when pressed rapidly (functional updater)', async () => {
    const user = userEvent.setup();
    render(<Counter />);
    const increase = screen.getByRole('button', { name: 'Increase' });
    await Promise.all([user.click(increase), user.click(increase), user.click(increase)]);
    expect(screen.getByTestId('value')).toHaveTextContent('Count: 3');
  });
});
```

```text
$ npx vitest run src/projects/counter --reporter=verbose

 ✓ src/projects/counter/Counter.test.tsx (7 tests) 347ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  1.98s
```

| Test | Proves | If it failed, the bug would be |
| --- | --- | --- |
| renders the initial value | props reach state | `useState()` called with nothing |
| increments/decrements by step | the handler and the clamp work | ignoring `step`, or adding instead of subtracting |
| cannot go below the minimum | the bound is enforced **and** visible | a button that looks clickable but does nothing |
| cannot go above the maximum | the same, on the other side | an off-by-one in the clamp |
| reports every change | the callback contract | calling `onChange` before clamping, or not at all |
| resets and disables Reset | "initial" is remembered | using `count === 0` instead of `count === initial` |
| loses no clicks | the functional updater | `setCount(count + 1)` with a stale `count` |

⚠️ **The last test is the interesting one.** With `setCount(count + delta)` the three rapid clicks can collapse into one update, because all three handlers captured the same `count`. The functional updater (`setCount(current => …)`) reads the latest state, so no update is lost. This is the exact bug that appears in production as "sometimes the + button only counts once" — and it is invisible in slow, human-paced testing.

---

## 7. Common mistakes in this project

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | `setCount(count + 1)` in a handler | rapid clicks lost (see the test) | functional updater |
| 2 | Clamping in the disabled attribute only | keyboard/AT can still trigger, or state drifts | clamp in the state update **and** disable |
| 3 | `<button>` without `type="button"` | submits an enclosing form | always set the type |
| 4 | Icon-only buttons with no accessible name | screen readers announce "button" | `aria-label` |
| 5 | Deriving the value from a prop on every render | the counter resets when the parent re-renders | props are *initial* values; state owns the current value (Part 5) |
| 6 | Putting `count` in the parent "for reuse" | prop drilling for no reason; harder tests | keep state where it is used (Part 9) |
| 7 | Testing `wrapper.state('count')` | tests break on refactors | test visible behaviour (Part 13) |
| 8 | Making `initial` required | every caller must pass it | defaults in the signature |
| 9 | No `Reset`, so users cannot get back | a small usability hole that users notice | provide the "undo to start" affordance |
| 10 | Adding `useEffect` to sync a prop into state | an extra render and a stale-value class of bug | state initialised once, or a `key` to remount |

---

## 8. Practice (extend the project)

### Beginner

1. Add a `quantity` style step selector: buttons for ×1, ×5, ×10 that change how much the `+`/`−` buttons move.
2. Show "Maximum reached" / "Minimum reached" text when a bound is hit, and add tests.
3. Make `label` render as a `<label>` associated with the output via `aria-labelledby`.

### Intermediate

1. Add a `history: number[]` of previous values and an Undo button; test that undo restores the previous value and is disabled with empty history. (Hint: keep both in a single state object so they cannot drift apart — Part 5.)
2. Persist the count in `localStorage` and restore it on mount; write the test for "restores the stored value" and for "ignores corrupt stored data".
3. Convert the three buttons into a small `<CounterButton>` component with `label`, `onClick` and `disabled` props, and explain in one sentence what moved from the parent to the child.

### Challenge

1. Rebuild the counter with `useReducer` (`{ count, history }`, actions `increment`/`decrement`/`reset`/`undo`), keep all seven tests passing unchanged, and write down what the reducer made clearer and what it made longer.
2. Add keyboard shortcuts (`+`, `-`, `r`, `z`) through a single `useEffect` with a `keydown` listener, correctly cleaning up on unmount, and ignoring keystrokes typed into inputs.
3. Add a "hold to repeat" behaviour (increasing while the button is held) using `setInterval` inside refs, and explain the cleanup rules — then test it with fake timers (Part 13).

---

## 9. Solutions

### Beginner

1. Keep `step` as state: `const [step, setStep] = useState(1)`, render three buttons that call `setStep(1 | 5 | 10)` and mark the active one with `aria-pressed`.
2. Render `{count >= max && <p role="status">Maximum reached</p>}` (and the mirror case). The test asserts the text appears at the bound and disappears after a decrement.
3. Give the output an `id` and wrap it in a `<label>`/`aria-labelledby` pair so the accessible name matches the visible label.

### Intermediate

1. `const [state, setState] = useState({ count: initial, history: [] as number[] })` — one object, one update: `setState((s) => ({ count: s.count + step, history: [...s.history, s.count] }))`. Two separate states would let them disagree (a "state that must change together" smell).
2. Initialise with a lazy initialiser: `useState(() => readStored() ?? initial)`, write in an effect, and reuse the corrupt-data pattern from Part 14's token store (parse, validate, delete on failure).
3. `CounterButton` receives `{ label, onClick, disabled }` — the parent keeps the *logic* (`apply`) and the child owns the *rendering* of one button, which is the split that makes the button reusable and the parent readable.

### Challenge

1. A reducer centralises the transitions (`increment`, `decrement`, `reset`, `undo`) and makes impossible transitions explicit; it costs a little more code for four actions, and it starts paying off when the state has several fields that must change together. The tests stay identical because they never knew how the state was stored — which is the point of testing behaviour.
2. A single effect that adds `window.addEventListener('keydown', handler)` and returns `() => window.removeEventListener('keydown', handler)`. Inside, ignore events whose `target` is an `input`/`textarea`/`select` (or use `event.defaultPrevented`), and ignore repeats if you do not want key-repeat to spin the counter.
3. Store the interval id in a ref (`const timer = useRef<number | null>(null)`), start it on pointer-down, clear it on pointer-up/leave/unmount, and make sure a stale interval cannot fire after unmount. With fake timers you can assert exactly how many increments happen in 500 ms — evidence instead of hope.

---

## 10. Summary

- **Ten requirements, seven tests, two files**: a counter is small, and "small" is exactly why it is the right place to build the habits for the rest of this part.
- **State owns the current value; props provide the starting value and the rules** (`initial`, `step`, `min`, `max`, `onChange`, `label`).
- **The functional updater is not optional** when handlers can fire faster than React re-renders — the rapid-click test is the proof.
- **Bounds are enforced in state *and* reflected in the UI** (clamped value, disabled buttons), because "the click did nothing" reads as a broken app.
- **Accessibility is part of the component**: a real accessible name (`aria-label`), a polite live region for the value, and `type="button"` everywhere.
- **The tests describe behaviour** (what a user sees and does), so they survived every refactor in the practice section.

---

**What's next →** [`02-todo-app.md`](./02-todo-app.md) scales this up to lists, forms, filters and persistence: a todo app where the state logic lives in a custom hook, the components are presentational, and the tests cover a full journey — including what happens when the stored data is corrupt.
