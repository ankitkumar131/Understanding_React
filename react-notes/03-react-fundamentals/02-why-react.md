# 02 — Why React?

> **Part 3 · React Fundamentals · File 2 of 12**
> Why this file exists: file 01 showed *what* React is. This file answers the harder question — *why would you choose it?* — with evidence rather than enthusiasm, including the honest list of what React costs and the situations where you should not use it at all.

---

## 1. The honest framing

React is not a victory. It is a **trade**:

> You give up direct control of the DOM and pay for a library (about 68 kB gzipped in our app), and in exchange you stop writing "update the screen" code by hand and get a programming model that scales to hundreds of interacting features.

That exchange is excellent for some applications and terrible for others. This file shows both sides with measurements from this repo's lab app, so the choice is yours to make rather than to inherit.

---

## 2. Problem 1 — keeping the screen in sync with the data

File 01 proved the drift bug in 37 lines of vanilla JavaScript. Let's make it concrete at app scale, because "synchronisation" is the whole game.

### 2.1 The feature set

Our MegaShop app has these features, all interacting:

- a text search over product name and SKU,
- five category chips (`All` plus four categories), each showing a live count,
- a product grid that renders a card per visible product,
- a "Showing N of M products" footer,
- an empty state when nothing matches,
- a cart counter in the header, incremented by "Add to cart" buttons,
- stock handling: sold-out products show "Notify me" and a disabled button.

That is **three** pieces of state (`category`, `query`, `cartCount`) and **seven** things on screen derived from them.

### 2.2 What React does with it

This is a real scripted session against the real app (the harness is `src/dev/interact.tsx`; it drives the actual `App` in a headless DOM and prints what is on screen after each interaction):

```text
1. first paint (no filters)
   visible : Mechanical Keyboard, Wireless Mouse, 27" Monitor, 32" Curved Monitor,
             Studio Headphones, USB Microphone, 1TB NVMe SSD, 2TB Portable SSD
   footer  : Showing 8 of 8 products.
   cart    : 🛒 0

2. typed "ssd" and pressed Search
   visible : 1TB NVMe SSD, 2TB Portable SSD
   footer  : Showing 2 of 8 products.

3. then clicked the "Audio" chip (combined filters, no matches)
   visible : (none)
   footer  : Showing 0 of 8 products.
   empty   : No products match / Nothing matches “ssd” in this category.

4. clicked "All" again
   visible : 1TB NVMe SSD, 2TB Portable SSD

5. pressed "Clear"
   visible : (all 8 products)

6. clicked "Add to cart" twice (first card, third card)
   cart    : 🛒 2

7. clicked the sold-out card's "Notify me" (disabled button)
   cart    : 🛒 2          ← unchanged, because a disabled button fires no click
```

Seven features, correct behaviour, **zero lines of DOM-manipulation code**. The only lines that mention state are these (from `src/App.tsx`):

```tsx
const [category, setCategory] = useState<CategoryChoice>('all');
const [query, setQuery] = useState('');
const [cartCount, setCartCount] = useState(0);
```

Everything else is a **derived value** computed from those three during render — the filtered array, the counts per chip, the footer text, the empty state, the badge label, the disabled flags. Derived values cannot drift, because they are recomputed from scratch every render. There is nowhere for them to be "forgotten".

### 2.3 What the same feature set looks like in vanilla JavaScript

Here is a faithful, *working* vanilla version of the search + category + count + empty-state subset (64 lines). I ran it too; it produces the same visible results:

**File: `filter3.html`**

