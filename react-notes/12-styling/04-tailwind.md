# 04 — Tailwind CSS: Utility-First, Measured

> **Part 12 · Styling · File 4 of 5**

Why this file exists: Tailwind is the most polarising choice in front-end styling, and most arguments about it are arguments about *philosophy* — "ugly class lists" versus "no naming" — when the practical questions are concrete: what ends up in the CSS bundle, how the tool decides that, what breaks when class names are built dynamically, and what the trade-offs are against CSS Modules (file 02). This file answers those with a real build from this book's lab: Tailwind v4 wired through Vite, a component styled with utilities, and the resulting `8.26 kB` stylesheet inspected — including which utilities were generated, that preflight lives in `@layer base`, and that variants like `disabled:opacity-50` are compiled into real selectors.

Measured in this lab: `npx vite build` → `dist/assets/index-CJZpD7p8.css 8.26 kB │ gzip: 2.52 kB`.

---

## 1. The model: styles as a constrained vocabulary

In file 02 you name a style (`.button`) and write its declarations. In Tailwind you *compose* declarations from a fixed vocabulary directly in the markup:

```tsx
// src/part12/StylingDemo.tsx
<button
  type="button"
  className="mt-4 rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
>
  {label} (tailwind)
</button>
```

Every class is one (or a few) CSS declarations: `px-4` is `padding-inline: 1rem`, `rounded-lg` is a radius, `bg-teal-700` is a colour from the theme, `hover:bg-teal-800` is a **variant** (the same declaration under `:hover`), and `disabled:opacity-50` is the same idea under `:disabled`.

Three consequences follow, and they are the entire trade-off:

| Consequence | What it means in practice |
| --- | --- |
| **No naming** | you never invent `.card-header--compact`; there is no naming debate and no dead name |
| **No dead CSS** | the scanner emits only the utilities that appear in your source (measured below) |
| **The markup gets long** | a complex component's `className` is a paragraph — and reading it means knowing the vocabulary |

💡 The vocabulary is *constrained on purpose*. `px-4` (not `padding-left: 13px`) makes "everything is on the spacing scale" the default, which is why teams report more consistent UIs after adopting it — the constraint does the work that code review was doing badly.

---

## 2. Setup in Vite (Tailwind v4)

```bash
npm i -D tailwindcss @tailwindcss/vite
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react({ compiler: true }), tailwindcss()],
});
```

```css
/* src/styles/global.css */
@import 'tailwindcss';      /* ← the whole framework entry: preflight + utilities + theme */
```

```text
$ npx vite build
✓ 19 modules transformed.
dist/index.html                   0.45 kB │ gzip:  0.29 kB
dist/assets/index-CJZpD7p8.css    8.26 kB │ gzip:  2.52 kB
dist/assets/index-D2DivNcc.js   220.66 kB │ gzip: 69.13 kB
```

Four measured facts from inspecting that CSS:

| Check | Result |
| --- | --- |
| Utilities used in the component were generated | `bg-teal-700` ✅, `px-4` ✅, `rounded-lg` ✅, `hover:bg-teal-800` ✅, `disabled:opacity-50` ✅ |
| Preflight (the base reset) is included | `@layer base{*,:after,:before,::backdrop{box-sizing:border-box;…}}` ✅ |
| Theme values are CSS variables | `--color-teal-700` present ✅ |
| A hand-written global rule survived alongside | `@media (prefers-reduced-motion)` kept ✅ |

The total stylesheet is **8.26 kB (2.52 kB gzip)**. That number is worth dwelling on: a utility framework's output is proportional to what you *use*, not to what it *ships*. A design system with hundreds of components and a broad utility surface will be larger — but it grows with usage, not with the framework.

⚠️ **Tailwind v4 is a Vite plugin, not a PostCSS config.** Tutorials written for v3 (`postcss.config.js`, `tailwind.config.js`, `content: [...]`, `@tailwind base/components/utilities`) do not describe this setup. If you copy v3 steps into a v4 project, you get an empty stylesheet and a confusing afternoon.

---

## 3. How the scanner decides what to emit

