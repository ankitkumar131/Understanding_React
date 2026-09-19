# 05 — JSX in Depth

> **Part 3 · React Fundamentals · File 5 of 12**
> Why this file exists: JSX looks so much like HTML that beginners learn it "by vibes" and then spend months confused about why `{0}` renders a zero, why `style="color:red"` fails, and what `{/* … */}` really is. This file explains JSX completely — syntax, semantics, the compiled output, the whitespace rules, and the exact errors TypeScript gives you when you get it wrong.

---

## 1. What JSX is, precisely

JSX is a **syntax extension for JavaScript** that lets you write a tree of elements the way you would write HTML. It is not a template language, not a string format, and not part of JavaScript. The build tool rewrites it before anything runs.

```tsx
const element = <p className="greet">Hello, {name}!</p>;
```

compiles to

```js
const element = _jsxs('p', { className: 'greet', children: ['Hello, ', name, '!'] });
```

The call returns a **plain object** — a React *element* — which for the `Greeting` case looks like this when logged:

```js
{ $$typeof: Symbol(react.transitional.element), type: 'p', key: null, ref: null,
  props: { className: 'greet', children: ['Hello, ', name, '!'] } }
```

Four facts follow immediately, and they explain a large fraction of all beginner confusion:

| Fact | Consequence |
| --- | --- |
| **JSX is an expression** (it produces a value) | You can assign it, return it, pass it as an argument, put it in an array, and store it in a variable |
| **JSX is JavaScript, not HTML** | Attribute names follow React's prop names (`className`, `htmlFor`), and values are JavaScript expressions |
| **It is compiled, not interpreted** | Syntax errors are *compile* errors (file 05 §11); the browser never sees `<div>` |
| **An element is a description, not a DOM node** | `element.props.children` is data; nothing is rendered until React commits it |

---

## 2. Every JSX expression is an expression

This is the single most important idea in the file. Because `<p>…</p>` is a *value*, all of the following are legal JavaScript:

```tsx
// 1. assign it
const heading = <h1>MegaShop</h1>;

// 2. return it
function Title() { return <h1>MegaShop</h1>; }

// 3. pass it as an argument
renderToStaticMarkup(<h1>MegaShop</h1>);

// 4. store many of them in an array
const rows = products.map((p) => <li key={p.id}>{p.name}</li>);

// 5. choose between two of them
const body = isLoading ? <Spinner /> : <ProductList products={visible} />;

// 6. give it to a prop
<EmptyState title="No matches" action={<button type="button">Clear filters</button>} />

// 7. put it in a local variable to keep the return statement readable
const priceLine = product.compareAtMinor ? <s>{formatMoney(product.compareAtMinor)}</s> : null;

return <p>{priceLine}</p>;
```

The practical upshot: **JSX never needs special syntax for control flow**, because control flow in JavaScript is expressions. `items.map(...)` produces an array of elements; `cond ? a : b` chooses one; `&&` short-circuits. That is why you never write a `for` loop inside JSX (file 11) — you write `map`, which *returns* the array you need.

### 2.1 What `{}` can contain — expressions only

Inside an **expression container** `{ … }` you may write any JavaScript **expression**. You may not write a **statement**.

| Allowed (expressions) | Not allowed (statements) |
| --- | --- |
| `{name}` | `{const x = 1}` |
| `{priceMinor / 100}` | `{if (soldOut) { … }}` |
| `{items.length}` | `{for (const i of items) { … }}` |
| `{items.map((i) => <li key={i.id}>{i.name}</li>)}` | `{switch (level) { … }}` |
| `{isDiscounted ? 'Sale' : 'Regular'}` | `{function helper() {}}` (function *expression* is fine, declaration is not) |
| `{soldOut && <Badge />}` | `{return <Badge />}` |
| `{/* a comment */}` | `{// a comment}` (this breaks the JSX: it comments out the closing brace) |

When you need statements, compute them **before** the JSX:

```tsx
export function CartLine({ quantity, unitMinor }: { quantity: number; unitMinor: number }) {
  let discount = 0;                                   // ← a statement lives here
  if (quantity >= 10) discount = 0.1;
  if (quantity >= 25) discount = 0.2;

  const lineTotalMinor = Math.round(quantity * unitMinor * (1 - discount));

  return (
    <p>
      {quantity} × {formatMoney(unitMinor)} {discount > 0 && <em>({discount * 100}% off)</em>} ={' '}
      <strong>{formatMoney(lineTotalMinor)}</strong>
    </p>
  );
}
```

