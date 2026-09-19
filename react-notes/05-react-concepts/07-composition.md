# 07 — Composition: Building With Components Instead of Configuring Them

> **Part 5 · React Concepts · File 7 of 9**
> Why this file exists: React has no inheritance, and no "extends". Instead there is composition — a component renders whatever you put inside it — and composition solves the problems that inheritance and configuration-prop designs solve badly. This chapter measures the property that makes composition more than a style preference: a layout that re-rendered three times re-rendered its child **once** when that child was passed in, and **three** times when the layout built the child itself. Then it builds slots, layout components, compound components (`<Tabs>` sharing state through context) and render props, and shows where each is the right tool.

---

## 1. The measured difference

**File: `src/dev/composition-probe.tsx`** — the same layout with a counter, rendered twice:

```tsx
function LayoutWithCounter({ children }: { children: ReactNode }) {
  layoutRenders += 1;
  const [clicks, setClicks] = useState(0);
  return (
    <section>
      <button onClick={() => setClicks((c) => c + 1)}>layout re-rendered {clicks + 1} times</button>
      {children}
    </section>
  );
}

// The contrast case: the SAME state, but the child element is built inside.
function LayoutBuildingInside() {
  layoutRenders += 1;
  const [clicks, setClicks] = useState(0);
  return (
    <section>
      <button onClick={() => setClicks((c) => c + 1)}>layout re-rendered {clicks + 1} times</button>
      <Heavy label="built inside" />
    </section>
  );
}
```

**Verified** — three renders of each layout (mount + two clicks):

```text
1. <Layout><Heavy/></Layout>: the layout re-rendered 3 times in total: layout=3 · Heavy (passed in)=1 · Heavy (built inside)=0
2. a layout that constructs <Heavy/> in its own JSX (3 renders, counted on their own): layout=3 · Heavy (built inside)=3
3. named slots: header=true sidebar=true main="Main content" footer="© 2026"
```

Read row 1 against row 2:

- When `Heavy` was **passed in as `children`**, the layout re-rendered three times and `Heavy` rendered **once** — the element object was created by the *parent* and reused, so React saw the same element and skipped the child.
- When the layout **built the element itself** (`<Heavy label="built inside" />` inside its own JSX), every one of the layout's three renders created a new element, and `Heavy` rendered **three** times.

Two lessons, and they are the same lesson twice:

1. **Who creates the element decides who controls its re-renders.** Passing JSX in is not just "an API choice"; it moves the ownership of that subtree to the caller.
2. **A component that renders `{children}` is not responsible for what is inside it.** That is why layout components — the ones that just arrange things — stay cheap no matter how heavy their contents are.

⚠️ This is not an argument for memoisation, and it is *not* the same thing as `React.memo`. It is a structural property: the element was never re-created, so React never even considered re-rendering it.

---

## 2. Composition in one sentence

> **A component renders what it is given, and receives data as props.**

Everything in this chapter is a variation on that sentence:

| Pattern | What it composes |
| --- | --- |
| `children` | arbitrary content in a fixed position |
| named slots | several pieces of content in several positions |
| layout/wrapper components | a container with no knowledge of its contents |
| compound components | several components sharing one state through context |
| render props / children-as-function | content whose shape depends on data the container owns |
| heads-up components / "controlled by prop" | a component whose behaviour is configured by elements, not booleans |

---

## 3. `children`: the default slot

```tsx
interface CardProps {
  children: ReactNode;
}

export function Card({ children }: CardProps) {
  return <article className="card">{children}</article>;
}

// Usage — the caller decides what a card contains:
<Card>
  <h3>Mechanical Keyboard</h3>
  <PriceTag priceMinor={499900} />
</Card>
```

**Verified**: `main="Main content"` in row 3 above came from exactly this pattern — `AppShell` accepted `children` and rendered them.

Why `children` is the highest-value prop in React:

- **It makes components reusable without knowing anything about their content.** `Card` works for a product, a review, a settings group.
- **It keeps the calling component in charge of its own data.** `Card` does not need `product`, `rating` or `onAdd` props; the caller fetches its own data and composes it.
- **It moves re-render ownership to the caller** (section 1) — layouts stay cheap.
- **It avoids prop explosion.** No `showRating`, `hasFooter`, `titleIsLarge`.

