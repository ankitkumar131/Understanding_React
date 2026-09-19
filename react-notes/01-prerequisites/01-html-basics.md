# 01 — HTML Basics (the HTML React Actually Produces)

> **Part 1 · Prerequisites · File 1 of 11**
>
> **Why this file exists:** React is a way to *generate* HTML from JavaScript.
> If you do not know exactly what HTML is, what a browser does with it, and how
> the DOM is built from it, then React will look like magic syntax with no
> meaning. After this file, "JSX" will feel like a small variation of something
> you already understand, instead of a new language.

---

## 1. What HTML is (in plain language)

**HTML (HyperText Markup Language)** is a text format for describing the
**structure and meaning** of a web page.

- It does **not** describe how things look (that is CSS).
- It does **not** describe what things do (that is JavaScript).
- It describes **what things are**: this is a heading, this is a paragraph, this
  is a link to another page, this is a form with two inputs.

A browser (Chrome, Firefox, Safari, Edge) reads HTML and turns it into something
it can draw on screen and something JavaScript can control.

```text
You write            Browser does              User sees
─────────            ────────────              ─────────
HTML text      →     parse → build DOM    →    rendered page
index.html           (a tree of objects)       (pixels)
```

**The single most important sentence in this file:**

> HTML is a **description of a tree**. Every element inside another element is a
> node in that tree. React is a tool for building and updating that tree.

---

## 2. A minimal HTML document, explained line by line

Create a folder called `html-playground` and inside it a file `index.html`:

```text
html-playground/
└── index.html
```

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My First Page</title>
  </head>
  <body>
    <h1>Hello, HTML</h1>
    <p>This is my first page.</p>
  </body>
</html>
```

**Line by line**

- `<!DOCTYPE html>` — "This file is modern HTML5." It is not an element; it is a
  *declaration* telling the browser which parsing rules to use. If you omit it,
  browsers fall back to "quirks mode" and some CSS behaves oddly.
- `<html lang="en">` — the root element. Everything lives inside it.
  `lang="en"` declares the page language: screen readers use it to choose the
  right pronunciation, and browsers use it for spell-check and translation.
- `<head>` — a container for **information about the page** that is not shown as
  page content: character encoding, viewport rules, title, CSS links, favicons.
- `<meta charset="UTF-8" />` — which character set the bytes are encoded in.
  UTF-8 covers every language and emoji. Without it, `café` may render as
  `cafÃ©`.
- `<meta name="viewport" ... />` — tells mobile browsers to use the real device
  width instead of pretending to be a 980px-wide desktop. This is what makes
  mobile-first CSS possible.
- `<title>My First Page</title>` — the browser tab text and the default bookmark
  name. **Note:** React can set this too (React 19 supports rendering `<title>`
  inside a component; Part 11 covers it).
- `<body>` — everything the user actually sees.
- `<h1>Hello, HTML</h1>` — a level-1 heading (the main heading of the page).
- `<p>...</p>` — a paragraph.

**How to run it**

1. Open the `html-playground` folder in your file manager.
2. Double-click `index.html`. It opens in your browser.

**Expected result:** a tab titled "My First Page" showing a big bold
"Hello, HTML" and a normal-sized sentence below it.

---

## 3. Elements, tags, attributes

The general shape of an element:

```text
<tagname attribute="value">content</tagname>
    ↑          ↑              ↑
 element    attribute      children / text
  name
```

- **Tag** — the written `<p>` / `</p>` markers.
- **Element** — the whole thing from opening tag to closing tag, including
  content. In conversation people say "tag" when they mean "element"; fine.
- **Attribute** — extra information attached to the start tag, written as
  `name="value"`.
- **Children** — the elements or text between the tags.

**Nesting:** elements can contain other elements, forming a tree.

```html
<body>
  <header>
    <h1>Shop</h1>
    <nav>
      <a href="/products">Products</a>
      <a href="/cart">Cart</a>
    </nav>
  </header>
  <main>
    <p>A small shop.</p>
  </main>
</body>
```

```text
body
├── header
│   ├── h1  "Shop"
│   └── nav
│       ├── a  "Products"
│       └── a  "Cart"
└── main
    └── p  "A small shop."
