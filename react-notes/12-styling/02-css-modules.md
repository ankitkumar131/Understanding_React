# 02 — CSS Modules: Real Scope Without a Runtime

> **Part 12 · Styling · File 2 of 5**

Why this file exists: file 01 ended with the collision problem — a global `.button` that applies to anything. CSS Modules solve it with the smallest possible mechanism: at build time, every class in a `*.module.css` file is renamed to a unique string, and the file's exports map your original names to those strings. No runtime, no CSS-in-JS, no new syntax beyond one import. This file shows the mechanism with the hashes this book's lab actually produced, then covers the parts tutorials skip: how the rename works in dev versus production, `composes`, `:global`, typing `styles` in TSX, conditional class names with `clsx`, and the honest cases where modules are the wrong tool.

Measured in this lab: `module classes in the bundle: ._button_1v1gi_1, ._icon_1v1gi_16, ._card_1v1gi_20`.

---

## 1. The mechanism, in one example

```css
/* src/styles/Button.module.css */
.button {
  background: #0f766e;
  color: white;
  padding: 0.5rem 1rem;
  border: 0;
  border-radius: 0.5rem;
}
```

```tsx
// any component
import styles from '../styles/Button.module.css';

export function SaveButton() {
  return <button type="button" className={styles.button}>Save</button>;
}
```

What the bundler does:

| Step | Result |
| --- | --- |
| 1. Read the module | `styles.button` is a **string**, not an object: `'_button_1v1gi_1'` |
| 2. Rewrite the CSS | `.button { … }` becomes `._button_1v1gi_1 { … }` |
| 3. Rewrite the JSX | `className={styles.button}` becomes `className="_button_1v1gi_1"` |
| 4. Bundle | one CSS file with the hashed selectors (measured above), one JS file with the hashed strings |

Two consequences that explain nearly every question people have about modules:

- **The rename happens at build time**, so nothing is computed in the browser — modules are as fast as plain CSS.
- **The class is only reachable through the import**, which is what makes deletion safe: if no file imports `styles.button`, the rule disappears from the bundle.

⚠️ **The hash is not stable across builds** and differs between dev and production (it may be `_button_1v1gi_1` in one build and something else in the next). Never assert on a hashed class name in a test, and never use one in a query selector — use roles, labels and `data-testid` (Part 13).

---

## 2. Setup in Vite

There is nothing to install or configure. Vite treats any file ending in `.module.css` (and `.module.scss`, `.module.sass`, `.module.less`, `.module.styl`) as a CSS Module:

```tsx
import styles from './Card.module.css';        // ✅ a module
import './global.css';                          // ✅ a global stylesheet (no import binding)
import globalStyles from './global.css';        // ⚠️ also works, but the names are not scoped
```

```ts
// vite.config.ts — only needed if you want to change the defaults
export default defineConfig({
  css: {
    modules: {
      // readable class names in development, hashed in production
      generateScopedName: process.env.NODE_ENV === 'production' ? '[hash:base64:6]' : '[name]__[local]__[hash:base64:4]',
    },
  },
});
```

💡 The default naming (as measured: `_button_1v1gi_1`) already includes the original name and a per-file hash, which is what makes DevTools usable — you can see that a mysterious element is "the button from Button.module.scss" without opening the CSS.

---

## 3. Composing and sharing within modules

Two features of the spec are worth knowing because they replace copy-paste:

```css
/* src/styles/Card.module.css */
.base {
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1rem;
  background: white;
}

.raised {
  composes: base;                 /* ← this class's element also gets .base's styles */
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.1);
}

.title {
  composes: base from './Typography.module.css';   /* ← compose across modules */
  font-weight: 600;
  padding-bottom: 0.5rem;
}
```

```tsx
import styles from '../styles/Card.module.css';

<div className={styles.raised}>…</div>       // rendered class: "_raised_xxx _base_yyy"
```

⚠️ `composes` must be the **first** declarations in the rule (before other properties), and it only composes **class selectors** — not elements or ids. If a build error says "composition is only allowed when selector is single :local class name", that is the reason.

**`:global(...)`** is the escape hatch for the two legitimate cases: styling a third-party library's class, or styling markup you do not control.

```css
/* src/styles/DatePicker.module.css */
.wrapper :global(.react-datepicker) { border: 0; }          /* scoped to your wrapper */
:global(body.is-modal-open) { overflow: hidden; }           /* a true global rule, written here */
```

⚠️ `:global` weakens the guarantee that this file is safe to change. Use it at the boundary (a wrapper around a library) and keep the count of `:global` rules small and reviewed.