v4 scans your source files for **candidate strings** that look like utilities and emits the matching CSS. That word "strings" is the whole gotcha:

```tsx
// ✅ every class appears as a complete string → all four are generated
<div className={cx('p-4', isLarge && 'p-8', 'text-white')} />

// ❌ the scanner sees "p-" and "8"/"4" separately: nothing is generated
<div className={`p-${size}`} />

// ❌ same problem: the full class name never appears in the source
const CLASSES = { sm: 'p-2', md: 'p-4' };        // ✅ this IS found (the literals are here)
<div className={CLASSES[size]} />                  // ✅ so this works
```

```tsx
// ✅ when the value really is dynamic, use a complete class map
const padding = { sm: 'p-2', md: 'p-4', lg: 'p-8' } as const;
<div className={padding[size]} />
```

Rule of thumb: **the string `p-4` must exist literally somewhere in a source file** for the utility to exist in your CSS. Dynamic composition (`'p-' + size`) produces a class name that has no CSS rule at all — the symptom is "the styles work in one place and silently do nothing in another", usually first spotted in production.

⚠️ Two more scanner facts: it scans files in your project (not `node_modules`), and it reads string literals including ones inside arrays/maps — which is why the `CLASSES` map above works. It does **not** run your code.

---

## 4. Variants, states and responsiveness

Variants are Tailwind's answer to pseudo-classes and media queries, and they compose:

```tsx
<button
  className="
    bg-teal-700 text-white                 /* base */
    hover:bg-teal-800 active:bg-teal-900   /* states */
    focus-visible:outline-2 focus-visible:outline-offset-2 outline-teal-500
    disabled:opacity-50 disabled:cursor-not-allowed
    sm:px-3 md:px-4 lg:px-6                /* responsive, mobile-first */
    dark:bg-teal-600                       /* theme variant */
    motion-reduce:transition-none          /* user preference */
  "
>
```

| Variant | Meaning | Note |
| --- | --- | --- |
| `hover:`, `focus-visible:`, `active:`, `disabled:` | pseudo-classes | `focus-visible:` is the accessible choice over `focus:` |
| `sm:` `md:` `lg:` `xl:` `2xl:` | `min-width` media queries | **mobile-first**: base styles are the small screen, variants add up |
| `dark:` | `prefers-color-scheme` by default, or a class/attribute strategy | configure once (section 5) |
| `motion-reduce:`, `contrast-more:` | user-preference media queries | the same a11y rules from file 01, in the vocabulary |
| `group-hover:`, `peer-checked:`, `has-[]:` | styling a parent/sibling based on state | powerful; keep the DOM shallow enough to read |
| `aria-[...]:`, `data-[...]:` | state from ARIA/data attributes | the accessible way to express "selected", "loading" |

⚠️ **Read responsive variants as "and up".** `md:px-4` means "at `md` and above", so a component's base classes apply to phones and each breakpoint overrides upward. If a style should apply *only* between two breakpoints, you need `md:… lg:…` pairs (or a custom variant) — the mobile-first direction is not negotiable.

---

## 5. Theming: `@theme` and CSS variables

v4 moves theme configuration into CSS. Design tokens become variables, and Tailwind generates utilities from them:

```css
/* src/styles/global.css */
@import 'tailwindcss';

@theme {
  --color-brand: #0f766e;              /* → bg-brand, text-brand, border-brand … */
  --color-brand-strong: #115e59;
  --radius-card: 0.75rem;              /* → rounded-card */
  --font-display: 'Inter', system-ui;  /* → font-display */
  --spacing-gutter: 1.25rem;           /* → p-gutter, gap-gutter … */
}

/* Dark mode driven by an attribute instead of the OS preference */
@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));
```

```tsx
<button className="rounded-card bg-brand px-4 py-2 text-white hover:bg-brand-strong">
```

Three things worth knowing:

1. **Tokens are real CSS variables**, so they also work in inline styles, in SCSS-compiled rules and at runtime — the same bridge from file 03, with Tailwind as the consumer.
2. **`@theme` is the single place for brand values.** A rebrand changes one block, and every utility follows.
3. **The dark-mode strategy is a one-line decision** (`dark` variant based on a class/attribute or on the media query). Whichever you pick, keep it in one place; mixing strategies is how half the app goes dark.