```

That shape — **a tree** — is the shape React thinks in. When you later read
"component tree", remember this diagram: it is the same idea, but each node is a
component instead of a tag.

### Void elements (no closing tag)

Some elements never have children, so they have no closing tag:

```html
<img src="cat.png" alt="A sleeping cat" />
<input type="email" name="email" />
<br />
<hr />
<meta charset="UTF-8" />
<link rel="stylesheet" href="styles.css" />
```

The trailing `/` is optional in HTML (`<img src="cat.png">` works), but it is
**required in JSX/TSX** — React will not compile `<img src="cat.png">`. Get used
to writing `/` now; it will save you an error later.

> ⚠️ **Beginner mistake:** writing `<img src="cat.png"></img>`. Images have no
> closing tag and no children. Void elements are: `area`, `base`, `br`, `col`,
> `embed`, `hr`, `img`, `input`, `link`, `meta`, `source`, `track`, `wbr`.

---

## 4. Common attributes you will use constantly

| Attribute | Belongs to | What it does | React note |
| --- | --- | --- | --- |
| `id` | any | unique identifier for the page | used with `<label htmlFor>` and JS lookups |
| `class` | any | CSS class names (space-separated) | **becomes `className` in JSX** |
| `style` | any | inline CSS | in JSX it takes an object: `style={{ color: 'red' }}` |
| `href` | `<a>`, `<link>` | destination URL | `<a href="/about">` is a full navigation; React Router uses `<Link to="/about">` |
| `src` | `<img>`, `<script>` | file URL to load | — |
| `alt` | `<img>` | text shown/announced if the image cannot load | required for accessibility |
| `type` | `<input>`, `<button>` | variant of the element | `type="button"` vs default `submit` (a classic form bug) |
| `name` | form controls | key used when submitting the form | also how uncontrolled form data is read (`FormData`) |
| `value` | form controls | current value | React controls this prop |
| `placeholder` | inputs | hint text | not a label; never a replacement for one |
| `disabled`, `required`, `checked`, `selected`, `readOnly` | form controls | boolean flags | in JSX write `disabled={true}` or just `disabled` |
| `data-*` | any | custom data, e.g. `data-id="42"` | handy for tests (`data-testid`) |
| `aria-*`, `role` | any | accessibility information | React passes them straight through |

### Attribute vs property

This distinction matters in React, so learn it here.

```html
<input id="email" value="hello" />
```

- The **attribute** `value="hello"` is what was written in the HTML text — the
  *initial* value.
- The **property** `input.value` is the *current* value in the live DOM. If the
  user types, the attribute stays `"hello"` but the property becomes whatever
  they typed.

You can see this in your browser console:

```js
const input = document.querySelector('#email');
console.log(input.getAttribute('value')); // "hello"  (what the HTML said)
console.log(input.value);                 // "hello"  (for now)
// now type "world" into the box and run the two lines again
```

> 💡 **Why you care:** React works with **properties**, not attributes. That is
> why React can control an input's value and keep it in sync with state. It is
> also why `<input value={x} />` without an `onChange` becomes read-only — React
> keeps forcing the property back to `x`.

---

## 5. Text, links, images, lists

```html
<h1>Main heading</h1>
<h2>Section heading</h2>
<p>
  A paragraph with <strong>importance</strong>, <em>emphasis</em>,
  <a href="https://react.dev" target="_blank" rel="noopener noreferrer">
    a link
  </a>
  and a line break.<br />
  New line here.
</p>

<img src="https://placehold.co/120x80" alt="Placeholder" width="120" height="80" />

<ul>
  <li>Unordered item</li>
  <li>Another item</li>
</ul>

<ol>
  <li>First step</li>
  <li>Second step</li>
</ol>
```

**Explained**

- Headings `h1`–`h6` express **document structure**, not font size. Use one `h1`
  per page and do not skip levels — screen-reader users navigate by headings.
- `<strong>` = important, `<em>` = emphasised. `<b>` and `<i>` only change
  appearance (styling), so prefer `strong`/`em` for meaning.
- `<a href="...">` navigates. `target="_blank"` opens a new tab.
  `rel="noopener noreferrer"` is a security best practice: without it, the opened
  page can access your page through `window.opener`.
- `<img>` **always** needs `alt`. Set `width`/`height` so the browser reserves
  space and the page does not jump while loading (this becomes the **CLS** metric
  in Part 15).
- `<ul>` = bullets (order doesn't matter), `<ol>` = numbers (order matters),
  `<li>` = the item. Only `<li>` may be a direct child of `ul`/`ol`.
- `<br />` forces a line break inside text. Do not use it to create paragraphs —
  use separate `<p>` elements. Using `br` for layout is the HTML equivalent of
  using spaces to align a Word document.

---

## 6. Semantic elements: meaning over appearance

"Semantic" means "carries meaning". Compare:

```html
<!-- ❌ Div soup: the browser, screen readers and search engines learn nothing -->
<div class="top">
  <div class="title">Shop</div>
  <div class="links">
    <div class="link">Products</div>
  </div>
