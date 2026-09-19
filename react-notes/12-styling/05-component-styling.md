# 05 — Choosing a Styling Strategy (and Living With It)

> **Part 12 · Styling · File 5 of 5**

Why this file exists: files 01–04 taught four tools and deliberately avoided a verdict. This file gives you one — a decision procedure, not a universal winner. Styling choices are expensive to reverse (every component touches them), so the goal here is to make the decision once, defensibly, and then to handle the parts that no strategy solves for you: theming, dark mode, accessibility, responsive design, and migrating from whatever you already have. It ends with the trade-offs stated as trade-offs, because the honest answer to "which is best?" is "for what, with whom, and how many components?"

---

## 1. The landscape, in one table

| Strategy | Scoping | Dynamic values | Theming | Bundle behaviour | Runtime cost | Best for |
| --- | --- | --- | --- | --- | --- | --- |
| **Global CSS + BEM** | naming convention only | CSS variables | tokens in `:root` | everything you wrote, always shipped | none | small apps, prototypes, teams with strong CSS skills |
| **CSS Modules** (file 02) | build-time hashing | CSS variables / class maps | tokens + `[data-theme]` | what you imported; dead classes vanish | none | component-level styles, component libraries |
| **SCSS + Modules** (file 03) | hashing + compile-time reuse | CSS variables | tokens published as variables | compiled once, dead code stays unless removed | none (build only) | design systems, scales, breakpoint helpers |
| **Tailwind** (file 04) | none needed (utilities are global but atomic) | class maps / variables | `@theme` tokens + `dark:` variant | proportional to usage (measured 8.26 kB in this lab) | none | product UIs, consistency, fast iteration |
| **CSS-in-JS (runtime)** e.g. styled-components/emotion | generated hashed classes | props → styles | theme provider | per-component styles in JS, grows with components | style computation + injection at runtime | apps that need deeply dynamic theming; **less attractive now** |
| **Zero-runtime CSS-in-JS** e.g. vanilla-extract, Linaria, StyleX | build-time extraction | CSS variables | token contracts | static CSS, extracted | none | design systems wanting typed styles without runtime cost |
| **Inline styles** | n/a | direct | limited | in the HTML | none | computed geometry and one-off values only (file 01) |

Two rows deserve a note, because they are where most stale advice lives:

- **Runtime CSS-in-JS** was the default recommendation of the late 2010s. It still works, but its costs — style computation during render, injection on the client, streaming/SSR complexity — are now avoidable, and the ecosystem's own authors moved toward compile-time approaches. Do not *start* a new app there in 2026; do not rush to rip it out of a working app either.
- **Zero-runtime CSS-in-JS** (vanilla-extract and friends) is the interesting middle: you get typed, colocated styles that compile to static CSS — the safety of CSS-in-JS with the delivery of CSS Modules. The cost is a build step and a smaller ecosystem.

---

## 2. The decision procedure

Ask these six questions in order; the first "yes" usually decides.

1. **Is there an existing design system or utility vocabulary?** → use it. Consistency with the team beats stylistic preference, always.
2. **Does the design follow a scale** (a spacing/size/colour palette) and get built by many hands, quickly? → **Tailwind** (file 04), with tokens in `@theme`.
3. **Are you shipping components other teams consume** (a library, a shared package)? → **CSS Modules** (+ tokens): `className` forwarding, predictable overrides, no runtime, no build-tool lock-in.
4. **Does the visual output depend heavily on runtime data** (dashboards, chart themes, tenant branding)? → **CSS variables + modules**, or zero-runtime CSS-in-JS if you want typed props.
5. **Is the app small and the team comfortable with plain CSS?** → **global CSS with tokens and BEM-ish names**. This is a legitimate answer, not a failure.
6. **Is the codebase legacy with three strategies already?** → stop adding; pick the target, define the boundary, migrate opportunistically (section 7).

```text
Design system exists? ──► use it
Many hands, scale-driven design? ──► Tailwind + @theme tokens
Consumable components? ──► CSS Modules + tokens (optionally SCSS)
Runtime-data-driven visuals? ──► CSS variables (+ typed styles if you want them)
Small app, plain CSS teams? ──► global CSS + tokens
Legacy mix? ──► pick a target, migrate opportunistically
```

---

## 3. Recipes

### Recipe A — small app (2–10 screens, 1–3 devs)

```text
src/styles/tokens.css        /* custom properties: colour, space, radius, type */
src/styles/global.css        /* reset/base + focus-visible + reduced-motion */
src/components/*.module.css  /* one module per component that needs more than utilities */
```