---

## 6. Composing repeated styles without inventing class names

The two complaints about utility CSS are "the class list is unreadable" and "I repeat the same 12 classes". Both have answers that do not require abandoning the approach:

| Problem | Tool | Cost |
| --- | --- | --- |
| Long class lists in JSX | extract a **React component** (`<Button variant="primary">`) | a component, not a CSS abstraction — the best answer for reused UI |
| Repeated *non-component* patterns (a card shell in three places) | a local constant (`const cardClasses = cx('rounded-card border p-4')`) | indirection; fine when the pattern is stable |
| A design-system API for consumers | variant props mapping to class maps | the mapping must be exhaustive or classes vanish (section 3) |
| Genuinely repeated CSS in one project | `@utility` (v4) to define a custom utility | you are inventing vocabulary — do it deliberately |

```tsx
// src/components/Button.tsx — the pattern this book recommends
import { cx } from '../lib/cx';

const base = 'rounded-card font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50';
const variants = {
  primary: 'bg-brand text-white hover:bg-brand-strong',
  ghost: 'bg-transparent text-brand hover:bg-brand/10',
  danger: 'bg-red-600 text-white hover:bg-red-700',
} as const;
const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2', lg: 'px-6 py-3 text-lg' } as const;

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: { variant?: keyof typeof variants; size?: keyof typeof sizes } & ComponentPropsWithoutRef<'button'>) {
  return <button type="button" className={cx(base, variants[variant], sizes[size], className)} {...rest} />;
}
```

⚠️ Note what just happened: the *utility* classes live in a component file, and the component's API is the same `variant`/`size` vocabulary a CSS-Modules component would have (file 02, section 5). Tailwind does not remove the need for components — it removes the need for a stylesheet per component.

---

## 7. Honest trade-offs: Tailwind vs CSS Modules

| Criterion | Tailwind | CSS Modules |
| --- | --- | --- |
| Where styles live | in the markup | in a file next to the component |
| Naming | none | you name classes |
| Dead CSS | impossible (scanner) | possible if you forget to delete |
| Consistency | enforced by the scale | enforced by review |
| Reading a component | learn the vocabulary, read the class list | read two files |
| Dynamic values | class maps / inline styles / CSS variables | class maps / CSS variables |
| Theming | `@theme` tokens + variants | tokens + `[data-theme]` |
| Designers reading code | class names are opaque | semantic names are readable |
| Refactoring a look | edit the className | edit one CSS rule, all users change |
| Bundle size | proportional to usage (measured: 8.26 kB here) | proportional to what you wrote |
| CSS knowledge required | less (the vocabulary first) | more (cascade, specificity) |
| Best fit | product UIs built from a shared vocabulary, rapid iteration, consistent spacing | component libraries, teams with strong CSS skills, designs that do not map to a scale |

⚠️ The "semantic classes are better" argument and the "utilities are faster" argument are both true for their respective teams. The decision criteria that actually correlate with success: does your design follow a scale (Tailwind-friendly)? Do you have designers handing over custom one-off visuals (Modules-friendly)? Will many people edit styles without reading CSS (Tailwind-friendly)? Do you need a consumable component library API (either, but Modules make overrides easier via `className`)?

