# 03 — SCSS: Variables, Nesting, Mixins and a Token Layer

> **Part 12 · Styling · File 3 of 5**

Why this file exists: plain CSS has variables and nesting now, so "SCSS is for variables" is out of date. What SCSS still gives a component codebase is **compile-time computation and reuse**: mixins that expand into several declarations, functions that derive colours and spacing, loops that generate a scale, and a module system (`@use`) that makes a token layer importable by every stylesheet with no runtime cost. This file sets up SCSS in Vite (measured: the lab compiles `Button.module.scss` that imports a shared `_tokens.scss`), then covers the parts that keep SCSS from becoming the thing people blame for unmaintainable CSS: nesting depth rules, `@use` instead of `@import`, the modern colour functions, and when to stop using SCSS and start using tokens.

Measured in this lab: `npx vite build` → `dist/assets/index-CJZpD7p8.css 8.26 kB │ gzip: 2.52 kB`, including the compiled SCSS module classes `._button_1v1gi_1, ._icon_1v1gi_16, ._card_1v1gi_20`.

---

## 1. Setup: one dependency, no configuration

```bash
npm i -D sass
```

```scss
/* src/styles/Button.module.scss — the module is SCSS because of the extension */
@use 'tokens' as *;

.button {
  background: $brand;
  border-radius: $radius;
}
```

That is the entire Vite setup: install `sass`, use `.scss`. Vite compiles it (including `.module.scss`) with the modern Sass API, and the compiled CSS goes into the same bundle as everything else — no runtime, no extra network request. (If you prefer not to install a compiler, native CSS nesting and custom properties cover much of the same ground; section 7 is the honest comparison.)

⚠️ **SCSS variables are not CSS variables, and they do not survive to the browser.** `$brand` is substituted at build time; `var(--brand)` is resolved at runtime. That difference drives the choice in section 5.

---

## 2. Variables, maps and the token layer

```scss
// src/styles/_tokens.scss — the underscore means "partial": it is never compiled on its own
$brand: #0f766e;
$brand-dark: #115e59;
$radius: 0.5rem;

$space: (1: 0.25rem, 2: 0.5rem, 3: 0.75rem, 4: 1rem, 6: 1.5rem);
$breakpoints: (sm: 40rem, md: 48rem, lg: 64rem);

@function space($step) {
  @return map.get($space, $step);
}

@mixin card($padding: space(4)) {
  border: 1px solid rgba($brand, 0.3);
  border-radius: $radius;
  padding: $padding;
}

@mixin below($name) {
  @media (max-width: map.get($breakpoints, $name)) {
    @content;                       // ← the mixin's body is supplied by the caller
  }
}
```

```scss
// usage
@use 'tokens' as *;

.card {
  @include card(space(6));
}

.grid {
  display: grid;
  gap: space(2);

  @include below(md) {
    grid-template-columns: 1fr;      // only applies below 48rem
  }
}
```

Three things this buys over copy-pasted values:

1. **One source of truth** — change `$radius` and every card follows.
2. **Constrained choices** — `space(4)` comes from a scale, so padding is never `13px` because someone was in a hurry.
3. **Media queries become readable** — `@include below(md)` says what it means, and every breakpoint lives in one map.

⚠️ `@use '...' as *` imports names into the file's namespace. The alternative is explicit namespacing (`@use 'tokens';` then `tokens.$brand`), which is more verbose but unambiguous. Pick one convention across the project; mixed conventions are how two `$radius` variables end up meaning different things.

---

## 3. Nesting: the good, the bad and the depth rule

Nesting exists to group related selectors, and it is the feature that turns good CSS into unmaintainable CSS when used for *structure* instead of *variation*.