</div>
<div class="content">
  <div class="post">
    <div class="post-title">Sale</div>
    <div class="post-body">Everything 50% off.</div>
  </div>
</div>
```

```html
<!-- ✅ Same look, but meaningfully structured -->
<header>
  <h1>Shop</h1>
  <nav>
    <a href="/products">Products</a>
  </nav>
</header>
<main>
  <article>
    <h2>Sale</h2>
    <p>Everything 50% off.</p>
  </article>
</main>
```

The main layout elements:

| Element | Meaning |
| --- | --- |
| `<header>` | introductory content for the page or a section (logo, title, nav) |
| `<nav>` | a group of navigation links |
| `<main>` | the main content of the page — **only one per page** |
| `<section>` | a thematic grouping, usually with its own heading |
| `<article>` | self-contained content that would make sense on its own (post, card, comment) |
| `<aside>` | tangential content (sidebar, related links) |
| `<footer>` | closing content (copyright, links, contact) |
| `<figure>` / `<figcaption>` | an image/diagram with its caption |
| `<button>` | something that performs an action |

**Why it matters even if it looks identical on screen:**

1. **Accessibility.** Screen readers announce "navigation", "main content",
   "button". A `div` with `onClick` is announced as nothing — a blind user cannot
   find or use it. In React you will constantly be tempted to put `onClick` on a
   `div`; use `<button>` instead.
2. **SEO.** Search engines weigh `<h1>`, `<article>`, `<nav>` structure.
3. **Keyboard behaviour comes free.** `<button>` is focusable and activates with
   Enter and Space. A `div` is none of those things.
4. **Readability.** Six months later, `<nav>` tells you what the code is.

> 🏭 **Production habit:** if you need a click handler, reach for `<button>` (or
> `<a>` for navigation) before `<div>`. Then style it however you want. The
> semantic element + CSS beats a fake one every time.

---

## 7. Forms: the part that matters most for React

Forms are where React's mental model is most visible, so learn the HTML side
precisely.

```html
<form id="signup">
  <div>
    <label for="email">Email</label>
    <input id="email" name="email" type="email" required placeholder="you@example.com" />
  </div>

  <div>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" minlength="8" required />
  </div>

  <div>
    <label for="country">Country</label>
    <select id="country" name="country">
      <option value="">Choose…</option>
      <option value="in">India</option>
      <option value="us">United States</option>
    </select>
  </div>

  <div>
    <label>
      <input type="checkbox" name="terms" required />
      I accept the terms
    </label>
  </div>

  <div>
    <label for="bio">Bio</label>
    <textarea id="bio" name="bio" rows="3"></textarea>
  </div>

  <button type="submit">Sign up</button>
  <button type="button">Clear</button>
</form>
```

**Line by line**

- `<form>` groups inputs and defines **what happens when they are submitted**.
  With no `action`/`method`, submitting does a `GET` to the current URL — which
  reloads the page. This reload is exactly what React handlers must prevent with
  `event.preventDefault()`.
- `<label for="email">` — `for` must equal the input's `id`. Clicking the label
  then focuses the input, and screen readers announce the label as the field's
  name. **In JSX this attribute is `htmlFor`**, because `for` is a reserved word
  in JavaScript.
- `type="email"` — on mobile, shows an email keyboard; browsers also validate the
  format. `type` also determines what the value *means* (`password` masks it,
  `number` allows spinners, `date` shows a date picker).
- `required` — the browser refuses to submit and shows its own message. Useful,
  but **never enough**: client-side validation is a UX feature, not security.
  The server must validate again (Part 15).
- `name="email"` — the key used when the form is submitted / read with
  `FormData`. Without a `name`, a field's value is invisible to the form.
- `placeholder` — hint text inside the box. It disappears when typing and is not
  a label; never use it as one.
- `<select>` with `<option value="...">` — the submitted value is the selected
  option's `value`, not its visible text.
- Wrapping an `<input>` **inside** a `<label>` (the checkbox case) also links
  them — no `id`/`for` needed. This is the idiomatic pattern for checkboxes.
- `<textarea>` — unlike `<input>`, its content goes between the tags.
  In JSX you will instead use `value={text}` because React treats it like any
  other controlled input.
- `<button type="submit">` submits the form.
- `<button type="button">` does **nothing** by default. This distinction causes
  one of the most common React bugs: a "Clear" button inside a form with no
  `type` defaults to `submit`, so it wipes the form *and* submits it.

### What "submitting" actually means

```text
user presses Enter in a text field, or clicks a submit button
        ↓