```html
<input id="q" placeholder="Search" />
<div id="chips">
  <button data-cat="all">All</button>
  <button data-cat="audio">Audio</button>
  <button data-cat="storage">Storage</button>
</div>
<ul id="list"></ul>
<p id="count"></p>
<p id="empty" hidden>No products match</p>

<script>
  const products = [
    { name: 'Studio Headphones', category: 'audio' },
    { name: '1TB NVMe SSD', category: 'storage' },
    { name: '2TB Portable SSD', category: 'storage' },
  ];

  let query = '';
  let category = 'all';

  const list = document.getElementById('list');
  const count = document.getElementById('count');
  const empty = document.getElementById('empty');
  const chips = document.getElementById('chips');

  // One delegated listener — if we rebuilt the chips with innerHTML we would
  // have to re-attach per-button listeners here on every render.
  chips.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    category = button.dataset.cat;
    render();
  });

  document.getElementById('q').addEventListener('input', (event) => {
    query = event.target.value;
    render();
  });

  function render() {
    const needle = query.trim().toLowerCase();
    const visible = products.filter(
      (p) => (category === 'all' || p.category === category) && p.name.toLowerCase().includes(needle),
    );

    // five separate DOM writes that must all agree with `visible`
    list.innerHTML = visible.map((p) => `<li>${p.name}</li>`).join('');
    count.textContent = `Showing ${visible.length} of ${products.length} products.`;
    empty.hidden = visible.length !== 0;
    for (const button of chips.querySelectorAll('button')) {
      button.classList.toggle('active', button.dataset.cat === category);
    }
    document.querySelectorAll('button').forEach((b) => {
      if (b.dataset.cat) b.setAttribute('aria-pressed', String(b.dataset.cat === category));
    });
  }

  render();
</script>
```

**Expected result** (real output from driving it in a headless DOM):

```text
1. first paint
   list  : Studio Headphones, 1TB NVMe SSD, 2TB Portable SSD
   count : Showing 3 of 3 products.
   empty : hidden=true
   active: All
2. typed "ssd"
   list  : 1TB NVMe SSD, 2TB Portable SSD
   count : Showing 2 of 3 products.
   active: All
3. clicked "Audio"
   list  : (none)
   count : Showing 0 of 3 products.
   empty : hidden=false
   active: Audio
```

### 2.4 The comparison, stated fairly

| | Vanilla version above | React version (same features) |
| --- | --- | --- |
| Lines of code | **64** | ~190 (5 small files) |
| Dependencies | none | react + react-dom (68 kB gz) + a build step |
| Places that write to the DOM | **5 per render**, all hand-written | 0 |
| Things that can drift out of sync | all 5 | none (derived) |
| New feature (pagination, sorting, discount badge, "in stock only" toggle) | new DOM write + new branch in every handler that could affect it | one new derived value, one new element |
| Number of *update paths* to reason about | grows with features × outputs | **stays 0** |
| Testability of the logic | must inspect the DOM | `filter(...)` on a plain array |
| Copy-paste reuse into another page | not possible without a templating layer | `<ProductList products={…} />` |

Two honest conclusions:

1. **For this toy, vanilla wins on almost every line of the table.** 64 lines, no build step, no dependency, no bundle cost. If your page has three products and one filter, write the vanilla version and go home.
2. **The vanilla column does not scale, and the reason is the fourth row.** The 5 DOM writes are 5 places that must be updated whenever the *shape of the UI* changes. With seven outputs (our real app) it is 7 writes; add sorting, pagination and a discount banner and it is 15 writes, spread over handlers that each need to remember to call `render()`, and each needing to be tested for the case where they forget. React replaces *N update paths* with *one description*. That is the entire value proposition, and it is why the line count is not the point.

> 💡 **The one-question test for React:** *"Does this screen have state that many parts of the UI depend on?"* If yes, a declarative model pays for itself quickly. If no (a brochure page, a blog post, a form that posts and reloads), it usually does not.

---

## 3. Problem 2 — state stored in the DOM

The vanilla pattern above is already the *good* version: `query` and `category` are JavaScript variables, and `render()` reads them. The common bad version stores state **in the DOM itself**:

```js
// anti-pattern: the DOM is the database
input.dataset.lastQuery = input.value;
const active = document.querySelector('.chip.active').dataset.cat;   // parse your own UI
list.hidden = false;                                                  // "is it loaded?" = is it hidden?
form.querySelector('.error') ? 'invalid' : 'valid';
```

Why this is a dead end:

- **You restore state by re-reading the UI.** After any render, you must keep class names, `hidden`, `aria-*` and text in the exact shape your code expects. Rename a class for a CSS refactor and your logic silently changes behaviour.
- **The DOM is lossy.** "Loading" and "loaded but empty" and "failed" all look like an empty container.
- **It is not serialisable.** You cannot save it, test it, log it, or share it with a server — so features like "restore my filters from the URL" or "resume where I left off" become reverse-engineering exercises.
- **It fights the browser.** Browsers may normalise attribute values, and `hidden` loses to CSS.

React's rule — *all state lives in JavaScript; the UI is computed from it* — is what makes features like URL-synced filters (Part 6), optimistic updates and server rendering (Part 7) tractable. You cannot build those cheaply on top of DOM-as-state.

---

## 4. Problem 3 — HTML has no units of reuse

HTML gives you exactly two reuse mechanisms: copy-paste, and `<iframe>`. Server-side templating languages added `include`/partials — but they still operate on *text*, which is why the classic problems of "partials" existed:

```text
partials:      header.html, product-card.html, footers.html …
mixing:        string concatenation and escaping rules
escaping bugs: "<script>" in a product name breaks the page
localisation:  string templates everywhere
interaction:   a partial cannot own its own state
```

React's unit of reuse is a **component**: a function that owns its markup, its data shape and its behaviour, and that can be *composed* by name with typed inputs.

**File: `src/components/Header.tsx`** (from the lab)

```tsx
import type { ReactNode } from 'react';

export interface HeaderProps {
  title: string;
  subtitle?: string | undefined;
  /** Anything the parent wants rendered in the header's right-hand slot. */
  children?: ReactNode;
}

export function Header({ title, subtitle, children }: HeaderProps) {
  return (
    <header className="header">
      <div>
        <h1>{title}</h1>
        {subtitle !== undefined && <p className="header__subtitle">{subtitle}</p>}
      </div>
      {children !== undefined && <div className="header__actions">{children}</div>}
    </header>
  );
}
```

Used twice, differently, from `App.tsx` and from the dev harness:

```tsx
<Header title="MegaShop" subtitle={`${products.length} products in the catalogue`}>
  <span className="cart">🛒 {cartCount}</span>
</Header>

<Header title="Your order" subtitle="3 items">
  <button type="button">Checkout</button>
</Header>
```

Four things are happening that a `.html` partial cannot do:

1. `title` and `subtitle` are **typed**. Passing a number where a string is expected is a compile error, discovered before you load the page.
2. `children` is a **slot**: the caller decides what goes in the right-hand area, without the header knowing about carts or checkout buttons.
3. The component has **behaviour** — inside `SearchBar`, the draft query is local state; inside `CategoryFilter`, the active chip is derived from a prop. Partials cannot own state; components can.
4. Escaping and correctness are handled: `{'<script>'}` renders as text, not markup, because React escapes text children by default.

Composition is where the model compounds: `ProductCard` is built from `PriceTag`, `Rating`, `StockBadge` and `Tag`; `ProductList` is built from `ProductCard` and `EmptyState`; the page is built from `Header`, `SearchBar`, `CategoryFilter` and `ProductList`. Every level was tested in isolation (file 09 shows the harness output for each).

---

## 5. Problem 4 — locality of change

The practical test of an architecture is: *how many files do I touch to delete a feature?*

| Change | Vanilla DOM app | React app (our lab) |
| --- | --- | --- |
| Remove the rating display | find every place that writes the rating DOM; remove those writes; risk touching CSS selectors | delete `<Rating … />` and `Rating.tsx` |
| Add a "discount %" to every card | add a node in each card template string, add an update line in every handler | edit `PriceTag.tsx` (29 lines) — every card gets it |
| Rename a product field `name` → `title` | grep the whole codebase for `name` and hope | rename in `Product`, and **the compiler lists every usage** |
| Change "Add to cart" to "Notify me" when sold out | an `if` in three handlers | one ternary inside `ProductCard` |