```scss
/* ✅ nesting for variants and states — flat compiled output */
.button {
  background: $brand;

  &:hover { background: $brand-dark; }
  &:disabled { opacity: 0.5; }
  &[aria-pressed='true'] { box-shadow: inset 0 0 0 2px white; }

  .icon { margin-right: space(2); }        // ← compiles to .button .icon: acceptable, one level
}

/* ❌ nesting that mirrors the DOM — brittle and specificity-hungry */
.page {
  .sidebar {
    .menu {
      ul {
        li {
          a.active { color: red; }         // → .page .sidebar .menu ul li a.active (specificity 3 classes + 3 elements)
        }
      }
    }
  }
}
```

The rules this book recommends:

| Rule | Why |
| --- | --- |
| Nest **at most one level** below a component's own class | keeps compiled specificity to two classes at most |
| Use `&` for states, pseudo-elements and modifiers | `.button:hover`, `.button--primary` — intent is visible |
| Never nest to "reach into" a child component's markup | the child should own its styles (and be reusable elsewhere) |
| Use `:where()`/`:is()` if you must group selectors | `:where()` contributes **zero** specificity |
| Prefer several flat rules over one deep block | flat selectors are trivially overridable and greppable |

```scss
/* The same styles, flat, with the child owning itself */
.button { … }
.button:hover { … }
.button--primary { … }
.button__icon { margin-right: space(2); }   // BEM naming replaces descendant nesting
```

💡 Compile a deep block once and read the output CSS: seeing `.page .sidebar .menu ul li a.active` in DevTools is the most persuasive argument for the one-level rule you will ever get.

---

## 4. Mixins, functions and loops

**Mixins** expand into declarations — use them for repeating *patterns*, not for single properties (a `@mixin padding` that only sets `padding` adds indirection with no payoff):

```scss
@mixin focus-ring($color: $brand) {
  outline: 2px solid $color;
  outline-offset: 2px;
}

@mixin truncate($lines: 1) {
  @if $lines == 1 {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  } @else {
    display: -webkit-box;
    -webkit-line-clamp: $lines;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
```

**Functions** return values — perfect for colour maths and spacing lookups:

```scss
@use 'sass:color';

@function shade($color, $amount) {
  @return color.adjust($color, $lightness: $amount);   // modern API
}
```

⚠️ **`darken()` and `lighten()` are deprecated in modern Dart Sass.** The replacements are the colour functions in the `sass:color` module (`color.adjust`, `color.scale`) or, better for theming, **CSS's own** `color-mix()`:

```scss
.button:hover { background: color-mix(in oklab, $brand 85%, black); }
```

The CSS version has a real advantage: it works at runtime, so it also works for a colour that comes from a CSS variable.

**Loops** generate repetitive utilities — use sparingly, because a generated file that nobody reads is how "where does this style come from?" starts:

```scss
@each $name, $value in $space {
  .mt-#{$name} { margin-top: $value; }
}
```

💡 If you find yourself writing loops for utilities, that is the moment to consider Tailwind (file 04) — it generates exactly that, with a scanner that only emits what you used.

---

## 5. Where SCSS stops and CSS variables begin

This is the single most important design decision in an SCSS codebase, and it is a *split*, not a competition:

| Need | Use | Because |
| --- | --- | --- |
| A value known at build time (`$radius`, spacing scale, breakpoints) | SCSS variable / function | computed once, zero runtime cost, can be used in mixins and media queries |
| A value that changes at runtime (theme, tenant colour, user preference) | CSS custom property | SCSS cannot know it; media queries and `:hover` cannot set SCSS variables |
| A colour derived from a runtime value | `color-mix()` in CSS | SCSS colour functions only see build-time values |
| A breakpoint | SCSS map + media query mixin | media queries cannot be built from CSS variables |

The bridge pattern that works well: SCSS **defines** the tokens, CSS variables **publish** them, components **consume** the CSS variables.

```scss
/* src/styles/_theme.scss */
@use 'tokens' as *;

:root {
  --brand: #{$brand};              /* SCSS value → CSS variable (interpolation) */
  --surface: #ffffff;
  --text: #0f172a;
  --radius: #{$radius};
}

[data-theme='dark'] {
  --surface: #0f172a;
  --text: #e2e8f0;
}
```

