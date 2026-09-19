# Project 1 — Counter: Components, State and Events

> **Part 17 · Projects · Project 1 of 6**

Why this project exists: it is the smallest app that contains the three ideas every React app
is made of — a **component** (a function that returns UI), **state** (a value React remembers
and re-renders when it changes), and an **event** (something the user does that changes that
value). If you can explain every line here, you understand the core loop of React. Everything
in projects 2–6 is this loop with more data.

**Concepts used:** function components, JSX, `useState`, event handlers, props, derived
values, lifting state up. **Nothing else.** No router, no API, no CSS framework.

**Time:** 45–60 minutes, typing every line.

---

## 1. The goal

```text
┌───────────────────────────────┐
│         Counter               │
│                               │
│            7                  │
│                               │
│   [ − ]   [ Reset ]   [ + ]   │
│                               │
│   Step: [ 1 ▾ ]               │
│   Even · Positive             │
│                               │
│   History: 0 → 1 → 7          │
└───────────────────────────────┘
```

Requirements:

1. `+` and `−` change the count by a configurable step.
2. `Reset` returns to 0.
3. The count cannot go below 0 (the `−` button disables itself).
4. Derived labels ("Even", "Odd", "Positive", "Zero") update automatically.
5. A history of the last 5 values is shown.

---

## 2. Set up

```bash
npm create vite@latest counter -- --template react-ts
cd counter
npm install
npm run dev
```

```text
  VITE v7.x.x  ready in 312 ms
  ➜  Local:   http://localhost:5173/
```

Then delete the template's demo code so you start clean:

```bash
rm src/App.css src/assets/react.svg
```

```tsx
// src/App.tsx — emptied, ready for the project
import { Counter } from './components/Counter';

export default function App() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 420, margin: '0 auto' }}>
      <Counter />
    </main>
  );
}
```

⚠️ **Delete `import './App.css'` from `App.tsx` when you delete the file**, or the dev server
shows `Failed to resolve import "./App.css"`. Vite fails loudly on a missing import — which
is the behaviour you want.

---

## 3. Step 1 — A component that displays a number

```tsx
// src/components/Display.tsx
interface DisplayProps {
  /** The number to show. */
  value: number;
}

/** A presentational component: it renders what it is given and knows nothing else. */
export function Display({ value }: DisplayProps) {
  return (
    <output
      style={{ display: 'block', fontSize: '4rem', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
    >
      {value}
    </output>
  );
}
```

**Line by line**

- `interface DisplayProps` — the *contract* of this component. TypeScript enforces it at
  every call site (Part 3 file 08).
- `{ value }: DisplayProps` — destructuring the props object, typed in the parameter. This
  is the modern way; `React.FC` is not needed (Part 3 file 08).
- `<output>` — the semantic HTML element for a calculated result. Screen readers announce it
  as a live value, which `<div>` does not (Part 15 file 08 cares about this).
- `{value}` — JSX expression container. The number is inserted as **text**, escaped (Part 15
  file 06).
- `fontVariantNumeric: 'tabular-nums'` — every digit is the same width, so the number does
  not jiggle as it changes. Note the camelCase: JSX styles are objects, not CSS strings
  (Part 3 file 05).

---

## 4. Step 2 — Add state

```tsx
// src/components/Counter.tsx
import { useState } from 'react';
import { Display } from './Display';

export function Counter() {
  // count is the current value; setCount is the ONLY way to change it
  const [count, setCount] = useState<number>(0);

  return (
    <section>
      <h1>Counter</h1>
      <Display value={count} />
      <button onClick={() => setCount(count + 1)}>+1</button>
    </section>
  );
}
```

**Line by line**

- `useState<number>(0)` — asks React to remember a number for this component. It returns a
  **pair**: the current value and a function to change it. The `<number>` is optional here
  (React infers it from `0`) but explicit is better documentation.
- `setCount(count + 1)` — does **not** mutate `count`. It tells React "the new value is
  this", and React re-renders the component with the new value (Part 4 files 01–02).
- `onClick={() => …}` — an arrow function, because `onClick` expects a *function to call
  later*, not the result of calling one.

⚠️ **The classic beginner bug:**

```tsx
// ❌ This calls setCount during render — infinite loop, React throws
<button onClick={setCount(count + 1)}>+1</button>

// ✅ This passes a function that React calls when the click happens
<button onClick={() => setCount(count + 1)}>+1</button>
```

The error you will see: `Too many re-renders. React limits the number of renders to prevent
an infinite loop.`

🔍 **Why state is not a variable:** a normal `let count = 0` is re-created on every render,
so it would reset to 0 constantly and React would not know to re-render when it changed.
`useState` stores the value *outside* the function body, keyed to this component instance,
and the setter is what triggers a re-render.

---

## 5. Step 3 — The step control (props flowing down)