Deep reason: React makes the **data shape** the shared contract, and TypeScript enforces that contract across the whole tree. The view code is local to the component that owns it, and change is proportional to the feature, not to the size of the app.

> 🏭 **What this looks like in a real team.** Two developers work on the same page: one on the category filter, one on the cart summary. Both edit `App.tsx` briefly, then work in their own component file. With the DOM-as-source-of-truth approach, both are editing the same `render()` and the same set of element ids, and every merge is a semantic conflict. This is why React (and its peers) win in teams more than in tutorials.

---

## 6. Problem 5 — one model for many targets

Because components describe *what*, not *how*, the same mental model (and often much of the same code) works for:

- **the browser DOM** (`react-dom`),
- **server-rendered HTML strings** — you met this in part 01 as `renderToStaticMarkup`, exactly what our dev harness uses to print markup for these notes,
- **native mobile** (`react-native`: `<View>` instead of `<div>`, `<Text>` instead of `<span>`),
- **tests** — you can render a component to a string or into a headless DOM and assert on the output (that is literally how the traces in this file were produced),
- **non-DOM targets** — canvas/WebGL (`react-three-fiber`), PDF (`react-pdf`), CLI (`ink`).

That portability is why "React developer" is a transferable skill, and why a company can move web and mobile with one hiring profile.

---

## 7. Problem 6 — ecosystem and hiring (the honest reason it dominates)

React is not merely technically excellent; it is *socially* dominant.

- **Largest component ecosystem.** Routing, data fetching, tables, editors, charts, maps, drag-and-drop, date pickers, headless UI — for nearly every UI problem there is a battle-tested React library. When you pick Vue or Svelte you get good libraries too, but fewer choices and fewer StackOverflow answers.
- **Hiring and onboarding.** React is the most requested front-end skill. Onboarding a new developer to a React codebase is a known path; onboarding them to your bespoke DOM-manipulation layer is not.
- **Tooling investment.** React DevTools, the React Compiler, framework support (Next.js, Remix/React Router, Expo), and now formalised docs at react.dev.
- **Momentum risk.** This cuts both ways: it is *network effects*, not physics. Being popular does not make it right for your project, and you should still read section 9.

---

## 8. What React costs (the ledger)

Every one of these is real. Ignoring them is why teams end up frustrated with React.

| Cost | Why it exists | Mitigation |
| --- | --- | --- |
| **Bundle weight** | React + ReactDOM ≈ 68 kB gzipped before your app | Fine for apps; measure it (Part 16) for marketing pages; code-split (Part 10 file on `lazy`) |
| **A build step** | JSX and TS must be compiled; browsers never see them | Vite in dev is instant (file 03); the build is one command |
| **The page requires JavaScript** | The client app is built in the browser | Server rendering or a framework if you need no-JS/first-paint parity (file 02 §11) |
| **Choice fatigue** | React is a library: it ships no router/data/state solution | Adopt per-part in these notes: Router 7, TanStack Query 5, `useState` first, Context for cross-cutting state (Part 5), Zustand when context is not enough (Part 10) |
| **Re-render subtleties** | Re-render ≠ update, but the wrong state placement still burns CPU | Part 4 (state design) and Part 10 (memoisation, Compiler) |
| **Ecosystem churn** | The "recommended" library shifts every 2–3 years | Prefer boring, widely-used libraries with small APIs; keep data-fetching and routing at the edges |
| **Two-mode development (SSR/RSC)** | Server and client are different environments | Not needed for the client app we build here; Part 18 surveys frameworks |
| **Escape hatches confuse beginners** | `useEffect` and refs are easy to overuse | Learn the rules (Part 4 file on effects): effects synchronise with *external* systems, nothing else |

Against that ledger, React's benefit is concentrated in one property: **the cost of adding the next feature stays roughly constant instead of growing with the number of features**. That is what you are buying.

---

## 9. When NOT to use React

Be honest here; this list will save you as much pain as all the React knowledge that follows.