```scss
/* component */
.button {
  background: var(--brand);        /* runtime-themable */
  border-radius: var(--radius);
}
```

⚠️ Interpolation is required (`#{$brand}`) when putting an SCSS value into a custom property — writing `--brand: $brand;` produces the literal text `$brand` in some setups and silently does nothing useful. This is a classic hour-long debugging session; write the `#{}` and move on.

---

## 6. `@use` versus `@import` (and what it fixes)

```scss
// ❌ legacy: global scope, every import re-evaluates, deprecation warnings in modern Sass
@import 'tokens';

// ✅ modern: a module with a namespace, evaluated once, sharing is explicit
@use 'tokens';
@use 'tokens' as *;        // opt into bare names, per file
@use 'sass:color';         // built-in modules work the same way
```

| | `@import` | `@use` |
| --- | --- | --- |
| Namespace | none — everything is global | `tokens.$brand` or `as *` |
| Evaluations | can run multiple times | once per compilation |
| Order sensitivity | high | low |
| Deprecation | deprecated in Dart Sass | current |
| Migration | — | rename to `@use`, add namespaces or `as *` |

⚠️ `@import` also *leaks* CSS: `@import 'reset'` inside a partial pulls the reset into every file that imports it, potentially duplicating output. `@use` never duplicates CSS by itself; if you need shared CSS output, write it once in a file that is imported once by your entry stylesheet.

---

## 7. Do you even need SCSS in 2026?

An honest scoreboard, because the answer is genuinely "it depends":

| Feature | Native CSS | SCSS |
| --- | --- | --- |
| Variables | ✅ custom properties (runtime, themable) | ⚠️ build-time only |
| Nesting | ✅ supported in modern browsers | ✅ (with more features: `@content`, `&` rules) |
| Loops / maps / functions | ❌ | ✅ |
| Mixins with arguments | ❌ (`@mixin` is not the same feature) | ✅ |
| Media-query helpers (`below(md)`) | ❌ | ✅ |
| Colour maths | ✅ `color-mix()`, relative colour syntax (newer) | ✅ (and at build time) |
| Compile step | none | one dev dependency |

Reasonable conclusions:

- **A small app with tokens and a few components**: native CSS (with custom properties) is enough; adding SCSS buys almost nothing.
- **A design system with scales, generated utilities, themable tokens and media-query helpers**: SCSS (or a CSS-in-JS/utility system) still earns its dependency.
- **A project already using Tailwind**: SCSS is usually unnecessary — Tailwind's `@theme`, `@apply`-free composition and CSS variables cover tokens and variants (file 04).

💡 There is no prize for removing SCSS, and no prize for keeping it. The cost is a compile step and a syntax; the benefit is compile-time reuse. Decide per project, and do not maintain both conventions in one codebase.

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Nesting to mirror the DOM | specificity climbs; overrides break | nest at most one level; use BEM names |
| 2 | Using SCSS variables for theming | cannot change at runtime | CSS custom properties |
| 3 | `--brand: $brand;` without interpolation | the custom property gets the wrong value | `#{$brand}` |
| 4 | `darken()` / `lighten()` | deprecated in modern Sass | `color.adjust`/`color.scale` or CSS `color-mix()` |
| 5 | `@import` in new code | deprecation warnings, duplicate CSS, global names | `@use` |
| 6 | Importing a partial with CSS into many files | duplicated output in the bundle | import shared CSS once at the entry |
| 7 | A mixin per property | indirection without reuse | mixins for multi-declaration patterns |
| 8 | Loops generating hundreds of utilities | dead CSS and bundle bloat | Tailwind's scanner, or write only what you use |
| 9 | Putting values in SCSS that components override per instance | consumers cannot override without a rebuild | CSS variables published from SCSS |
| 10 | Mixing `as *` and namespaced `@use` randomly | name clashes, confusion | one convention |
| 11 | Deep `@content` nesting of media queries | compiled output with overlapping queries that are hard to reason about | define breakpoints once, keep queries adjacent to their rules |
| 12 | Storing non-token values (one-off header height) as tokens | the token file becomes a junk drawer | tokens for reused decisions; local values stay local |