---

## 4. Named slots

When there are several insertion points, use several element props — the same idea as `children`, with names:

```tsx
interface AppShellProps {
  header: ReactNode;
  sidebar: ReactNode;
  footer: ReactNode;
  children: ReactNode;      // the "main" slot
}

export function AppShell({ header, sidebar, footer, children }: AppShellProps) {
  return (
    <div className="shell">
      <header className="shell__header">{header}</header>
      <aside className="shell__sidebar">{sidebar}</aside>
      <main className="shell__main">{children}</main>
      <footer className="shell__footer">{footer}</footer>
    </div>
  );
}

// Usage:
<AppShell
  header={<h1>MegaShop</h1>}
  sidebar={<CategoryNav />}
  footer={<small>© 2026</small>}
>
  <ProductList products={visible} onAddToCart={handleAddToCart} />
</AppShell>
```

**Verified** — every slot landed in its place:

```text
3. named slots: header=true sidebar=true main="Main content" footer="© 2026"
```

⚠️ **`children` versus a named prop is a real decision.** `children` is idiomatic for "the main content"; a named prop is better when (a) there are several slots, (b) the slot is optional, or (c) the name adds meaning (`sidebar` says more than `children` used twice). Mixing both — `children` for the main area, named props for the ornaments — is what the sample above does.

💡 **When a slot is optional, type it as optional and render conditionally:**

```tsx
interface ModalProps {
  title: string;
  footer?: ReactNode;              // no footer → no <footer> element at all
  children: ReactNode;
}

{footer !== undefined && <footer className="modal__footer">{footer}</footer>}
```

Checking `!== undefined` (rather than a truthy test) matters because `0`, `''` and `NaN` are all valid `ReactNode`s that render *something* while being falsy (Part 3, file 10).

---

## 5. Layout components

A layout component has an opinion about space and none about content:

```tsx
interface StackProps {
  direction?: 'row' | 'column';
  gap?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}

export function Stack({ direction = 'column', gap = 'md', children }: StackProps) {
  return <div className={`stack stack--${direction} stack--gap-${gap}`}>{children}</div>;
}

interface SplitProps {
  ratio?: number;                  // 0.5 = even halves
  start: ReactNode;
  end: ReactNode;
}

export function Split({ ratio = 0.5, start, end }: SplitProps) {
  return (
    <div className="split" style={{ display: 'grid', gridTemplateColumns: `${ratio}fr ${1 - ratio}fr` }}>
      <div>{start}</div>
      <div>{end}</div>
    </div>
  );
}
```

