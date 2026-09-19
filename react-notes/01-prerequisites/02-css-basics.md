# 02 — CSS Basics (Styling the Markup React Produces)

> **Part 1 · Prerequisites · File 2 of 11**
>
> **Why this file exists:** React changes *how you attach classes and styles*,
> but it changes nothing about CSS itself. If your box model and flexbox are
> shaky, every React project becomes guesswork. This file gives you the 20% of
> CSS that covers 80% of real UI work, and shows exactly how that CSS is wired to
> a React component.

---

## 1. What CSS is, and the three ways to attach it

**CSS (Cascading Style Sheets)** is the language that describes **appearance**:
size, colour, spacing, layout, animation.

Three ways to attach styles, in order of how you should use them:

**1. External stylesheet (the normal choice)**

```html
<!-- index.html -->
<link rel="stylesheet" href="/styles.css" />
```

```css
/* styles.css */
body {
  margin: 0;
  font-family: system-ui, sans-serif;
}
```

**2. Inline style on an element (for one-off, dynamic values)**

```html
<p style="color: red; font-size: 14px;">Danger</p>
```

In React this becomes an **object** — the single most important syntax
difference you will meet:

```tsx
// React: camelCase property names, string values, double braces
<p style={{ color: 'red', fontSize: '14px' }}>Danger</p>
```