---

## 4. TypeScript: typing the `styles` object

TypeScript does not know what is inside a CSS file, so `styles.button` is typed as `string` (with `vite/client` types, approximately `Record<string, string>`) — which means **typos compile**:

```tsx
<div className={styles.buton}>   {/* ⚠️ no error: it is just a missing property on a dictionary */}
```

Three ways to make it strict, in increasing order of effort:

| Approach | How | Trade-off |
| --- | --- | --- |
| Trust `vite/client` | nothing to do | typos are not caught |
| Generate declarations per module | `vite-plugin-sass-dts`, `typed-css-modules`, or a small codegen step | new build step and a types file per module |
| Use CSS Modules with `declare module` for strict keys | a generic plugin that emits a `.d.ts` alongside each module | best safety, more files in the repo |

A pragmatic middle ground many teams use:

```ts
// src/types/css-modules.d.ts
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
```

…plus a lint rule against member access with a name that does not exist in the sibling file (available from some tooling), or the codegen approach in CI. Whichever you choose, write it in the README so the next person knows whether `styles.buton` can happen.

💡 Because a missing class is `undefined` and React renders `className="undefined"` as a literal string, the symptom is *"the styles silently did not apply"* — not a stack trace. That is what makes the typing worth a build step in a large codebase.

---

## 5. Conditional and combined class names

Modules give you strings, so combining them is ordinary string work — which is why a tiny helper earns its place:

```tsx
// src/lib/cx.ts — a 10-line version of clsx
export type ClassValue = string | false | null | undefined;
export const cx = (...values: ClassValue[]): string => values.filter(Boolean).join(' ');
```

```tsx
import styles from './Button.module.css';
import { cx } from '../lib/cx';

type ButtonProps = {
  variant?: 'primary' | 'ghost';
  size?: 'sm' | 'lg';
  isLoading?: boolean;
} & ComponentPropsWithoutRef<'button'>;

export function Button({ variant = 'primary', size = 'sm', isLoading = false, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx(styles.button, styles[variant], styles[size], isLoading && styles.loading, className)}
      aria-busy={isLoading}
      {...rest}
    />
  );
}
```

```css
/* Button.module.css */
.button { border: 0; border-radius: 0.5rem; cursor: pointer; }
.primary { background: #0f766e; color: white; }
.ghost { background: transparent; color: #0f766e; }
.sm { padding: 0.25rem 0.75rem; font-size: 0.875rem; }
.lg { padding: 0.75rem 1.5rem; font-size: 1rem; }
.loading { opacity: 0.6; cursor: progress; }
```

Three habits in that snippet that matter more than they look:

1. **`styles[variant]`** — variant names double as class names, so adding a variant is a two-line change (`type` + CSS).
2. **`className` is forwarded and merged last**, so consumers can extend the component without forking it (the same `...rest` discipline as Part 3's component APIs).
3. **`aria-busy` accompanies the visual state** — a styling change that also tells assistive technology what is happening.

⚠️ `cx(styles.button, condition && styles.active)` needs the `false | undefined` handling, which the tiny helper does. Using template literals is fine too (`className={`${styles.a} ${condition ? styles.b : ''}`}`), but it is harder to read and easier to leave `undefined` in the string.

---

## 6. Where CSS Modules stop being enough

| Situation | Why modules struggle | Better tool |
| --- | --- | --- |
| Design-system-scale consistency ("every padding is a token") | nothing enforces the values you write | tokens + Tailwind (file 04) or a constrained style API |
| Values coming from props/state | needs custom properties, not class names | CSS variables (file 01, section 4) |
| Theming per tenant / runtime theming | classes are static; themes are dynamic | CSS variables on a root attribute (file 05) |
| Third-party markup | you cannot pass a class into DOM you do not own | `:global` wrappers, or the library's own theming API |
| Very dynamic styles (drag positions, chart layouts) | not a class problem | inline styles for the dynamic part |
| Sharing styles between a JS and a non-JS surface (emails, MDX) | modules are a bundler feature | plain CSS or a utility framework |

💡 **Modules and SCSS are orthogonal.** `Button.module.scss` is a module whose *source* is SCSS (file 03 does exactly that, and the build above compiled it). Modules handle scoping; SCSS handles syntax; Tailwind handles utility distribution — they can coexist in one project, and often should.

---

## 7. How the rename shows up in practice

| Place | What you see | What to do |
| --- | --- | --- |
| DevTools Elements | `class="_button_1v1gi_1 _primary_1v1gi_7"` | read the `[name]__[local]` pattern (or configure `generateScopedName`) |
| A test | the hashed string differs between runs/builds | query by role/label, never by class |
| A CSS override in a global file | `.button` does not affect the module's button | that is the point; target a `:global` hook or pass a class in |
| A keyboard/prototype handoff | the CSS is in a different file than the markup | give the component a `className` prop so consumers can adjust |
| Copying markup into a Storybook story | no styles | import the module in the story and use the same classes |

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Forgetting `.module` in the filename | the classes are global; collisions return | name component styles `*.module.css` |
| 2 | Importing the stylesheet without binding (`import './x.module.css'`) | classes exist but you cannot reference them | `import styles from` |
| 3 | Asserting on hashed class names in tests | tests break on every build | query by role/testid |
| 4 | Typos in `styles.buton` | silently renders `class="undefined"` | typed modules or codegen |
| 5 | Using `composes` after other declarations | build error, confusing message | put `composes` first |
| 6 | Trying to compose element or id selectors | not supported | compose class selectors |
| 7 | `:global` for convenience | scoping guarantee lost file-wide | keep `:global` to library boundaries |
| 8 | Styling third-party components by guessing their classes | breaks on their next release | use their theming API or a wrapper |
| 9 | Duplicating design values across modules | a rebrand becomes a hunt | tokens as CSS variables |
| 10 | Building a component library without forwarding `className` | consumers cannot adjust anything | accept and merge `className` |
| 11 | Deeply nested SCSS inside a module | specificity climbs, overrides get messy | flat selectors; nest at most one level |
| 12 | Expecting modules to theme dynamically | classes are static strings | CSS custom properties for dynamic values |

---

## 9. Best practices

1. **One module per component**, named after it (`Button.module.css` next to `Button.tsx`), so ownership is obvious.
2. **Use semantic class names** inside the file (`.button`, `.loading`) — they are local, so long prefixes are unnecessary.
3. **Expose variants as classes** and let props choose among them (`styles[variant]`).
4. **Forward `className`** and merge it last so consumers can extend.
5. **Keep the number of `:global` rules near zero**, and comment each one.
6. **Reach for tokens** for colours, spacing and radii instead of literals.
7. **Prefer composition and small primitives** over one component with fifteen modifier classes.
8. **Type the module** (codegen) if the project is large enough that a silent typo would cost real debugging time.
9. **Never depend on the hash**: no test assertions, no `querySelector` with a module class, no copy-pasted class strings.
10. **Pair with `data-*` attributes for states** when tests or analytics need to observe them (`data-loading={isLoading}`) rather than encoding state in class names only.

---

## 10. Practice

### Beginner

1. Create `Card.module.css` with `.card`, `.raised`, `.title`, and a `Card.tsx` that uses all three. Add a `raised` prop that adds `styles.raised` conditionally using `cx`.
2. Break it on purpose: rename `.title` to `.titel` in the CSS but keep `styles.title` in the TSX. Describe exactly what renders and why there is no error.
3. Add a global `.card` rule in `global.css` and prove that it does **not** affect the module's card.

### Intermediate

1. Build a `Button` component with variants and sizes (section 5), including a `loading` state that also sets `aria-busy`. Then use it in three places with different `className` additions, and confirm the consumer's classes win where they should (they are merged last).
2. Use `composes` to build a `.danger` button from `.button`, then decide (in writing) whether composition or an extra modifier class is clearer for your team.
3. Wrap a third-party component (a date input, a chart) and style it with exactly one `:global` rule inside a scoped wrapper. Write the comment you would leave above it.

### Challenge

1. Add typed CSS Modules to the lab: generate `.d.ts` declarations for every module (a script or plugin) and wire `npx tsc -b` into CI. Then introduce a typo in a class name and prove the build fails.
2. Convert a global-CSS component (BEM-style, with descendant selectors) to a CSS Module. Measure: lines changed, any style differences (screenshot diff), and whether the specificity dropped. Then write the migration playbook for the rest of the codebase.
3. Design the styling API of a `Button` for a shared library: which props exist, what tokens it reads, how a consumer overrides a colour for one instance, how it behaves in dark mode, and how it prevents a consumer from shipping an unreadable combination (contrast). Then implement and critique your own design.

---

## 11. Solutions

### Beginner

1. ```tsx
   import styles from './Card.module.css';
   import { cx } from '../lib/cx';
   export function Card({ raised = false, title, children }: { raised?: boolean; title: string; children: ReactNode }) {
     return (
       <section className={cx(styles.card, raised && styles.raised)}>
         <h2 className={styles.title}>{title}</h2>
         {children}
       </section>
     );
   }
   ```
2. `styles.title` is `undefined`, so React renders `className="undefined"` (the literal string). No error is thrown because the styles object is a plain dictionary and the property is simply absent; the heading loses its styles. The fix is typed modules, or a `styles['title']` access that a codegen step can check.
3. The global `.card` matches elements with the literal class `card`; the module's element has `_card_hash`, so the global rule never matches — unless you also pass `className="card"` explicitly (in which case both apply and the cascade decides by specificity/order). That is the intended behaviour: global styles must be opted into.

### Intermediate

1. The merged order (`styles.button, styles.primary, styles.sm, styles.loading, className`) means a consumer's `className` comes last in the attribute, and because module classes are all single-class selectors, the *stylesheet order* decides ties — so the consumer's class must be defined in a stylesheet loaded after yours, or use a token/`!important`-free override strategy (e.g. `--button-bg`). This subtlety is worth writing in the component's README: "override via tokens, not by fighting the cascade".
2. `composes` gives you the base declarations without repeating them and without a second class in the markup — good for shared resets (borders, focus rings). An extra modifier class (`.button.danger` or `.button--danger`) is more explicit in the markup and easier to debug in DevTools (two classes visible). Recommendation: `composes` for structural sharing inside a module; modifiers for semantic variants that consumers can also apply.
3. ```css
   /* Wrapper around react-datepicker: one :global rule, scoped to our wrapper. */
   .wrapper :global(.react-datepicker) { border: 0; font-family: var(--font-sans); }
   ```
   The comment should say which library and version the class belongs to, and that the rule must be re-checked when the library's major version changes.

### Challenge

1. A codegen script (or `vite-plugin-sass-dts` / `typed-css-modules`) that reads every `*.module.*` file, extracts local class names, and writes `X.module.css.d.ts` with a literal union type. Then `styles.buton` is a type error, and CI fails on the typo. The cost: one more generated file per module (commit them, or generate in CI before type-checking).
2. Expect: line count similar or lower; specificity drops from two-or-three-class chains to single classes; visual diffs show a handful of unintended changes (usually where a global rule was previously winning by source order — that is the useful discovery). The playbook: one component per PR, import the module, move selectors verbatim, flatten `&`-nesting, replace hard-coded values with tokens, screenshot-diff the affected routes, then delete the old rules and check the CSS bundle shrank.
3. A defensible Button: props `variant: 'primary' | 'secondary' | 'danger' | 'ghost'`, `size: 'sm' | 'md' | 'lg'`, `isLoading`, `leadingIcon`, plus `ComponentPropsWithoutRef<'button'>` so every native prop works; it reads `--button-bg`, `--button-fg`, `--button-bg-hover` with token defaults; a consumer overrides per instance with `style={{ '--button-bg': 'hotpink' } as CSSProperties}` (or a `tone` prop if you want to police contrast); dark mode flips the tokens, not the component; contrast is protected by *design review of the tokens* plus a test that computes contrast ratios for the token pairs (a script in CI catches the unreadable combinations).

---

## 12. Summary

- **CSS Modules scope by renaming at build time**: measured, `.button` became `._button_1v1gi_1` in the bundle, and `styles.button` in JS is that string — no runtime, no cost.
- **Vite needs no configuration** for `*.module.css` (and `*.module.scss`); the hash is unstable across builds, so never assert on it in tests or selectors.
- **The rename is a deletion guarantee**: a class that no file imports disappears from the bundle, which is what makes module-based CSS maintainable where global CSS is not.
- **`composes` shares declarations inside and across modules; `:global` is the boundary escape hatch** — use it for third-party markup and keep it rare.
- **Type the module or accept silent typos**: `styles.buton` renders `className="undefined"` and no error; codegen or a plugin turns that into a build failure.
- **Combining classes is string work** — a ten-line `cx` helper handles conditionals, and forwarding `className` last keeps components extensible.
- **Modules pair with variants and tokens**: `styles[variant]` for the class, CSS custom properties for anything dynamic, `aria-*` alongside visual states.
- **Know the limits**: dynamic/themed values, design-system consistency, third-party internals and very dynamic layout need variables, utilities or inline styles — modules are the scoping tool, not the whole strategy.

---

**What's next →** [`03-scss.md`](./03-scss.md) adds syntax on top of modules: variables, nesting done safely, mixins and functions for a token system, `@use` versus the old `@import`, the modern colour functions that replace `darken()`, and the nesting depth that keeps specificity flat.