💡 **They are not mutually exclusive.** A common, workable combination: Tailwind for layout/spacing/colour in app code, plus one CSS Module for a genuinely bespoke component (an animated chart legend, a complex grid) that utilities express badly. What you must not do is half a component in each without a rule; adopt a boundary ("modules for the design-system primitives, utilities everywhere else") and write it down.

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | v3 config in a v4 project (`tailwind.config.js`, `content`, `@tailwind` directives) | no styles generated | `@tailwindcss/vite` + `@import 'tailwindcss'` |
| 2 | `className={`p-${size}`}` | classes never generated; styles silently missing | complete class map or literals |
| 3 | Reading responsive variants as "only at this size" | styles leak to larger breakpoints | they are `min-width` variants ("and up") |
| 4 | `focus:` instead of `focus-visible:` | focus rings appear on mouse clicks | `focus-visible:` |
| 5 | Hard-coded colours (`bg-[#0f766e]`) everywhere | no theming, no rebrand, inconsistent palette | `@theme` tokens |
| 6 | Long class lists copy-pasted between components | drift; the second copy always lags | extract a component |
| 7 | `!important`-style overrides via `!` prefix as a habit | specificity fights you cannot trace | pass a variant prop or a token |
| 8 | No `className` prop on wrapper components | consumers cannot adjust anything | accept and merge `className` last |
| 9 | Ignoring the a11y variants | focus/contrast/motion regressions | `focus-visible:`, contrast-aware colours, `motion-reduce:` |
| 10 | Assuming the framework ships a huge stylesheet | measured: 8.26 kB for a small app | measure your own CSS bundle |
| 11 | Building a design system API of arbitrary props | the class map grows exponentially | constrain to a variant union |
| 12 | Mixing Tailwind and hand-written component CSS without a boundary | two sources of truth for the same look | decide the boundary and document it |

---

## 9. Best practices

1. **Keep tokens in `@theme`** and use token utilities (`bg-brand`) instead of arbitrary values.
2. **Extract components, not class-name abstractions**, for anything used more than twice.
3. **Always include `focus-visible:` and `disabled:` states** in interactive components, and `motion-reduce:` where you animate.
4. **Never build class names dynamically**; use complete strings in a map.
5. **Use `cx` for conditional classes** — it keeps the JSX readable.
6. **Prefer `gap-*` over margins for spacing between siblings**; it survives reordering and conditional rendering.
7. **Read responsive variants as mobile-first**, and design the small screen first.
8. **Choose one dark-mode strategy** (media query or attribute) and configure it once.
9. **Measure the CSS bundle** in CI, so a stray `[*]`-heavy file or a forgotten arbitrary value shows up.
10. **Write the boundary down** ("utilities in app code, one module for X") so the next person does not have to guess.

---

## 10. Practice

### Beginner

1. Install Tailwind v4 in a Vite React project (section 2) and style one button with `bg-*`/`px-*`/`rounded-*`/`hover:`/`disabled:`. Build and confirm the utilities appear in the output CSS.
2. Convert these to Tailwind: `padding: 1rem 1.5rem; background: #0f766e; border-radius: 0.75rem; color: white; font-weight: 600;`.
3. Explain the difference between `p-4 md:p-8` and `md:p-8 p-4` (order in the class list does not matter — why not?).

### Intermediate

1. Add `@theme` tokens for brand colour, radius and font, and replace every hard-coded colour in a component with a token utility. Then change the token and confirm the change propagates.
2. Build the `Button` component from section 6 with three variants and three sizes, including focus/disabled states. Then add a `loading` state that shows a spinner and sets `aria-busy`.
3. Introduce a dynamic-size bug (`p-${size}`) in a component, verify in the build that the class is missing, then fix it with a class map and prove the CSS now contains all three paddings.

### Challenge

1. Implement dark mode with a `data-theme` attribute (not the media query), including a switch that persists the choice, `color-scheme` for form controls, and one component that also respects `prefers-color-scheme` when the user has not chosen. Then audit contrast in both themes with a script or tool.
2. Build a small design-system page with ten components using only tokens and utilities, plus a "no arbitrary values" lint rule. Measure the resulting CSS bundle and compare it with the equivalent CSS Modules implementation of the same ten components.
3. Write the migration plan for a CSS-Modules codebase moving to Tailwind (or the reverse), including: the boundary rule, the order of work, how to keep the app shippable, how to avoid duplicated styling during the transition, and the success metric (bundle size? stylesheet count? review time?).

---

## 11. Solutions

### Beginner

