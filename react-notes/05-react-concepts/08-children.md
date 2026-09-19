# 08 — The `children` Prop: Everything React Will and Will Not Render

> **Part 5 · React Concepts · File 8 of 9**
> Why this file exists: `children` is the prop that makes composition work (file 07), and it is also the one React treats specially — a whole set of values are legal children, a few are not, and each has its own rule. This chapter verifies exactly what renders (`number="42"`, `zero="0"`, `bool=""`, `null=""`), captures the two errors people actually hit (`Objects are not valid as a React child`, and the warning for a bare function), and shows what `Children.count`/`toArray`/`map` really do with `null`s, nested arrays and fragments — so you can stop guessing why a child vanished or a key warning appeared.

---

## 1. `children` is just a prop

```tsx
<Card>Hello</Card>
```

JSX compiles that to a call with `children` in the props, which is why all of these are identical:

```tsx
<Card>Hello</Card>
<Card children="Hello" />
```

The second form looks unusual, but it is a useful reminder: `children` is not magic — it is the props slot the JSX *content* fills in. Everything that follows is a consequence of the JSX compiler putting whatever you wrote between the tags into that slot.

```tsx
// The JSX compiler's view of composition:
Card({ children: 'Hello' });
Card({ children: [<h3 key="t1">Title</h3>, <PriceTag priceMinor={499900} key="p1" />] });
```

Which explains why `children` is a *value*: you can build it, store it, pass it around and pass it twice (though rendering it twice is usually a bug — file 07, mistake 2).

---

## 2. What React accepts as a child

**Verified** — every kind of value in one component, and what appeared in the DOM:

```text
3. what renders for each kind of child: text="text" · number="42" · zero="0" · bool="" · null="" · undefined=""
```

| Value | Renders as | Notes |
| --- | --- | --- |
| string | the text | escaped, not HTML |
| number | its text form (`42`) | **`0` renders `"0"`** — it is falsy but a valid child |
| boolean | **nothing** | `{true}`/`{false}` are ignored — this is what makes `{isLoading && <Spinner />}` safe |
| `null` / `undefined` | **nothing** | the idiomatic "render nothing" |
| element | that element | `<span>hi</span>` |
| array of the above | each item, in order | **needs keys**; nested arrays are flattened |
| fragment | its children | `<>{a}{b}</>` |
| portal | its content, elsewhere in the DOM | `createPortal` (Part 10) |
| **object** (`{}`, `[]` of objects, `new Date()`) | **throws** | see below |
| **function** | **not rendered; warns** | unless a component explicitly expects one (render props, file 07) |

Two errors, both captured from React 19.3:

```text
1. passing an object as a child: THROWN: Objects are not valid as a React child (found: object with keys {not}).
   If you meant to render a collection of children, use an array instead.

2. passing a function as a child: THROWN: (nothing) | logged: Functions are not valid as a React child.
   This may happen if you return Component instead of <Component /> from render.
   Or maybe you meant to call this function rather than return it.
   <div>{Component}</div>
```

The two messages are worth reading carefully, because they cover the vast majority of "my component is blank / my page crashed" reports:

| Message | The mistake behind it | Fix |
| --- | --- | --- |
| *Objects are not valid as a React child* | rendering `{product}` (the object) instead of `{product.name}`; rendering a `Date`; rendering a `Map`; forgetting to `map()` | render a string/number, or `.map()` to elements (Part 3, file 09) |
| *Functions are not valid as a React child … return Component instead of `<Component />`* | `{renderItem}` instead of `{renderItem()}`; `{ProductCard}` instead of `<ProductCard />`; forgetting to *call* a render prop | call it, or use it as a component |

⚠️ **The boolean row is the one that surprises people in both directions.** `{count && <Badge/>}` with `count === 0` renders a lone `0` — because `0` **is** a renderable child. Write `{count > 0 && <Badge/>}` (or `{count ? <Badge/> : null}`) when the guard is a number. This is a bug you can see in the wild as a stray "0" in a price list.

---

## 3. Typing `children`

```tsx
import type { ReactNode, ReactElement, PropsWithChildren } from 'react';

// The default: anything renderable, including nothing.
interface CardProps { children: ReactNode }

// Exactly one element (rare — usually you want ReactNode).
interface WrapperProps { children: ReactElement }

// Text only, when the component is designed for a label.
interface BadgeProps { children: string }

// Optional content.
interface PanelProps { children?: ReactNode }

// Same as CardProps, spelled with the helper.
type HeaderProps = PropsWithChildren<{ title: string }>;

// A FUNCTION child (render props — file 07): type it, do not use ReactNode.
interface TableProps<T> { items: readonly T[]; children: (item: T) => ReactNode }

// Several slots mean several props, each typed the same way.
interface ModalProps {
  title: string;
  footer?: ReactNode;
  children: ReactNode;
}
```