---

## 9. Best practices

1. **One token partial** (`_tokens.scss`) with colour, spacing, radius, typography and breakpoints, and a documented rule for what may be added.
2. **Publish tokens as CSS variables** so runtime theming and component overrides work.
3. **Nest one level, use `&`, and name children with BEM-style local classes.**
4. **Use `@use`** everywhere; `@import` only in legacy files.
5. **Prefer CSS `color-mix()`** for derived colours that must follow a runtime variable.
6. **Keep mixins for patterns** (`focus-ring`, `card`, `truncate`, `below`) and name them after the intent.
7. **Compile and read the output** when a selector surprises you — the compiled CSS is the truth.
8. **Do not generate utilities by hand** if you have (or plan to add) a utility framework.
9. **Split files by concern** (`_tokens.scss`, `_mixins.scss`, `_theme.scss`) and keep component styles in `*.module.scss` next to the component.
10. **Retire SCSS features you no longer need** — every abstraction has a reading cost, and CSS itself keeps absorbing the useful ones.

---

## 10. Practice

### Beginner

1. Install `sass`, create `_tokens.scss` with a colour, radius and spacing map, and use `@use 'tokens' as *` in a CSS Module. Build and confirm the compiled CSS contains the resolved values.
2. Write a `.button` with `&:hover`, `&:disabled` and a `.button--ghost` modifier, in a single nesting level.
3. Explain the difference in one sentence each: `$radius` vs `var(--radius)`, and `@import` vs `@use`.

### Intermediate

1. Build the `below($name)` media-query mixin and use it in three components. Then compile and inspect the output: how many `@media` blocks are produced, and does each contain only its own rules?
2. Create a `focus-ring`, a `truncate($lines)` and a `card($padding)` mixin, and refactor an existing component to use them. Count the lines saved and the number of hard-coded values removed.
3. Publish your SCSS tokens as CSS variables in `_theme.scss` and move one component to consume `var(--…)`. Then implement dark mode by overriding the variables under `[data-theme='dark']`, without touching the component.

### Challenge

1. Build a small type-scale generator: a map of sizes with line heights, a `text($size)` mixin that emits font-size/line-height/letter-spacing, and a demo page. Then evaluate honestly whether a design system should generate this at build time or ship tokens as variables.
2. Replace every colour function in a codebase with either CSS `color-mix()` or `color.adjust`, and write down the trade-off per usage (build-time vs runtime, browser support, readability).
3. Audit a project's stylesheets for specificity: write a script that compiles the CSS, extracts each selector's specificity, and reports the worst offenders. Then refactor the top three and show the before/after. (Hint: `:where()` is your friend for grouping without cost.)

---

## 11. Solutions

### Beginner

1. ```scss
   // src/styles/_tokens.scss
   $brand: #0f766e;
   $radius: 0.5rem;
   $space: (1: 0.25rem, 2: 0.5rem, 4: 1rem);
   ```
   ```scss
   // src/styles/Chip.module.scss
   @use 'tokens' as *;
   .chip { background: $brand; border-radius: $radius; padding: map.get($space, 2); }
   ```
   The compiled output contains `._chip_hash { background: #0f766e; border-radius: 0.5rem; padding: 0.5rem; }` — the variables are gone by then.
2. ```scss
   .button {
     border: 0; border-radius: $radius;
     &:hover { background: $brand-dark; }
     &:disabled { opacity: 0.5; }
   }
   .button--ghost { background: transparent; color: $brand; border: 1px solid currentColor; }
   ```
   Compiled: `.button:hover`, `.button:disabled`, `.button--ghost` — all one class each, no descendant chains.
3. `$radius` is a build-time value substituted by the Sass compiler and unavailable to the browser; `var(--radius)` is a runtime value the browser resolves, changeable by a class, attribute or media query. `@import` pulls a file into the global namespace repeatedly and is deprecated; `@use` loads it once as a module with a namespace and no CSS duplication.