**3. A `<style>` block in the document (rarely; usually a bundler's job)**

```html
<style>
  .badge { background: gold; }
</style>
```

### Why inline styles are different in React

```tsx
// ❌ Doesn't work: this is a string, but React needs an object
<p style="color: red">

// ❌ Doesn't work: `font-size` is not valid JavaScript
<p style={{ 'font-size': '14px' }}>

// ✅ React: object, camelCase keys, values as strings
<p style={{ fontSize: '14px', color: 'red' }}>
```

The outer `{}` means "switch to JavaScript". The inner `{}` is the object
literal. So the double braces are not special syntax — it is just a JavaScript
object inside a JSX expression. (Part 3 covers JSX braces properly.)

- CSS property `font-size` → JS object key `fontSize`
- CSS property `background-color` → `backgroundColor`
- Values that are not numbers still need quotes: `'14px'`, `'1.5rem'`, `'#333'`
- Numbers are allowed and get `px` added automatically **except for
  unitless-safe properties** like `flex`, `opacity`, `zIndex`, `lineHeight`:
  `style={{ width: 200, opacity: 0.5, zIndex: 10 }}`

> 🏭 **Production note:** use inline styles only for values that are genuinely
> dynamic per render (a progress bar's width, a computed colour). Everything
> else belongs in a class — because hover states, media queries, pseudo-elements
> (`::before`) and `!important` do not exist in inline style objects.

---

## 2. Selectors: how CSS chooses elements

```css
/* 1. Element selector: every <p> */
p { line-height: 1.6; }

/* 2. Class selector: every element with class="card" */
.card { border: 1px solid #ddd; }

/* 3. Id selector: the element with id="app" */
#app { min-height: 100vh; }

/* 4. Descendant: any <a> inside .nav, at any depth */
.nav a { text-decoration: none; }

/* 5. Child: only direct children */
.nav > a { padding: 8px; }

/* 6. Attribute selector */
input[type="email"] { border-color: #888; }

/* 7. Pseudo-class: state */
button:hover { background: #eee; }
button:focus-visible { outline: 2px solid #2563eb; }
input:disabled { opacity: 0.6; }
li:first-child { margin-top: 0; }

/* 8. Pseudo-element: generated part of an element */
.required::after { content: " *"; color: crimson; }
```

**How to read a selector:** left to right, "give these declarations to
*these* elements."

### Specificity: which rule wins

When two rules set the same property on the same element, the more **specific**
selector wins. Same specificity → the later rule wins.

```text
specificity, roughly, highest to lowest:

inline style attribute   (beats everything except !important)
#id                       →  100
.class / [attr] / :hover  →   10
element / ::before        →    1
* (universal)             →    0

!important overrides all of the above (avoid it)
```

```css
/* Specificity 1 — element */
button { background: gray; }

/* Specificity 10 — class: wins over the element rule */
.btn-primary { background: steelblue; }

/* Specificity 11 — element + class: wins over both */
button.btn-primary { background: royalblue; }
```

> ⚠️ **Beginner trap:** fighting specificity by adding `!important`. It works
> until you need to override *that*, and then nothing works. Instead, keep
> specificity low and flat: use **one class per element** where possible.
> This is exactly what CSS Modules and Tailwind (Part 12) are designed around.

### The cascade, in one paragraph

Styles flow from many sources — browser defaults, your stylesheet, inline
styles — and CSS resolves conflicts in this order: **origin and importance**
(our styles beat browser defaults), then **specificity**, then **order of
appearance**. "Cascading" means "these rules fall down onto elements and are
resolved by these tie-breakers."

### Inheritance

Some properties (mostly text ones) *inherit* from parent to child even if you
never write a rule for the child:

```css
body {
  font-family: system-ui, sans-serif; /* all descendants inherit this */
  color: #111;                        /* and this */
  line-height: 1.5;                   /* and this */
}
```

Non-inherited (must target the element itself): `margin`, `padding`, `border`,
`width`, `height`, `display`, `background`, `position`.

```css
/* Set typography once at the root; never repeat it everywhere */
body {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: #111827;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
```

> 💡 `system-ui` uses the operating system's own font — which is why good web
> apps feel native everywhere and load instantly (no font file download).

---

## 3. The box model (the single most important CSS concept)

Every element is a rectangular box made of four layers:

```text
┌─────────────────────────────────────────────┐  ← margin (space OUTSIDE, transparent)
│  ┌───────────────────────────────────────┐  │
│  │  border                                │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  padding                        │  │  │
│  │  │  ┌───────────────────────────┐  │  │  │
│  │  │  │        content            │  │  │  │
│  │  │  │  (text, image, child)     │  │  │  │
│  │  │  └───────────────────────────┘  │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

- **content** — the text or child elements.
- **padding** — space *inside* the border, between content and border.
- **border** — the visible edge.
- **margin** — space *outside* the border, between this box and its neighbours.

### `box-sizing`: the setting that makes width predictable

```css
/* Default: width = content only. Add padding and the box grows. */
.card { width: 300px; padding: 20px; border: 1px solid #ddd; }
/* Real width on screen: 300 + 20 + 20 + 1 + 1 = 342px 😖 */

/* With border-box: width includes padding + border */
.card { box-sizing: border-box; width: 300px; padding: 20px; border: 1px solid #ddd; }
/* Real width: exactly 300px ✅ */
```

Which is why **every project starts with this reset:**

```css
/* A sane starting point you will see in nearly every real codebase */
*,
*::before,
*::after {
  box-sizing: border-box;
}

* {
  margin: 0;
}

body {
  font-family: system-ui, sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

img,
picture,
video,
canvas,
svg {
  display: block;
  max-width: 100%;
}

input,
button,
textarea,
select {
  font: inherit;
}

p,
h1,
h2,
h3,
h4,
h5,
h6 {
  overflow-wrap: break-word;
}
```

That block is worth typing once and keeping in a file called `reset.css`. It
removes the browser's inconsistent defaults so your CSS starts from zero.

### Margin collapse (a real source of "why is my gap wrong?")

Vertical margins between adjacent blocks *merge* instead of adding:

```css
.a { margin-bottom: 20px; }
.b { margin-top: 30px; }
/* The gap between .a and .b is 30px — NOT 50px */
```

Horizontal margins never collapse. This is why modern layouts use `gap` in
flexbox/grid instead of margins between siblings:

```css
.stack { display: flex; flex-direction: column; gap: 16px; } /* predictable */
```

---

## 4. Units: choose the right one

| Unit | Relative to | Use it for |
| --- | --- | --- |
| `px` | pixels | borders, hairlines, small fixed details |
| `rem` | the root font size (default 16px) | font sizes, spacing, widths that should scale with user settings |
| `em` | the *element's own* font size | rarely; it compounds and surprises people |
| `%` | the parent's size | fluid widths, image scaling |
| `vw` / `vh` | 1% of viewport width / height | full-screen sections (`min-height: 100vh`) |
| `ch` | width of the `0` character | readable text measures (`max-width: 65ch`) |
| `fr` | a fraction of leftover grid space | grid columns |
| `dvh` | dynamic viewport height | better than `vh` on mobile browsers with toolbars |

**Practical rules**

```css
:root {
  font-size: 16px; /* 1rem = 16px; users who increase their default font size are respected */
}

body {
  font-size: 1rem;      /* 16px */
  line-height: 1.5;     /* unitless: multiply the element's own font size */
}

h1 { font-size: 2rem; }        /* 32px, scales with root font size */
p  { max-width: 65ch; }        /* comfortable reading measure */
.hero { min-height: 60dvh; }   /* correct on mobile with browser chrome */
```

> 💡 **Accessibility rule:** font sizes in `rem`, never `px`, so users who zoom
> or change their browser's default font size get a page that scales.

---

## 5. Display and layout: block, inline, flex, grid

### `display` basics

```css
div  { display: block; }         /* full width, stacks vertically, margin/padding all work */
span { display: inline; }        /* flows in text; vertical margin/padding ignored */
img  { display: inline-block; }  /* flows in text but respects box properties */
.hidden { display: none; }       /* removed from layout entirely */
```

### Flexbox: one-dimensional layout (rows OR columns)

Memorise these six properties; they cover most UI layout:

```css
.row {
  display: flex;            /* children become flex items in a row */
  flex-direction: row;      /* row | column */
  justify-content: space-between; /* along the main axis (horizontal for row) */
  align-items: center;      /* across the cross axis (vertical for row) */
  gap: 12px;                /* space between items — no margin collapsing */
  flex-wrap: wrap;          /* let items wrap onto new lines instead of squashing */
}
```

A typical "header with logo left, nav right":

```css
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid #e5e7eb;
}

.nav-links {
  display: flex;
  gap: 20px;
  list-style: none;
  padding: 0;
  margin: 0;
}
```

A common "centred card" and "equal-width columns":

```css
.center {
  display: flex;
  align-items: center;     /* vertical centring */
  justify-content: center; /* horizontal centring */
  min-height: 100dvh;
}

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.card {
  flex: 1 1 240px;  /* grow | shrink | basis: at least 240px, then share space */
  min-width: 0;      /* lets long text shrink instead of overflowing */
}
```

> 🔍 `min-width: 0` on flex items is the fix for "my long text won't shrink /
> my table overflows". Flex items have `min-width: auto` by default, which
> refuses to shrink below content size.

### CSS Grid: two dimensions at once

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
```

That one declaration creates a **responsive grid** with no media queries:
"as many 220px-minimum columns as fit, share the leftover space equally."
This is the standard catalogue/gallery layout in production apps.

```css
/* Named areas: great for page shells (layout routes in Part 6) */
.shell {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "header header"
    "sidebar main"
    "footer footer";
  min-height: 100dvh;
  gap: 16px;
}
.shell > header  { grid-area: header; }
.shell > aside   { grid-area: sidebar; }
.shell > main    { grid-area: main; }
.shell > footer  { grid-area: footer; }
```

### Flexbox or Grid?

| Situation | Use |
| --- | --- |
| A row/column of things, sizing follows content | **flex** |
| 2D layout with rows *and* columns, or overlapping areas | **grid** |
| Toolbar, nav bar, button with icon + text, card internals | **flex** |
| Page shell, dashboard, gallery, form grid | **grid** |
| Centring one thing in a container | **flex** (or grid + `place-items: center`) |

---

## 6. Spacing, colours and typography systems

Amateur CSS hardcodes numbers everywhere (`margin: 13px`, `margin: 17px`).
Professional CSS uses **scales**:

```css
/* Design tokens: one place to change everything */
:root {
  /* spacing scale — multiples of 4px */
  --space-1: 0.25rem;  /*  4px */
  --space-2: 0.5rem;   /*  8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */

  /* colour palette */
  --color-bg: #ffffff;
  --color-surface: #f9fafb;
  --color-border: #e5e7eb;
  --color-text: #111827;
  --color-muted: #6b7280;
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-danger: #dc2626;

  /* radius + shadow */
  --radius: 8px;
  --radius-lg: 14px;
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.06);
  --shadow-md: 0 4px 12px rgb(0 0 0 / 0.1);
}

.card {
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  box-shadow: var(--shadow-sm);
}
```

**CSS custom properties (`--name`)** are read with `var(--name)`. Two things to
know:

1. They **cascade like normal CSS** — override `--color-bg` on `body.dark` and
   everything inside picks it up. This is how theming (Part 5, Context) works
   with almost no JavaScript.
2. They can be read and written **from JavaScript**:

```ts
// Read a token
const styles = getComputedStyle(document.documentElement);
console.log(styles.getPropertyValue('--color-primary')); // "#2563eb"

// Change the theme at runtime — a real technique used in production
document.documentElement.style.setProperty('--color-bg', '#0b1220');
```

That snippet is, essentially, dark mode in three lines. In React you will
usually *set a class* (`document.body.classList.toggle('dark')`) and let CSS
custom properties do the rest.

### Typography basics

```css
h1 { font-size: 2rem; line-height: 1.2; letter-spacing: -0.02em; }
p  { font-size: 1rem; line-height: 1.6; color: var(--color-text); }

/* Font stacks: use what the user already has, in preference order */
body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
```

Rules that make text look professional:

- `line-height: 1.2–1.3` for headings, `1.5–1.7` for body text.
- Line length 45–75 characters: `max-width: 65ch`.
- Do not use more than 2 font families, or more than ~4 font sizes.
- Smaller text needs *more* line-height, not less.

---

## 7. Responsive design

Mobile-first: write the small-screen styles as the default, then add
enhancements with `min-width` media queries.

```css
/* Phone (default, no media query) */
.grid { display: grid; grid-template-columns: 1fr; gap: 12px; }

/* Tablet and up */
@media (min-width: 640px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
}

/* Desktop and up */
@media (min-width: 1024px) {
  .grid { grid-template-columns: repeat(3, 1fr); gap: 24px; }
  .shell { grid-template-columns: 240px 1fr; }
}
```

**Also needed in almost every page** (the `<meta name="viewport">` line from
the previous file). Without it, mobile browsers zoom out and your media queries
behave as if the screen were 980px wide.

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

Useful extras:

```css
/* Respect users who ask for less motion */
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}

/* Dark mode from the OS setting */
@media (prefers-color-scheme: dark) {
  :root { --color-bg: #0b1220; --color-text: #e5e7eb; }
}
```

---

## 8. States: hover, focus, active, disabled

Interactive elements need feedback in **all** their states, and keyboard users
need a visible focus ring.

```css
.button {
  padding: 10px 16px;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: var(--color-primary);
  color: white;
  font: inherit;
  cursor: pointer;
  transition: background-color 120ms ease, transform 60ms ease;
}

.button:hover { background: var(--color-primary-hover); }
.button:active { transform: translateY(1px); }

/* :focus-visible shows a ring only for keyboard focus, not mouse clicks */
.button:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

> ⚠️ **Never write `outline: none`** without providing another focus indicator.
> It makes the page unusable by keyboard. Use `:focus-visible` and keep the ring.

---

## 9. How this connects to React (the important part)

### Same CSS, different way of attaching class names

```html
<!-- HTML -->
<button class="button button--primary" disabled>Save</button>
```

```tsx
// React (TSX)
<button className="button button--primary" disabled>Save</button>
```

**Rules to remember:**

1. `class` → `className` (because `class` is a reserved word in JavaScript).
2. Class names are normal JavaScript strings, so they can be **computed**:

```tsx
<button
  className={`button ${isPrimary ? 'button--primary' : ''} ${isDisabled ? 'is-disabled' : ''}`}
>
  Save
</button>
```

That template literal is the "old way" and it gets ugly fast (stray spaces). The
tiny `clsx` library exists purely for this:

```bash
npm install clsx
```

```tsx
import clsx from 'clsx';

<button
  className={clsx('button', isPrimary && 'button--primary', isDisabled && 'is-disabled')}
>
  Save
</button>
```

You will meet `clsx` (and its variant `classnames`) in Part 12. Remember *why*
it exists: class lists in React are just strings, and strings get messy.

### Dynamic styles go in the style object

```tsx
function ProgressBar({ value }: { value: number }) {
  return (
    <div
      style={{
        height: 8,
        background: '#e5e7eb',
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${value}%`,           // ← genuinely dynamic: needs JS
          background: value > 90 ? 'crimson' : 'steelblue', // ← dynamic colour
          height: '100%',
          transition: 'width 200ms ease',
        }}
      />
    </div>
  );
}
```

The static parts (`height`, `background`, `borderRadius`) should really be a CSS
class. The dynamic parts (`width`, colour) must be inline. That split is the rule
to follow.

### A full HTML + CSS + React side-by-side

```text
styles.css
```

```css
:root {
  --color-primary: #2563eb;
  --color-border: #e5e7eb;
  --space-4: 1rem;
  --radius: 8px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: white;
}

.card__title { margin: 0; font-size: 1.125rem; }
.card__price { margin: 0; color: var(--color-primary); font-weight: 600; }
.card__actions { display: flex; gap: 8px; margin-top: 8px; }
```

```text
src/components/ProductCard.tsx
```

```tsx
import './ProductCard.css'; // or a CSS module — Part 12

export interface Product {
  id: string;
  name: string;
  price: number;
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="card">
      <h3 className="card__title">{product.name}</h3>
      <p className="card__price">₹{product.price}</p>
      <div className="card__actions">
        <button className="button">Add to cart</button>
      </div>
    </article>
  );
}
```

Notice:

- The structure is HTML you already know.
- The class names are ordinary CSS class names.
- The only React-specific things are `className`, `import` of the stylesheet and
  `{product.name}` expressions. Everything else is the CSS you just learned.
- `import './ProductCard.css'` works because **Vite** (Part 16) understands CSS
  imports and injects them into the page. That single line is the standard way to
  attach a stylesheet to a component in a modern React project.

> 💡 Note the class naming style `card__title` — that is **BEM**
> (Block `card`, Element `card__title`, Modifier `card--primary`). It exists to
> keep specificity flat and names unique without a build tool. You will see it
> in real codebases, and Part 12 explains alternatives (CSS Modules, Tailwind).

---

## 10. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| Missing `box-sizing: border-box` | Elements wider than expected; horizontal scrollbars | add the global reset |
| Font sizes in `px` | Users who enlarged their browser font still see tiny text | use `rem` |
| Fighting specificity with `!important` | CSS becomes unmaintainable; nothing overrides anything | keep one class per element |
| Styling with `div` + class for everything | Bad accessibility, no keyboard support (see previous file) | semantic tag + class |
| `margin` between siblings | Unexpected gaps (margin collapse) | `display: flex; gap: ...` |
| `outline: none` on focus | Keyboard users cannot see where they are | use `:focus-visible` with a visible ring |
| Inline styles for everything in React | No hover/media queries; unreadable components | class for static, `style` for dynamic |
| `style="..."` (string) in React | Error: `The style prop expects a mapping from style properties to values, not a string` | pass an object |
| `'background-color'` in a React style object | TypeScript error and no effect | camelCase: `backgroundColor` |
| `width: 100vh` on mobile | Content hidden behind the browser toolbar | `100dvh` or `min-height` |
| Hardcoded colours everywhere | Inconsistent UI; painful rebranding | CSS custom properties (design tokens) |

---

## 11. Practice exercises

### Beginner

Style this markup so it looks like a clean product card: 320px wide, 16px
padding, a light border, rounded corners, the title and price on one row with the
price pushed to the right, and a full-width "Add to cart" button at the bottom.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Card</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <article class="card">
      <div class="card__row">
        <h3 class="card__title">Mechanical Keyboard</h3>
        <span class="card__price">₹4,999</span>
      </div>
      <p class="card__desc">Hot-swappable, RGB backlight, 75% layout.</p>
      <button class="button button--primary">Add to cart</button>
    </article>
  </body>
</html>
```

**Solution**

```css
/* styles.css */
*,
*::before,
*::after { box-sizing: border-box; }
* { margin: 0; }

body {
  font-family: system-ui, sans-serif;
  line-height: 1.5;
  padding: 24px;
  background: #f3f4f6;
}

.card {
  width: 320px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between; /* price pushed to the right */
  gap: 8px;
}

.card__title { font-size: 1.125rem; }
.card__price { color: #2563eb; font-weight: 600; }
.card__desc  { color: #6b7280; font-size: 0.875rem; }

.button {
  padding: 10px 16px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font: inherit;
  cursor: pointer;
  transition: background-color 120ms ease;
}
.button:hover { background: #1d4ed8; }
.button:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
```

Then this same card as a React component:

```text
src/components/ProductCard.tsx
```

```tsx
export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="card">
      <div className="card__row">
        <h3 className="card__title">{product.name}</h3>
        <span className="card__price">₹{product.price.toLocaleString('en-IN')}</span>
      </div>
      <p className="card__desc">{product.description}</p>
      <button className="button button--primary">Add to cart</button>
    </article>
  );
}
```

**Expected result:** a light-grey page with a white rounded card; title on the
left, blue price on the right; grey description; blue button that darkens on
hover and shows a focus ring when tabbed to.

### Intermediate

Build a **responsive** page: a header (logo left, nav right), a main area with a
grid of 6 cards, and a footer. On phones the grid must be one column; from 640px
two columns; from 1024px three columns. The header must stack its logo and nav
vertically on phones. Use design tokens for colours and spacing, and make the
nav links keyboard-accessible with a visible focus ring.

**Solution**

```css
/* styles.css */
:root {
  --space-2: 0.5rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --color-bg: #f9fafb;
  --color-surface: #ffffff;
  --color-border: #e5e7eb;
  --color-text: #111827;
  --color-muted: #6b7280;
  --color-primary: #2563eb;
  --radius: 12px;
}

*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; }

body {
  font-family: system-ui, sans-serif;
  line-height: 1.5;
  background: var(--color-bg);
  color: var(--color-text);
}

/* ---------- layout shell ---------- */
.shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.shell__main {
  flex: 1; /* pushes footer down on short pages */
  padding: var(--space-6) var(--space-4);
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}

/* ---------- header ---------- */
.header {
  display: flex;
  flex-direction: column;   /* phone first */
  gap: var(--space-2);
  align-items: flex-start;
  padding: var(--space-4);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.header__logo { font-weight: 700; text-decoration: none; color: var(--color-text); }

.nav-list {
  display: flex;
  gap: var(--space-4);
  list-style: none;
  padding: 0;
}
.nav-list a {
  color: var(--color-muted);
  text-decoration: none;
  padding: var(--space-2);
  border-radius: 6px;
}
.nav-list a:hover { color: var(--color-primary); background: #eff6ff; }
.nav-list a:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }

/* ---------- grid ---------- */
.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-4);
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  padding: var(--space-4);
}
.card h2 { font-size: 1.05rem; margin-bottom: var(--space-2); }
.card p  { color: var(--color-muted); font-size: 0.9rem; }

.footer {
  padding: var(--space-4);
  text-align: center;
  color: var(--color-muted);
  font-size: 0.85rem;
  border-top: 1px solid var(--color-border);
}

/* ---------- breakpoints (mobile-first) ---------- */
@media (min-width: 640px) {
  .header { flex-direction: row; align-items: center; justify-content: space-between; }
  .grid   { grid-template-columns: repeat(2, 1fr); }
}

@media (min-width: 1024px) {
  .header { padding-inline: var(--space-6); }
  .grid   { grid-template-columns: repeat(3, 1fr); }
}
```

```html
<body>
  <div class="shell">
    <header class="header">
      <a class="header__logo" href="/">MegaShop</a>
      <nav aria-label="Main">
        <ul class="nav-list">
          <li><a href="/">Home</a></li>
          <li><a href="/products">Products</a></li>
          <li><a href="/cart">Cart</a></li>
        </ul>
      </nav>
    </header>

    <main class="shell__main">
      <div class="grid">
        <article class="card"><h2>Widget</h2><p>Compact and useful.</p></article>
        <article class="card"><h2>Gadget</h2><p>Does one thing well.</p></article>
        <article class="card"><h2>Doohickey</h2><p>You know you want it.</p></article>
        <article class="card"><h2>Thingamajig</h2><p>Now with more jig.</p></article>
        <article class="card"><h2>Gizmo</h2><p>Classic.</p></article>
        <article class="card"><h2>Contraption</h2><p>Surprisingly sturdy.</p></article>
      </div>
    </main>

    <footer class="footer">© 2026 MegaShop</footer>
  </div>
</body>
```

**Why it works**

- `min-height: 100dvh` on the shell + `flex: 1` on main puts the footer at the
  bottom even with little content.
- Mobile-first: the default rules are the phone layout; media queries only *add*.
- Resize the window slowly and watch the columns appear at 640px and 1024px.
- `flex-wrap` is not needed in the nav here, but `gap` keeps spacing consistent
  when it does wrap.

### Challenge

Take the intermediate solution and add a **dark theme toggled by a class on the
root element**, without duplicating any component CSS. Requirements:

1. Light theme is the default.
2. Adding the class `theme-dark` to `<html>` switches every colour.
3. The toggle must be a real `<button>` that says what it does, and the choice
   must be visible immediately.
4. Write the equivalent in React: a `ThemeToggle` component using
   `useState` and `useEffect` to set the class on `document.documentElement`.

*Hint: define all colours as custom properties inside `:root`, and redefine the
colour variables inside `.theme-dark`. Everything else already uses `var(...)`,
so nothing else changes.*

**Solution**

```css
/* Add to styles.css — the only new CSS you need */
:root {
  --color-bg: #f9fafb;
  --color-surface: #ffffff;
  --color-border: #e5e7eb;
  --color-text: #111827;
  --color-muted: #6b7280;
  --color-primary: #2563eb;
}

.theme-dark {
  --color-bg: #0b1220;
  --color-surface: #111c2f;
  --color-border: #1f2a3d;
  --color-text: #e5e7eb;
  --color-muted: #9aa4b2;
  --color-primary: #60a5fa;
}

/* Because every component uses var(--color-*), the theme "just works". */
/* One exception: the hardcoded #eff6ff hover in .nav-list a:hover → tokenise it */
.nav-list a:hover { color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 12%, transparent); }
```

```html
<!-- Plain HTML version -->
<button id="theme-toggle" type="button" aria-pressed="false">Dark mode</button>
<script>
  const btn = document.getElementById('theme-toggle');
  const root = document.documentElement;

  btn.addEventListener('click', () => {
    const isDark = root.classList.toggle('theme-dark');
    btn.setAttribute('aria-pressed', String(isDark));
    btn.textContent = isDark ? 'Light mode' : 'Dark mode';
  });
</script>
```

```text
src/components/ThemeToggle.tsx
```

```tsx
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'theme';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
  // 1. Saved preference wins
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;

  // 2. Otherwise follow the operating system
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  // Keep the DOM in sync with React state — this is a textbook useEffect
  useEffect(() => {
    document.documentElement.classList.toggle('theme-dark', theme === 'dark');
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <button
      type="button"
      aria-pressed={theme === 'dark'}
      onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
    >
      {theme === 'dark' ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
```

**Why this solution is good**

- **The theme lives in CSS, not in JavaScript.** React only toggles one class.
  Adding a third theme later is a CSS-only change.
- `getInitialTheme` is passed as a **lazy initialiser** (a function, not a call):
  React runs it only on the first render, and only once — not on every render.
  You will meet this exact pattern again in Part 4, `useState`.
- The `useEffect` **synchronises** React state with an external system (the DOM
  class list and `localStorage`). That is precisely what effects are for.
- `aria-pressed` tells screen-reader users whether the toggle is on — colour and
  text alone are not enough for everyone.
- Functional update `setTheme(current => ...)` is used because the new value
  depends on the old one. (Part 4 explains why this matters.)

> Note: this challenge uses `useState`/`useEffect`, which you have not studied
> yet. You are not expected to fully understand it now — the point is to see that
> **CSS does the styling and React only flips a switch.** When you reach Part 4,
> come back and read this component again; it will feel obvious.

---

## 12. Summary

- CSS attaches three ways: **external sheet** (default), **inline** (dynamic
  values only), `<style>` (rare).
- In React, `style` is an **object with camelCase keys**:
  `style={{ fontSize: '1rem' }}`.
- `class` becomes **`className`**, and class names can be computed strings.
- The **box model** is content → padding → border → margin, and
  `box-sizing: border-box` makes widths sane.
- Use **`rem`** for fonts, **design tokens** (CSS custom properties) for colours
  and spacing, and **`gap`** instead of margins between siblings.
- **Flexbox** for one dimension, **grid** for two, `display: flex; gap` for
  predictable stacking.
- **Mobile-first** media queries with `min-width`.
- Always style **states**: hover, `:focus-visible`, active, disabled.
- Theming = override custom properties on a parent class; React just toggles the
  class.

**What's next →** [`03-javascript-basics.md`](./03-javascript-basics.md): the
language React is written in, starting from variables.