This habit — *compute, then render* — is the origin of the "derived values belong before the JSX" rule from file 04. It also keeps the returned tree readable: the JSX becomes a picture of the data, not a program.

### 2.2 Comments in JSX

```tsx
<div>
  {/* this is a JSX comment: a JS expression container holding a JS comment */}
  {products.length} products
</div>
```

Three rules, each with a reason:

- `{/* … */}` — the only comment syntax that survives **inside** JSX children. It works because `{}` opens a JavaScript expression context where `/* */` is a normal comment.
- `{// …}` — **breaks**. The `//` comments out the closing `}` on the same line, and you get a syntax error such as `Expected corresponding JSX closing tag for <div>`.
- Between attributes, `{/* … */}` is not allowed; use a line comment above the element or inside `{}` if the position permits:

```tsx
{/* WRONG between attributes */}
<button {/* disabled */} type="button">Go</button>     // ✗ syntax error

{/* RIGHT: a comment line above the element */}
{/* The button is disabled while the request is in flight. */}
<button type="button" disabled={isPending}>Go</button>
```

The reason: element children are a JavaScript expression position; attribute lists are not.

**Verified behaviour:** a comment inside children renders nothing. Our `renderToStaticMarkup(<div>{/* internal note */}visible</div>)` produced exactly `<div>visible</div>`.

---

## 3. Anatomy of an element

```tsx
<ProductCard             →  tag
  key={product.id}       →  props (attribute syntax)
  product={product}      →  props
  featured               →  boolean shorthand: featured={true}
>
  <Tag tag="hot" />      →  children (an element)
  Only {product.stock} left!   →  children (text + expression)
</ProductCard>
```

### 3.1 Capitalisation decides everything

| Written | Means | Compiled to |
| --- | --- | --- |
| `<div>`, `<img>`, `<button>` | A **host** element: a real DOM tag | `jsx('div', …)` — the string `'div'` |
| `<ProductCard>`, `<PriceTag>` | **Your** component: the function in scope | `jsx(ProductCard, …)` — the variable |
| `<productCard>` | An unknown HTML tag named `productcard` | `jsx('productCard', …)` → React warns *"The tag <productCard> is unrecognized in this browser"* |
| `<Card.Subtitle>` | Member expression — a component attached to another | `jsx(Card.Subtitle, …)` |

That is why **component names must start with a capital letter**: the capital is what tells the compiler "this is an identifier, not a string". It is also why renaming `productCard` to `ProductCard` "makes it work" — you are not fixing a style issue, you are changing what the code means.

A useful corollary for imports:

```tsx
import ProductCard from './ProductCard';        // default export, capitalised ⇒ component
import { formatMoney } from '../data/products'; // lowercase ⇒ not a component; must not be JSX'd
```

### 3.2 Self-closing and void elements

```tsx
<img src="/p1.png" alt="Keyboard" />   {/* void element: always self-closed */}
<br />
<input type="search" />
<PriceTag priceMinor={499900} />       {/* required self-closing: the component has no children */}
```

Unlike HTML, JSX **requires** every element to be closed. A bare `<img>` is a syntax error, and `<div>` without `</div>` produces *"JSX element 'div' has no corresponding closing tag"*.

For void elements React is strict in the opposite direction too. These two lines compile but the second **throws at render time** — a real, verified error:

```tsx
<img src="/hero.png" alt="hero">child</img>
// Error: img is a self-closing tag and must neither have `children` nor use `dangerouslySetInnerHTML`.
```

TypeScript does **not** catch that one (the DOM types allow the children prop), which is a useful lesson in itself: *the type system catches shape mistakes, not semantic HTML mistakes.* React's runtime dev warnings cover this class of problem.

### 3.3 Fragments

A component must return **one** element. When you need several siblings, wrap them in a fragment:

```tsx
export function PriceTag({ priceMinor, compareAtMinor }: PriceTagProps) {
  ...
  return (
    <p className="price">
      <span className="price__now">{formatMoney(priceMinor)}</span>
      {isDiscounted && (
        <>
          <s className="price__was">{formatMoney(compareAtMinor)}</s>
          <span className="price__save">save {formatMoney(savings)}</span>
        </>
      )}
    </p>
  );
}
```