| Type | Means | When |
| --- | --- | --- |
| `ReactNode` | string, number, boolean, null, undefined, element, fragment, portal, array of these | **the default choice** |
| `ReactElement` | exactly one element | when a component needs to clone/inspect it (rare, and discouraged) |
| `JSX.Element` | one element, similar to `ReactElement` | older code; prefer `ReactElement` |
| `string` / `number` | text only | labels, badges, headings |
| `ReactNode[]` | an array of children | lists of slots |
| `(x: T) => ReactNode` | a function child | render props |
| `PropsWithChildren<P>` | `P & { children?: ReactNode }` | augmenting an existing props type |

💡 **`ReactNode` already includes “nothing”**, so `children: ReactNode` accepts `<Card />` with no content — the type is not what prevents empty content. Add validation or a required-content check if a component genuinely needs children, or use `ReactElement` deliberately and document why.

---

## 4. Rendering, wrapping and passing children through

```tsx
// 1. Render them.
function Card({ children }: { children: ReactNode }) {
  return <article className="card">{children}</article>;
}

// 2. Wrap them (add chrome around content you do not own).
function Highlight({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' }) {
  return <mark className={`highlight highlight--${tone}`}>{children}</mark>;
}

// 3. Pass them through (a layout that only arranges).
function Page({ children }: { children: ReactNode }) {
  return (
    <div className="page">
      <Header />
      <main className="page__main">{children}</main>
      <Footer />
    </div>
  );
}

// 4. Render them conditionally — but be careful with falsy values.
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  // `null` is a legal child and renders nothing, so this is the safe "hide" form.
  return <div hidden={!open}>{children}</div>;
}
```