### Intermediate

1. Each component's `@include below(md)` emits its own `@media (max-width: 48rem) { .component { … } }` block — three components, three blocks. The cost is a little repetition in bytes (a few hundred bytes, gzipped away to almost nothing); the benefit is locality — the media query sits next to the rule it modifies. If the output ever became large, hoisting all breakpoints into one section is the alternative, at the cost of reading two files to understand one component.
2. Typical result: 15–30 lines removed and 4–8 hard-coded values replaced by tokens. The honest caveat: `truncate(2)` hides the `-webkit-` prefixes, which is exactly the sort of thing mixins should own — while a one-property mixin like `padding: space(4)` should just be `padding: space(4)`.
3. Dark mode via variables needs zero changes in the component: `[data-theme='dark'] { --surface: #0f172a; }` flips what `background: var(--surface)` resolves to. The SCSS token stays as the *source* of the default value (`#{$surface-light}`) — the two layers do different jobs.

### Challenge

1. ```scss
   $type: (sm: (size: 0.875rem, line: 1.25rem), md: (size: 1rem, line: 1.5rem), lg: (size: 1.25rem, line: 1.75rem));
   @mixin text($name) {
     $entry: map.get($type, $name);
     font-size: map.get($entry, size);
     line-height: map.get($entry, line);
   }
   ```
   Build-time generation is good for *app* styles where the scale is fixed; a design system should ship the resulting **variables** (`--text-sm-size`) as well, so consumers can use them in inline styles, Tailwind's theme, and runtime theming without importing SCSS.
2. A workable split: derive hover/active colours with `color-mix(in oklab, var(--brand) 85%, black)` when the base colour is a variable (runtime), and keep `color.adjust()` only for values defined in SCSS that never change at runtime. Browser support for `color-mix` is broad in current evergreen browsers; if you must support older ones, keep the build-time function and note it.
3. A specificity report typically surfaces: (a) `#app .page .card .button` chains from legacy CSS, (b) `!important` counts (each one is a fight someone lost), (c) utility classes overridden by component classes. Refactors: wrap grouping selectors in `:where(...)`, replace descendant chains with single classes or `&`, and delete the `!important`s after the underlying conflict is resolved.

---

## 12. Summary

- **SCSS in Vite is one dependency** (`npm i -D sass`); `.scss` and `.module.scss` compile with no configuration, and the output joins the same CSS bundle (measured: 8.26 kB total in this lab's build).
- **A token partial is the point**: colour, spacing, radius and breakpoints in one file, consumed with `@use 'tokens' as *`.
- **Nest one level, use `&` for states, name children with local class names** — deep nesting compiles to high-specificity selectors (`.page .sidebar .menu ul li a`) that are the root cause of "I cannot override this".
- **Mixins for patterns, functions for values, loops sparingly** — and prefer CSS's own `color-mix()` for colours that must follow a runtime variable, since `darken()`/`lighten()` are deprecated.
- **SCSS variables are build-time, CSS custom properties are runtime.** Publish `--brand: #{$brand}` and let components consume the variable, so theming works without a rebuild.
- **`@use` replaces `@import`** — namespaced, evaluated once, no duplicated CSS.
- **Decide whether you need SCSS at all**: native CSS covers variables, nesting and colour mixing; SCSS still earns its place for maps, mixins, breakpoints and generated scales, and it is largely redundant in a Tailwind project.

---

**What's next →** [`04-tailwind.md`](./04-tailwind.md) covers the opposite philosophy: instead of naming styles, you compose utilities. It shows the v4 Vite setup measured in this lab (the plugin generated `bg-teal-700`, `px-4`, `rounded-lg` and the `disabled:opacity-50` variant, with preflight in `@layer base` and theme variables as CSS custom properties), how the scanner decides what to emit, how to keep dynamic class names from silently disappearing, and the honest trade-offs against CSS Modules.