These components are the cheapest kind to write and the easiest to keep stable: they take `ReactNode`s, they have no state, and their tests do not need any data. Because they hold no state (section 1's mechanism), a `Stack` that re-renders does not re-render its children.

---

## 6. Compound components

`<Tabs>` is the canonical compound component: a small family of components that share state through **context**, so the API reads like HTML while nothing gets drilled.

```tsx
// File: src/components/Tabs.tsx
import { createContext, useContext, useState, type ReactNode } from 'react';

interface TabsContextValue {
  active: string;
  setActive: (id: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabs(): TabsContextValue {
  const value = useContext(TabsContext);
  if (value === null) throw new Error('Tabs.* must be used inside <Tabs>');
  return value;
}

export function Tabs({ defaultActive, children }: { defaultActive: string; children: ReactNode }) {
  const [active, setActive] = useState(defaultActive);
  // React 19: a context can be rendered as a provider directly.
  return <TabsContext value={{ active, setActive }}><div className="tabs">{children}</div></TabsContext>;
}

export function TabsList({ children }: { children: ReactNode }) {
  return <div className="tabs__list" role="tablist">{children}</div>;
}

export function Tab({ id, children }: { id: string; children: ReactNode }) {
  const { active, setActive } = useTabs();
  return (
    <button
      type="button"
      className="tabs__tab"
      role="tab"
      aria-selected={active === id}
      onClick={() => setActive(id)}
    >
      {children}
    </button>
  );
}

export function TabPanel({ id, children }: { id: string; children: ReactNode }) {
  const { active } = useTabs();
  if (active !== id) return null;
  return <div className="tabs__panel" role="tabpanel">{children}</div>;
}
```

**Verified** — switching tabs, including the accessibility attributes:

```text
4. tabs, initially: Specs:true Reviews:false · visible panel="Switch, RGB, 75%"
5. after clicking the Reviews tab (no props changed on the panels): Specs:false Reviews:true · visible panel="“Loud but lovely.”"
```

Three properties of the compound API:

- **No prop drilling**: `<Tab>` reads `active`/`setActive` from context, so its props are only `id` and `children` — it works at any depth inside `<Tabs>`.
- **The state cannot leak out of place**: the panels decide for themselves whether they are visible (`active !== id → null`), so a new panel is one line at the call site.
- **The parts are discoverable**: `Tabs.List`, `Tabs.Tab`, `Tabs.Panel` mirror HTML (`select`/`option`, `table`/`tr`) — an API shape people already know.

⚠️ **Two caveats.** First, a compound component's children must *be* inside the provider — the `useTabs` hook throws a clear error otherwise (the lab's pattern, Part 4 file 05), which is what turns "my tab does nothing" into "Tabs.* must be used inside `<Tabs>`". Second, this pattern **couples the parts**: `Tab` may only be used inside `Tabs`. That is fine and intended — it is a component *family*, not three independent components. Document it in the types (the `Tabs.*` naming does most of the work).

---

## 7. Render props and children-as-function

Sometimes the container owns the data and the caller owns the markup for **each item**:

```tsx
interface TableProps<T> {
  items: readonly T[];
  children: (item: T, index: number) => ReactNode;      // a FUNCTION, not an element
}

export function Table<T>({ items, children }: TableProps<T>) {
  return (
    <ul className="table">
      {items.map((item, index) => (
        <li key={index}>{children(item, index)}</li>
      ))}
    </ul>
  );
}

// Usage — the caller decides what a row looks like:
<Table items={products}>
  {(product) => (
    <>
      <span className="row__name">{product.name}</span>
      <PriceTag priceMinor={product.priceMinor} />
    </>
  )}
</Table>
```

**Verified:**

```text
6. children as a function (the parent decides what each row looks like): 2 rows: Keyboard, Monitor
```

Notes on the pattern:

- **The container controls structure; the caller controls presentation.** That is exactly the split that keeps a generic `<Table>` reusable.
- **Type it as `(item: T, index: number) => ReactNode`**, and prefer `key` from your data (`key={item.id}`) to the index shown above whenever items can reorder (Part 3, file 11).
- ⚠️ **A function child re-creates elements on every render** (it is called during the container's render), so the section-1 optimisation does *not* apply here: each row is a fresh element each time. That is fine for rows; do not use children-as-function for a subtree you are trying to keep still.
- **The alternative name is `render`**: `<Table items={products} render={(product) => …} />` reads better when there is more than one function prop (`renderItem`, `renderEmpty`), and it avoids the special-casing that `children` gets in some tooling.

---

## 8. Composition versus configuration props

The most common alternative to composition is a growing set of props that switch behaviour on and off. Both forms can work; the point is to notice when configuration is *becoming* composition and switch:

```tsx
// CONFIGURATION: every new need adds a prop, and the component grows branches.
interface AlertProps {
  message: string;
  tone: 'info' | 'warn' | 'error';
  showIcon?: boolean;
  dismissible?: boolean;
  onDismiss?: () => void;
  actions?: Array<{ label: string; onClick: () => void }>;
  compact?: boolean;
  children?: ReactNode;
}

// COMPOSITION: the pieces are visible at the call site, and each is separately testable.
<Alert tone="warn">
  <Alert.Icon />
  <Alert.Body>Your card expires soon.</Alert.Body>
  <Alert.Actions>
    <button type="button" onClick={updateCard}>Update card</button>
    <button type="button" onClick={dismiss}>Dismiss</button>
  </Alert.Actions>
</Alert>;
```

| | Configuration props | Composition |
| --- | --- | --- |
| Adding a variation | a new prop + a new branch inside the component | a new piece at the call site; the container is untouched |
| Where the variation is visible | inside one large component | in the JSX that needs it |
| Testing | one component with many props to set up | small pieces, small tests |
| Learnability | "which props do I set for X?" | "what does this JSX look like?" |
| Best for | a *fixed* set of small variations (a `Button` with three sizes) | open-ended content or many variations (a `Modal`, `Card`, `Alert`, page layouts) |
| Risk | prop explosion, unreadable conditionals | a looser API; the parts must be documented |

⚠️ **Do not compose everything.** A `<Button>` with two sizes and a tone is *better* as props: `<Button size="lg" tone="danger">Delete</Button>` is shorter, harder to misuse, and keeps the styles in one place. Composition wins when the variation is **structural** (different pieces in different places), not when it is **superficial** (colours, sizes, spacing).

---

## 9. Composition replaces inheritance

There is no `class Modal extends Dialog` in React, and that is a feature:

| Problem inheritance solves | How composition solves it in React |
| --- | --- |
| Share behaviour between components | a **custom hook** (Part 4, file 09) |
| Share markup | a **component** that renders `children` |
| Specialise a base component | pass **props** and **children** to the base; no subclass |
| Override part of the rendering | **slots** (`header`, `footer`) or render props |
| Add behaviour without touching the original | **wrapper components** (`<WithAnalytics><Button/></WithAnalytics>`) |

The comparison that usually makes this concrete: a `<ProductCard>` and a `<DealCard>` are not parent and child; they are two components that both *compose* `<Card>`, `<PriceTag>` and `<Tag>`. When they need shared behaviour (say, "add to cart"), they both call the same hook or receive the same callback. Inheritance would force a hierarchy that the UI does not have, and React's component tree is the hierarchy.

---

## 10. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | building children inside a layout that owns state | the layout re-renders them all (measured: `3` vs `1`) | accept `children`/slots |
| 2 | `props.children` rendered twice | two copies, duplicated ids, broken a11y | render once, or take two slots |
| 3 | conditionally rendering a slot with a truthy check | `0`/`''` appear as text | `slot !== undefined && …` |
| 4 | a wrapper that needs to know its contents (reads `children.props`) | brittle, breaks with fragments/memo | pass data as props or context |
| 5 | `React.Children.map` used to clone children and inject props | clever, hard to debug, fights `memo` | context (compound components) or render props |
| 6 | a compound component used outside its parent | confusing runtime failure | throwing hook with a clear message |
| 7 | children-as-function used where identity matters | the subtree re-renders every time | pass elements, not functions, for stable subtrees |
| 8 | `key` on the wrong level in a mapped slot | items lose state when reordering | key the element you map over |
| 9 | props exploding instead of composing | a 12-prop component with branches | split into composable pieces |
| 10 | composing a `<Button>` down to coloured `<span>`s | an unreadable API for a trivial variation | keep small variations as props |
| 11 | a layout component with layout-specific state that its children need | children cannot reach it | lift it, or provide it via context |
| 12 | forgetting that JSX is just a value | "I cannot pass markup as a prop" | props can hold elements: `header={<h1/>}` |

---

## 11. Best practices

1. **Default to `children`** for the main content of any container.
2. **Use named slots** when there is more than one insertion point, and make optional slots type-optional.
3. **Keep layout components stateless and content-agnostic** — that is what makes them cheap (section 1) and reusable.
4. **Use compound components** for families that share state (`Tabs`, `Menu`, `RadioGroup`) and guard them with a throwing hook.
5. **Use render props** when the container owns data and the caller owns each row's markup.
6. **Compose structure, configure appearance.** Sizes, tones and variants are props; what-goes-where is composition.
7. **Prefer plain components and hooks over `cloneElement`** — inject via context or props instead.
8. **Type slots as `ReactNode`**, and functions as `(item: T) => ReactNode`.
9. **Document the family**: `Tabs`, `Tabs.List`, `Tabs.Tab`, `Tabs.Panel` — the dot naming is the documentation.
10. **Delete configuration props as you compose**: when `showHeader`, `headerTitle` and `headerAction` exist, the component wants a `header` slot.

---

## 12. Real-world example: composition in the lab

The lab's catalogue screen is built from composition at three levels:

| Component | Composition pattern | Why |
| --- | --- | --- |
| `ProductCard` | renders `children`? no — it takes `product` and composes `PriceTag`, `Rating`, `Tag`, `StockBadge` | the parts are shared across card types (a wishlist card later), and each is testable alone |
| `ProductList` | takes `products`, `onAddToCart`, `emptyMessage`, and a `compareAtFor` function | the *structure* (a `<ul>` of cards, or an empty state) belongs to the list; the data and the pricing policy come from the caller |
| `EmptyState` | takes `message` and an optional `actionLabel` + `onAction` pair (a union — file 01) | content and action are decisions of the caller |
| `AppShell`-style layout | `Header`, main content, `CartPanel` | the page arranges; the pieces know their own data (the cart comes from context, Part 4 file 05) |
| `Toast` | takes `message`, `onDismiss`, `durationMs` | a single-purpose component; composition would be over-engineering here |

And the `compareAtFor` prop is worth a closer look, because it shows composition of *behaviour* rather than markup:

```tsx
<ProductList
  products={visible}
  onAddToCart={handleAddToCart}
  emptyMessage={`Nothing matches “${query}” in this category.`}
  compareAtFor={(product) => COMPARE_AT[product.id]}     // a policy injected by the caller
/>
```

`ProductList` does not know where sale prices come from — a lookup table today, an API tomorrow. It calls the function it was given. That is the same idea as `children`, applied to a decision instead of an element.

---

## 13. Practice

### Beginner — slots for a product tile

1. Write `Card` with `children`.
2. Extend it to `ProductTile` with a `media` slot (an image), `children` (the body) and an optional `footer` slot (actions).
3. Render three tiles: one with an image, one without (`media` omitted), one with a badge instead of an image.
4. Then answer: why is `media` a slot rather than a `imageUrl?: string` prop? Give both sides — which version is easier for a *caller* who wants a video instead of an image?

### Intermediate — a compound `<Accordion>`

**File: `src/components/Accordion.tsx`**

Build `<Accordion>` with `<Accordion.Item id>`, `<Accordion.Header>`, `<Accordion.Panel>`:

1. State (which items are open) lives in `<Accordion>`; the parts read it through context (the lab's `useTabs` pattern, extended to a set).
2. `allowMultiple` prop: when `false`, opening one closes the others.
3. Correct accessibility: `button` with `aria-expanded` and `aria-controls`, panel with `id` and `role="region"` + `aria-labelledby`.
4. Keyboard: Enter/Space toggles (free with a real `<button>`), and Home/End move between headers.
5. Then explain what changes in the components if each item owns its own `open` state instead — and when that would be the better design.

### Challenge — a data table with render props

**File: `src/components/DataTable.tsx`**

Build a generic `<DataTable<T>>` that owns structure (columns, sorting, empty state) and takes rendering decisions from the caller:

```tsx
interface Column<T> {
  key: string;
  header: ReactNode;
  render: (item: T) => ReactNode;           // the caller decides the cell
  sortValue?: (item: T) => string | number; // optional: makes the column sortable
  align?: 'start' | 'end';
}

interface DataTableProps<T> {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (item: T) => string;
  empty?: ReactNode;                        // a slot for the empty state
  caption?: string;                         // accessibility: a real table caption
}

<DataTable
  rows={products}
  rowKey={(product) => product.id}
  caption="Products in this category"
  empty={<EmptyState message="Nothing here yet." />}
  columns={[
    { key: 'name', header: 'Name', render: (product) => product.name, sortValue: (product) => product.name },
    { key: 'price', header: 'Price', align: 'end', render: (product) => <PriceTag priceMinor={product.priceMinor} />, sortValue: (product) => product.priceMinor },
    { key: 'rating', header: 'Rating', align: 'end', render: (product) => <Rating value={product.rating} /> },
    { key: 'actions', header: <span className="visually-hidden">Actions</span>, render: (product) => <button type="button" onClick={() => add(product)}>Add</button> },
  ]}
/>
```

Requirements:

1. Sorting: clicking a header sorts by `sortValue` (ascending/descending toggle); columns without `sortValue` are not sortable.
2. Sorting must be **stable** and must not mutate `rows` (copy before sorting — Part 3, file 09).
3. `aria-sort` on the sorted header, and the header must be a `<button>` inside a `<th>`.
4. `empty` is rendered in place of the body when `rows` is empty.
5. Everything renders as a real `<table>` (semantics first), with a `<caption>`.
6. Then answer: why do the columns hold **functions** rather than, say, a `format: 'money' | 'text' | 'date'` string? What would the `format` version need to change if a caller wanted a badge in a cell?

---

## 14. Solutions

### Beginner

```tsx
interface CardProps { children: ReactNode }

export function Card({ children }: CardProps) {
  return <article className="card">{children}</article>;
}

interface ProductTileProps {
  media?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

export function ProductTile({ media, footer, children }: ProductTileProps) {
  return (
    <Card>
      {media !== undefined && <div className="tile__media">{media}</div>}
      <div className="tile__body">{children}</div>
      {footer !== undefined && <div className="tile__footer">{footer}</div>}
    </Card>
  );
}

// Three call sites, three different compositions:
<ProductTile media={<img src="/img/keyboard.jpg" alt="Mechanical keyboard" width={240} />} footer={<button type="button">Add to cart</button>}>
  <h3>Mechanical Keyboard</h3>
  <PriceTag priceMinor={499900} />
</ProductTile>

<ProductTile footer={<button type="button">Add to cart</button>}>
  <h3>Mouse Pad</h3>
  <PriceTag priceMinor={19900} />
</ProductTile>

<ProductTile media={<Tag tone="good">New</Tag>}>
  <h3>Monitor Stand</h3>
  <PriceTag priceMinor={129900} />
</ProductTile>
```

**Why `media` is a slot rather than an `imageUrl?: string` prop**: the slot lets the caller pass *whatever* it needs — an `<img>` with its own `alt` and `loading` attributes, a `<video>`, a `<canvas>`, a skeleton placeholder, a badge, or nothing at all. The `imageUrl` version would need a new prop for each variation (`videoUrl`, `badge`, `placeholder`) and the component would have to grow branches for each. The cost of the slot version is that the caller must write the `<img>` (including the attributes the component cannot know) and that the component cannot inspect its contents — which is precisely what makes it reusable (section 10, mistake 4).

### Intermediate

**File: `src/components/Accordion.tsx`**

```tsx
import { createContext, useContext, useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

// Two contexts: one for the accordion's state, one for each item's id pair.
interface AccordionContextValue {
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
}

interface ItemIds {
  triggerId: string;
  panelId: string;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);
const ItemContext = createContext<ItemIds | null>(null);

function useAccordion(): AccordionContextValue {
  const value = useContext(AccordionContext);
  if (value === null) throw new Error('Accordion.* must be used inside <Accordion>');
  return value;
}

function useItemIds(): ItemIds {
  const value = useContext(ItemContext);
  if (value === null) throw new Error('Accordion.Header/Panel must be used inside <Accordion.Item>');
  return value;
}

export function Accordion({
  allowMultiple = false,
  defaultOpen = [],
  children,
}: {
  allowMultiple?: boolean;
  defaultOpen?: readonly string[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState<readonly string[]>(defaultOpen);
  const headingsRef = useRef<HTMLDivElement>(null);

  const isOpen = useCallback((id: string) => open.includes(id), [open]);

  const toggle = useCallback(
    (id: string) => {
      setOpen((current) => {
        if (current.includes(id)) return current.filter((item) => item !== id);
        return allowMultiple ? [...current, id] : [id];   // single-open mode replaces the set
      });
    },
    [allowMultiple],
  );

  // Home/End: move focus between the headers (a DOM action, so a ref — file 06).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Home' && event.key !== 'End') return;
    const triggers = headingsRef.current?.querySelectorAll<HTMLButtonElement>('.accordion__trigger');
    if (triggers === undefined || triggers.length === 0) return;
    event.preventDefault();
    (event.key === 'Home' ? triggers[0] : triggers[triggers.length - 1]).focus();
  };

  return (
    <AccordionContext value={{ isOpen, toggle }}>
      <div className="accordion" ref={headingsRef} onKeyDown={onKeyDown}>
        {children}
      </div>
    </AccordionContext>
  );
}

function Item({ id, children }: { id: string; children: ReactNode }) {
  // One id pair per item: deterministic, stable across renders, and unique in the page.
  const reactId = useId();
  const ids: ItemIds = { triggerId: `${reactId}-trigger`, panelId: `${reactId}-panel` };
  const { isOpen } = useAccordion();

  return (
    <ItemContext value={ids}>
      <section className="accordion__item" data-id={id} data-open={isOpen(id)}>
        {children}
      </section>
    </ItemContext>
  );
}

function Header({ id, children }: { id: string; children: ReactNode }) {
  const { isOpen, toggle } = useAccordion();
  const { triggerId, panelId } = useItemIds();
  const expanded = isOpen(id);

  return (
    <h3 className="accordion__heading">
      <button
        type="button"
        id={triggerId}
        className="accordion__trigger"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => toggle(id)}
      >
        {children}
      </button>
    </h3>
  );
}

function Panel({ id, children }: { id: string; children: ReactNode }) {
  const { isOpen } = useAccordion();
  const { triggerId, panelId } = useItemIds();
  if (!isOpen(id)) return null;

  return (
    <div className="accordion__panel" id={panelId} role="region" aria-labelledby={triggerId}>
      {children}
    </div>
  );
}

Accordion.Item = Item;
Accordion.Header = Header;
Accordion.Panel = Panel;

// Usage:
// <Accordion allowMultiple defaultOpen={['shipping']}>
//   <Accordion.Item id="shipping">
//     <Accordion.Header id="shipping">Shipping</Accordion.Header>
//     <Accordion.Panel id="shipping">Delivered in 2–4 days.</Accordion.Panel>
//   </Accordion.Item>
//   <Accordion.Item id="returns">
//     <Accordion.Header id="returns">Returns</Accordion.Header>
//     <Accordion.Panel id="returns">30 days, no questions asked.</Accordion.Panel>
//   </Accordion.Item>
// </Accordion>
```

The `id`/`aria-controls` pairing is the fiddly part of real compound components: the trigger must point at the panel's id. The clean solution is to generate the pair **once per item, in the item**, and pass it through a second (item-level) context — the same nesting technique as the accordion context itself:

```tsx
const ItemContext = createContext<{ triggerId: string; panelId: string } | null>(null);

function Item({ children }: { children: ReactNode }) {
  const triggerId = useId();
  const panelId = `${triggerId}-panel`;
  return <ItemContext value={{ triggerId, panelId }}>{children}</ItemContext>;
}
// Header: id={triggerId} aria-controls={panelId}   Panel: id={panelId} aria-labelledby={triggerId}
```

Keyboard Home/End support belongs on the list of headers: give the headers' container a ref, query `button` inside it, and move focus with `.focus()` — a DOM behaviour, so a ref is the right tool (file 06).

**What changes if each item owned its own state**: `<Item>` would hold `const [open, setOpen] = useState(false)`, and the accordion would lose the ability to enforce `allowMultiple={false}` (an item cannot close its siblings without talking to them — file 01's sibling problem), to report which sections are open, or to open two items programmatically. Owning the state in the parent is what makes those features *possible*; local state is only better when the parent genuinely never needs to know (an expandable "advanced settings" block, for instance).

### Challenge

**File: `src/components/DataTable.tsx`**

```tsx
import { useMemo, useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (item: T) => ReactNode;
  sortValue?: (item: T) => string | number;
  align?: 'start' | 'end';
}

export interface DataTableProps<T> {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (item: T) => string;
  empty?: ReactNode;
  caption?: string;
}

type SortState = { key: string; direction: 'asc' | 'desc' } | null;

export function DataTable<T>({ rows, columns, rowKey, empty, caption }: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null);

  const sortedRows = useMemo(() => {
    if (sort === null) return rows;                       // no sorted copy, no unnecessary work
    const column = columns.find((candidate) => candidate.key === sort.key);
    if (column?.sortValue === undefined) return rows;

    const compare = (a: T, b: T): number => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      if (typeof left === 'number' && typeof right === 'number') return left - right;
      return String(left).localeCompare(String(right), 'en-IN');
    };

    // Copy before sorting: `rows` is a prop and must not be mutated (Part 3, file 09).
    const copy = [...rows].sort(compare);
    return sort.direction === 'asc' ? copy : copy.reverse();
  }, [rows, columns, sort]);

  const toggleSort = (key: string) => {
    setSort((current) => {
      if (current === null || current.key !== key) return { key, direction: 'asc' };
      return current.direction === 'asc' ? { key, direction: 'desc' } : null;   // third click clears
    });
  };

  const showEmpty = rows.length === 0 && empty !== undefined;

  return (
    <table className="data-table">
      {caption !== undefined && <caption>{caption}</caption>}
      <thead>
        <tr>
          {columns.map((column) => {
            const isSorted = sort?.key === column.key;
            const ariaSort = isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined;
            return (
              <th key={column.key} scope="col" aria-sort={ariaSort} style={{ textAlign: column.align ?? 'start' }}>
                {column.sortValue === undefined ? (
                  column.header
                ) : (
                  <button type="button" className="data-table__sort" onClick={() => toggleSort(column.key)}>
                    {column.header}
                    {isSorted && <span aria-hidden="true">{sort.direction === 'asc' ? ' ▲' : ' ▼'}</span>}
                  </button>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {showEmpty ? (
          <tr>
            <td colSpan={columns.length}>{empty}</td>
          </tr>
        ) : (
          sortedRows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} style={{ textAlign: column.align ?? 'start' }}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
```

**Why columns hold functions rather than a `format: 'money' | 'text' | 'date'` string**: a `format` string makes the table responsible for knowing *every* way a cell might be presented — and it grows without limit (badges, images, buttons, links, tooltips, conditional colours). With `render`, the table stays a **layout** component (structure, sorting, accessibility, empty state) and the caller decides presentation — which is exactly the section-1 property that makes `DataTable` reusable across products, orders, users and anything else. The `format` version would need a change *inside the table* for every new cell type; the `render` version needs a change only at the call site. The trade to acknowledge: `render` functions are re-created on every render of the caller (so the table re-renders its body — normally fine, and measurable if it is not), and the table cannot optimise what it does not understand.

---

## 15. Summary

- **Composition = a component renders what it is given.** React has no inheritance; behaviour comes from hooks, markup from children and slots, variation from props.
- **Measured, and the reason this chapter exists:** a layout that re-rendered three times re-rendered a child passed as `children` **once** and a child built inside itself **three** times. Who creates the element owns the re-renders.
- **`children` is the default slot**; **named props** (`header`, `sidebar`, `footer`) are slots too — use them when there is more than one insertion point, and guard optional slots with `!== undefined` so `0` and `''` behave.
- **Layout components should be stateless and content-agnostic** — that is what keeps them cheap and reusable.
- **Compound components** (`<Tabs>`, `<Accordion>`) share one state through context, keep their API readable (`Tabs.Tab`), and fail loudly when a part is used outside its parent. Export the family as properties of the parent (`Accordion.Item = Item`).
- **Render props / children-as-function** let a container own the data while the caller owns each item's markup (verified: 2 rows rendered by the caller's function) — and they re-create elements each render, so use them deliberately.
- **Compose structure, configure appearance**: a `Button`'s size is a prop; a `Modal`'s contents are composition.
- **`cloneElement` and `React.Children` gymnastics are a smell**: inject through context, props or slots instead.
- **Inheritance problems map onto React tools**: shared behaviour → hooks; shared markup → components with children; specialisation → props and slots; added behaviour → wrapper components.

---

**What's next →** [`08-children.md`](./08-children.md): the `children` prop under a microscope — what `ReactNode` really includes, what React considers a child (arrays, strings, numbers, `null`, booleans, fragments), the rules for typing and documenting children, `Children.map`/`Children.toArray` and the rare cases they are justified, `key` behaviour inside mapped children, and the mistakes that produce "Objects are not valid as a React child".