`<>…</>` is shorthand for `<React.Fragment>…</React.Fragment>`. It groups children **without adding a DOM element** — verified: rendering `<><span>a</span><span>b</span></>` produced exactly `<span>a</span><span>b</span>`, with no wrapper.

Why this matters beyond avoiding an extra `<div>`:

- **Layout.** An extra wrapper breaks flex/grid relationships (`display: grid` counts children).
- **HTML validity.** `<tbody><div><tr>…</tr></div></tbody>` is invalid; a fragment is not.
- **Accessibility.** Meaningless divs pollute the DOM for screen readers and tests.

Forgetting the fragment gives the most common JSX *syntax* error of all:

```text
error TS2657: JSX expressions must have one parent element.
```

and here is the trap that costs beginners an hour:

> ⚠️ **A syntax error hides every other error in the project.** When we added that one broken line to a file with 11 deliberate type errors, the compiler reported **only** TS2657:
>
> ```text
> === PASS A — type errors only (no syntax error in the file) ===
> src/__probe.tsx(3,21): error TS2741: Property 'rating' is missing in type '{ title: string; }' but required in type 'CardProps'.
> src/__probe.tsx(4,51): error TS2322: Type '{ title: string; rating: number; stocked: true; }' is not assignable to type 'IntrinsicAttributes & CardProps'.
>   Property 'stocked' does not exist on type 'IntrinsicAttributes & CardProps'.
> … 9 more errors …
>
> === PASS B — the same file with ONE syntax error added ===
> src/__probe.tsx(2,10): error TS2657: JSX expressions must have one parent element.
> ```
>
> So when the compiler suddenly shows one strange error and "loses" everything else, **fix the syntax error first** — the rest will reappear.

### 3.4 Adjacent elements vs adjacent children

```tsx
// ✗ two siblings at the top level of a return → TS2657
return <span>one</span><span>two</span>;

// ✓ they are children of one element, so this is fine
return <div><span>one</span><span>two</span></div>;

// ✓ a fragment: no extra DOM node
return <><span>one</span><span>two</span></>;
```

---

## 4. Attributes: the HTML ↔ JSX mapping

JSX attributes are **props**, not HTML attributes. React maps most of them onto the DOM for you, using the *DOM property* names. The differences from HTML are small, consistent, and worth memorising:

| HTML | JSX | Why |
| --- | --- | --- |
| `class="card"` | `className="card"` | `class` is a reserved word in JavaScript |
| `for="q"` | `htmlFor="q"` | `for` is a reserved word in JavaScript |
| `tabindex`, `readonly`, `maxlength`, `contenteditable` | `tabIndex`, `readOnly`, `maxLength`, `contentEditable` | DOM property names are camelCase |
| `onclick="doThing()"` | `onClick={doThing}` | Handlers are **functions**, not strings |
| `style="color:red"` | `style={{ color: 'red' }}` | `style` takes an **object**, not a string |
| `foo="bar"` (invented attribute) | not allowed; use `data-*` or a prop | React (and TypeScript) reject unknown attributes |
| `data-sku="p1"`, `aria-label="card"`, `role="group"` | same as HTML | `data-*`, `aria-*` and ARIA role names are allowed verbatim |

**Expected result** — the `class`/`for` mismatch produces these exact TypeScript errors (TS 6.0.3, from our lab probe):

```text
error TS2322: Type '{ class: string; }' is not assignable to type 'DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>'.
  Property 'class' does not exist on type 'DetailedHTMLProps<…>'. Did you mean 'className'?

error TS2322: Type '{ children: string; for: string; }' is not assignable to type 'DetailedHTMLProps<LabelHTMLAttributes<HTMLLabelElement>, HTMLLabelElement>'.
  Property 'for' does not exist on type 'DetailedHTMLProps<…>'. Did you mean 'htmlFor'?
```

Note the *"Did you mean"* — the compiler is doing the remembering for you, which is a good reason to keep TypeScript in the loop even while learning.

### 4.1 String literals vs expressions

```tsx
<ProductCard name="Keyboard" />            {/* string literal — no braces */}
<ProductCard name={'Keyboard'} />          {/* same value, expression form */}
<ProductCard priceMinor={499900} />        {/* number: must be braces, or it becomes a string */}
<ProductCard priceMinor="499900" />        {/* type error: string is not number */}
<ProductCard featured />                   {/* shorthand for featured={true} */}
<ProductCard featured={false} />           {/* explicit false */}
<StockBadge product={product} />           {/* object: braces */}
<Rating value={4.6} reviewCount={0} />     {/* 0 is a real value; it is NOT "falsy means absent" */}
```