1. Expect the built CSS to contain `.bg-teal-700`, `.px-4`, `.rounded-lg`, `.hover\:bg-teal-800:hover` and `.disabled\:opacity-50:disabled` — exactly the patterns measured in section 2.
2. `px-6 py-4 bg-brand rounded-xl text-white font-semibold` (with `--color-brand: #0f766e` in `@theme`; the default palette's teal-700 is the alternative).
3. Both produce the same CSS. **Class list order in HTML does not matter** — only the order of rules *inside the stylesheet* matters for equal-specificity conflicts, and Tailwind emits its utilities in a fixed, deterministic order (variants after base utilities). That is a feature: you cannot break styling by reordering your class names.

### Intermediate

1. Tokens: `--color-brand`, `--radius-card`, `--font-display`. After replacing literals with `bg-brand rounded-card font-display`, changing `--color-brand` in one place updates every usage, and the dark theme can override the same variable.
2. The component API is `variant`/`size`/`isLoading`; the class maps are `as const` so the types are literal unions; `aria-busy={isLoading}` accompanies the spinner; the disabled state covers loading (`disabled={isLoading || rest.disabled}`) so a double submit is blocked in the UI as well (Part 11, file 02 adds the `ref` guard for the same-tick case).
3. Build with each size used and grep the output: with the template literal, `.p-2`, `.p-4`, `.p-8` are absent (the scanner saw only the fragments); after switching to the map, all three appear. The verification step — *grep the built CSS for the class you expect* — is the habit worth keeping from this exercise.

### Challenge

1. Implementation: `document.documentElement.dataset.theme = theme` + `localStorage`, an inline script in `index.html` that applies the stored theme before React renders (avoiding a flash — see Part 15), `@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *))`, and `@media (prefers-color-scheme: dark)` used as the default inside a `:root:not([data-theme])` rule. `color-scheme: light dark` on `:root` makes native controls (scrollbars, date pickers) follow. The contrast audit is a script computing WCAG ratios for the token pairs in both themes, run in CI so a designer's tweak cannot ship an unreadable combination.
2. Expect the Tailwind version's bundle to be dominated by preflight + the utilities used once per component; removing arbitrary values and using tokens typically reduces both bundles. The useful comparison is not bytes alone: also count *stylesheet files* (1 vs N), *class-name collisions* (0 vs 0 with modules), and *review time* (subjective — say so).
3. A workable migration: (a) write the boundary rule ("Tailwind for app code, modules for the three bespoke components"); (b) add Tailwind and convert the layout primitives first (they are low-risk and high-traffic); (c) convert one component at a time, deleting its module in the same PR; (d) allow both systems during the transition but forbid a single component using both without a comment; (e) metric: number of remaining module files (should trend to the boundary set) plus the CSS bundle size and the count of dead rules.

---

## 12. Summary

- **Tailwind replaces naming with a constrained vocabulary**, composed in the markup; variants (`hover:`, `focus-visible:`, `disabled:`, `md:`, `dark:`) are part of that vocabulary.
- **v4 setup is a Vite plugin plus `@import 'tailwindcss'`** — measured: the build emitted an **8.26 kB (2.52 kB gzip)** stylesheet containing only the utilities used, with preflight in `@layer base` and theme values as CSS variables (`--color-teal-700`).
- **The scanner matches complete strings in your source**: `p-${size}` generates nothing; a `{ sm: 'p-2', md: 'p-4' } as const` map works because the literals are present.
- **Responsive variants are mobile-first (`min-width`, "and up")**, and the class-list order in HTML never matters — only the stylesheet's order does.
- **Tokens live in `@theme`** and are real CSS variables, so dark mode and runtime theming follow the same one-block change as file 03's approach.
- **Long class lists are solved with components, not abstractions**: a `variant`/`size` API with `as const` class maps is the recommended shape.
- **Neither Tailwind nor CSS Modules wins universally** — the criteria that matter are whether your design follows a scale, who edits styles, and whether you are shipping a component library. Many teams use both with an explicit boundary.

---

**What's next →** [`05-component-styling.md`](./05-component-styling.md) turns the previous four files into a decision: a comparison table of every strategy (global, BEM, modules, SCSS, Tailwind, CSS-in-JS, vanilla-extract-style zero-runtime), the questions that decide it for a real team, recipes for small apps, design systems and legacy codebases, and the parts of styling that no strategy solves for you — theming, dark mode, a11y and migration.