| Situation | Why React is the wrong tool | Use instead |
| --- | --- | --- |
| **Static marketing site / landing page** | No state; you would ship 68 kB of JS to display text | HTML + CSS, possibly Astro/Eleventy/11ty with islands |
| **Blog, docs, knowledge base** | Content, not interaction; SEO and first paint matter most | Astro, Hugo, Eleventy, plain markdown |
| **Small enhancement on an existing server-rendered page** ("add a date picker") | React would need a root, a bundle and a build pipeline for one widget | Vanilla JS, or a tiny library; islands architecture |
| **CRUD admin for a small team, server-rendered** | The state lives in the database; every action is a round trip | Rails/Laravel/Django + htmx/turbo; excellent for this |
| **Brutal bundle budget** (e.g. embedded widget on every page of a high-traffic site) | Library cost is paid by every page load | Preact (React-compatible, ~4 kB), Svelte, or vanilla |
| **Your team already ships fast in Vue/Svelte/Angular** | Retraining costs more than any benefit | Stay. Skill and delivery beat fashion |
| **Real-time UI with thousands of independently-updating nodes** | Declarative re-render model needs careful engineering | Fine-grained reactivity (Solid, Svelte) or targeted rendering |
| **You need it working without JS at all** | React's model is a client runtime | Server-rendered HTML (plus progressive enhancement) |

> ❌ **The most expensive mistake in this area** is not choosing React wrongly; it is *not deciding*. Teams that bolt React onto a server-rendered page for one widget, then grow a second app inside it, end up maintaining two architectures and two sets of state.

---

## 10. A decision checklist

Answer these before starting a new front end:

1. **Is there client state that many parts of the UI depend on?** (filters, cart, wizard, editor, dashboards) → React earns its keep.
2. **Does the page need to work with JavaScript disabled or be indexed as content?** → server-rendered HTML first; add React only for islands, or use a framework with SSR/SSG.
3. **How many independent features will interact on the same screen?** More than three or four → declarative wins.
4. **Will a team of more than one person touch this?** → component boundaries and typed props pay off immediately.
5. **Do you need native mobile too?** → React + React Native shares the model.
6. **What is the performance budget, and who pays for it?** (every visitor, on every page)
7. **What does the team already know?** Skills are a real budget item.
8. **How long will this live?** A 6-week dashboard and a 6-year product have different answers.
9. **Is the data mostly read-only?** → rendering can be done on the server; the client app may be unnecessary.
10. **Can we start with less?** (React for one route, vanilla for the rest; Vite for a prototype before a framework choice)

---

## 11. Common mistakes in reasoning about React

| Claim | Why it is wrong |
| --- | --- |
| "React is faster than vanilla JS." | False as stated. Hand-written DOM updates for a *known* change are the fastest possible option. React wins on *predictability at scale* and constant feature cost, not raw speed. |
| "React gives you SEO." | The opposite is the default: a client-rendered app ships an empty `<div id="root">`. SEO needs SSR/SSG or content in the HTML. |
| "React means fewer lines of code." | For a toy, React is usually *more* lines (64 vs ~190 in section 2.4). It is fewer *responsibilities to keep consistent*. |
| "The virtual DOM is why it is fast." | The comparison of trees costs work. Its value is that it makes "describe the screen; I will work out the updates" possible. |
| "React is a full stack." | React is a view library. Data fetching, caching, routing, forms and validation are separate (Parts 6, 7, 8). |
| "You need Redux for a real app." | No. You need Redux (or similar) for *specific* problems: large cross-cutting state with complex update rules and a need for devtools/time-travel. `useState` + props + context covers most apps (Parts 4, 5, 10). |
| "Performance = use `memo`/`useMemo` everywhere." | Premature memoisation adds complexity and its own bugs. Measure first; the React Compiler (Part 10) automates the common cases. |
| "React is only for SPAs." | React is a rendering library: it powers static sites, embedded widgets and native apps too (but see section 9 for when it is still the wrong call). |

---

## 12. Practice

### Beginner

Look at any website you use daily (a bank portal, your email, a shopping site). For three pages, decide whether each is a *content* page or a *stateful app* page. Justify each in one sentence.