browser collects every named control's value
        ↓
browser runs its built-in validation (required, type, minlength…)
        ↓
if valid: browser navigates to `action` (default: the same URL) and reloads the page
```

Everything the browser does after "collects the values" is what we will replace
with JavaScript in React: we intercept the submit event, read the values from
React state, call an API, and update the UI without a reload.

### Input types worth knowing

| `type` | Renders as | Notes |
| --- | --- | --- |
| `text` | single-line text | default |
| `email` | text + email keyboard | validates basic format |
| `password` | masked text | value is still plain text in JS |
| `number` | text + steppers | returns a **string** in JS; can be empty |
| `checkbox` | tick box | `.checked` boolean, not `.value` |
| `radio` | one of a group | group by identical `name` |
| `file` | file picker | **cannot** be a controlled input in React |
| `date`, `time` | pickers | string values like `"2026-09-19"` |
| `submit` / `button` / `reset` | buttons | `submit` triggers the form |

> 💡 **Checkbox and radio are different from everything else.** For text inputs
> you read `event.target.value`; for checkboxes and radios you read
> `event.target.checked` (a boolean). Mixing these up is the most common form
> bug in React's early chapters, and now you know it before writing a line of
> React.

---

## 8. The DOM: what the browser really builds

Open any page, press F12 (or right-click → Inspect) and look at the **Elements**
panel. That is the **DOM** (Document Object Model).

- The DOM is a **tree of JavaScript objects** representing the page.
- HTML text is the *source*; the DOM is the *live model*.
- JavaScript reads and writes the DOM to change what the user sees.

The DOM is not the same as your HTML file:

| | HTML source | DOM |
| --- | --- | --- |
| What it is | text you wrote | live objects in memory |
| Can JavaScript change it? | no | yes |
| Does it include content injected by JS? | no | yes |
| Fixes invalid nesting automatically? | no | yes (browser repairs it) |

### Watching the DOM change (vanilla JavaScript, no React)

This example shows the pain React was invented to remove. Save as
`html-playground/dom-demo.html`:

```text
html-playground/
├── index.html
└── dom-demo.html
```

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>DOM Demo</title>
  </head>
  <body>
    <h1>Counter without React</h1>
    <p>Count: <span id="count">0</span></p>
    <button id="increment">+1</button>
    <button id="reset">Reset</button>

    <script>
      // 1. Read the starting value out of the DOM (the DOM is our "state")
      let count = 0;

      // 2. Grab references to the elements we will touch
      const countEl = document.querySelector('#count');
      const incrementBtn = document.querySelector('#increment');
      const resetBtn = document.querySelector('#reset');

      // 3. Define how to update the screen
      function render() {
        countEl.textContent = String(count);
      }

      // 4. Wire up the events
      incrementBtn.addEventListener('click', () => {
        count = count + 1; // update the data
        render();          // then manually update the DOM
      });

      resetBtn.addEventListener('click', () => {
        count = 0;
        render();
      });

      render(); // initial paint
    </script>
  </body>
</html>
```

**Line by line**

- `let count = 0;` — the data lives in a JavaScript variable.
- `document.querySelector('#count')` — asks the DOM for the element with
  `id="count"`. Stored so we do not search again on every click.
- `function render()` — **the key idea**: one function that copies the data into
  the DOM.
- `countEl.textContent = String(count)` — writes the number into the page. Setting
  `textContent` replaces the element's text; the browser then repaints.
- `addEventListener('click', handler)` — registers a function to run on click.
- Inside the handler: `count = count + 1; render();` — **change the data, then
  manually re-render**. Every manual DOM app follows this pattern, and every
  manual DOM app eventually forgets one `render()` call in one branch, and that
  is the bug you spend the afternoon on.

**Expected result:** the number increases when you click, and resets to 0.

### Now imagine 200 items

