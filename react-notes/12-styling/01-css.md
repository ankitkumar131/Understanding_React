# 01 — CSS in a React App: Global Styles, Imports and Inline Styles

> **Part 12 · Styling · File 1 of 5**

Why this file exists: React renders markup; CSS decides what it looks like, and the two are joined by a single attribute — `className`. That sounds trivial until a project grows: a class defined in one file changes a button in a different feature, a "quick fix" inline style defeats a whole stylesheet, and nobody can delete CSS because nobody knows what uses it. This file builds the foundation the next four files depend on: how plain CSS enters a Vite + React app, what the cascade and specificity actually do to your components, when inline styles are legitimate, and which parts of global CSS are worth keeping (resets, tokens, base typography) versus which are the problem.

Measured build output from this book's lab: `dist/assets/index-CJZpD7p8.css 8.26 kB │ gzip: 2.52 kB`.

---

## 1. The three ways a React element gets styled

```tsx
// src/part12/StylingDemo.tsx
<section className="card">                       {/* 1. a class from a stylesheet */}
  <button type="button" className={styles.button}>{label}</button>   {/* 2. a class from a CSS Module */}
  <p style={inlineStyle}>…</p>                   {/* 3. an inline style object */}
</section>
```

| | Global class | CSS Module class | Inline style |
| --- | --- | --- | --- |
| Where it lives | a `.css` file, loaded once | a `.module.css` file, scoped at build time | the JSX |
| Collision risk | **high** — same name = same rule | none (hashed names) | none |
| Dynamic values | via CSS variables or extra classes | via CSS variables or extra classes | directly, from props/state |
| `:hover`, media queries, `@keyframes` | yes | yes | **no** |
| Specificity fights | yes | rare | wins everything (except `!important` in a stylesheet) |
| Best for | resets, tokens, typography, layout primitives | component styles (file 02) | one-off, computed values |

The rest of this file is about the first and third columns; files 02–05 are about the second and the strategies built on it.

---

## 2. How global CSS enters a React app

In Vite, importing a CSS file from JavaScript is the whole wiring:

```tsx
// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';          // ← bundled, injected into the page
import { StylingDemo } from './part12/StylingDemo';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StylingDemo />
  </StrictMode>,
);
```

In development Vite injects the CSS into `<style>` tags (with HMR — editing the file updates the page without a reload); in a production build it extracts a single CSS file:

```text
$ npx vite build
dist/index.html                   0.45 kB │ gzip:  0.29 kB
dist/assets/index-CJZpD7p8.css    8.26 kB │ gzip:  2.52 kB
dist/assets/index-D2DivNcc.js   220.66 kB │ gzip: 69.13 kB
```

Two facts to take from that output:

1. **The CSS is a separate asset**, linked from the HTML — not inlined into the JS. A stylesheet blocks first paint, so its size and content matter (file 04 shows what that costs with a utility framework).
2. **All imported CSS is concatenated into one file**, in import order. Which brings us to the thing that bites teams: order is all that stands between two rules with the same specificity.

```css
// src/styles/global.css
.button { background: rebeccapurple; }        /* file 01: a global, generic name */
```

```scss
/* src/styles/Button.module.scss — its compiled class is ._button_1v1gi_1, so no fight here */
```

```text
=== generated class names (CSS Modules are hashed, Tailwind is generated) ===
module classes in the bundle: ._button_1v1gi_1, ._icon_1v1gi_16, ._card_1v1gi_20
```

Notice the contrast in that measurement: the module's `.button` became `._button_1v1gi_1` (safe), while the global `.button` in `global.css` stayed `.button` and will apply to **anything** in the app that uses that class — including a future component that has never heard of it. Generic global class names are the single most common cause of "why did this change?" in a growing React app.

---

## 3. The cascade and specificity, in the only amount you need

CSS resolves conflicting declarations with three questions, in order:

1. **Origin and importance** — `!important` beats normal declarations (and inline `!important` beats everything).
2. **Specificity** — an id (100) beats a class/attribute/pseudo-class (10) beats an element (1). Inline styles sit above all of them.
3. **Source order** — the later rule wins when specificity ties.

Applied to React, this means:

```css
/* ❌ three components fighting, and the winner depends on import order */
.button { background: teal; }
.card .button { background: navy; }
#checkout .button { background: crimson; }
```

```css
/* ✅ one rule per intent, flat specificity, deterministic */
.button { background: teal; }
.button--primary { background: navy; }
```