Two rules of thumb:

- **Strings**: quotes are fine and shorter (`className="card"`, `alt="Keyboard"`, `type="button"`).
- **Everything else**: braces. Numbers, booleans, objects, arrays, functions, `undefined`, and any computed value.

```tsx
// Braces are also needed for computed strings
<span className={`price price--${size}`}>
<span className={isDiscounted ? 'price price--sale' : 'price'}>
<span aria-label={`Rated ${label} out of 5`}>
```

> 💡 **The `style={{ … }}` question, answered.** The outer braces mean "JavaScript expression"; the inner braces are the object literal. It is not a special JSX rule: `style={<object>}`. So `style={{ width: `${percent}%` }}` is one expression containing one object (from our real `Rating` component). Numbers become pixels: verified `style={{ color: 'red', fontSize: '2rem', marginTop: 8 }}` rendered as `style="color:red;font-size:2rem;margin-top:8px"`.

### 4.2 How React maps props onto the DOM

Our probes show the transformation exactly:

```tsx
<label htmlFor="q">Search</label>                          →  <label for="q">Search</label>
<div className="box big" />                                →  <div class="box big"></div>
<button type="button" onClick={() => {}}>Go</button>       →  <button type="button">Go</button>
<input disabled readOnly maxLength={10} value="" />        →  <input disabled="" readOnly="" maxLength="10" value=""/>
<div foo="bar" />                                          →  <div foo="bar"></div>   (with a dev warning, see below)
```

Three behaviours worth internalising:

1. **Event handlers are never rendered as attributes.** `onClick={() => {}}` is React's own prop; it does not become `onclick="…"` in the DOM. React attaches listeners at the root and dispatches them through its own system (file 12).
2. **Boolean `true` renders as the empty attribute** (`disabled=""`), which is the correct HTML for boolean attributes; `false`/`null`/`undefined` render nothing at all.
3. **Unknown lowercase attributes pass through with a warning.** We verified `renderToStaticMarkup(<div foo="bar" />)` → `<div foo="bar"></div>`, and for camelCase React logs:
   > *"React does not recognize the `myProp` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `myprop` instead."*

   TypeScript rejects both outright, before you get that far:
   ```text
   error TS2322: Type '{ foo: string; }' is not assignable to type 'DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>'.
     Property 'foo' does not exist on type 'DetailedHTMLProps<…>'.
   ```
   The lesson: **invented attributes are a smell.** Either it is a real DOM attribute (`data-*`, `aria-*`), or it belongs to a component's props (file 08).

> 🔍 **Why `data-*` and `aria-*` are allowed while `foo` is not.** TypeScript's DOM types declare index signatures for exactly these two families (plus ARIA role names in React 19's types). That is why our probe `<div data-sku="p1" aria-label="card" role="group" />` produced **no** error while `<div foo="bar" />` did. It is a deliberate design decision by the React types team, and a good example of types encoding conventions.

---

## 5. Children

Whatever sits between the opening and closing tags becomes the **`children` prop** — which is the fact behind every "slot" pattern in these notes:

```tsx
<Header title="MegaShop" subtitle="8 products">
  <span className="cart">🛒 0</span>          {/* children */}
</Header>
```

is, at compile time, roughly:

```js
jsx(Header, { title: "MegaShop", subtitle: "8 products", children: jsx('span', { className: "cart", children: "🛒 0" }) });
```

Children can be:

- **text** — `Hello`
- **an expression** — `{product.name}`, `{formatMoney(price)}`, `{products.length}`
- **elements** — `<Tag tag="hot" />`
- **arrays of elements** — `{tags.map((t) => <Tag key={t} tag={t} />)}` (keys required; file 11)
- **`null`/`undefined`/`false`** — render nothing (file 10 uses this for conditionals)
- **a function** — "render props" (Part 10) — an advanced pattern; skip for now

Multiple children arrive as an **array** (`children: ["Hello, ", name, "!"]` in our compiled output). That is why mapping over children works, and why React requires keys for arrays of elements.

### 5.1 Whitespace and text, exactly

Whitespace in JSX is *mostly* intuitive and occasionally surprising. Every row below is real output:

| Source | Rendered |
| --- | --- |
| `<p>Hello <strong>world</strong>, welcome back</p>` (all one line) | `<p>Hello <strong>world</strong>, welcome back</p>` |
| The same text **split across lines**, with the newline adjacent to the tags | `<p>Hello<strong>world</strong>, welcome back</p>` — the newline **disappears** |
| `Hello{' '}` followed by a newline and a tag | `<p>Hello <strong>world</strong></p>` — the `{' '}` restores one space |
| `<p>A{'  '}B</p>` | `<p>A  B</p>` — explicit strings are kept verbatim |
| `<div>{}</div>` (empty expression container) | `<div></div>` — legal, renders nothing |

The rule: **leading/trailing whitespace on a line is trimmed, blank lines are removed, and whitespace containing a newline between elements is dropped.** When you need a space that JSX would eat, write it explicitly as `{' '}` — you will see this in real code where a link or element must be separated from text.

### 5.2 Text is escaped for you

React escapes text children and string attribute values when rendering to HTML:

```tsx
<p title="say &quot;hi&quot;">5 &lt; 6 &amp;&amp; 7 &gt; 3</p>
```

renders as

```html
<p title="say &quot;hi&quot;">5 &lt; 6 &amp;&amp; 7 &gt; 3</p>
```

meaning a product named `27" Monitor` becomes `27&quot; Monitor` in the HTML (you saw exactly this in the MegaShop render output), and a product named `<script>alert(1)</script>` is displayed as text, not executed. Entities you type in JSX (`&lt;`, `&amp;`) are handled by the JSX parser and also end up correctly escaped.

This default is a security property, not a convenience: **React's escaping is why "just render the user's string" is safe in JSX.**

### 5.3 The one way to opt out, and why it is named `dangerouslySetInnerHTML`

```tsx
<div dangerouslySetInnerHTML={{ __html: '<em>rendered as markup</em>' }} />
```

**Expected result:** `<div><em>raw</em> &amp; unescaped?</div>` — the string is inserted as **raw HTML**, unescaped and unexamined.

- The name is the API design: it exists to make you pause, and it appears in code review for a reason.
- It is an **XSS hole** the moment the string is not fully trusted (user input, a CMS field, an API response you did not write). React cannot sanitise HTML for you; if you must inject HTML, sanitise it with a dedicated library (e.g. DOMPurify) and *then* inject.
- Legitimate uses: rendering Markdown that you converted from a trusted source, injecting a `<style>` tag, or embedding HTML from a CMS you control.
- Note the double braces again: `dangerouslySetInnerHTML` takes an **object** with a `__html` key — one expression, one object.

---

## 6. Values that render nothing (and the value that does not)

A core skill in JSX is knowing what happens to each JavaScript value you put in `{}`. Verified with a single render:

```tsx
<div>{0}{false}{null}{undefined}{''}{NaN}{true}</div>
```

**Expected result:**

```html
<div>0NaN</div>
```

| Value | Renders as | Note |
| --- | --- | --- |
| `0` | **`0`** | A real number renders. This is the `{items.length && …}` bug (file 10) |
| `NaN` | **`NaN`** | Same reason; guard your numbers |
| `''` | nothing | Empty string is invisible, but it *is* a string |
| `null` / `undefined` | nothing | The idiomatic "render nothing" values |
| `false` / `true` | nothing | Booleans are never rendered as text |
| an object | **error** | `Objects are not valid as a React child (found: object with keys {a})…` |
| an array | its items | `[<li/>, <li/>]` renders both; strings in arrays render as text |
| a function | nothing (and a warning) | Never put a function in children |

> ⚠️ **The object-child error is the one to learn by heart.** `{user}` where `user` is `{ id, name }` throws:
> ```text
> Error: Objects are not valid as a React child (found: object with keys {a}).
>        If you meant to render a collection of children, use an array instead.
> ```
> The fix is always a *value*: `{user.name}` (or `{JSON.stringify(user)}` for debugging).

---

## 7. JSX is not HTML: the complete difference list