```js
// The "old way" for a list: build the DOM by hand, every time, for every change
const ul = document.querySelector('#list');
ul.innerHTML = '';                       // destroy everything...

items.forEach((item) => {                // ...and rebuild it
  const li = document.createElement('li');
  li.textContent = item.name;
  li.className = 'item';
  li.addEventListener('click', () => select(item.id));
  ul.appendChild(li);
});
```

Notice what this code has to do for a *single* changed item:

1. Throw away the entire list from the DOM.
2. Recreate every row from scratch.
3. Re-attach every event listener.
4. Lose focus, scroll position inside inputs, text selection and CSS animation
   state.
5. Do all this by hand, for every kind of update, in every screen of the app.

**This is the problem React solves.** In React you will write:

```tsx
<ul id="list">
  {items.map(item => (
    <li key={item.id} className="item" onClick={() => select(item.id)}>
      {item.name}
    </li>
  ))}
</ul>
```

You describe what the list *should look like* for the current data. React figures
out the minimal set of DOM operations — and it updates only the changed row.

You do not have to understand that code yet. Just notice: you never call
`createElement`, `appendChild` or `innerHTML`, and you never call `render()` by
hand.

---

## 9. Accessibility basics you must not skip

React does not make accessibility automatic; it only makes it easy to get right.
Three rules carry most of the weight:

**1. Every form control needs an accessible name.**

```html
<label for="email">Email</label>
<input id="email" />
```

or, when visuals don't need a visible label:

```html
<input id="search" aria-label="Search products" />
```

**2. Use the right element for the job.**

```html
<!-- ❌ not focusable, invisible to assistive tech, no keyboard support -->
<div class="btn" onclick="save()">Save</div>

<!-- ✅ focusable, Enter/Space work, announced as a button -->
<button type="button" onclick="save()">Save</button>
```

**3. Images need `alt`.**

```html
<img src="chart.png" alt="Sales rose 20% in Q3" />   <!-- meaningful -->
<img src="decoration.png" alt="" />                  <!-- decorative: empty alt, not omitted -->
```

**Quick check:** press `Tab` through your page. Can you reach every interactive
thing? Is there a visible focus outline? If not, keyboard-only users (and many
other people) cannot use your page. In React this is a five-second test you
should run after every UI change.

---

## 10. What HTML alone cannot do (why React is coming)

| Need | HTML alone | With JavaScript | With React |
| --- | --- | --- | --- |
| Show data | static text only | must build DOM by hand | describe once, reuse components |
| Update a value | reload the page | manual DOM updates | state change → React updates DOM |
| Reuse a "card" 50 times | copy-paste 50 times | functions that create DOM | one component rendered in a loop |
| Keep data and UI in sync | impossible | your responsibility, bugs guaranteed | React derives UI from data |
| Split a page into pieces | no | possible, messy | components with props |

The next 17 parts of these notes are about doing the right-hand column
*properly*.

---

## 11. Cheat sheet

```html
<!-- structure -->
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Page</title></head><body>…</body></html>

<!-- semantics: header nav main section article aside footer figure figcaption -->
<header><nav><a href="/">Home</a></nav></header>
<main>
  <section>
    <h2>Products</h2>
    <article><h3>Widget</h3><p>₹499</p></article>
  </section>
</main>
<footer><small>© 2026</small></footer>

<!-- text: h1-h6 p strong em small br hr blockquote code pre -->
<p><strong>Bold-ish</strong> and <em>italic-ish</em> and <code>inline code</code></p>

<!-- media & links -->
<a href="/about" title="About us">About</a>
<img src="/logo.png" alt="Company logo" width="120" height="40" />
<figure><img src="/chart.png" alt="Sales chart" /><figcaption>Q3 sales</figcaption></figure>

<!-- lists -->
<ul><li>a</li><li>b</li></ul>
<ol><li>one</li><li>two</li></ol>
<dl><dt>Term</dt><dd>Definition</dd></dl>

<!-- tables -->
<table>
  <thead><tr><th scope="col">Name</th><th scope="col">Price</th></tr></thead>
  <tbody><tr><td>Widget</td><td>₹499</td></tr></tbody>
</table>

<!-- forms -->
<form action="/submit" method="post">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required />
  <fieldset>
    <legend>Plan</legend>
    <label><input type="radio" name="plan" value="free" checked /> Free</label>
    <label><input type="radio" name="plan" value="pro" /> Pro</label>
  </fieldset>
  <label><input type="checkbox" name="news" /> Newsletter</label>
  <select name="country"><option value="in">India</option></select>
  <textarea name="bio" rows="3"></textarea>
  <button type="submit">Send</button>
  <button type="reset">Reset</button>
</form>
```