💡 The practical strategy for a component-based codebase: **keep specificity flat** (single-class selectors), never nest selectors to "target that button inside that card", and let *class names* express the variations (`button button--primary`) instead of descendant chains. Flat selectors also make overrides predictable for consumers of your components.

⚠️ **Inline styles win.** `<p style={{ color: 'red' }}>` cannot be overridden by a stylesheet class (short of `!important`), which is why one careless inline style can make a component's theme "broken" for every consumer. Use inline styles for values that are genuinely dynamic and local (a progress bar's width, a chart's height), not for colour/spacing decisions that belong to a stylesheet.

---

## 4. What belongs in global CSS

Global CSS is not the enemy; *unscoped component styles* are. A sane global stylesheet contains exactly four kinds of thing:

```css
/* src/styles/global.css */
@import 'tailwindcss';                     /* or a reset such as modern-normalize */

:root {                                    /* 1. design tokens as custom properties */
  --brand: #0f766e;
  --radius: 0.5rem;
  --space-2: 0.5rem;
  --font-sans: system-ui, sans-serif;
}

html {                                     /* 2. base element styles */
  font-family: var(--font-sans);
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
}

body { margin: 0; color: #1f2937; background: #f8fafc; }

:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }   /* 3. cross-cutting a11y */

@media (prefers-reduced-motion: reduce) {  /* 4. user-preference overrides */
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

Four rules of thumb for what to *keep out*:

| Keep out of global CSS | Why | Where it belongs |
| --- | --- | --- |
| `.button`, `.card`, `.modal` | generic names collide; the file becomes a junk drawer | a component's module (file 02) |
| Descendant chains targeting component internals | couples global CSS to component markup | the component's own stylesheet |
| Utility classes written by hand | inconsistent with the utility framework you may adopt | Tailwind (file 04) or a token layer |
| `!important` | the symptom of a specificity fight you have not resolved | fix the specificity |

💡 **Custom properties are the bridge between the two worlds.** A global token (`--brand`) can be consumed by a CSS Module, a Tailwind theme (file 04) and an inline style, which is how dynamic values (a user's chosen colour, a theme) stay out of the "inline style vs stylesheet" argument:

```tsx
<div style={{ '--progress': `${percent}%` } as CSSProperties}>
  <div className="bar" />