| # | HTML | JSX | Error if you forget |
| --- | --- | --- | --- |
| 1 | `class` | `className` | TS2322 + "Did you mean 'className'?" |
| 2 | `for` | `htmlFor` | TS2322 + "Did you mean 'htmlFor'?" |
| 3 | lowercase attribute names (`tabindex`) | camelCase (`tabIndex`) | TS2322 |
| 4 | `onclick="fn()"` | `onClick={fn}` | TS2322 (string is not a handler) |
| 5 | `style="color:red"` | `style={{ color: 'red' }}` | TS2559: *Type 'string' has no properties in common with type 'Properties<string \| number, string & {}>'* |
| 6 | optional closing tags (`<li>`, `<img>`, `<br>`) | **must** be closed | TS17008/TS1005: "JSX element 'li' has no corresponding closing tag" |
| 7 | multiple root elements in a fragment of markup | prohibited (one parent) | TS2657: "JSX expressions must have one parent element" |
| 8 | invented attributes (`foo="bar"`) | not allowed (`data-*`/`aria-*`/props) | TS2322 + a dev warning |
| 9 | HTML entities in attributes | same, plus `{'…'}` for awkward strings | — |
| 10 | comments `<!-- -->` | `{/* … */}` only inside children | Syntax error |
| 11 | `<div>` in a string of HTML | JSX values, never strings | You would see the literal text |

And the reverse list — things that *are* the same: tag names, nesting rules, `data-*`/`aria-*`/`role`, and the general shape of the tree. JSX chose familiarity on purpose: it is "HTML-shaped JavaScript".

---

## 8. How JSX compiles: the automatic runtime

Our `Greeting` example, compiled for a **production** build:

```js
import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";

export function Greeting({ name }) {
    return _jsxs("p", { className: "greet", children: ["Hello, ", name, "!"] });
}
export const el = _jsx(Greeting, { name: "Ada" });
export const frag = _jsxs(_Fragment, { children: [_jsx("span", { children: "a" }), _jsx("span", { children: "b" })] });
```

And for a **development** build (`--jsx react-jsxdev`):

```js
import { jsxDEV as _jsxDEV, Fragment as _Fragment } from "react/jsx-dev-runtime";
const _jsxFileName = "/tmp/jsx.tsx";

export function Greeting({ name }) {
    return _jsxDEV("p", { className: "greet", children: ["Hello, ", name, "!"] },
        void 0, true,
        { fileName: _jsxFileName, lineNumber: 2, columnNumber: 9 }, this);
}
```

Read the difference carefully — it answers a question you will have soon:

- `jsx` vs **`jsxDEV`**: the dev runtime passes **file, line and column** for every element. That is how React can say *"Check the render method of `ProductCard`"* and how DevTools and the overlay point at the exact JSX line. None of that exists in production, which is why production errors are terser.
- `jsxs` (plural) is used when children are a **static array**; `jsx` when there is a single child. It is a small optimisation inside React's runtime. You never call either by hand.
- The automatic runtime (React 17+) imports `react/jsx-runtime` itself, which is why modern files need **no `import React`**. Older tutorials show `React.createElement(…)` from the classic runtime; that is history, and mixing the two mental models is a common source of "why does this tutorial say I must import React?" confusion.

The four "element factories" you will encounter, in the order you should care about them:

| API | Form | Verdict |
| --- | --- | --- |
| **JSX** | `<PriceTag priceMinor={499900} />` | The normal way. Use it |
| `jsx()` / `jsxs()` from `react/jsx-runtime` | what JSX becomes | Never written by hand; it appears in compiled output you read |
| `createElement()` | `React.createElement('p', { className: 'x' }, 'hi')` | Legacy-runtime equivalent; useful when you must build elements from data with dynamic tag names |
| `cloneElement()` | `React.cloneElement(child, { className: 'x' })` | Implicit prop injection into children. **Avoid** in new code — prefer explicit props or a context (Part 5); it breaks the "props flow down, visibly" rule |

---

## 9. Common mistakes

| Mistake | What you see | Fix |
| --- | --- | --- |
| `class` instead of `className` | TS2322, "Did you mean 'className'?" | Rename |
| `for` instead of `htmlFor` | TS2322, "Did you mean 'htmlFor'?" | Rename |
| Two root elements | TS2657 | Wrap in `<></>` or an element |
| Unclosed `<img>`/`<li>` | "JSX element has no corresponding closing tag" | Self-close: `<img … />` |
| `style="color:red"` | TS2559 | `style={{ color: 'red' }}` |
| `onClick={handleClick()}` | The handler runs during render, instantly, and every render | Tell the reference: `onClick={handleClick}` — or wrap it: `onClick={() => handleClick(id)}` (file 12) |
| `{user}` where `user` is an object | Runtime error "Objects are not valid as a React child" | `{user.name}` |
| `{items.length && <List />}` | A literal `0` renders when the list is empty | `{items.length > 0 && <List />}` (file 10) |
| `{// comment}` | Syntax error about the closing tag | `{/* comment */}` |
| `{if (x) …}` | "Expression expected" | Use a ternary or `&&`, or compute before the JSX |
| Invented attribute `foo="bar"` | TS2322 + dev warning | Use `data-foo`, `aria-*`, or a component prop |
| Rendering a component that was never imported | TS2304: *Cannot find name 'ProductCard'* | Import it — and remember the capital letter rule |
| `return` with a newline before `<div>` | Nothing renders (ASI inserts a semicolon) | `return (` + element, or keep it on the same line |