| HTML attribute | JSX/TSX | Why |
| --- | --- | --- |
| `class` | `className` | `class` is a reserved word in JS |
| `for` | `htmlFor` | `for` is a reserved word in JS |
| `style="color:red"` | `style={{ color: 'red' }}` | JSX takes an object |
| `onclick="f()"` | `onClick={f}` | a function reference, camelCase |
| `tabindex` | `tabIndex` | camelCase for all attributes |
| `<img ...>` | `<img ... />` | JSX requires closing/self-closing |

Do not memorise the last table today — it is repeated in Part 3 where you
actually write JSX.

---

## 12. Common mistakes in this chapter's material

| ⚠️ Mistake | What happens | Fix |
| --- | --- | --- |
| Forgetting `<!DOCTYPE html>` | quirks mode; unexpected CSS | always include it |
| Nesting a `<div>` inside a `<p>` | browser auto-closes the `<p>`; broken layout | only phrasing content goes inside `<p>` |
| `<label>` without `for`/`id` | clicking the label does nothing; screen readers lose the field | link them, or wrap the input |
| Input without `name` | value missing from form submission / `FormData` | always add `name` |
| `<button>` with no `type` inside a form | becomes `submit`; form submits accidentally | be explicit: `type="button"` or `type="submit"` |
| Using `placeholder` as a label | label vanishes while typing; inaccessible | always add a `<label>` |
| Using `<br>` for spacing | unpredictable layout, bad semantics | use CSS margins |
| Multiple `<h1>`/skipped heading levels | poor screen-reader navigation | one `h1`, then `h2`, `h3` in order |
| `<div onClick>` | not keyboard accessible | use `<button>` |
| `alt` missing | images are unusable to blind users | describe or use `alt=""` for decorative |

---

## 13. Practice exercises

### Beginner

Take the following "div soup" and rewrite it with semantic elements, a working
`<label>`, and `alt` text. Do not change how it looks.

```html
<div class="top">
  <div class="brand">MegaShop</div>
  <div class="menu"><div class="item">Home</div><div class="item">Products</div></div>
</div>
<div class="content">
  <div class="block">
    <div class="big">Best Sellers</div>
    <img src="/widget.png" />
    <div class="price">₹499</div>
  </div>
</div>
<div class="bottom">© 2026 MegaShop</div>
```

**Solution**

```html
<header>
  <h1>MegaShop</h1>
  <nav>
    <a href="/">Home</a>
    <a href="/products">Products</a>
  </nav>
</header>

<main>
  <section aria-labelledby="best-sellers">
    <h2 id="best-sellers">Best Sellers</h2>
    <article>
      <img src="/widget.png" alt="Widget, our best selling product" width="200" height="200" />
      <p>₹499</p>
    </article>
  </section>
</main>

<footer>
  <small>© 2026 MegaShop</small>
</footer>
```

**Why this is better**

- `header`/`nav`/`main`/`section`/`article`/`footer` give the page meaning; the
  `.top`/`.content`/`.bottom` classes gave it nothing.
- `h1` then `h2` create a real outline a screen reader can jump through.
- `aria-labelledby` ties the section to its heading, so it is announced as
  "Best Sellers, region".
- The image now has `alt`, which is the difference between "image" and "Widget,
  our best selling product" for a blind user.
- `width`/`height` prevent layout shift while the image loads.

### Intermediate

Build `profile.html`: a user profile page with a header, an `<article>` card
containing an avatar image, name (`h2`), a bio paragraph and a list of skills,
plus a footer. Then add a form that lets a visitor "send a message": name, email,
message textarea, a "notify me" checkbox, a submit button and a **reset** button.
Requirements: every field must have a proper label, `name` attributes, sensible
`type`s, and the reset button must not submit the form.