```tsx
// src/components/Controls.tsx
interface ControlsProps {
  step: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onReset: () => void;
  /** True when the count is already at the minimum, so "−" does nothing. */
  canDecrement: boolean;
}

export function Controls({ step, onIncrement, onDecrement, onReset, canDecrement }: ControlsProps) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
      <button onClick={onDecrement} disabled={!canDecrement} aria-label={`Decrease by ${step}`}>
        − {step}
      </button>
      <button onClick={onReset}>Reset</button>
      <button onClick={onIncrement} aria-label={`Increase by ${step}`}>
        + {step}
      </button>
    </div>
  );
}
```

**Note the shape:** `Controls` owns **no state**. It receives values and callbacks. This is
the pattern you will use for the rest of these notes — components that render are separate
from components that decide (Part 5 file 01).

⚠️ **`disabled` is a boolean attribute in JSX:** write `disabled={!canDecrement}`, not
`disabled="false"`. The string `"false"` is truthy, so the button would always be disabled.

---

## 6. Step 4 — Put it together, with derived values

```tsx
// src/components/Counter.tsx
import { useState } from 'react';
import { Controls } from './Controls';
import { Display } from './Display';
import { History } from './History';
import { StepPicker } from './StepPicker';

const MIN = 0;
const MAX_HISTORY = 5;

export function Counter() {
  const [count, setCount] = useState<number>(0);
  const [step, setStep] = useState<number>(1);
  const [history, setHistory] = useState<number[]>([0]);

  /** Derived value: computed during render, never stored in state. */
  const canDecrement = count - step >= MIN;

  function update(next: number): void {
    setCount(next);
    // Keep the last MAX_HISTORY entries, including the new one
    setHistory((previous) => [...previous, next].slice(-MAX_HISTORY));
  }

  return (
    <section>
      <h1 style={{ textAlign: 'center' }}>Counter</h1>

      <Display value={count} />
      <p style={{ textAlign: 'center' }}>{describe(count)}</p>

      <Controls
        step={step}
        canDecrement={canDecrement}
        onIncrement={() => update(count + step)}
        onDecrement={() => update(count - step)}
        onReset={() => update(0)}
      />

      <StepPicker step={step} onChange={setStep} />
      <History values={history} />
    </section>
  );
}

/** A pure function: no state, no React — easy to test. */
function describe(value: number): string {
  if (value === 0) return 'Zero';
  return `${value % 2 === 0 ? 'Even' : 'Odd'} · ${value > 0 ? 'Positive' : 'Negative'}`;
}
```

**Line by line**

- `const canDecrement = count - step >= MIN;` — a **derived value**. It is recalculated on
  every render from `count` and `step`. Storing it in state would create two sources of
  truth that can disagree (Part 4 file 01).
- `setHistory((previous) => …)` — the **functional updater**. It receives the *current* value
  rather than the value captured when the handler was created, which is correct when the new
  state depends on the old (Part 4 file 02).
- `[...previous, next]` — a **new array**. Mutating with `previous.push(next)` would keep the
  same reference and React would not see a change (Part 1 file 06).
- `.slice(-MAX_HISTORY)` — keeps the last 5. Negative indices count from the end.
- `describe()` — a plain function outside the component. It has no dependencies on React, so
  it can be unit-tested without rendering anything (Part 13).

⚠️ **Do not derive state.** This is wrong, and it is the most common React mistake:

```tsx
// ❌ Two sources of truth — they will drift
const [isEven, setIsEven] = useState(count % 2 === 0);
useEffect(() => setIsEven(count % 2 === 0), [count]);

// ✅ One source of truth, computed every render
const isEven = count % 2 === 0;
```

---

## 7. Step 5 — The remaining two components

```tsx
// src/components/StepPicker.tsx
interface StepPickerProps {
  step: number;
  onChange: (next: number) => void;
}

export function StepPicker({ step, onChange }: StepPickerProps) {
  return (
    <label style={{ display: 'block', marginTop: '1rem', textAlign: 'center' }}>
      Step:{' '}
      <select value={step} onChange={(event) => onChange(Number(event.target.value))}>
        {[1, 5, 10].map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
```

```tsx
// src/components/History.tsx
interface HistoryProps {
  values: number[];
}

export function History({ values }: HistoryProps) {
  if (values.length === 0) return null;
  return (
    <p style={{ marginTop: '1rem', textAlign: 'center', color: '#555' }}>
      History: {values.join(' → ')}
    </p>
  );
}
```

**Line by line**

- `onChange={(event) => onChange(Number(event.target.value))}` — **HTML select values are
  always strings.** Without `Number(...)`, `step` becomes `"5"`, and `count + step` becomes
  string concatenation: `0 + "5"` is `"05"`. This bug is silent, which is what makes it
  valuable to meet now (Part 5 file 03).
- `key={option}` — React needs a stable identity for each list item to reconcile correctly
  (Part 3 file 11). Never use the array index for a list that can reorder.
- `<label>` wrapping the `<select>` — clicking the text focuses the control, and screen
  readers announce the association. Free accessibility.
- `if (values.length === 0) return null;` — an early return is the cleanest conditional
  rendering (Part 3 file 10).

---

## 8. Run it

```bash
npm run dev
```

Open <http://localhost:5173>. Click `+ 1` four times, change the step to 5, click `+ 5`,
then `− 5` twice.