Rules: tokens only, no literal colours in components, one module per component, no `!important`.

### Recipe B — product app with a design language (10+ screens, a team)

```text
src/styles/global.css        /* @import 'tailwindcss' + @theme tokens + base/a11y rules */
src/components/ui/*.tsx      /* a small primitive set: Button, Input, Card, Badge … */
src/features/*/…             /* feature code uses utilities + primitives, never raw colours */
```

Rules: primitives own the states (focus, disabled, loading); feature code composes; arbitrary values need a comment; a lint rule and a CSS-size budget in CI.

### Recipe C — component library consumed by others

```text
packages/ui/src/Button/Button.tsx
packages/ui/src/Button/Button.module.css
packages/ui/src/tokens.css           /* published as the theming contract */
```

Rules: forward and merge `className`; accept a `style` prop for escape hatches; document every CSS variable the component reads (`--button-bg`, `--button-fg`); never rely on the consumer's cascade; ship tokens, not opinions about fonts.

### Recipe D — legacy codebase, mixed strategies

Rules: (1) freeze the old approach — no new global classes; (2) declare the target and the boundary; (3) migrate per component touched by real work (not a big-bang refactor); (4) delete the old styles in the same PR; (5) track the number of old-style files as the metric; (6) never let a single component use two systems without a comment explaining why.

---

## 4. Theming and dark mode (strategy-independent)

Whichever tool you chose, the theming mechanism is the same three layers (file 03, section 5):

```css
:root {
  color-scheme: light dark;                 /* native controls follow */
  --surface: #ffffff;
  --surface-raised: #f8fafc;
  --text: #0f172a;
  --brand: #0f766e;
}

[data-theme='dark'] {
  color-scheme: dark;
  --surface: #0f172a;
  --surface-raised: #1e293b;
  --text: #e2e8f0;
  --brand: #14b8a6;                          /* lighter for dark surfaces */
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) { /* the same dark values */ }
}
```

```tsx
// src/theme/ThemeToggle.tsx
function applyTheme(theme: 'light' | 'dark' | 'system'): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.dataset['theme'] = theme;
  localStorage.setItem('theme', theme);
}
```

Four details that make the difference between a demo and a shipped theme:

1. **Apply the stored theme before React renders** (a tiny inline script in `index.html`), or the first paint flashes light before your effect runs.
2. **Use `color-scheme`** so scrollbars, form controls and default backgrounds match.
3. **Contrast-check both themes** — a brand colour that passes on white usually fails on near-black; lighten saturated colours for dark surfaces.
4. **Never hard-code a colour in a component.** One literal is enough to break a theme, and it will be found in production, at night, by a user.

---

## 5. Responsive design, briefly and correctly

| Principle | Practice |
| --- | --- |
| Mobile-first | write the small-screen layout as the base; add complexity upward (`min-width`) |
| Fluid before breakpoints | `clamp()`, percentages, `flex-wrap`, `grid-auto-fit` often remove the need for a breakpoint |
| Content decides breakpoints | add a breakpoint where *this component* breaks, not where a device list says |
| Container queries when the component is reused | `@container` styles depend on the container's width, which is what makes a card work in a sidebar and in a full-width grid |
| Test with real constraints | 320 px width, 200% zoom, long German words, a slow network |

```css
/* A card that adapts to its container, not the viewport */
.card { container-type: inline-size; }
@container (min-width: 28rem) { .card__body { display: grid; grid-template-columns: 8rem 1fr; } }
```

💡 Container queries are the modern answer to "this component looks wrong in the sidebar": with a utility framework, that is `@container` variants; with modules, a `@container` block in the module — either way, the component owns its own responsiveness.

---

## 6. What no strategy solves for you

| Problem | The actual owner |
| --- | --- |
| Inconsistent spacing/colour | the **token layer** + review (or a utility scale that removes the choice) |
| Accessibility (focus, contrast, motion, zoom) | the base stylesheet + component states (file 01, section 6) |
| Dead CSS | scoped styles or a scanning utility framework — global CSS will accumulate it |
| Specificity fights | flat selectors and a component boundary discipline |
| Design/developer handoff | naming and token agreement, not a tool |
| Performance | the CSS bundle in CI, plus your component count (Part 10, file 04) |
| A rebrand | tokens in one place; literals spread across files will make it a quarter-long project |
| Print styles, emails, PDFs | separate stylesheets; do not try to reuse the app's system |

---

## 7. Migrating without freezing the team

A migration that works, in order:

1. **Freeze** the old approach for new code (a lint rule or a reviewed convention).
2. **Define the target** and write the boundary in the README ("modules for primitives, utilities elsewhere").
3. **Start with the primitives** — Button, Input, Card, Modal. Everything else inherits the new system through them.
4. **Migrate on touch**: when a feature is edited, its styles move. No dedicated refactor sprints that block delivery.
5. **Delete in the same PR** — the old CSS file goes in the same commit that stops importing it.
6. **Screenshot-diff the affected routes** before merging (a handful of pages is enough to catch the surprises caused by cascade order).
7. **Track one number**: remaining files in the old style. A falling number is the only proof the migration is real.

⚠️ Two failure modes to avoid: the **big-bang rewrite** (weeks of work, huge diff, no shippable state) and the **permanent halfway house** (two systems, no boundary, every new component a coin toss). The third — migrating only when a feature is touched — is slower but durable.

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Choosing by fashion | reversing later costs every component | use the decision procedure (section 2) |
| 2 | Two systems with no boundary | every component invents its own rules | write the boundary down |
| 3 | Tokens defined *and* literals used | theming half-works | forbid literals for themed values |
| 4 | Runtime CSS-in-JS in a new app in 2026 | avoidable runtime and SSR costs | modules, zero-runtime, or utilities |
| 5 | Themable colours hard-coded inside a component library | consumers cannot rebrand | publish CSS variables and document them |
| 6 | A "dark mode" that is only a filter/inverted colours | wrong contrast, weird images | token swap + contrast checks |
| 7 | Ignoring `color-scheme` | white scrollbars in a dark app | set `color-scheme` with the theme |
| 8 | No CSS budget in CI | the stylesheet grows every sprint | fail the build above a threshold |
| 9 | Overriding a library's internals with `:global`/`>` chains | breaks on their next release | use their theming API or wrap |
| 10 | Responsive work by device list | breakpoints in the wrong places | break where the component breaks; prefer container queries |
| 11 | Testing styles by asserting class strings | brittle tests, no user-visible guarantee | test behaviour/roles; screenshot-diff visuals |
| 12 | Migrating everything before shipping anything | no shippable state for weeks | migrate on touch, primitives first |

---

## 9. Best practices

1. **Decide once, document it, and make new code follow it.**
2. **Tokens are non-negotiable** in every strategy; a literal for a themed value is a bug.
3. **Scope what you can**: modules or atomic utilities, whichever the recipe prescribes.
4. **Keep specificity flat**, in every system (SCSS nesting, Tailwind `!`, CSS-in-JS overrides).
5. **Components expose a `className`/`style` escape hatch**, and their theming contract in variables.
6. **Accessibility rules live in the base layer** (focus-visible, reduced motion, contrast) plus per-component states.
7. **Budget CSS in CI** alongside JS, and watch the number of component stylesheets.
8. **Migrate on touch**, primitives first, deleting old styles in the same PR.
9. **Screenshot-diff visually significant changes**, because cascade changes are invisible in review.
10. **Revisit the decision yearly**, not monthly — and only with evidence (bundle size, review friction, theming bugs).

---

## 10. Practice

### Beginner

1. For each app, name the strategy you would pick and the first question that decided it: (a) a 5-page marketing site with a React form; (b) an internal dashboard built by 8 developers; (c) a shared component library used by three products; (d) a white-label product where each customer sets brand colours.
2. List three things every strategy must still handle, and where they live in your project today.
3. Write the boundary sentence for a project that uses Tailwind and one CSS Module.

### Intermediate

1. Take a component from your app and implement it twice — once in CSS Modules, once in Tailwind — then compare: lines of code, number of files, how easy it is to change the brand colour, and how easy it is for a designer to read.
2. Design the theming contract for a component library of five components: which CSS variables each exposes, what their defaults are, and how a consumer overrides one instance without touching the others.
3. Add a CSS budget to CI: measure the built stylesheet(s), fail above a threshold, and print the delta against the previous build's artifact (store the size in the repo or as a comment on the PR).

### Challenge

1. Run a real migration of one feature from global CSS to your chosen target, including screenshot diffs of the affected routes, the deleted files, and the CSS size delta. Then write the one-page playbook for the rest of the codebase based on what actually went wrong.
2. Build a "theme pack" feature: a tenant supplies `{ primary, radius }`, the app applies them as CSS variables at runtime, and every component (including a Tailwind-based one) follows. Then handle contrast automatically (compute a readable foreground from the background) and document the limits.
3. Audit a production app's CSS end to end: total bytes and gzip, number of rules, the top 10 most specific selectors, the count of `!important`, the count of unused rules (by comparing selectors with the class strings in the built JS), and the accessibility of focus/contrast. Produce a prioritised list with effort estimates.