**Solution**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ada Lovelace — Profile</title>
  </head>
  <body>
    <header>
      <h1>Team Directory</h1>
      <nav>
        <a href="/">Home</a>
        <a href="/team">Team</a>
      </nav>
    </header>

    <main>
      <article>
        <img src="/ada.png" alt="Portrait of Ada Lovelace" width="120" height="120" />
        <h2>Ada Lovelace</h2>
        <p>Mathematician and first programmer.</p>

        <h3>Skills</h3>
        <ul>
          <li>Mathematics</li>
          <li>Analytical engines</li>
          <li>Writing</li>
        </ul>
      </article>

      <section aria-labelledby="contact-heading">
        <h2 id="contact-heading">Send a message</h2>
        <form action="/messages" method="post">
          <p>
            <label for="sender-name">Your name</label>
            <input id="sender-name" name="name" type="text" required />
          </p>
          <p>
            <label for="sender-email">Email</label>
            <input id="sender-email" name="email" type="email" required />
          </p>
          <p>
            <label for="message">Message</label>
            <textarea id="message" name="message" rows="4" required></textarea>
          </p>
          <p>
            <label>
              <input type="checkbox" name="notify" />
              Notify me about replies
            </label>
          </p>
          <button type="submit">Send</button>
          <button type="reset">Clear</button>
        </form>
      </section>
    </main>

    <footer><small>© 2026 Team Directory</small></footer>
  </body>
</html>
```

**Notes on the solution**

- `<p>` wrappers around each label+input pair give the form a natural vertical
  rhythm without CSS. Using `<div>` would work equally well; `<p>` is fine here
  because `label` and `input` are phrasing content.
- `type="reset"` clears the fields. **`type="reset"` is also the reason a plain
  `<button>` is dangerous**: with no `type`, a button defaults to `submit`.
- `type="email"` triggers the browser's own validation and mobile keyboard.

### Challenge

Build `todos.html`: a static page (no JavaScript) that represents a **todo
list**, correctly structured, that a screen-reader user could navigate:

- a heading "My Todos"
- a form to add a todo: text input + submit button (no JavaScript; it just needs
  to be semantically correct)
- a list of 4 todos, where 2 are done. Each todo is a checkbox with a
  `<label>` whose text is the todo title.
- a "done" todo should be marked in a way that is *meaningful*, not just colour.
- a footer showing how many are complete.

Then answer in your own words: **what breaks on this page as a paper form that
makes you wish you had JavaScript?** (This is the exact motivation for Part 3.)

**Solution**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Todos</title>
  </head>
  <body>
    <header>
      <h1>My Todos</h1>
    </header>

    <main>
      <section aria-labelledby="add-heading">
        <h2 id="add-heading">Add a todo</h2>
        <form action="/todos" method="post">
          <label for="new-todo">Task</label>
          <input id="new-todo" name="title" type="text" required />
          <button type="submit">Add</button>
        </form>
      </section>

      <section aria-labelledby="list-heading">
        <h2 id="list-heading">Tasks</h2>
        <ul>
          <li>
            <label>
              <input type="checkbox" name="todo-1" checked />
              <s>Buy groceries</s>
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" name="todo-2" checked />
              <s>Read Chapter 1</s>
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" name="todo-3" />
              Build the todo app
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" name="todo-4" />
              Ship it
            </label>
          </li>
        </ul>
      </section>
    </main>

    <footer>
      <p>2 of 4 tasks complete</p>
    </footer>
  </body>
</html>
```

**Why `<s>` instead of `color: gray`?** `<s>` (strikethrough) marks content that
is no longer accurate. Colour alone conveys nothing to a screen reader and
nothing to a colour-blind user. Meaning must survive without CSS.

**Answer to the reflection question:** on a paper form, nothing updates. You
cannot tick a checkbox and have the footer change to "3 of 4", you cannot add a
todo without going to the server and reloading, and you cannot hide the
completed ones. To react to the user *without a round trip*, you need JavaScript
holding the data and re-drawing the page. That is precisely the job React does
for you — declaratively, without the manual DOM work from section 8.

---

## 14. Summary

- HTML describes **structure**, in a **tree**, which the browser turns into the
  **DOM**.
- Elements have **attributes**; a few are void (`<img>`, `<input>`, `<br>`).
- Use **semantic** elements: they power accessibility, SEO, keyboard support and
  readability.
- **Forms** collect named values. Labels, `name`, `type` and an explicit
  `type="button"` prevent most form bugs — and React's forms chapter reuses
  every one of these ideas.
- **Attributes vs properties** matters: React drives the DOM's *properties*.
- Manual DOM code (change data → remember to call `render()` → rebuild the DOM)
  is the pain that React's declarative model removes.

**What's next →** [`02-css-basics.md`](./02-css-basics.md): making this structure
look good, and the styling vocabulary React reuses.