That last row deserves a line of code, because it is silent:

```tsx
// ✗ returns undefined — JavaScript inserts a semicolon after `return`
function Broken() {
  return
    <p>never rendered</p>;
}

// ✓
function Fixed() {
  return (
    <p>rendered</p>
  );
}
```

---

## 10. Best practices

1. **Keep JSX shallow.** Past ~5 levels of nesting, extract a component. Deeply nested JSX is where "which `</div>` is this?" bugs live.
2. **Compute before you render.** Derived values go above `return` (file 04 §8 and file 09).
3. **Prefer `className` composition with template literals** over scattered `if`s, and only for *strings*; use `style={{}}` for genuinely dynamic numbers (`width: '92%'` in `Rating`).
4. **Give every non-obvious element an accessibility story**: `alt` on images, `aria-label`/`role` on custom widgets (our `Rating` labels its bar; `CategoryFilter` marks pressed chips). JSX makes it look optional; the DOM does not.
5. **`{' '}` over hand-aligned whitespace** when a space matters; aligned whitespace gets eaten by formatters.
6. **Never build HTML strings.** If you catch yourself writing `'<div>' + … `, you have left JSX and taken its escaping guarantees with you.
7. **Treat `dangerouslySetInnerHTML` as a red flag** in review; if it is genuinely needed, the input must be sanitised upstream.
8. **Use fragments to group, not divs to satisfy the compiler.** A `<div>` you added only to make JSX legal will bite you in CSS.
9. **Let the types work**: if `<div foo="bar" />` is rejected, that is information about your intent, not an obstacle. Rename it to `data-foo` or move it to a component prop.

---

## 11. Practice

### Beginner

1. Write a `BookSummary` component that renders a title, an author and a price, given `{ title: string; author: string; priceMinor: number }`. Render it three times from `App.tsx` with different values. Use `formatMoney` from `src/data/products.ts`.
2. Deliberately introduce each of these errors, read the message, then fix it: (a) `class` instead of `className`; (b) `style="color: red"`; (c) two adjacent root elements; (d) `<img …>` without a slash.

**Solution**

```tsx
// src/components/BookSummary.tsx
import { formatMoney } from '../data/products';

export interface BookSummaryProps {
  title: string;
  author: string;
  priceMinor: number;
}

export function BookSummary({ title, author, priceMinor }: BookSummaryProps) {
  return (
    <article className="book">
      <h3>{title}</h3>
      <p className="book__author">by {author}</p>
      <p className="book__price">{formatMoney(priceMinor)}</p>
    </article>
  );
}
```

```tsx
// src/App.tsx (excerpt)
<main className="page">
  <BookSummary title="The Pragmatic Programmer" author="Hunt & Thomas" priceMinor={249900} />
  <BookSummary title="Refactoring" author="Martin Fowler" priceMinor={319900} />
  <BookSummary title="Designing Data-Intensive Applications" author="Martin Kleppmann" priceMinor={429900} />
</main>
```

The four errors, and what to notice: (a) TS2322 with a *"Did you mean"* suggestion; (b) TS2559 complaining that a string has no properties in common with a style object — read that one carefully, it is telling you the *type* is wrong, not the value; (c) TS2657 — wrap in `<>…</>` and watch every other error in the project reappear; (d) "JSX element 'img' has no corresponding closing tag".

### Intermediate

Build a `PriceLine` component that shows the current price, the "was" price only when the product is discounted, a "Save ₹X" note, and a "sold out" badge only when `stock === 0`. Then answer: why is `{savings && <span>…</span>}` wrong here, and what is the type-safe way to show the badge only when the count is *exactly* zero?

**Solution**