---

## 11. Solutions

### Beginner

1. (a) Global CSS + tokens — the first question is "how many components and hands?" (few). (b) Tailwind — "does the design follow a scale and get built by many hands?" (yes). (c) CSS Modules + tokens — "is this consumed as components by other teams?" (yes). (d) CSS variables + modules or zero-runtime CSS-in-JS — "does the visual output depend on runtime data?" (yes, per tenant).
2. Inconsistency (tokens + review/scale), accessibility (base stylesheet + component states), dead CSS/scale (scoped styles or a scanning framework). Any honest project that has all three in one place (tokens file, global base, per-component files) is already ahead of most.
3. "Design-system primitives (Button, Input, Card) are styled with CSS Modules so consumers can override predictably; everything else uses Tailwind utilities and `@theme` tokens."

### Intermediate

1. Expect the Tailwind version to have fewer files (one component file) and a longer className; the module version to have two files and a shorter markup; brand change to be a single token edit in both (if tokens are used); designer readability to favour modules (semantic names) while developer speed in new components favours Tailwind. Write the conclusion as *your team's* criterion, not a universal one.
2. A sustainable contract: each component documents its variables, e.g. Button reads `--button-bg` (default `--color-primary`), `--button-fg`, `--button-bg-hover`, `--button-radius`; Card reads `--card-surface` (default `--surface-raised`) and `--card-radius`; a consumer overrides per instance via `style={{ '--button-bg': … } as CSSProperties}`. Defaults come from global tokens, so nothing needs overriding in the common case.
3. ```cs
   // in CI
   const css = statSync('dist/assets/index-*.css').size;
   if (css > BUDGET_KB * 1024) fail(`CSS budget exceeded: ${kb(css)} kB`);
   ```
   The delta against the base branch is the more useful signal early on (a rule that makes the number trend up in every PR is what you are looking for), and it works the same for JS budgets (Part 16).

### Challenge

1. A good migration report includes: before/after CSS sizes, the three visual regressions the screenshot diff caught (typically cascade-order surprises), the files deleted, the time spent, and a playbook that starts with "migrate primitives first" because that is what removed the most duplication with the least risk.
2. Implementation: read the tenant config, then set the variables on `:root`; compute a foreground with enough contrast (relative-luminance maths, or `color-contrast()` where supported, with a fallback table); persist per tenant; keep the *default* theme in CSS so a missing config still renders; document limits (a "brand" colour that fails contrast gets corrected to the nearest accessible shade — and that decision is a product decision, not a CSS one).
3. Expect the audit to find: a handful of `!important` (each a historical fight), a specificity tail from an early global stylesheet, a noticeable share of unused rules if the codebase has changed a lot (compare against the class strings in the built JS), and focus styles missing on icon-only buttons. The prioritised list usually starts with unused-rule removal (safe, measurable), then focus/contrast (user-facing correctness), then the specificity refactors (risky, do them on touch).

---

## 12. Summary

- **There is no universal winner.** Global CSS + BEM, CSS Modules, SCSS, Tailwind, runtime CSS-in-JS and zero-runtime CSS-in-JS each win on different criteria, and the table in section 1 states them without pretending otherwise.
- **Decide with six questions** (design system? many hands and a scale? components consumed by others? runtime-driven visuals? small app? legacy mix?) — the first "yes" usually decides.
- **Four recipes cover most projects**: small app (tokens + modules), product app (Tailwind + primitives), component library (modules + published CSS variables), legacy (freeze, boundary, migrate on touch).
- **Theming is strategy-independent**: tokens in `:root`, a `[data-theme]` override, `color-scheme`, a pre-render theme script, and contrast checks in both themes. One hard-coded colour breaks all of it.
- **Responsive design is mobile-first, content-driven and increasingly container-based** — `@container` is what makes a component work in any slot.
- **Some problems belong to no strategy**: consistency (tokens), accessibility (base layer + states), dead CSS (scoping or scanning), specificity (flat selectors), performance (CI budgets).
- **Migrate on touch, primitives first, delete in the same PR, and track one number** (remaining old-style files). Big-bang rewrites and permanent halfway houses are the two ways migrations fail.

---

**What's next →** [`../13-testing/01-testing-basics.md`](../13-testing/01-testing-basics.md) opens Part 13: what to test at all, the difference between unit, component and integration tests, what a good test asserts (behaviour and roles, not class strings), and how to think about coverage and the testing pyramid for a React app.
