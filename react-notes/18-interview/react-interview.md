# React Interview Questions
React Interview Questions

> **Part 18 · Interview Preparation · File 1 of 4**

How to use this file: read the **short answer** first — that is the answer you say out loud in the first thirty seconds. Then read the **detailed explanation**, because that is the part that decides a senior-level verdict: it shows you know *why*, what the trade-offs are, and where the answer stops being true. Then read the **example**, because interviewers ask you to type things.

Every question has the same four parts:

```text
Question
Short interview answer      ← what you say first, in 1–3 sentences
Detailed explanation        ← the reasoning, the trade-offs, the version notes
Example                     ← complete, runnable code
```

Version note for the whole file: **React 19** (this book's baseline). Where behaviour changed (effects, refs, `useRef` requiring an argument, ref-as-prop, `<Context>` instead of `<Context.Provider>`), the older form is named as history, not as wrong.

---

## 1. Components, props and composition

### Q1.1 — What is a React component?

**Short answer:** A component is a function that returns UI (JSX). React calls it during a render and turns what it returns into DOM elements; the component's name must be capitalised so JSX treats it as a component instead of an HTML tag.

**Detailed explanation:** A component is not a class, a template or a web component — it is a plain function whose output is a description of the UI. Because it is a function, it can accept arguments (props), return early, be composed with other functions, and be tested in isolation. Two properties matter more than the definition: components must be **pure with respect to their props and state** (same inputs → same output, no side effects during render), and they are **not** called by you — React decides when to call them, which is why you never see `return MyComponent()` at runtime.

**Example:**

```tsx
// Greeting.tsx
export function Greeting({ name }: { name: string }) {
  return <p>Hello, {name}!</p>;              // JSX → React element → DOM
}

// App.tsx
import { Greeting } from './Greeting';

export function App() {
  return (
    <main>
      <Greeting name="Asha" />
      <Greeting name="Vik" />
    </main>
  );
}
```

### Q1.2 — Why can't a component be called like a normal function?

**Short answer:** Calling it directly inlines its result into the parent and bypasses hooks, memoisation and reconciliation. JSX vs. call: `<Greeting />` creates an element React renders; `Greeting()` executes the function immediately, where React cannot manage it.

**Detailed explanation:** When you write `{Greeting()}`, the function runs during the parent's render and whatever it returns becomes part of the parent's output — a *different tree shape*. Hooks called inside it now belong to the parent component, state is recreated, memoisation is defeated, and the component disappears from the profiler. `<Greeting />` is not a call; it is a description that React compares against the previous render (type + key) to decide whether to keep the existing instance.

**Example:**

```tsx
// ❌ Never: this is a function call, not a component
function Bad({ items }: { items: string[] }) {
  return <ul>{items.map((item) => ListItem({ item }))}</ul>;
}

// ✅ JSX: React owns the instance, hooks and reconciliation work
function Good({ items }: { items: string[] }) {
  return <ul>{items.map((item) => <ListItem key={item} item={item} />)}</ul>;
}
```

### Q1.3 — What are props, and can a component change them?

**Short answer:** Props are the inputs a component receives from its parent — read-only. A component may not mutate them; to "change a prop", the parent must pass a different value (usually by updating its own state).

**Detailed explanation:** Props are ordinary JavaScript objects, but React's model treats them as immutable for a reason: a component's output must be a function of its inputs, and if a child mutated its props the parent's data would silently change without a re-render. The same rule applies to state (only the setter changes it) and to the objects inside them. In development, React freezes props and state objects to catch mutations early.

**Example:**

```tsx
function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'positive' }) {
  // label = 'changed';                    // ❌ TypeError in dev: props are frozen
  return <span className={`badge badge--${tone}`}>{label}</span>;
}

// The parent changes it by rendering with a different value:
function App() {
  const [tone, setTone] = useState<'neutral' | 'positive'>('neutral');
  return (
    <>
      <Badge label="Status" tone={tone} />
      <button type="button" onClick={() => setTone('positive')}>Mark good</button>
    </>
  );
}
```

### Q1.4 — What is `children`, and when should you use it?

**Short answer:** `children` is a normal prop containing whatever was written between the opening and closing tags. Use it when a component provides a *frame* (layout, styling, behaviour) and the caller provides the *content*.

**Detailed explanation:** Composition through `children` is React's answer to the "too many configuration props" problem. A `Card` with `title`, `body`, `footer`, `icon`, `badge`, `actions` props becomes unusable; a `Card` with `children` becomes a container that composes with anything, including other components that know nothing about `Card`. The pattern is called *containment*, and its other form is passing a component as a prop (`renderItem`, `as`) — *specialisation*.

**Example:**

```tsx
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function App() {
  return (
    <Card title="Invoices">
      <ul>
        <li>#1042 — paid</li>
        <li>#1043 — due</li>
      </ul>
      <p>Two invoices this month.</p>
    </Card>
  );
}
```

### Q1.5 — What is the difference between state and props?

**Short answer:** Props come from outside and are read-only; state lives inside the component, is initialised by the component, and changes through a setter that triggers a re-render.

**Detailed explanation:** The useful question is not "what is the difference" but "where should this value live?" A value belongs in state if it changes over time and the component must re-render when it does; it belongs in props if the parent owns it; and it belongs in **neither** if it can be derived from existing state or props during render. Getting this wrong produces the two most common bugs in React: duplicated state that drifts, and state that should have been lifted.

**Example:**

```tsx
function SearchResults({ query }: { query: string }) {          // prop: owned by the parent
  const [page, setPage] = useState(1);                          // state: owned here
  const visible = results.filter((r) => r.title.includes(query)).slice(0, page * 10);  // derived: no state

  return (
    <>
      <p>{visible.length} matches</p>
      <button type="button" onClick={() => setPage((p) => p + 1)}>Show more</button>
    </>
  );
}
```

---

## 2. State and rendering

### Q2.1 — What happens when you call `setState`?

**Short answer:** React schedules an update; it does not re-render immediately. The component function runs again with the new value, React compares the returned elements with the previous ones (reconciliation), and only the differences are applied to the DOM.

**Detailed explanation:** The line after `setCount(count + 1)` still sees the old `count` — a snapshot, not the new value. This is why three rapid `setCount(count + 1)` calls can collapse into one update (all three read the same snapshot) while `setCount((c) => c + 1)` three times counts three. Updates inside event handlers are batched in React 18+, including inside promises and timeouts, so a click handler that sets three states re-renders once.

**Example:**

```tsx
function Counter() {
  const [count, setCount] = useState(0);

  const broken = () => { setCount(count + 1); setCount(count + 1); setCount(count + 1); };   // +1
  const correct = () => { setCount((c) => c + 1); setCount((c) => c + 1); setCount((c) => c + 1); };  // +3

  return (
    <>
      <output data-testid="count">{count}</output>
      <button type="button" onClick={correct}>Add three</button>
    </>
  );
}
```

### Q2.2 — Why is my state not updating immediately after `setState`?

**Short answer:** Because state is a snapshot taken at the start of the render. `setState` schedules the *next* render; the current function keeps its old value. To compute from the previous value, use the updater function.

**Detailed explanation:** People hit this in three shapes: reading the value right after setting it; logging the value in the same handler (you see the old one); and building a new object from the old state instead of using the updater form. The mental model is a photograph: the render you are inside holds one snapshot, and the setter asks for a new photograph later.

**Example:**

```tsx
function AddTodo() {
  const [todos, setTodos] = useState<string[]>([]);

  const add = (title: string) => {
    setTodos((current) => [...current, title]);   // ✅ always the latest array
    // setTodos([...todos, title]);               // ⚠️ works alone, loses items when called twice in one tick
  };

  return <button type="button" onClick={() => add('Write notes')}>Add</button>;
}
```

### Q2.3 — What is the difference between controlled and uncontrolled inputs?

**Short answer:** A controlled input takes its value from state (`value` + `onChange`), so React is the single source of truth. An uncontrolled input keeps its value in the DOM and you read it when needed (via a ref or `FormData`).

**Detailed explanation:** Controlled inputs make instant validation, formatting and conditional disablement trivial, at the cost of a re-render per keystroke. Uncontrolled inputs are faster and integrate naturally with `<form action>` and `useActionState` (React reads the `FormData` for you) and with non-React code, at the cost of imperatively reading values. The interview answer should include React 19's `<form action={fn}>`, which resets uncontrolled fields automatically after a successful action.

**Example:**

```tsx
// Controlled
function Controlled() {
  const [email, setEmail] = useState('');
  return <input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />;
}

// Uncontrolled (React reads the FormData for you)
function Uncontrolled() {
  const [state, submit, isPending] = useActionState(async (_prev: string | null, data: FormData) => {
    return `Hello ${String(data.get('name'))}`;
  }, null);
  return (
    <form action={submit}>
      <input name="name" aria-label="Name" />
      <button type="submit" disabled={isPending}>Send</button>
      {state !== null && <p>{state}</p>}
    </form>
  );
}
```

### Q2.4 — What is the "single source of truth" and why does duplicating state cause bugs?

**Short answer:** Every piece of data should be owned in exactly one place; everything else derives from it. Duplicated state becomes inconsistent as soon as one copy is updated and the other is not.

**Detailed explanation:** Classic duplications: storing `filteredItems` next to `items` plus `filter`; storing `isValid` next to the fields; storing `total` next to `items`. The fix is to compute during render (cheap) or memoise the computation, and never to store derived values. When two pieces of state *must* change together, store them in one object or move them into a reducer so a single update keeps them in sync.

**Example:**

```tsx
function Cart({ items }: { items: Item[] }) {
  const [coupon, setCoupon] = useState<string | null>(null);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);   // derived
  const discount = coupon === 'SAVE10' ? Math.round(subtotal * 0.1) : 0;          // derived
  const total = subtotal - discount;                                             // derived

  return <p>Total: ₹{total} <button type="button" onClick={() => setCoupon('SAVE10')}>Apply SAVE10</button></p>;
}
```

---

## 3. Hooks

### Q3.1 — What are the Rules of Hooks and why do they exist?

**Short answer:** Only call hooks at the top level of a component or another hook — never inside conditions, loops or nested functions. React identifies each hook by its call order, not by name.

**Detailed explanation:** React stores hooks in a linked list on the component's internal state. Render one: `[state, effect]`. If a conditional hook is skipped on the next render, every subsequent hook shifts by one position and `useState` reads the effect's data — the "rendered fewer hooks than expected" error. The rules also cover custom hooks (they must be called from components or hooks) and lint (`eslint-plugin-react-hooks`) is the enforcement mechanism, including React Compiler's validation pass.

**Example:**

```tsx
function Profile({ user }: { user: User | null }) {
  // ❌ if (user === null) return null; useState(...)  → the hook order changes between renders

  const [nickname, setNickname] = useState('');       // ✅ hooks first, unconditionally
  if (user === null) return <p>No user</p>;           // ✅ early return after the hooks
  return <input value={nickname} onChange={(e) => setNickname(e.target.value)} aria-label="Nickname" />;
}
```

### Q3.2 — When should you use `useEffect`, and when should you not?

**Short answer:** Use it to synchronise with something *outside* React — a subscription, the document title, a non-React widget, an imperative browser API. Do not use it to derive state, to react to a click, or to fetch data that a library can cache and deduplicate.

**Detailed explanation:** Every effect is a synchronisation with an external system, and each one needs a cleanup if it subscribes. Effects that compute state from props (`useEffect(() => setX(props.y), [props.y])`) are the most common anti-pattern: they add a second render, a moment of inconsistency, and a class of bugs — compute during render instead, or remount with a `key`. For data fetching, TanStack Query (or the framework's loader) removes the effect, adds caching, cancellation and retries.

**Example:**

```tsx
// ✅ External system: a media query subscription
function useIsWide() {
  const [isWide, setIsWide] = useState(() => window.matchMedia('(min-width: 900px)').matches);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 900px)');
    const update = (event: MediaQueryListEvent) => setIsWide(event.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);   // cleanup is not optional
  }, []);                                                       // no dependency → subscribe once

  return isWide;
}

// ❌ Derived state in an effect: extra render + a frame of stale UI
// useEffect(() => setFullName(`${first} ${last}`), [first, last]);
const fullName = `${first} ${last}`;                            // ✅ just compute it
```

### Q3.3 — Explain the dependency array.

**Short answer:** It lists every reactive value the effect reads. Missing values cause stale reads; extra values cause unnecessary re-runs. `[]` means "run once after mount" — and only if the effect truly reads nothing reactive.

**Detailed explanation:** React compares the array element-by-element with the previous render using `Object.is`. The honest way to write an effect is to write it without the array first, see what it reads, then list those values — and if the list keeps changing identity (a function, an object created in render), fix the *source* (move it out, wrap it in `useCallback`/`useMemo`, or restructure) rather than lying to the linter. StrictMode intentionally double-invokes effects in development so that a missing cleanup becomes visible immediately.

**Example:**

```tsx
function ChatRoom({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const socket = createSocket(roomId);
    socket.on('message', (m: Message) => setMessages((current) => [...current, m]));
    return () => socket.close();               // runs on roomId change and on unmount
  }, [roomId]);                                // roomId is reactive and is read above

  return <ul>{messages.map((m) => <li key={m.id}>{m.text}</li>)}</ul>;
}
```

### Q3.4 — `useRef` vs `useState` vs a module-level variable?

**Short answer:** `useRef` stores a value that survives renders **without** causing one; `useState` triggers a re-render when it changes; a module-level variable is shared by every instance of the component (a bug in almost every case).

**Detailed explanation:** Refs are for things that are not part of the rendered output: a DOM node, a timer id, the previous value, a mutable instance value, an `AbortController`. Because changing a ref does not re-render, never render based on `ref.current` — the UI will not update. In React 19, `useRef` **requires an argument** (`useRef<HTMLDivElement | null>(null)`), and `ref` is a normal prop on function components (no `forwardRef` needed).

**Example:**

```tsx
function SearchBox() {
  const inputRef = useRef<HTMLInputElement | null>(null);      // DOM node
  const typingTimer = useRef<number | null>(null);             // timer id, no re-render needed
  const [query, setQuery] = useState('');

  useEffect(() => () => { if (typingTimer.current !== null) window.clearTimeout(typingTimer.current); }, []);

  return (
    <>
      <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" />
      <button type="button" onClick={() => inputRef.current?.focus()}>Focus the box</button>
    </>
  );
}
```

### Q3.5 — `useMemo` vs `useCallback` vs `memo`?

**Short answer:** `useMemo` caches a *value*, `useCallback` caches a *function*, and `memo` caches a *component's render* when its props are unchanged. All three are optimisations, none are required for correctness.

**Detailed explanation:** With React Compiler 1.0 this answer changes shape: the compiler inserts equivalent memoisation automatically, so hand-written `useMemo`/`useCallback` are increasingly redundant for performance — but they remain meaningful when identity is part of an API (effect dependencies, subscription callbacks) and when you are working in a codebase without the compiler. The interviewer's follow-up is almost always "when is memo useless?" — answer: when props change on every render (a new object or inline function from the parent), because the comparison always fails.

**Example:**

```tsx
const Row = memo(function Row({ item, onSelect }: { item: Item; onSelect: (id: string) => void }) {
  return <li><button type="button" onClick={() => onSelect(item.id)}>{item.title}</button></li>;
});

function List({ items }: { items: Item[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  const onSelect = useCallback((id: string) => setSelected(id), []);          // stable → memo(Row) can bail out
  const sorted = useMemo(() => [...items].sort((a, b) => a.title.localeCompare(b.title)), [items]);

  return <ul>{sorted.map((item) => <Row key={item.id} item={item} onSelect={onSelect} />)}</ul>;
}
```

### Q3.6 — What is a custom hook, and what makes a good one?

**Short answer:** A function whose name starts with `use` that calls other hooks and returns reusable logic. A good one hides a rule (and its cleanup) behind a small, well-named API — not just a few lines moved out of a component.

**Detailed explanation:** Custom hooks share *logic*, not *state*: two components calling `useTodos()` get two independent sets of todos. The tests to apply: does it have a clear contract (inputs, outputs, error cases)? Does it clean up? Would a reader understand it from its name? Hooks that return 12 values or that re-implement a library are usually a sign the boundary is wrong — often the better answer is a context provider or a query hook.

**Example:**

```tsx
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;                                   // corrupt data must not crash the app
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;                     // `as const` gives a tuple, not an array
}

// Usage — the component knows nothing about storage or parsing:
const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light');
```

### Q3.7 — What is `useReducer` for, and when is it better than `useState`?

**Short answer:** When several pieces of state change together in response to named actions, or when the next state depends on the previous in non-trivial ways. `useReducer` centralises the transitions in one pure function, which is easier to read and to test.

**Detailed explanation:** `useState` is simpler for independent values; a reducer wins as soon as you have "if this changes, that must too" rules, or four or more related updates. Extras worth mentioning: the dispatch function is stable (good for effect dependencies), reducers can be unit-tested without rendering, and the same reducer shape is what Redux/Zustand users think in.

**Example:**

```tsx
type State = { count: number; history: number[] };
type Action = { type: 'increment' } | { type: 'decrement' } | { type: 'undo' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'increment': return { count: state.count + 1, history: [...state.history, state.count] };
    case 'decrement': return { count: state.count - 1, history: [...state.history, state.count] };
    case 'undo': {
      const previous = state.history.at(-1);
      return previous === undefined
        ? state
        : { count: previous, history: state.history.slice(0, -1) };
    }
    default: return state;      // exhaustive switch: TypeScript flags a missing case
  }
}

const [state, dispatch] = useReducer(reducer, { count: 0, history: [] });
```

---

## 4. Re-rendering and performance

### Q4.1 — What causes a component to re-render?

**Short answer:** Its own state changing, its parent re-rendering, a context value it consumes changing, or a forced update. Props changing is *not* a separate cause — props changing implies the parent re-rendered.

**Detailed explanation:** Re-rendering means running the component function again, not touching the DOM: React then diffs the output and applies only real changes. Three consequences interviewers probe: (1) a parent's re-render re-renders all children unless they are memoised (compiler or `memo`); (2) *where* state lives decides how much re-renders; (3) an expensive tree re-rendering is a cost, but an unchanged DOM is cheap — so measure before memoising.

**Example:**

```tsx
function Parent() {
  const [count, setCount] = useState(0);
  console.log('Parent renders');
  return (
    <>
      <button type="button" onClick={() => setCount((c) => c + 1)}>{count}</button>
      <Child />                      {/* re-renders with the parent, even with no props */}
    </>
  );
}
const Child = memo(function Child() { console.log('Child renders'); return <p>Static</p>; });
// with memo → the Child log appears once; without → on every click
```

### Q4.2 — Does a re-render update the DOM?

**Short answer:** Not necessarily. React compares the new element tree with the previous one and applies only the differences; unchanged elements cause no DOM work.

**Detailed explanation:** This distinction is why "re-render" and "slow" are not the same statement, and it is one of the most common misconceptions in interviews. What costs money is (a) running expensive code inside components, (b) creating huge element trees, and (c) real DOM writes and layout. The measurement lab in Part 17 shows both halves: at 4000 rows an un-memoised click re-rendered 4000 rows (because their component functions ran), yet the DOM itself was untouched.

**Example:**

```tsx
function Panel() {
  const [open, setOpen] = useState(false);
  const expensive = heavyComputation();          // ❌ runs on every render, even when only `open` changes
  return <button type="button" onClick={() => setOpen((o) => !o)}>{expensive}{open ? 'close' : 'open'}</button>;
}
// Fix: compute only when the inputs change (`useMemo`), move it out of render, or move state down.
```

### Q4.3 — How do you find out why a component re-rendered?

**Short answer:** React DevTools Profiler (record an interaction, read the ranked chart and the "why did this render" panel) plus targeted console counters in development.

**Detailed explanation:** With the compiler enabled, the Profiler still works; the reasons shown include "props changed", "state changed", "context changed", "parent rendered". If you cannot install DevTools, a `useEffect` that logs only when a specific prop changes, or a render counter ref, answers the same question. The important habit is to identify the *cause* before applying `memo`: the most common cause is state living too high in the tree, which memoisation cannot fix.

**Example:**

```tsx
function Rows({ rows }: { rows: Row[] }) {
  const renders = useRef(0);
  renders.current += 1;

  useEffect(() => { console.log(`Rows rendered ${renders.current} times (${rows.length} rows)`); });

  return <ul>{rows.map((row) => <li key={row.id}>{row.title}</li>)}</ul>;
}
```

### Q4.4 — How would you optimise a slow list?

**Short answer:** Render fewer rows first (windowing/pagination), then move state down or memoise the row, then turn on the React Compiler if the project allows it — and measure each step.

**Detailed explanation:** The order matters because the fixes have very different costs and payoffs. Windowing is a structural fix that removes the work entirely; moving state down reduces the number of components that re-render; memoisation avoids re-running components whose inputs did not change. This lab's measurements: mounting 4000 rows ≈ 255 ms in the dev build, 20 000 rows windowed to 50 ≈ 3.2 ms; with the compiler on, a one-row update re-rendered 0 rows (1.3 ms) versus 4000 rows (212.6 ms) with it off. Every number is development-build and machine-specific — quote the ratio, not the millisecond.

**Example:**

```tsx
// Windowing, without a library (fixed row height)
function VirtualList({ items, height = 320, rowHeight = 32 }: { items: Item[]; height?: number; rowHeight?: number }) {
  const [scrollTop, setScrollTop] = useState(0);
  const first = Math.floor(scrollTop / rowHeight);
  const count = Math.ceil(height / rowHeight) + 2;

  return (
    <ul style={{ height, overflowY: 'auto' }} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
      {items.slice(first, first + count).map((item) => (
        <li key={item.id} style={{ height: rowHeight }}>{item.title}</li>
      ))}
    </ul>
  );
}
```

### Q4.5 — What does React Compiler change about performance work?

**Short answer:** It moves memoisation from you to the build: the compiler inserts the equivalent of `useMemo`/`useCallback`/`memo` where it can prove it is safe, so hand-written memoisation is often unnecessary. It does not make slow *code* fast, and it does not replace measurement.

**Detailed explanation:** Compiler 1.0 (stable since October 2025) analyses components and hooks and can memoise after early returns — something `useMemo` cannot do. Two caveats worth stating in an interview: adopting it can change *when* effects fire (memoised values change identity less often), and it requires the Rules of React, so impure components that "worked because they re-rendered" surface as bugs. Official guidance: leave existing `useMemo`/`useCallback` in place while adopting, and keep them where they exist for correctness (effect dependencies).

**Example:**

```tsx
// With the compiler, this component's JSX and derived work are memoised automatically:
function Summary({ items }: { items: Item[] }) {
  const total = items.reduce((sum, item) => sum + item.price, 0);     // computed in render — fine
  return <p>{items.length} items · ₹{total}</p>;
}

// Opt out of compilation for one function when needed:
function PixelCanvas() {
  'use no memo';
  // …imperative, mutation-heavy code the compiler should not touch
}
```

---

## 5. Context, state management and data

### Q5.1 — What problem does Context solve, and what does it not solve?

**Short answer:** Context passes a value down a deep tree without prop drilling. It does not solve *state management*: it has no selectors, no persistence, and every consumer re-renders when the value changes.

**Detailed explanation:** The cost model is the trap: the provider's `value` must be memoised, and even then every consumer of that context re-renders when it changes. So Context is right for low-frequency, widely needed values (theme, locale, current user, a client instance) and wrong for high-frequency data (a form's keystrokes, a list of todos). For those, keep the state local, or use a store with selectors (Zustand/Redux Toolkit), or keep server data in a query cache.

**Example:**

```tsx
// ✅ Context for a stable, app-wide value
const ThemeContext = createContext<{ theme: 'light' | 'dark'; toggle: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const toggle = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);
  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);       // ← memoised, or every consumer re-renders
  return <ThemeContext value={value}>{children}</ThemeContext>;           // React 19: no `.Provider`
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
```

### Q5.2 — When would you use Redux (Toolkit) instead of Context?

**Short answer:** When many unrelated components need to read and write the same state with fine-grained subscriptions, when you need predictable transitions that are traceable in DevTools, or when the team needs one enforced pattern for a large app.

**Detailed explanation:** Context re-renders all consumers; a Redux store lets components subscribe to *slices* with `useSelector`, so a change to one slice does not re-render everything. Other signals for Redux: complex update logic shared across features, undo/redo, time-travel debugging, middleware for logging/persistence, and a large team where consistency outweighs boilerplate. The anti-signal: "the app is big", on its own. If the state is server data, the answer is a query cache (TanStack Query), not Redux — and Redux is never *required* for a large app; plenty of large apps use a store and a query cache together.

**Example:**

```ts
// store/counterSlice.ts (Redux Toolkit)
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const counterSlice = createSlice({
  name: 'counter',
  initialState: { value: 0 },
  reducers: {
    incremented: (state, action: PayloadAction<number>) => { state.value += action.payload; },   // Immer allows "mutation"
    reset: (state) => { state.value = 0; },
  },
});

export const { incremented, reset } = counterSlice.actions;
export const counterReducer = counterSlice.reducer;

// In a component — only this component re-renders when `value` changes:
const value = useSelector((state: RootState) => state.counter.value);
const dispatch = useDispatch();
dispatch(incremented(2));
```

### Q5.3 — What is server state, and why is it different from client state?

**Short answer:** Server state is data you do not own, that lives elsewhere, can change without you, and arrives asynchronously. Client state is yours: a form draft, a selected tab, a sidebar's open/closed flag.

**Detailed explanation:** Treating server data as client state is why apps end up with hand-written `isLoading`, `error`, retry, deduplication, caching and cancellation code in every component — and why two screens can show different values for the same resource. A query cache gives you one entry per query key, deduplicates concurrent requests, cancels on unmount, invalidates after mutations, and shows stale-while-revalidate behaviour. The split to state in an interview: *server state → query library; UI state → `useState`; shared UI state → context or a store; form state → a form library or actions.*

**Example:**

```tsx
const { data: tasks, isPending, error, refetch } = useQuery({
  queryKey: ['tasks', { status: 'open' }],
  queryFn: ({ signal }) => api.listTasks({ status: 'open' }, signal),   // signal → cancellation for free
});

const moveTask = useMutation({
  mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => api.setStatus(id, status),
  onMutate: async ({ id, status }) => {
    await queryClient.cancelQueries({ queryKey: ['tasks'] });
    const previous = queryClient.getQueryData(['tasks']);
    queryClient.setQueryData(['tasks'], (old: Task[] = []) => old.map((t) => (t.id === id ? { ...t, status } : t)));
    return { previous };                                    // rolled back in onError
  },
  onError: (_e, _v, context) => { if (context?.previous) queryClient.setQueryData(['tasks'], context.previous); },
  onSettled: () => { void queryClient.invalidateQueries({ queryKey: ['tasks'] }); },
});
```

---

## 6. Routing, forms and API integration

### Q6.1 — Client-side routing: what actually happens when you click a `<Link>`?

**Short answer:** The router prevents the browser's full-page navigation, updates `history` with `pushState`, and re-renders the matching route component. No document request is made.

**Detailed explanation:** Because the URL is real, deep links, refresh, shares and the back button all work — provided the server is configured to serve `index.html` for unknown paths (SPA fallback). That server configuration is the deployment step people forget; a static host without a rewrite returns 404 for `/tasks/42` on refresh. React Router v7/v8 offers three modes — declarative (`<BrowserRouter>`), data (`createBrowserRouter` + loaders/actions), framework (Vite plugin) — and the DOM APIs now live in `react-router/dom`.

**Example:**

```tsx
const router = createBrowserRouter([
  { path: '/', element: <Layout />, children: [
    { index: true, element: <TaskListPage /> },
    { path: 'tasks/:id', element: <TaskDetailPage /> },
    { path: '*', element: <p role="alert">Page not found.</p> },
  ]},
]);

// main.tsx
createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />,     // from "react-router/dom"
);
```

### Q6.2 — How do you read a route parameter or a query string?

**Short answer:** `useParams()` for path segments (`/tasks/:id`), `useSearchParams()` for the query string (`?filter=done&page=2`).

**Detailed explanation:** The convention worth stating: path segments identify a resource; query strings describe *how* it is displayed (filter, sort, page, search). Putting display state in the URL makes it shareable, bookmarkable and back-button friendly — the reason `useSearchParams` exists instead of hidden state. Remember that `searchParams` is a stable but *mutable* object: read values from it, but always update via the setter or the URL and the UI drift apart.

**Example:**

```tsx
function TaskListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get('filter') ?? 'all';
  const page = Number(searchParams.get('page') ?? '1');

  return (
    <select value={filter} aria-label="Filter"
            onChange={(e) => setSearchParams({ filter: e.target.value, page: '1' })}>
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="done">Done</option>
    </select>
  );
}
```

### Q6.3 — How do you protect a route?

**Short answer:** Wrap the route in a guard component that checks the session status: show a loading state while it is unknown, redirect anonymous users (remembering the target), and render a permission message for the wrong role. The API must enforce the same rule — the guard is UX.

**Detailed explanation:** Three statuses, not a boolean: `loading`, `anonymous`, `authenticated`. With a boolean, a refreshing signed-in user sees the sign-in page flash. Redirect with `replace` and remember where the user was going so sign-in can return them there. And say the security sentence out loud in the interview: *anyone can call the API directly, so authorization must be enforced server-side; the guard only prevents confusing screens.*

**Example:**

```tsx
function ProtectedRoute({ role }: { role?: string }) {
  const { status, session } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <p role="status">Checking your session…</p>;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role !== undefined && !hasRole(session, role)) return <p role="alert">You do not have permission to view this page.</p>;
  return <Outlet />;
}

<Route element={<ProtectedRoute />}>
  <Route element={<ProtectedRoute role="admin" />}>
    <Route path="/admin" element={<AdminPage />} />
  </Route>
</Route>
```

### Q6.4 — How do you fetch data in React the right way?

**Short answer:** Name the four states (idle, loading, success, error), check `response.ok`, cancel on unmount and on a new request, and put the cache and the retry policy in a library rather than in every component.

**Detailed explanation:** The five classic mistakes are: not checking `response.ok` (`fetch` resolves on 404/500); trusting `as MyType` on the parsed body; no cancellation (a stale response overwriting a fresh one); retrying a permanent failure (a 404 loop); and duplicating `isLoading`/`error`/`data` state per screen. Say what you would do instead: a typed API module, one query per resource key, `AbortSignal` from the query library, parse the body at the boundary, and distinguish retryable errors (5xx, network) from permanent ones (404).

**Example:**

```ts
// api/weather.ts — one place knows the URL and the error shape
export async function fetchWeather(city: string, signal?: AbortSignal): Promise<WeatherReport> {
  const response = await fetch(`/api/weather?city=${encodeURIComponent(city)}`, { signal });
  if (response.status === 404) throw new CityNotFoundError(city);          // domain answer
  if (!response.ok) throw new ApiError(`Weather service failed (${response.status})`, response.status);
  return parseWeather(await response.json());                             // parse, never cast
}

// hook — one state machine, not three booleans
const { state, search, retry } = useWeather();   // idle | loading | success | error with `retryable`
```

### Q6.5 — Controlled forms vs React 19 actions — which do you use?

**Short answer:** Controlled inputs when the form must react to every keystroke (search, live validation, dependent fields); actions (`<form action={fn}>` + `useActionState`) when the submission is the event, you want the pending state and field errors for free, and uncontrolled inputs are fine.

**Detailed explanation:** Actions run in a transition, receive the `FormData`, need no `preventDefault`, force a POST, and reset uncontrolled fields after a successful action; they compose with `useFormStatus` (child components asking "is the form pending?") and `useOptimistic` (show the result before the server confirms). The version-agnostic answer — `onSubmit` + `new FormData(e.currentTarget)` + your own pending state — is still correct and is what you use on older React.

**Example:**

```tsx
function InviteForm() {
  const [state, submit, isPending] = useActionState(async (_prev: string | null, data: FormData) => {
    const email = String(data.get('email') ?? '');
    if (!email.includes('@')) return 'Enter a valid email address.';        // returned value becomes `state`
    const response = await fetch('/api/invites', { method: 'POST', body: JSON.stringify({ email }) });
    return response.ok ? null : 'Could not send the invite. Try again.';
  }, null);

  return (
    <form action={submit}>
      {state !== null && <p role="alert">{state}</p>}
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required />
      <button type="submit" disabled={isPending}>{isPending ? 'Sending…' : 'Send invite'}</button>
    </form>
  );
}
```

---

## 7. Errors, Suspense and modern React

### Q7.1 — What does an error boundary catch, and what does it not?

**Short answer:** It catches errors thrown during rendering, in lifecycle methods and in constructors of its children. It does not catch errors in event handlers, in `setTimeout` callbacks, in promises you do not await (unless they are passed to `use()`), or errors inside the boundary itself.

**Detailed explanation:** The boundary is a class component with `getDerivedStateFromError` (render a fallback) and `componentDidCatch` (report). For asynchronous failures, the modern answer is: an awaited action or a `use()` call inside a Suspense boundary, or simply handle the error where it happened (a failed mutation shows an inline message). Boundaries should be *placed per feature*, so one broken widget does not blank the page — and should offer a reset (clear the error state, re-render, retry).

**Example:**

```tsx
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { reportError(error, info.componentStack); }

  render() {
    if (this.state.error !== null) {
      return (
        <div role="alert">
          <p>That part of the page failed to load.</p>
          <button type="button" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### Q7.2 — What is Suspense for?

**Short answer:** It lets a component "wait" for something asynchronous (a lazy component, a promise read with `use`) and shows a fallback while it does, without tracking a loading boolean in every parent.

**Detailed explanation:** Suspense works with lazy routes (`React.lazy`, or React Router's `lazy`), with `use(promise)` in React 19, and with frameworks' server components. Three practical notes: the fallback replaces the boundary's subtree, so place boundaries where a skeleton makes sense rather than around the whole app; `HydrateFallback` handles the first-hydration case for lazy routes and must be declared on a non-lazy route (a real React Router 8 gotcha this book measured); and a suspended component that rejects an error should be caught by an error boundary *above* the Suspense boundary.

**Example:**

```tsx
const Reports = lazy(() => import('./pages/ReportsPage'));

function App() {
  return (
    <ErrorBoundary>                                   {/* catches load failures */}
      <Suspense fallback={<p role="status">Loading report…</p>}>
        <Reports />
      </Suspense>
    </ErrorBoundary>
  );
}
```

### Q7.3 — `useTransition` vs `useDeferredValue`?

**Short answer:** `useTransition` marks a state update as non-urgent (you control the update and get an `isPending` flag); `useDeferredValue` returns a lagging copy of a value so a slow subtree can render behind a fast one.

**Detailed explanation:** Both implement the same idea — keep typing responsive by rendering the expensive part at a lower priority. Use `useTransition` when *you* trigger the update (a filter state you set), `useDeferredValue` when the value comes from a prop or a parent and you cannot wrap the setter. Neither makes the work faster; they let React keep the input responsive and show the previous result meanwhile.

**Example:**

```tsx
// Transition: the input is urgent, the filter is not
function FilterableList({ items }: { items: Item[] }) {
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState('');

  return (
    <>
      <input aria-label="Filter" onChange={(e) => {
        setQuery(e.target.value);                                        // urgent: keystroke visible immediately
        startTransition(() => setFilter(e.target.value));                 // non-urgent: list catches up
      }} />
      {isPending && <p role="status">Filtering…</p>}
      <ul>{items.filter((item) => item.title.includes(filter)).map((item) => <li key={item.id}>{item.title}</li>)}</ul>
    </>
  );
}
```

### Q7.4 — What is `useOptimistic` for?

**Short answer:** Showing the expected result of an action before the server confirms it, with an automatic rollback if the action fails.

**Detailed explanation:** The optimistic value is derived from the real state plus a pending action; when the action completes (successfully or not) the optimistic value disappears and the real state takes over. Because it is scoped to the async action's lifetime, it is the declarative form of the manual "snapshot, patch, restore" pattern that optimistic updates with query libraries do by hand.

**Example:**

```tsx
function LikeButton({ post }: { post: Post }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticLikes, addOptimisticLike] = useOptimistic(post.likes, (current: number) => current + 1);

  return (
    <form action={async () => {
      addOptimisticLike(undefined);                       // show it immediately
      startTransition(async () => { await like(post.id); });
    }}>
      <button type="submit" disabled={isPending}>{optimisticLikes} likes</button>
    </form>
  );
}
```

---

## 8. Testing, accessibility and quality (the questions that decide senior level)

### Q8.1 — What do you test in a React app?

**Short answer:** Behaviour — what a user can see and do — at the component level with Testing Library, plus a smaller number of integration tests, plus a few end-to-end journeys for the paths that must never break.

**Detailed explanation:** The pyramid's shape is not the point; the *query* is. Query by role, label and text (`getByRole('button', { name: 'Save' })`), not by class or `data-testid` unless there is no accessible way to reach the element. Fake the network at the boundary (MSW), not the modules. Test the failure paths: validation stops the request, a 500 shows a retryable message, an optimistic update rolls back. Assert on the negative side effects too (nothing was stored when the request failed).

**Example:**

```tsx
it('refuses invalid input and does not call the API', async () => {
  const user = userEvent.setup();
  const calls: Request[] = [];
  server.events.on('request:start', ({ request }) => { calls.push(request); });
  render(<TaskForm />);

  await user.type(screen.getByLabelText('Title'), 'a');                 // too short
  await user.click(screen.getByRole('button', { name: 'Add task' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('at least 3 characters');
  expect(calls.filter((request) => request.method === 'POST')).toHaveLength(0);   // the network was not troubled
});
```

### Q8.2 — How do you make a component accessible?

**Short answer:** Use the right element (`button`, `label`, `form`, `table`), give every control an accessible name, manage focus when content appears, announce dynamic changes (`role="status"`, `aria-live`), and support the keyboard fully — including Escape for dialogs and Enter/Space for actions.

**Detailed explanation:** Accessibility is mostly a design consequence of using semantic HTML: a `<div onClick>` is not a button and never will be (no focus, no Space/Enter, no role). The rest is explicit: `aria-label` when the visible label is a symbol, `aria-pressed` for toggles, `aria-invalid` + a described-by error for validation, `role="alert"` for urgent failures, and `aria-live="polite"` for results that change without navigation. Test with roles (which is what Testing Library encourages) and audit with axe; then do one manual pass with a keyboard.

**Example:**

```tsx
<label htmlFor="title">Title</label>
<input
  id="title"
  value={title}
  onChange={(e) => setTitle(e.target.value)}
  aria-invalid={error !== null}
  aria-describedby={error !== null ? 'title-error' : undefined}
/>
{error !== null && <p id="title-error" role="alert">{error}</p>}

<div role="group" aria-label="Filter tasks">
  {filters.map((filter) => (
    <button key={filter} type="button" aria-pressed={active === filter} onClick={() => setActive(filter)}>{filter}</button>
  ))}
</div>
```

### Q8.3 — How do you structure a large React application?

**Short answer:** Feature folders with one-way dependencies (types → api → hooks → components → pages → app shell), server state in a query cache, UI state local, a few contexts for app-wide values, routes as data, and a shared design-system folder for genuinely shared UI.

**Detailed explanation:** The structure should make the answer to "where does this go?" obvious and cycles impossible. Practical rules: a feature may not import from another feature's internals (only through an index or a shared module); everything that knows about a URL lives in that feature's `api.ts`; cross-cutting concerns (auth, theming, logging, error boundaries) live in `shared/` or `app/`; and the review question is always "what happens to the import graph when this feature is deleted?". Name the alternative you rejected and why — that is the senior part of the answer.

**Example:**

```text
src/
├── app/            # providers, router, error boundary, layout
├── features/
│   ├── tasks/      # api.ts, hooks.ts, components, types.ts, index.ts (public surface)
│   └── reports/
├── shared/         # ui/, lib/, hooks/ — no feature imports anything from a sibling's internals
└── auth/           # session store, AuthProvider, guards
```

### Q8.4 — What does "React is a library, not a framework" mean in practice?

**Short answer:** React gives you the rendering model and a small set of primitives; routing, data fetching, forms, styling and testing are choices you make. That flexibility is why the ecosystem questions ("should I use Redux?", "Next.js or Vite?") have no single answer.

**Detailed explanation:** The practical consequence is that a React project needs a small set of decisions made explicitly and written down: rendering strategy (SPA, SSR, static), routing library, data layer, form strategy, styling approach, testing stack, and deployment target. A good interview answer describes the decision and its trade-off — and names the one that was wrong and why, because everyone has one.

**Example:**

```text
A defensible default for an internal dashboard (and the reason):
SPA + Vite            — no SEO need, fast builds, simple static hosting
React Router (data)   — routes as data, loaders, URL as state
TanStack Query        — one cache, deduplication, mutation invalidation
React Hook Form+Zod   — form state without re-rendering per keystroke; schema reuse
Tailwind + a few CSS modules — utility speed with escape hatches
Vitest + RTL + MSW, Playwright for three critical journeys — fast by default, real where it matters
```

---

## 9. Rapid-fire round

| # | Question | One-line answer |
| --- | --- | --- |
| 1 | Why `key` in a list? | so React can match items between renders; use a stable id, never the index, when the list changes |
| 2 | Why is the index a bad key? | after insert/delete, the same key means a different item → wrong DOM/state reuse |
| 3 | What is a fragment (`<>…</>`)? | a way to group children without adding a DOM node |
| 4 | Why does `<button>` inside a form submit? | the default `type` is `submit`; set `type="button"` for other buttons |
| 5 | What is StrictMode for? | development-only checks: double-invoking renders/effects to surface impure code and missing cleanups |
| 6 | `useEffect` vs `useLayoutEffect`? | the latter runs before paint — for measuring layout; rare, and it blocks painting |
| 7 | Can you call hooks conditionally? | no — the call order is the identity |
| 8 | What is prop drilling? | passing props through components that do not use them; fix with composition or context |
| 9 | Should you fetch in `useEffect`? | for a quick demo, yes; in an app, use a query library or a route loader |
| 10 | What is a controlled component? | its value comes from React state; the DOM is the display, React is the truth |
| 11 | Why is `dangerouslySetInnerHTML` dangerous? | it can execute injected scripts (XSS); sanitise or avoid it |
| 12 | What does `React.memo` compare? | props, shallowly, unless you pass a custom comparison |
| 13 | When is `useMemo` pointless? | when its inputs change on every render, or when the computation is trivial |
| 14 | What is reconciliation? | React diffing the new element tree against the previous one to decide the minimal DOM updates |
| 15 | Does React's virtual DOM make the DOM fast? | no — it makes updates *predictable and batched*; the DOM work is still yours to minimise |
| 16 | What is a portal for? | rendering a child into another DOM node (modals, tooltips) while keeping React's tree |
| 17 | Do you need `forwardRef` in React 19? | no — `ref` is a regular prop on function components |
| 18 | What is `useId` for? | stable ids for accessibility attributes that match between server and client |
| 19 | How do you cancel a fetch? | pass an `AbortSignal` and abort it in cleanup or on a new request; ignore `AbortError` |
| 20 | What is hydration? | attaching React's event handlers and state to server-rendered HTML |
| 21 | What is a hydration mismatch? | the client's first render differs from the server's HTML (often from reading `Date.now()`/`localStorage` during render) |
| 22 | What is code splitting? | shipping fewer bytes initially by loading parts on demand (`lazy`, dynamic `import()`) |
| 23 | What is tree shaking? | removing unused exports at build time; it needs ESM and side-effect-free modules |
| 24 | What belongs in `localStorage`? | small, non-sensitive preferences; tokens are a security trade-off (XSS), not a default |
| 25 | How do you debug "too many re-renders"? | you are setting state during render (often `onClick={fn()}` instead of `onClick={fn}`) |

---

## 10. Summary — what separates a good answer from a great one

- **Lead with the answer, then earn it**: one or two sentences first (what it is, what it costs), then the mechanism and the trade-off.
- **Name the trade-off, not a winner**: `memo` versus the compiler, Context versus a store, controlled versus uncontrolled — say when each is right.
- **Say what changed recently**: React 19 (`ref` as a prop, `<Context>` without `.Provider`, actions, `useActionState`, `useOptimistic`, `use`), React Compiler 1.0 and its caveats, React Router's modes, and what is now legacy (class lifecycle methods, `forwardRef`-by-default, Create React App).
- **Use numbers when you can, and label them honestly**: "in this book's lab, disabling the compiler took a one-row update from 1.3 ms to 212 ms at 4000 rows in a development build" — measurement beats folklore.
- **Know the security sentence**: frontend validation and route guards are UX; authorization belongs on the server.
- **Connect the answer to a project you built**: problems you hit (stale responses, optimistic rollbacks, hydration warnings) are the most convincing evidence of understanding.

---

**What's next →** [`javascript-interview.md`](./javascript-interview.md) covers the JavaScript questions that decide React interviews: closures, the event loop, promises and async/await, `this`, array methods, destructuring and spread/rest — each with a short answer, the mechanism, and a runnable example.