**Solution sketch** — "Product listing with filters, sort and pagination" → stateful (many derived outputs from a few inputs). "Terms and conditions" → content (no state at all; server-rendered HTML is the right tool). "Email inbox with selection, labels and search" → stateful (this is why Gmail-like apps are a canonical React/SPA use case). The point of the exercise is the reflex, not the labels.

### Intermediate

Take the 64-line vanilla `filter3.html` version and add a third filter: "only in stock". Count the edits you had to make. Then add the same thing to the React app (`App.tsx` + `CategoryFilter.tsx`) and count.

**Solution — vanilla:** you must (1) add a checkbox to the HTML, (2) add `let inStockOnly = false;`, (3) add a change listener calling `render()`, (4) add the condition inside `filter()` in `render()`, (5) sync the checkbox's `checked` property inside `render()` (`checkbox.checked = inStockOnly;` — easy to forget, and the source of the classic "checkbox does not reset" bug). Five edits, one of them a new *DOM write* that can drift.

**Solution — React:** add `inStockOnly` to `App`'s state and pass it down; the filter clause inside the existing `useMemo`; one new chip or checkbox element whose `checked` comes from state. **No new DOM writes.** The checkbox's visual state is derived from the same variable — it cannot be out of sync with the filtering, because both come from the same value in the same function body.

### Challenge

Write a one-page decision memo for a fictional client: a 12-person company wants to rebuild their *public marketing site* (40 static pages, 3 forms, a blog) plus their *customer dashboard* (login, filters, live data, charts, tables). They have one front-end developer who knows JavaScript and basic React. State the architecture you recommend, and explicitly name what you would **not** do.

**Solution**

```text
Architecture
  Marketing site (40 pages + blog):  static/SSG — Astro or Eleventy (or Next.js
    static export). Content in markdown/MDX, HTML delivered by CDN, no client
    React except maybe one island for the pricing toggle.
  Forms (3):                         server-rendered POST + progressive enhancement.
    Never trust client validation as the only validation (Part 8).
  Dashboard:                         Vite + React + TypeScript SPA (this notes set,
    Parts 3–12), React Router for routes, TanStack Query for server data,
    charts via a charting library, tables with sorting/pagination.

Do NOT
  - Do not build the marketing site as a client-rendered SPA: it would ship the
    library to every visitor and hurt first paint and SEO for content that never
    changes.
  - Do not introduce Redux "because the app is large": server data belongs in a
    query cache (Part 14), not a global store.
  - Do not hand-roll routing/auth-guard logic — routing is Part 6, and route
    guards are UX, not security (the API must enforce authorisation).
  - Do not use client-side validation as a security control.
  - Do not pick a framework for the dashboard yet: a Vite SPA is the smallest
    thing that can work; graduate to a framework when SSR/RSC requirements appear.
```

The memo's value is the explicit "do not" list: architecture is mostly about what you refuse to build.

---

## 13. Summary

- React is a **trade**: control and bundle size in exchange for a model where UI is derived from state.
- The core problem it solves is **state synchronisation**: with a declarative model, the number of *update paths you must maintain* is zero, no matter how many derived outputs exist.
- Storing state in the DOM (classes, `hidden`, `data-*`) does not scale: state must live in JavaScript so it can be tested, logged, serialised and derived from.
- **Components are units of reuse** that HTML partials cannot match: typed inputs, `children` slots, local state, escaping, composition.
- **Locality of change** is the daily, felt benefit: renaming a field is a compiler-guided refactor; deleting a feature is deleting a file.
- One model serves the DOM, server-rendered strings, tests and native views.
- React's dominance is partly **social** (ecosystem, hiring) — real, but not a technical argument.
- The costs are real: library weight, build step, JavaScript requirement, library-choice fatigue, re-render subtleties.
- React is the wrong tool for content sites, tiny enhancements, tight bundle budgets and teams already productive elsewhere. Decide with the checklist, not by default.

---

**What's next →** [`03-project-setup.md`](./03-project-setup.md)