Notice `Collapsible` uses `hidden` rather than unmounting the content. That is a real trade-off for children you do not control: `{open ? children : null}` destroys whatever state the children held (an input's draft, an open accordion inside); `hidden` keeps everything mounted and merely invisible. Which one you want depends on whether the content should *forget* (a checkout step: yes) or *remember* (a settings panel: usually yes).

---

## 5. The `Children` utilities, measured

Three helpers exist for the rare case where a component must inspect the children it was handed: `Children.count`, `Children.toArray`, `Children.map` (and `Children.only`).

**Verified** — over a deliberately messy children value: `['a', null, [<b key="b1"/>, undefined], <Fragment key="frag">c</Fragment>]`

```text
4. Children utilities over: "a", null, [<b/>, undefined], <Fragment>c</Fragment>
   Children.count  -> 5
   Children.toArray -> 3 items, keys: (none), .2:$b1, .$frag
   Children.map    -> ["[0]","[1]","[2]","[3]","[4]"]  (null/undefined children are skipped)
   rendered text: "ac"
```

Reading it precisely:

| Utility | Result | What it does |
| --- | --- | --- |
| `Children.count(children)` | `5` | counts across nested arrays, **including** `null` slots |
| `Children.toArray(children)` | `3` items, keys `(none), .2:$b1, .$frag` | flattens nested arrays/fragments and **removes** `null`/`undefined`/booleans; **adds keys** (prefixed by their path) so the result is safe to render |
| `Children.map(children, fn)` | 5 calls | visits every slot (including empty ones) and collects the results; `null` returns are dropped from the array it builds |
| rendered text | `"ac"` | the text `'a'` and the fragment's `'c'` are what actually appears |

And the key rule for arrays of children — **Verified**:

```text
5. an array of children without keys: Each child in a list should have a unique "key" prop.
   Check the top-level render call using <ul>. See https://react.dev/link/warning-keys for more information.
6. the same array with keys: (no warning)
```

⚠️ **When you need these utilities, it is usually a design smell.** `Children.map` + `cloneElement` to "inject a prop into each child" is the classic misuse: the child cannot know it is being injected into, `memo` breaks, and the props appear from nowhere. The modern answers are context (file 09 / compound components) or explicit props (file 07's render props). Legitimate uses of `Children.*` are narrow: counting decorative items, converting arbitrary children into a keyed array for a layout that must reorder them, or validating that exactly one child was provided (`Children.only`).

---

## 6. `cloneElement`, and why to avoid it

```tsx
// The pattern you will see in older component libraries:
function RadioGroup({ children }: { children: ReactNode }) {
  const [value, setValue] = useState('free');
  return (
    <fieldset>
      {Children.map(children, (child) =>
        isValidElement(child)
          ? cloneElement(child as ReactElement<{ checked?: boolean; onChange?: () => void }>, {
              checked: (child.props as { value: string }).value === value,
              onChange: () => setValue((child.props as { value: string }).value),
            })
          : child,
      )}
    </fieldset>
  );
}
```

What is wrong with it: it reaches into children the component does not own, the props it injects are invisible at the call site, `memo`-ised children re-render anyway (new props each time), and the type assertions pile up. What to do instead: **context** (the child reads the group's state itself), or **explicit props** (the caller passes `checked`/`onChange` — which is exactly what file 03's radio group does).

The narrow case where `cloneElement` is still reasonable: a wrapper that must add *one* well-known prop to a single, known child (the classic `Tooltip` wrapping a `Button` to add aria attributes), where the coupling is documented and the children are typed to require that prop. Even then, an explicit prop tends to be clearer.

---

## 7. Children and re-renders (the useful consequence)

File 07 measured it; here is why it happens, from the `children` side:

```tsx
function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState('light');       // changes often in this app
  return <section data-theme={theme}>{children}</section>;
}

// The children element is created HERE — in App's render — and handed to the provider.
function App() {
  return (
    <ThemeProvider>
      <ExpensiveDashboard />      {/* created by App, not by ThemeProvider */}
    </ThemeProvider>
  );
}
```

When `ThemeProvider`'s own state changes, it re-renders — but `<ExpensiveDashboard />` is the **same element object** it was given, so React does not re-render it. That is why "move the heavy part into `children`" is a standard performance trick (React's own docs use it for components that re-render on scroll or mouse position), and it is *free*: no `memo`, no `useMemo`, just where the JSX was written.

⚠️ **Two caveats.** First, the trick does not apply when the parent that creates the element re-renders — `App` re-rendering re-creates `<ExpensiveDashboard />` and it will re-render too. Second, children do **not** see the provider's state: `<ExpensiveDashboard />` was created in `App`'s scope, so it cannot read `theme` from `ThemeProvider` unless that value is passed down through props or context (file 09). "Children do not re-render" and "children cannot see the state" are two sides of the same fact: children belong to whoever created them.

---

## 8. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `{count && <Badge />}` with `count === 0` | a stray `0` in the UI | `{count > 0 && …}` or a ternary |
| 2 | rendering an object | thrown: *Objects are not valid as a React child* | render a field, or `.map()` |
| 3 | rendering a component without calling it | warning: *Functions are not valid as a React child* | `<Component />`, or `{fn()}` for a render prop |
| 4 | `children: ReactElement` when content may be a string/array | type errors at every call site | `ReactNode` unless you need exactly one element |
| 5 | rendering `children` twice | duplicated ids, duplicated DOM, broken accessibility | render once, or use two named slots |
| 6 | mapping `children` with `cloneElement` to inject props | invisible props; `memo` defeated; type assertions | context or explicit props |
| 7 | an array of children without keys | the "unique `key` prop" warning (verified) | key each element you build in a list |
| 8 | `Children.toArray` used to count what will render | wrong count (it flattens and drops empties) | `Children.count` for counting, `memo`/layout for rendering |
| 9 | expecting children to see the container's state | `undefined`/stale values | pass props, or use context |
| 10 | unmounting children to "hide" them | their internal state resets | `hidden`, CSS, or lift the state |
| 11 | `props.children.props` used to read content | breaks with strings, arrays, fragments | pass data as props |
| 12 | a slot rendered with a truthy check | `0`/`''` produce stray output | `slot !== undefined && …` (file 07) |

---

## 9. Best practices

1. **Type children as `ReactNode`** unless you have a specific reason to narrow it.
2. **Use `children` for the main content, named props for additional slots** (file 07).
3. **Guard falsy values explicitly** in JSX (`> 0`, `!== undefined`) — `0` and `''` are renderable.
4. **Render children once**, in a place that makes sense, and let CSS handle visibility.
5. **Do not inspect children** (`Children.map`, `cloneElement`, `child.props`) unless you have no alternative — and reach for context first.
6. **Key arrays** you build yourself; rely on `Children.toArray` only if the children are truly arbitrary.
7. **Remember the ownership rule**: children belong to the component that created the elements (their re-renders and their visible state both follow from that).
8. **Use the children trick deliberately** when a wrapper re-renders often and must not drag a heavy subtree with it.
9. **Document what a component expects of its children** when it has requirements (one element, a specific prop, a specific component family).
10. **Prefer `hidden`/CSS when content should remember its state**, and unmount when it should not.

---

## 10. Real-world example: children in the lab

| Place | Children used for | Why |
| --- | --- | --- |
| `EmptyState` | the caller passes `message` and an optional action pair (props, not children) | a component with two slots of *known* shape does not need the `children` slot at all |
| `ProductList` | `emptyMessage` as a prop; cards are built inside from `products` | the list owns the structure; the *items* are its data, not the caller's markup |
| `Tag`, `Rating`, `PriceTag` | text children | these are leaf components: `children` is exactly the label — which is why they accept `ReactNode` and nothing else |
| `Toast` | `message` as a prop | the content is one string; children would add nothing |
| `Card`-style wrappers (challenge, file 07) | a `media` slot, a body (`children`) and a `footer` slot | three positions, three props — and the caller decides what goes in each |
| `AppShell` (file 07's example) | `header`, `sidebar`, `footer`, `children` | the page arranges; the pieces know their own data |

And the pattern to notice: **the lab uses props rather than children** whenever the content is a *value* (a message, a label, a price). `children` is for *markup the caller owns*. Reaching for `children` where a string prop would do adds indirection (`<EmptyState>Nothing here yet</EmptyState>` versus `<EmptyState message="Nothing here yet" />`) without adding flexibility.

---

## 11. Practice

### Beginner — fix the disappearing content

Each snippet has a bug that makes content vanish, appear as `0`, or throw. Identify it and fix it.

```tsx
// 1.
function Badge({ count }: { count: number }) {
  return <span className="badge">{count && <strong>{count} new</strong>}</span>;
}

// 2.
function ProductLine({ product }: { product: Product }) {
  return <li className="line">{product}</li>;
}

// 3.
function Row({ render }: { render: () => ReactNode }) {
  return <div className="row">{render}</div>;
}

// 4.
function Slots({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div>
      {header && <div className="slots__header">{header}</div>}
      {children}
    </div>
  );
}

// 5.
function List({ titles }: { titles: string[] }) {
  return <ul>{titles.map((title) => <li>{title}</li>)}</ul>;
}
```

### Intermediate — a `<Panel>` with three slots and a rule

Build `Panel` with `title`, `actions` (optional) and `children`:

1. `title` is a required `string`; `actions` is an optional `ReactNode` rendered in a header row only when provided.
2. `children` is `ReactNode`; if no children are given, render a default "Nothing to show yet." message. (Hint: `Children.count(children) === 0` — and say why a simple `!children` check is not reliable.)
3. Add an optional `footer` slot that is a *function* receiving the panel's own "expanded" state: `footer?: (expanded: boolean) => ReactNode`. Explain what this type buys over `ReactNode`.
4. Render a `Panel` with: no actions and no children; actions only; a footer that shows `expanded ? 'Collapse' : 'Expand'`.

Then answer: why does the footer need to be a *function* to see `expanded`, when the actions slot does not?

### Challenge — a `Repeat` component and a layout that reorders children

**File: `src/components/Repeat.tsx`** and **`src/components/MediaObject.tsx`**

1. **`Repeat`** — `<Repeat times={3} gap="sm">{(index) => <Rating key={index} value={index + 3} />}</Repeat>`: a component whose child is a function that receives the index. Type it correctly, key the returned elements, and render nothing when `times <= 0`.
2. **`MediaObject`** — the classic layout with `figure`, `body` and optional `actions`, where a `reverse` prop swaps figure and body. Implement it with named slots, and make the DOM order actually change (not just visual order with CSS) — then explain when CSS `order` would be the better choice and why.
3. **Reorder children** — implement a `MediaObject` variant that accepts a `mediaPosition` of `'start' | 'end' | 'top'` and uses `Children.toArray` to guarantee stable keys while reordering. Then explain the two things `Children.toArray` did for you (flattening and keying) and what would break without it.

---

## 12. Solutions

### Beginner

```tsx
// 1. `count && …` renders "0" when count is 0 — 0 is a valid child.
function Badge({ count }: { count: number }) {
  return <span className="badge">{count > 0 ? <strong>{count} new</strong> : null}</span>;
}

// 2. An object is not a valid child — render the field you want.
function ProductLine({ product }: { product: Product }) {
  return (
    <li className="line">
      {product.name} — {product.sku}
    </li>
  );
}

// 3. A function is not a valid child unless it is CALLED (render prop).
function Row({ render }: { render: () => ReactNode }) {
  return <div className="row">{render()}</div>;
}

// 4. The header slot is guarded with a truthy check: an empty string (a valid node)
//    or 0 would be dropped, and `false` would render nothing anyway. Check explicitly.
function Slots({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <div>
      {header !== undefined && <div className="slots__header">{header}</div>}
      {children}
    </div>
  );
}

// 5. The mapped elements need keys, and the component should say what it renders.
function List({ titles }: { titles: readonly string[] }) {
  return (
    <ul>
      {titles.map((title, index) => (
        <li key={titles.indexOf(title) === index ? title : `${title}-${index}`}>{title}</li>
      ))}
    </ul>
  );
}
```

Two notes on those answers. Bug 4 is subtle: `header && …` looks harmless, but `header` is `ReactNode`, which includes `0` and `''` — both of which are dropped by the guard while being perfectly renderable, and both of which *would* render visibly if you wrote `{header}` without a guard. Bug 5 is worse than it looks: in a real list you cannot assume titles are unique, so the `key` must come from data (an `id`) whenever one exists; using the index as a key reorders state incorrectly (Part 3, file 11). The honest fix is to change the prop to `titles: readonly { id: string; title: string }[]` and use `key={item.id}`.

### Intermediate

```tsx
import { Children, useState, type ReactNode } from 'react';

interface PanelProps {
  title: string;
  actions?: ReactNode;
  footer?: (expanded: boolean) => ReactNode;   // a function: it needs the panel's state
  children: ReactNode;
}

export function Panel({ title, actions, footer, children }: PanelProps) {
  const [expanded, setExpanded] = useState(true);
  const childCount = Children.count(children);   // counts across arrays/fragments, incl. null slots

  return (
    <section className="panel">
      <header className="panel__header">
        <h3 className="panel__title">{title}</h3>
        {actions !== undefined && <div className="panel__actions">{actions}</div>}
        <button type="button" className="panel__toggle" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </header>

      <div className="panel__body" hidden={!expanded}>
        {childCount === 0 ? <p className="panel__empty">Nothing to show yet.</p> : children}
      </div>

      {footer !== undefined && <footer className="panel__footer">{footer(expanded)}</footer>}
    </section>
  );
}
```

**Why `!children` is not reliable**: `children` is a `ReactNode`, and `0` and `''` are falsy *and* valid children — but they are also the two values you would least want to interpret as "empty". Meanwhile `[null, null]` is truthy while rendering nothing, and `Children.count([null, null])` is `2`, so even the count is not a perfect emptiness test for arrays of nulls. The precise check for "nothing will render" is a recursive one (`Children.toArray(children).length === 0` after dropping empties), which is why most components simply document "children are required" instead of guessing.

**Why the footer is a function and the actions slot is not**: `actions` is *markup* — the caller decides what it looks like, and the panel decides where it goes; it needs no data from the panel. The footer needs the panel's `expanded` state to render its text, and the only way a caller-provided node can see that state is if the panel calls a *function* with it (file 07's render prop). The alternative — lifting `expanded` into the caller — would make every caller manage a state the panel already owns. The type `(expanded: boolean) => ReactNode` is that contract, expressed precisely enough that TypeScript will reject `<Panel footer={<span/>} />`.

### Challenge

**File: `src/components/Repeat.tsx`**

```tsx
import type { ReactNode } from 'react';

interface RepeatProps {
  times: number;
  gap?: 'sm' | 'md' | 'lg';
  children: (index: number) => ReactNode;      // a function child: it needs the index
}

export function Repeat({ times, gap = 'md', children }: RepeatProps) {
  if (times <= 0) return null;                  // nothing to render, and no wrapper element
  return (
    <div className={`repeat repeat--gap-${gap}`}>
      {Array.from({ length: times }, (_, index) => children(index))}
    </div>
  );
}

// Usage:
<Repeat times={3} gap="sm">
  {(index) => <Rating key={index} value={index + 3} />}
</Repeat>
```

Two details: the children are keyed **by the caller** (the component cannot key elements it does not build unless it wraps them — and wrapping would change the DOM), and returning `null` for `times <= 0` avoids an empty wrapper element in the DOM.

**File: `src/components/MediaObject.tsx`**

```tsx
import { Children, type ReactNode } from 'react';

interface MediaObjectProps {
  figure: ReactNode;
  body: ReactNode;
  actions?: ReactNode;
  mediaPosition?: 'start' | 'end' | 'top';
}

export function MediaObject({ figure, body, actions, mediaPosition = 'start' }: MediaObjectProps) {
  const figureNode = <div className="media__figure">{figure}</div>;
  const bodyNode = (
    <div className="media__body">
      {body}
      {actions !== undefined && <div className="media__actions">{actions}</div>}
    </div>
  );

  // DOM order changes with the prop — not merely visual order.
  const ordered = mediaPosition === 'end' ? [bodyNode, figureNode] : [figureNode, bodyNode];

  return (
    <div className={`media media--${mediaPosition}`} data-media-position={mediaPosition}>
      {ordered.map((node, index) => (
        <Fragment key={index}>{node}</Fragment>
      ))}
    </div>
  );
}
```

**Why DOM order rather than CSS `order`**: tab order, screen-reader order and text selection all follow the DOM. Flipping visually with `order` while leaving the DOM alone produces a page where the keyboard user tabs through the media after the body on screen, and where a screen reader reads the caption before the image it describes. CSS `order` is the right tool only for purely decorative rearrangement — a grid of tiles, where reading order genuinely does not matter.

**The reordering variant**, using `Children.toArray`:

```tsx
function MediaObjectReordering({ figure, body, actions, mediaPosition = 'start' }: MediaObjectProps) {
  const children = Children.toArray([figure, body, actions]);   // flattens + guarantees keys
  const [mediaChild, bodyChild, actionsChild] = children;

  return (
    <div className={`media media--${mediaPosition}`}>
      {mediaPosition === 'start' ? [mediaChild, bodyChild, actionsChild] : [bodyChild, mediaChild, actionsChild]}
    </div>
  );
}
```

What `Children.toArray` did for you, exactly (measured above): it **flattened** nested arrays and fragments into a single list, and it **assigned keys** (prefixed by the child's path, e.g. `.2:$b1`) so the rearranged list renders without key warnings. Without it, reordering a raw `[figure, body, actions]` array would trigger the "Each child in a list should have a unique `key` prop" warning (verified in section 5) — and any element-level state inside those children could be attached to the wrong node.

---

## 13. Summary

- **`children` is a normal prop** filled by whatever the JSX compiler finds between the tags; `<Card>x</Card>` and `<Card children="x" />` are the same call.
- **What renders (verified)**: strings, numbers (including `0`), elements, fragments, portals, and arrays of those. **Booleans, `null` and `undefined` render nothing.** An **object throws** (*Objects are not valid as a React child*) and a **function warns** (*Functions are not valid as a React child … return `<Component />`*).
- **Type children as `ReactNode`** by default; narrow to `ReactElement`, `string` or `(x) => ReactNode` deliberately, and document the requirement — the type alone does not force content to exist.
- **Guard falsy values explicitly** (`> 0`, `!== undefined`): `0` and `''` are renderable, which is why `{count && …}` prints a stray `0`.
- **`Children.count`/`toArray`/`map` (verified)** count slots including empties, flatten-and-key while dropping empties, and visit every slot respectively — useful for counting, and a smell when used to clone children.
- **`cloneElement` + `Children.map` prop injection is discouraged**: the injected props are invisible at the call site and `memo` is defeated. Use context or explicit props.
- **Children belong to whoever created them.** A wrapper that re-renders often can avoid re-rendering a subtree passed in as `children` (measured in file 07: `1` render versus `3`), but those children also cannot see the wrapper's state.
- **Arrays need keys** (verified warning), and the fix is a stable id from your data — not the index.
- **Prefer props over `children` when the content is a value** (a message, a label): it is shorter and equally flexible.

---

**What's next →** [`09-context.md`](./09-context.md): the deep dive on context as an architecture tool. We will verify nested providers overriding for their subtree (`outer=dark/#f5f5f5 · inner=light/#111`), the silent default when no provider exists, `use(Context)` working **inside a condition** (which `useContext` cannot do), the split-context pattern measured (`StateConsumer: 1 → 2` renders while `DispatchConsumer: 1 → 1`), testing with a stub provider, and the rules that keep context from becoming invisible global state.