**Expected result:** the number updates instantly, the description switches between
"Even · Positive" and "Odd · Positive", the history reads `0 → 1 → 2 → 3 → 4 → 9`, and the
`−` button becomes disabled when the next decrement would go below 0.

```bash
npx tsc -b --noEmit    # 0 errors
npm run lint           # clean
```

---

## 9. What actually happened, in React terms

```text
User clicks "+ 5"
  ↓
React calls your onClick handler
  ↓
update(9) runs → setCount(9) and setHistory([...prev, 9])
  ↓
React batches both updates into ONE re-render
  ↓
Counter() runs again with count = 9
  ↓
canDecrement is recomputed (true), describe(9) returns "Odd · Positive"
  ↓
React diffs the new JSX against the previous, and updates only the text nodes that changed
```

🔍 **Two updates, one render.** React 18+ batches state updates inside event handlers
automatically, so you never see an intermediate frame where `count` is 9 but `history` is not.
Before React 18 this was only true inside React event handlers — a fact that still shows up in
older blog posts.

---

## 10. Common mistakes in this project

| Mistake | Symptom | Fix |
| --- | --- | --- |
| `onClick={setCount(count + 1)}` | `Too many re-renders` | Wrap in an arrow function |
| `count++` | Nothing happens | State is immutable; use `setCount(count + 1)` |
| `history.push(next)` | History never updates | Build a new array with spread |
| `setCount(count + 1); setCount(count + 1);` expecting +2 | Only +1 | Both calls read the same `count`; use the functional form |
| `disabled="false"` | Button always disabled | `disabled={false}` |
| Using the array index as `key` on a reorderable list | Wrong item updates | Use a stable id |
| Storing `isEven` in state | Stale label after some updates | Derive it during render |
| `event.target.value` used as a number | `"05"` concatenation | `Number(...)` |

The `setCount` twice case deserves a demonstration:

```tsx
// ❌ Both calls use the same `count` from this render → result is count + 1
setCount(count + 1);
setCount(count + 1);

// ✅ Each updater receives the latest pending value → result is count + 2
setCount((c) => c + 1);
setCount((c) => c + 1);
```

---

## 11. Exercises

### Beginner
1. Add a `Max` of 100 and disable `+` when reached.
2. Add a `Double` button that multiplies the count by 2 (respecting `Max`).

### Intermediate
1. Lift `count` into `App` and render **two** `Counter`s that share it. What has to change?
2. Persist the count to `localStorage` and restore it on load. Do it without `useEffect` if
   you can — then explain why the `useState` initialiser is the better place.

### Challenge
1. Add undo/redo: keep two stacks and enable the buttons only when they have something to do.
2. Write tests for `describe()` and for the component: click `+` three times, assert the
   display and the history. (Part 13 shows the setup.)

---

## 12. Solutions

### Beginner
1. `const canIncrement = count + step <= MAX;` passed down as a prop, with
   `disabled={!canIncrement}`. Note the symmetry with `canDecrement` — both are derived.
2. `onDouble={() => update(Math.min(count * 2, MAX))}`. Clamping at the call site keeps the
   invariant in one place.

### Intermediate
1. `Counter` becomes fully controlled: it takes `count`, `step`, and callbacks as props and
   owns no `useState`. `App` holds the state. That is **lifting state up** (Part 5 file 02) —
   and the moment you do it, you can see why props-only components are easier to reuse.
2. ```tsx
   const [count, setCount] = useState<number>(() => Number(localStorage.getItem('count') ?? 0));
   useEffect(() => localStorage.setItem('count', String(count)), [count]);
   ```
   The lazy initialiser `() => …` runs **once**, on the first render — reading storage on
   every render would be wasteful. Writing still needs an effect, because it is a side effect
   on the outside world (Part 4 file 03).

### Challenge
1. `past: number[]` and `future: number[]`. `update()` pushes the current value onto `past`
   and clears `future`; `undo()` pops `past` onto `future`. Buttons are disabled when their
   stack is empty — the same derived-boolean pattern as `canDecrement`.
2. ```tsx
   it('increments and records history', async () => {
     render(<Counter />);
     const user = userEvent.setup();
     await user.click(screen.getByRole('button', { name: /increase/i }));
     await user.click(screen.getByRole('button', { name: /increase/i }));
     expect(screen.getByText('2')).toBeInTheDocument();
     expect(screen.getByText(/History: 0 → 1 → 2/)).toBeInTheDocument();
   });
   ```
   Querying by role and accessible name is what makes the test survive a CSS change (Part 13
   file 03).

---

## 13. What you proved you can do

- [ ] Write a typed function component with an explicit props interface.
- [ ] Explain why `useState` returns a pair and why the setter does not mutate.
- [ ] Derive a value during render instead of storing it in state.
- [ ] Update state that depends on previous state with the functional form.
- [ ] Update an array immutably.
- [ ] Pass callbacks down and keep child components stateless.
- [ ] Explain what happens between a click and a pixel changing.

---

**What's next →** [`02-todo-app.md`](./02-todo-app.md) adds forms, filtering, list rendering
with stable keys, and component communication in both directions — the same three concepts,
with real data and real user input.