</div>
```

```css
.bar { width: var(--progress, 0%); }        /* the stylesheet owns the styling; JS owns the value */
```

⚠️ TypeScript does not allow unknown keys in `style` objects; the `as CSSProperties` cast (or a small typed helper) is the standard workaround for custom properties.

---

## 5. Inline styles: the honest guide

| Use inline styles for | Do not use them for |
| --- | --- |
| Computed geometry (`width`, `height`, `transform` from state) | hover/focus/active states (impossible) |
| A value coming from the server or user settings (`--accent`) | media queries / responsive breakpoints |
| Third-party positioning (tooltip coordinates, drag offsets) | theming decisions that should be overridable |
| A truly one-off tweak in a prototype | anything reused twice (make it a class) |

```tsx
// src/part12/StylingDemo.tsx
const inlineStyle = { color: 'var(--brand)', marginTop: '0.5rem' } as const;
```

Two further properties of inline styles worth knowing: they are **recreated objects on every render** (harmless for the DOM, but a `style` prop also changes identity, which matters if a memoised child compares props — Part 10, file 03), and they **cannot be expressed in a stylesheet**, so they defeat user stylesheets and some theming approaches.

---

## 6. Accessibility is part of styling

Styling decisions that break usability are styling bugs, and they belong in this file rather than a footnote:

| Concern | What to do | Why |
| --- | --- | --- |
| Focus visibility | never `outline: none` without a replacement; use `:focus-visible` | keyboard users cannot see where they are |
| Colour contrast | ≥ 4.5:1 for body text, 3:1 for large text and UI borders | WCAG AA — test with a contrast checker, not by eye |
| Motion | honour `prefers-reduced-motion` (the global rule above) | vestibular disorders |
| Colour alone | pair colour with an icon, text or shape | colour-blind users |
| Zoom | use `rem`/`em` for text sizes, avoid fixed pixel heights for text containers | browser zoom and OS text scaling |
| Dark mode | `prefers-color-scheme` or a `data-theme` attribute on `<html>` | user preference; see file 05 |

```css
@media (prefers-color-scheme: dark) {
  :root { --surface: #0f172a; --text: #e2e8f0; }
}
```

---

## 7. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Generic global class names (`.button`, `.card`) | collisions across features; changes break unrelated screens | CSS Modules (file 02) or a naming convention |
| 2 | Relying on import order for correctness | a new import silently changes the cascade | flat specificity and scoped styles |
| 3 | Deep descendant selectors | brittle coupling and specificity wars | single-class selectors, component-local styles |
| 4 | `!important` to fix a conflict | hides the design problem and breaks theming | resolve the specificity |
| 5 | Inline styles for theming | consumers cannot override; dark mode breaks | classes + CSS custom properties |
| 6 | `outline: none` with no focus replacement | inaccessible UI | `:focus-visible` styles |
| 7 | Fixed pixel font sizes everywhere | ignores user text scaling | `rem`/`em` |
| 8 | Importing component CSS globally by accident | the styles leak to the whole app | `*.module.css` for components |
| 9 | Styling with `div`s and classes only | screen readers get no semantics; also a styling smell | semantic elements first (`button`, `nav`, `label`) |
| 10 | A stylesheet nobody can delete | dead CSS grows forever | scoped styles (modules), or a utility scanner (file 04) |
| 11 | Duplicating brand values in ten files | a rebrand is a week of grep | tokens in one place |
| 12 | Testing styles by asserting class strings from a source file | refactors break tests for no user-visible reason | assert behaviour/roles, or visual snapshots |

---

## 8. Best practices

1. **Semantic HTML first, then styling.** A `<button>` that looks right beats a `<div>` that looks right.
2. **Scope component styles** (file 02) and keep the global sheet for tokens, reset, base elements and a11y rules.
3. **Define tokens once** as CSS custom properties and reuse them in modules, Tailwind's theme and inline values.
4. **Keep specificity flat**; express variation in class names.
5. **Use `rem`/`em` for sizes** and respect user preferences (`prefers-reduced-motion`, `prefers-color-scheme`).
6. **Never remove focus outlines**; style them.
7. **Let JS own values, CSS own presentation** — pass custom properties, not colours.
8. **Put the design decisions in one reviewable place** (tokens + a small set of primitives), so a rebrand is not a search-and-replace.
9. **Measure the CSS bundle** like any other asset; a framework that ships utilities you never use is a cost (file 04).
10. **Delete dead styles** on purpose: scoped styles and generated utilities make "is this used?" answerable, global CSS does not.

---

## 9. Practice

### Beginner

1. Import a global CSS file in a Vite app, add a `.card` class, and use it in two components. Then add a second `.card` rule later in the file with a different background and explain which wins and why.
2. Convert these to a defensible approach: `<div className="button" style={{ background: 'red', padding: 12 }}>Save</div>`.
3. Write the four global rules this file recommends for a new project (reset/base, tokens, focus, reduced motion).

### Intermediate

1. Put a progress bar in a component: the percentage comes from state, the styling from a stylesheet. Use a CSS custom property and explain why this beats `style={{ width: `${percent}%` }}` on the element you want to animate.
2. Build a dark-mode switch using `data-theme` on `<html>`, with tokens for light and dark, and no duplicated component CSS. Then extend it to respect `prefers-color-scheme` when the user has not chosen.
3. Take a component with a descendant-selector-based override (`.card .button { … }`) and refactor it to flat specificity. Write down what became possible afterwards (e.g. theming, reuse outside the card).

### Challenge

1. Audit a real project's global CSS: list every selector, classify it (token, base, layout, component style, dead), and propose a migration plan with the risky items called out. Include how you would verify nothing broke.
2. Design a token system for a design system: primitive tokens (`--teal-700`), semantic tokens (`--color-primary`, `--surface-raised`), and component tokens (`--button-bg`), with the rule for which layer components may consume. Then apply it to three components and evaluate the indirection honestly.
3. Redesign the focus and keyboard affordances of an app you have built: audit every interactive element for a visible `:focus-visible` state, contrast, and target size (≥ 24×24 CSS px, ideally 44×44 for touch). Document the before/after with screenshots or measurements.

---

## 10. Solutions

### Beginner

1. The later rule wins because both selectors have the same specificity (a single class) and the cascade falls back to source order. The lesson: in a codebase where imports decide order, "which `.card` applies?" is not answerable from the file you are editing — which is why component styles need scoping.
2. Use a real `<button type="button" className="…">Save</button>`, move the padding/colour into a module (or utility classes), and keep only genuinely dynamic values inline. The `div` is the more serious problem: it is not keyboard-focusable, has no button semantics, and needs ARIA to behave — a styling decision that created an accessibility bug.
3. ```css
   @import 'tailwindcss';                       /* or a reset */
   :root { --brand: #0f766e; --radius: 0.5rem; }
   html { font-family: system-ui, sans-serif; }
   :focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
   @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
   ```

### Intermediate

1. ```tsx
   <div className="progress" style={{ '--progress': `${percent}%` } as CSSProperties}>
     <div className="progress__bar" />
   </div>
   ```
   ```css
   .progress { background: #e2e8f0; height: 0.5rem; border-radius: 999px; }
   .progress__bar { background: var(--brand); height: 100%; width: var(--progress); transition: width 200ms ease; }
   ```
   The custom property keeps the *presentation* (colour, height, transition) in CSS where it can be themed and where `prefers-reduced-motion` can disable it, while JS supplies only the value. Animating `width` directly via inline styles also makes the animation untouchable by CSS media queries.
2. ```css
   :root { --surface: #ffffff; --text: #0f172a; }
   [data-theme='dark'] { --surface: #0f172a; --text: #e2e8f0; }
   @media (prefers-color-scheme: dark) {
     :root:not([data-theme='light']) { --surface: #0f172a; --text: #e2e8f0; }
   }
   body { background: var(--surface); color: var(--text); }
   ```
   The switch sets `document.documentElement.dataset.theme = theme` and persists the choice (localStorage — Part 4's rules about reading external state apply; ideally mirror it in a context so components can render an icon). No component CSS changes because everything reads tokens.
3. Flat version: `.card { }` and `.button { }`, with the override expressed as a modifier (`.button--in-card`) or by the card passing a token (`--button-bg`). What becomes possible: the button can live anywhere, the card can be themed without breaking the button, and both files can be moved without moving their styling.

### Challenge

1. Classification sketch: tokens (`:root { --… }`) — keep, maybe split into a `tokens.css`; base (`html`, `body`, `h1…`) — keep, review for resets duplicating Tailwind's preflight; layout primitives (`.container`, `.stack`) — keep, they are designed to be global; component styles (`.button`, `.card—*`) — migrate to modules; dead (selectors with zero matches in the src tree and in class strings) — delete after a visual pass. Verification: build before/after, compare rendered pages (screenshots on the main routes), and check the CSS bundle size reduction. Risk: overrides that were silently relying on import order — those are exactly where visual diffs will show up.
2. Three layers with a rule: **components may only consume semantic tokens** (`--color-primary`, `--surface-raised`), primitives exist for the theme layer, and component tokens are the escape hatch for a component's own knobs (`--button-bg` defaults to `--color-primary`). Applied: a button reads `--button-bg`; a card reads `--surface-raised` and passes a radius; a badge reads `--color-primary` with opacity. Honest evaluation: the indirection costs a lookup when reading code, and it pays for itself the first time a dark theme or a brand rewrite lands — if your app has one theme forever, two layers are enough.
3. A useful audit output is a table: element, role, `:focus-visible` present (yes/no), contrast ratio, target size, and the fix. Typical findings: icon-only buttons with no focus style, muted grey text below 4.5:1, 16 px tap targets on mobile, and a `div` that should be a `button`.

---

## 11. Summary

- **React and CSS meet at `className` and `style`.** Global classes are unscoped, module classes are hashed at build time (measured: `._button_1v1gi_1`), inline styles win everything.
- **CSS enters a Vite app through an import**; development injects `<style>` tags with HMR, production extracts one file (measured: `8.26 kB │ gzip: 2.52 kB`) that is concatenated **in import order** — which is why import-dependent styling is fragile.
- **Keep specificity flat** and express variation through class names; descendant chains and `!important` are how stylesheets become unmaintainable.
- **Global CSS should hold four things**: tokens (custom properties), base element styles, cross-cutting accessibility rules, and user-preference overrides. Component styles belong in modules (file 02).
- **Inline styles are for dynamically computed values**, not for theming or states — they cannot express `:hover`, media queries or themes. Pass custom properties instead, so CSS keeps ownership of presentation.
- **Accessibility is a styling concern**: focus visibility, contrast, motion preferences, dark mode and target sizes are part of the visual layer, and they are cheap to get right in a global sheet once.
- **Tokens are the bridge** between global CSS, CSS Modules, Tailwind and inline values — one place to change the brand.

---

**What's next →** [`02-css-modules.md`](./02-css-modules.md) takes the collision problem seriously: how CSS Modules scope class names (with the measured hashes from this build), how Vite configures them, `composes` and `:global`, how to type `styles` in TSX, `clsx` for conditional classes, and the places where modules quietly stop being enough.