```tsx
// src/components/PriceLine.tsx
import { formatMoney } from '../data/products';

export interface PriceLineProps {
  priceMinor: number;
  compareAtMinor?: number | undefined;
  stock: number;
}

export function PriceLine({ priceMinor, compareAtMinor, stock }: PriceLineProps) {
  const isDiscounted = compareAtMinor !== undefined && compareAtMinor > priceMinor;
  const savingsMinor = isDiscounted ? compareAtMinor - priceMinor : 0;
  const soldOut = stock === 0;

  return (
    <p className="price-line">
      <strong className="price-line__now">{formatMoney(priceMinor)}</strong>

      {isDiscounted && (
        <>
          <s className="price-line__was">{formatMoney(compareAtMinor)}</s>
          <span className="price-line__save">Save {formatMoney(savingsMinor)}</span>
        </>
      )}

      {soldOut && <span className="badge badge--out">Sold out</span>}
    </p>
  );
}
```

`{savings && …}` would render the **number** `0` when there is no discount, because `0` is a renderable value (section 6). The fix is to make the condition a *boolean*: `isDiscounted` (already an explicit `!== undefined` comparison) or `soldOut = stock === 0`. Notice also that `soldOut` is written with `=== 0`, not `!stock`, for the same reason: `!stock` is true for `0` **and** would be true for `NaN`, and it reads as "not stock" rather than "no stock".

### Challenge

Write a `SpecList` that renders a definition list from `Record<string, string>` data, with these requirements: keys are shown in `<dt>`, values in `<dd>`; values that look like a URL are rendered as a link; the whole list renders nothing when the record is empty. Then explain the `Object.entries` typing problem you had to solve.

**Solution**

```tsx
// src/components/SpecList.tsx
export interface SpecListProps {
  specs: Record<string, string>;
}

const URL_LIKE = /^https?:\/\//i;

export function SpecList({ specs }: SpecListProps) {
  const entries = Object.entries(specs);

  if (entries.length === 0) return null;      // render nothing for an empty spec sheet

  return (
    <dl className="specs">
      {entries.map(([label, value]) => (
        <div className="specs__row" key={label}>
          <dt>{label}</dt>
          <dd>
            {URL_LIKE.test(value) ? (
              <a href={value} target="_blank" rel="noreferrer">
                {value}
              </a>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
```

The typing detail: `Object.entries(specs)` on a `Record<string, string>` yields `[string, string][]`, so the destructured `label` and `value` are `string` — no casts needed. The same call on an **interface** (rather than a `Record`/index-signature type) yields `[string, any][]` or fails to infer cleanly, which is the Part 2 rule "interfaces do not have index signatures" showing up in React code. If your specs have *known* keys, prefer a typed shape (`interface Specs { weight: string; warranty: string }`) and `Object.entries` still works, but the `key` is then a union of literal keys.

Note the valid-HTML subtlety: `<dl>` allows `<div>` wrappers around `<dt>`/`<dd>` pairs in the current HTML spec, which is why the row wrapper is a `<div>` and not a fragment — a fragment would be invalid here. This is exactly the kind of decision that "JSX looks like HTML" hides.

---

## 12. Summary

- JSX is a **compile-time syntax extension**; every element compiles into a `jsx()`/`jsxs()` call that returns a plain object (an element).
- **JSX is an expression**: assign it, return it, pass it, store it in arrays. Control flow comes from JavaScript expressions (`map`, `?:`, `&&`), never from statements.
- `{}` holds **expressions**; statements must be computed before the JSX. `{/* */}` is the only comment form inside children.
- **Capitalisation decides meaning**: lowercase = DOM tag (string), capitalised = your component (identifier). Self-closing is mandatory; void elements reject children at runtime.
- Attributes are **props**: `className`, `htmlFor`, camelCase DOM names, functions for events, `{{ }}` for style, `data-*`/`aria-*` allowed, invented attributes rejected.
- **Children become the `children` prop** — the basis of every slot/composition pattern.
- Whitespace is trimmed around newlines; `{' '}` restores a space. Text and attributes are **escaped by default**; `dangerouslySetInnerHTML` opts out and is a security decision.
- Falsy rendering: `null`/`undefined`/booleans render nothing; **`0` and `NaN` render**; objects throw.
- The dev transform (`jsxDEV`) carries file/line/column, which is why dev errors point at your JSX; production strips it.
- A **syntax error hides all other errors** — fix TS2657-class errors first.

---

**What's next →** [`06-tsx.md`](./06-tsx.md)
