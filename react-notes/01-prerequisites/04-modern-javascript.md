# 04 — Modern JavaScript (ES6+): the Syntax React Is Written In

> **Part 1 · Prerequisites · File 4 of 11**
>
> **Why this file exists:** most of what looks like "React syntax" is actually
> **modern JavaScript** syntax that existed before React and works fine without
> it. Arrow functions, template literals, optional chaining, default parameters
> — learn them here, on their own, and React code stops looking like a foreign
> language.

**Notation used in this file:** `ES6` means ECMAScript 2015, the version that
modernised JavaScript. `ES2016`…`ES2023` added more. "Modern JavaScript" means
this whole family. Node 22 and every current browser support all of it.

The rule for the rest of this book: **these features are never optional** — the
React documentation and every React codebase use them everywhere.

---

## 1. Arrow functions (the most important one)

You have met function declarations:

```js
// Function declaration
function add(a, b) {
  return a + b;
}
```

The **arrow function** is a shorter way to write a function *expression*:

```js
// Arrow function, full form: parameters, arrow, body
const add = (a, b) => {
  return a + b;
};

// Arrow function, concise body: no braces, no `return` needed
const add2 = (a, b) => a + b;
```

Both do the same thing when called: `add(1, 2)` → `3`.

### Every arrow-function shape you will see

```js
// 1. One parameter → parentheses optional (but Prettier adds them; keep them)
const double = (n) => n * 2;
const double2 = n => n * 2;      // works, less consistent

// 2. Zero parameters → parentheses required
const now = () => Date.now();

// 3. Concise body: the expression's value IS the return value (implicit return)
const square = (n) => n * n;

// 4. Block body: braces, and you MUST write `return` yourself
const square2 = (n) => {
  return n * n;
};

// 5. Returning an OBJECT literal needs parentheses around it
// const bad  = () => { name: 'Ada' };   // ❌ the braces are parsed as a body!
const good = () => ({ name: 'Ada' });    // ✅ returns the object
```

**Why number 5 matters:** React components and hooks often return objects, and
this mistake produces a confusing `undefined` or a syntax error.

```js
// ❌ This function returns undefined:
const makeUser = () => { name: 'Ada' };   // JS reads { } as a function body
console.log(makeUser());                  // undefined

// ✅ Parentheses make it an expression again:
const makeUser2 = () => ({ name: 'Ada' });
console.log(makeUser2());                 // { name: 'Ada' }
```

### Implicit return: the "one-expression" rule

```js
const items = [1, 2, 3];

// These are equivalent:
const a = items.map((n) => n * 2);
const b = items.map((n) => {
  return n * 2;
});
```

Use the concise form when the function is **one expression**. Use braces when you
need multiple statements (a variable, an `if`, a `console.log`):

```js
const c = items.map((n) => {
  const doubled = n * 2;
  return doubled;
});
```

> 💡 React components are just functions returning JSX, and the **implicit
> return** shape is used for small components:
>
> ```tsx
> // Concise: renders a paragraph
> const Label = ({ text }: { text: string }) => <p>{text}</p>;
>
> // Block body: needed as soon as you add a variable or a conditional
> const Label2 = ({ text }: { text: string }) => {
>   const upper = text.toUpperCase();
>   return <p>{upper}</p>;
> };
> ```
>
> Both are correct. Most codebases use block bodies for anything with more than
> one expression, because it is easier to add a line later.

### Arrow functions as callbacks

The real reason arrows dominate React: they are short, and passing functions
around is React's core mechanic.

```js
// Old style: verbose
[1, 2, 3].map(function (n) { return n * 2; });

// Arrow style: what you will read in every codebase
[1, 2, 3].map((n) => n * 2);

// With objects
const users = [{ name: 'Ada' }, { name: 'Grace' }];
users.filter((user) => user.name.startsWith('A'));
users.find((user) => user.name === 'Grace');
```

### Arrow functions and `this` (short version; full version in file 8)

Arrow functions **do not have their own `this`** — they capture `this` from where
they are defined. That is why they are perfect as callbacks:

```js
const timer = {
  seconds: 0,
  startBroken() {
    setInterval(function () {
      // ❌ `this` here is NOT the timer object (it is the global object)
      // this.seconds++;
    }, 1000);
  },
  startWorking() {
    setInterval(() => {
      // ✅ `this` is `timer`, because arrows take it from the surrounding scope
      this.seconds++;
    }, 1000);
  },
};
```

Modern React uses functions and hooks, not classes, so you will rarely think
about `this`. But you *will* read older code that does. The rule "use arrow
functions for callbacks" is safe in both worlds.

### Arrow functions you should NOT use

```js
// ❌ Objects with methods that need their own `this`
const counter = {
  count: 0,
  // `this` would be the surrounding scope, not `counter`
  increment: () => { this.count++; },
};

// ✅ Method shorthand for object methods that need `this`
const counter2 = {
  count: 0,
  increment() { this.count++; },
};
```

Also: arrow functions have no `arguments` object and cannot be used as
constructors (`new MyArrow()` fails). Rarely relevant in React.

---

## 2. Template literals

**Template literals** use backticks instead of quotes and allow interpolation and
multi-line strings.

```js
const name = 'Ada';
const items = 3;

// ❌ Concatenation: hard to read, easy to get the spaces wrong
const msg1 = 'Hello, ' + name + '! You have ' + items + ' items.';

// ✅ Template literal
const msg2 = `Hello, ${name}! You have ${items} items.`;
```

Anything inside `${ }` is a normal JavaScript expression:

```js
const price = 1299;
const qty = 2;

console.log(`Total: ₹${price * qty}`);                     // "Total: ₹2598"
console.log(`Total: ₹${(price * qty).toLocaleString('en-IN')}`); // "Total: ₹2,598"
console.log(`Status: ${qty > 0 ? 'In stock' : 'Sold out'}`);
```

Multi-line strings without `\n`:

```js
const receipt = `Order #1042
2 × Keyboard
Total: ₹9998`;
```

### React use #1 — dynamic class names

```tsx
type Props = {
  variant: 'primary' | 'secondary';
  size: 'sm' | 'lg';
  disabled: boolean;
};

function Button({ variant, size, disabled }: Props) {
  // Compose the class list from values
  const className = `btn btn--${variant} btn--${size} ${disabled ? 'is-disabled' : ''}`;

  return <button className={className}>Save</button>;
}

// <Button variant="primary" size="lg" disabled={false} />
//   → className="btn btn--primary btn--lg "   (note the trailing space — harmless)
```

The trailing/extra spaces are exactly why the `clsx` helper exists:

```tsx
import clsx from 'clsx';

const className = clsx('btn', `btn--${variant}`, `btn--${size}`, {
  'is-disabled': disabled,
});
```

### React use #2 — building URLs

```ts
const baseUrl = 'https://api.example.com';
const userId = 42;

const detail = `${baseUrl}/users/${userId}`;             // ".../users/42"
const search = `${baseUrl}/users?query=${encodeURIComponent('ada & co')}`;
```

> ⚠️ `encodeURIComponent` matters. Without it, a space or `&` in user input
> breaks the URL. When you build query strings by hand, encode the values — or
> use `new URL()` / `URLSearchParams` (file 11 shows both).

### React use #3 — messages in the UI

```tsx
function EmptyState({ query }: { query: string }) {
  return <p>No results for “{query}”. Try a different search.</p>;
}
// JSX braces, not ${ } — but the same idea of embedding values in text.
```

---

## 3. Default parameters

```js
function greet(name = 'guest') {
  return `Hello, ${name}`;
}

greet();            // "Hello, guest"
greet('Ada');       // "Hello, Ada"
greet(undefined);   // "Hello, guest"   ← undefined triggers the default
greet(null);        // "Hello, null"    ⚠️ null does NOT trigger the default
greet('');          // "Hello, "        ⚠️ empty string does NOT either
```

Note the difference: defaults apply **only** for `undefined`. This is why `??` and
defaults are different tools for different situations.

Defaults can use earlier parameters, and can be expressions:

```js
function createUser(name, role = 'user', joinedAt = new Date()) {
  return { name, role, joinedAt };
}
```

### React use — defaults for props

React's older API was `defaultProps`. React now recommends **default parameter
values** in the component signature:

```tsx
// ❌ Old pattern (React docs now recommend against it for function components)
// Button.defaultProps = { variant: 'primary' };

interface ButtonProps {
  label: string;
  variant?: 'primary' | 'secondary'; // optional: caller may omit it
  onClick?: () => void;
}

// ✅ Default parameter value — the modern way
function Button({ label, variant = 'primary', onClick }: ButtonProps) {
  return (
    <button type={onClick ? 'button' : 'submit'} onClick={onClick} className={`btn btn--${variant}`}>
      {label}
    </button>
  );
}

// <Button label="Save" />            → variant = 'primary'
// <Button label="Save" variant="secondary" />
```

**But watch the `undefined` rule above** — if a caller passes `variant={undefined}`,
you get the default; if they pass `variant={null}`, you do not. And when the prop
is genuinely `null`-able, use `??`:

```tsx
function Price({ amount }: { amount: number | null }) {
  const display = amount ?? 0; // 0 is used when amount is null or undefined
  return <span>₹{display.toLocaleString('en-IN')}</span>;
}
```

---

## 4. Property shorthand and computed keys

```js
const name = 'Ada';
const age = 36;

// Long form
const person = { name: name, age: age };

// Shorthand: when the variable name and the key are the same
const person2 = { name, age };
```

Same for methods:

```js
const api = {
  // Method shorthand
  getUsers() {
    return fetch('/users');
  },
  // Equivalent arrow property
  getPosts: () => fetch('/posts'),
};
```

### Computed property names

```js
const fieldName = 'email';
const value = 'ada@example.com';

const update = { [fieldName]: value }; // { email: 'ada@example.com' }
```

**React use — one handler for many fields.** This pattern is the reason
controlled forms are manageable:

```tsx
function SignupForm() {
  const [form, setForm] = useState({ name: '', email: '', city: '' });

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;      // destructuring (file 5)
    setForm((previous) => ({
      ...previous,        // keep all other fields (spread — file 6)
      [name]: value,      // overwrite just this one (computed key)
    }));
  }

  return (
    <form>
      <input name="name"  value={form.name}  onChange={handleChange} />
      <input name="email" value={form.email} onChange={handleChange} />
      <input name="city"  value={form.city}  onChange={handleChange} />
    </form>
  );
}
```

Each input has a `name` attribute matching its key in the state object, so **one
handler serves them all**. Without computed keys you would need three handlers.
Full explanation of this code arrives in Part 8; here, notice that the only exotic
syntax is `[name]: value`.

---

## 5. Optional chaining `?.`

Accessing a property of `undefined` or `null` throws. Optional chaining returns
`undefined` instead.

```js
const user = { name: 'Ada', address: null };

user.address.city;      // ❌ TypeError: Cannot read properties of null (reading 'city')
user.address?.city;     // undefined ✅
```

Three forms:

```js
const data = { user: { name: 'Ada', getAge: () => 36 }, items: [], index: { 'a-b': 1 } };

// 1. Property access
data.user?.name;              // 'Ada'
data.missing?.name;           // undefined
data.user?.address?.city;     // undefined (short-circuits the whole chain)

// 2. Method call — the () is only called if the method exists
data.user.getAge?.();         // 36
data.missing?.getAge();       // undefined  (short-circuits, no call)
data.user.getAge?.();         // still safe

// 3. Bracket access — for dynamic keys
data.index?.['a-b'];          // 1

// Also legitimate for arrays
data.items?.[0];              // undefined  (no crash on empty array)
```

**Where it short-circuits:** once a `?.` hits `null`/`undefined`, the *entire rest
of the chain* is skipped and the result is `undefined`. That is why
`data.user?.address?.city` does not throw even though `address` is `null`.

**Do not overuse it.** Hiding a real problem is worse than crashing:

```js
// ❌ Masks a bug: `user` must exist here; if it doesn't, we want a loud error
const name = user?.profile?.name ?? 'unknown';

// ✅ Only guard what is genuinely optional (not loaded yet, truly optional field)
const avatar = user.profile?.avatarUrl ?? '/default-avatar.png';
```

### React use — API data is not there yet

```tsx
interface ApiResponse {
  data?: {
    user?: {
      name: string;
      avatar?: string;
    };
  };
}

function Avatar({ response }: { response: ApiResponse }) {
  // On the first render there is no data yet. Without `?.` this crashes.
  const name = response.data?.user?.name ?? 'Guest';
  const src = response.data?.user?.avatar ?? '/default-avatar.png';

  return <img src={src} alt={`${name}'s avatar`} />;
}
```

The alternative (and better) approach is to render a loading state until the data
exists, so the component never sees `undefined`:

```tsx
if (!data) return <Spinner />;
return <Avatar url={data.user.avatar} />;
```

> 🏭 **Production rule:** prefer explicit loading/empty states. Use `?.` for
> genuinely optional data, not as a way to avoid thinking about the states.

---

## 6. Nullish coalescing `??` and logical assignment

```js
// ?? returns the right side only when the left is null or undefined
0 ?? 'default';         // 0            ✅ keeps valid falsy values
'' ?? 'default';        // ''
false ?? 'default';     // false
null ?? 'default';      // 'default'
undefined ?? 'default'; // 'default'
NaN ?? 'default';       // NaN  ⚠️ NaN is not nullish
```

**`||` vs `??` side by side:**

| Expression | `||` result | `??` result | Which to use |
| --- | --- | --- | --- |
| `0 \|\| 5` | `5` | — | — |
| `0 ?? 5` | — | `0` | `??`, if 0 is meaningful |
| `'' \|\| 'x'` | `'x'` | — | — |
| `'' ?? 'x'` | — | `''` | `??`, if empty is meaningful |
| `false \|\| true` | `true` | — | — |
| `false ?? true` | — | `false` | `??`, if false is meaningful |
| `null \|\| 'x'` | `'x'` | `'x'` | either |
| `undefined ?? 'x'` | — | `'x'` | either |

**Rule of thumb:**

- Default for something that could be `null`/`undefined` (a prop, an API field) →
  **`??`**.
- Boolean/feature check where falsy genuinely means "no" (`!user`, `isOpen || fallback`)
  → **`||`** is fine and often clearer.

### Logical assignment operators

```js
let a; a ??= 'default';    // a = a ?? 'default'  → 'default'
let b = 0; b ??= 5;        // 0 (not nullish)     → stays 0
let c = ''; c ||= 'x';     // '' is falsy         → 'x'
let d = true; d &&= false; // d was truthy        → false
```

Handy for merging config with defaults:

```js
const config = { retries: 0 };
config.timeout ??= 5000;   // adds timeout, keeps retries = 0
console.log(config);       // { retries: 0, timeout: 5000 }
```

### Optional chaining + nullish coalescing: the everyday pair

```js
const displayName = user?.profile?.displayName ?? user?.email ?? 'Anonymous';
```

Read it as a chain of fallbacks: "use the display name, else the email, else
'Anonymous'." You will write this shape often when dealing with user data.

---

## 7. Other modern syntax you will see in React code

### `const` + destructuring + object shorthand in one line

```js
const { id, name, email } = user; // destructuring — full treatment in file 5
const payload = { id, name, email }; // shorthand — keys come from variables
```

### Spread for immutable updates (full treatment in file 6)

```js
const next = { ...state, count: state.count + 1 };
const list = [...items, newItem];
```

### `async`/`await` (full treatment in file 11)

```js
const response = await fetch('/api/users');
const users = await response.json();
```

### Logical short-circuit inside JSX (the everyday pattern)

```tsx
{isLoading && <Spinner />}                 {/* render only when true */}
{error ? <ErrorBanner /> : <Content />}    {/* either / or */}
{items ?? []}                              {/* avoid undefined */}
```

### `Object.entries` for iterating objects

```js
const totals = { food: 1200, travel: 800, books: 300 };

Object.entries(totals).map(([category, amount]) => `${category}: ₹${amount}`);
// ['food: ₹1200', 'travel: ₹800', 'books: ₹300']
```

### `Array.from` and `new Set` (dedupe)

```js
// Unique values from a list — a real filtering need
const tags = ['react', 'ts', 'react', 'vite'];
const uniqueTags = [...new Set(tags)]; // ['react', 'ts', 'vite']
```

### Optional catch binding

```js
try {
  JSON.parse('nope');
} catch {
  // we do not need the error object
  console.error('Invalid JSON');
}
```

### `??=`-style defensive code is not a substitute for types

Everything in this section becomes *less* necessary once you use TypeScript
(Part 2). Types tell you which properties can be missing, at compile time, before
the crash happens. The pattern to aim for:

```tsx
// TypeScript says: this may be undefined → you handle it deliberately
function Avatar({ url }: { url?: string }) {
  return <img src={url ?? '/default.png'} alt="Avatar" />;
}
```

---

## 8. Putting it together: a real "before and after"

The same component logic written in 2014-style JavaScript and modern syntax —
this is the *only* difference, not a React feature change.

```js
// ---------- Old style ----------
function formatPrice(amount, currency) {
  if (currency === undefined) { currency = '₹'; }
  var text = currency + amount.toFixed(2);
  return text;
}

function Cart(props) {
  var items = props.items;
  var total = 0;
  for (var i = 0; i < items.length; i++) {
    total = total + items[i].price * items[i].quantity;
  }
  var message;
  if (items.length === 0) {
    message = 'Cart is empty';
  } else {
    message = 'Total: ' + formatPrice(total);
  }
  return { message: message, count: items.length };
}
```

```js
// ---------- Modern style ----------
const formatPrice = (amount, currency = '₹') => `${currency}${amount.toFixed(2)}`;

const summarizeCart = ({ items }) => {
  const count = items.length;
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    count,
    total,
    message: count === 0 ? 'Cart is empty' : `Total: ${formatPrice(total)}`,
  };
};
```

Both are JavaScript. The second is shorter, has no loops, no temporary `var`, no
manual string concatenation, and no `if/else` where a ternary says it better.
More importantly, it produces exactly the shape React wants: **data in, data
out.**

> 🔍 Notice what did *not* appear in this file: any React. That is the point.
> React code is mostly modern JavaScript arranged in a particular way.

---

## 9. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| `() => { name: 'x' }` | returns `undefined` | wrap in parens: `() => ({ name: 'x' })` |
| Forgetting `return` in an arrow with braces | `undefined` everywhere | use concise body, or add `return` |
| `onClick={handleClick()}` | handler runs during render, not on click | pass the function: `onClick={handleClick}` or `onClick={() => handleClick(id)}` |
| `if (name === 'x') return;` inside a concise arrow | syntax error | use braces for a block body |
| Default parameter expected to handle `null` | prop stays `null` | defaults only apply to `undefined`; use `??` |
| Using `||` where `0`/`''`/`false` are valid | value replaced by fallback | use `??` |
| `data.user.name` before data loads | `TypeError: Cannot read properties of undefined` | `data.user?.name` or render a loading state |
| Overusing `?.` | bugs hidden instead of fixed | guard only genuinely optional data |
| `e.target.value` on a `<div>` handler | `undefined` | only form controls have `.value` |
| Template literal with `${}` in a `.md` example inside JSX | confusion between `${}` and `{}` | in JSX you use `{}`; in strings you use `${}` |

---

## 10. Practice exercises

### Beginner

Rewrite each snippet using arrow functions, default parameters, template
literals, optional chaining and/or `??`. Predict the output of each first.

```js
// 1
function welcome(name) {
  if (name === undefined) { name = 'friend'; }
  return 'Hello, ' + name + '!';
}

// 2
function area(w, h) {
  return w * h;
}

// 3
function cityOf(user) {
  if (user && user.address && user.address.city) {
    return user.address.city;
  }
  return 'Unknown';
}

// 4
function retryCount(options) {
  return options.count === undefined || options.count === null ? 3 : options.count;
}
```

**Solution**

```js
// 1
const welcome = (name = 'friend') => `Hello, ${name}!`;
welcome();        // "Hello, friend!"
welcome('Ada');   // "Hello, Ada!"

// 2
const area = (w, h) => w * h;
area(3, 4);       // 12

// 3
const cityOf = (user) => user?.address?.city ?? 'Unknown';
cityOf({ address: { city: 'Pune' } }); // "Pune"
cityOf({ address: null });             // "Unknown"
cityOf(undefined);                     // "Unknown"

// 4
const retryCount = (options) => options?.count ?? 3;
retryCount({ count: 0 });  // 0     ✅ 0 is preserved (?? not ||)
retryCount({ count: 5 });  // 5
retryCount({});            // 3
retryCount();              // 3
```

**The lesson:** `??` plus `?.` turns a five-line defensive function into one line
— without the `||` bug that would have turned `count: 0` into `3`.

### Intermediate

Build `formatting.js` with these functions, all using modern syntax:

1. `formatCurrency(amount, currency = '₹')` → `"₹1,299.00"` for `1299`
   (two decimals, thousands separators).
2. `formatUser(user)` → `"Ada (ada@example.com)"`, falling back to
   `"Unknown user"` when `user` is missing, and to an empty email when `email` is
   missing.
3. `pluralize(count, singular, plural)` → `"1 item"` / `"3 items"`; handle the
   default plural by adding `s`.
4. `buildQueryString(params)` → `"?page=2&sort=name&q=ada+lovelace"`; skip
   `null`/`undefined` values, and encode the values.
5. `clamp(value, min = 0, max = 100)` → keeps a number in range, treating
   `null`/`undefined` as the minimum.

Then add a `main()` that prints one example of each, and a short comment above
each function describing why you chose `??` or `||`.

**Solution**

```text
js-playground/formatting.js
```

```js
// 1. amount is required; currency has a default parameter.
//    toLocaleString keeps the grouping correct for the locale.
const formatCurrency = (amount, currency = '₹') =>
  `${currency}${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// 2. The whole user may be missing (?.), and the email may be missing (??).
//    ?? because '' is a perfectly valid "no email" value here.
const formatUser = (user) => {
  if (!user) return 'Unknown user';
  const name = user.name ?? 'Anonymous';
  const email = user.email ?? '';
  return email ? `${name} (${email})` : name;
};

// 3. count is a number and 1 is meaningful, so use === for the singular check.
//    Default `plural` is derived from `singular`.
const pluralize = (count, singular, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

// 4. Skip nullish values with ?? during filtering; encodeURIComponent protects
//    against spaces, & and = inside values.
const buildQueryString = (params) => {
  const pairs = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

  return pairs.length ? `?${pairs.join('&')}` : '';
};

// 5. clamp: nullish input becomes `min`; then Math.min/max bound the value.
const clamp = (value, min = 0, max = 100) => {
  const safeValue = value ?? min;
  return Math.min(Math.max(safeValue, min), max);
};

function main() {
  console.log(formatCurrency(1299));                          // ₹1,299.00
  console.log(formatCurrency(49999.5, '$'));                   // $49,999.50
  console.log(formatUser({ name: 'Ada', email: 'ada@example.com' })); // Ada (ada@example.com)
  console.log(formatUser({ name: 'Grace' }));                  // Grace
  console.log(formatUser(null));                               // Unknown user
  console.log(pluralize(1, 'item'));                           // 1 item
  console.log(pluralize(3, 'item'));                           // 3 items
  console.log(pluralize(2, 'person', 'people'));               // 2 people
  console.log(buildQueryString({ page: 2, sort: 'name', q: 'ada lovelace', empty: null }));
  // ?page=2&sort=name&q=ada%20lovelace
  console.log(clamp(150));        // 100
  console.log(clamp(-5));         // 0
  console.log(clamp(null));       // 0
  console.log(clamp(42));         // 42
}

main();
```

**Small notes**

- `encodeURIComponent` encodes a space as `%20`. In real forms, spaces are often
  encoded as `+`, but `%20` is equally valid and servers accept both.
- `formatCurrency` uses `toLocaleString` with explicit fraction digits so
  `1299` renders as `₹1,299.00` rather than `₹1,299`.
- `formatUser`'s early `if (!user)` guard clause is clearer than burying everything
  in `?.` — this is a judgement call, and good code makes those calls explicitly.

**Expected result:** the `main()` output above, in order.

### Challenge

Write `todos.js` — the data layer for a todo app. No React, just clean modern
JavaScript that React will later call. Requirements:

- Model: `{ id, title, done, priority: 'low' | 'normal' | 'high', createdAt }`.
- `createTodo({ title, priority = 'normal' })` returns a **new** todo with a
  generated id and `createdAt: new Date().toISOString()`, validating that the
  title is non-empty (throw an `Error` otherwise).
- `addTodo(todos, todo)` → new array.
- `toggleTodo(todos, id)` → new array where that todo's `done` flipped; the
  changed todo is a new object, the others are the same references.
- `removeTodo(todos, id)` → new array.
- `setPriority(todos, id, priority)` → new array.
- `filterTodos(todos, { status = 'all', query = '' } = {})` where `status` is
  `'all' | 'active' | 'done'`; the query matches the title case-insensitively.
- `sortTodos(todos, by = 'createdAt')` where `by` is `'createdAt' | 'priority' |
  'title'`, without mutating the input.
- `todosSummary(todos)` → `{ total, done, active, byPriority }`.
- Prove immutability in `main()` and demonstrate each function.

This is deliberately the same set of operations you will wire to buttons in
Project 2 (Part 17).

**Solution**

```text
js-playground/todos.js
```

```js
// ---------------------------------------------------------------- model

let idCounter = 0;
const nextId = () => `t${++idCounter}`;

const PRIORITIES = ['low', 'normal', 'high'];

// createTodo: validation + defaults. Default parameter for priority,
// object shorthand in the return value, template literal for the id.
const createTodo = ({ title, priority = 'normal' } = {}) => {
  const cleanTitle = title?.trim() ?? '';
  if (!cleanTitle) {
    throw new Error('Todo title is required');
  }
  if (!PRIORITIES.includes(priority)) {
    throw new Error(`Unknown priority: ${priority}`);
  }

  return {
    id: nextId(),
    title: cleanTitle,
    done: false,
    priority,
    createdAt: new Date().toISOString(),
  };
};

// ---------------------------------------------------------------- updates

// Every function returns NEW arrays; nothing mutates its input.
const addTodo = (todos, todo) => [...todos, todo];

const toggleTodo = (todos, id) =>
  todos.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo));

const removeTodo = (todos, id) => todos.filter((todo) => todo.id !== id);

const setPriority = (todos, id, priority) => {
  if (!PRIORITIES.includes(priority)) {
    throw new Error(`Unknown priority: ${priority}`);
  }
  return todos.map((todo) => (todo.id === id ? { ...todo, priority } : todo));
};

// ---------------------------------------------------------------- queries

const filterTodos = (todos, { status = 'all', query = '' } = {}) => {
  const needle = query.trim().toLowerCase();

  return todos.filter((todo) => {
    const matchesStatus =
      status === 'all' || (status === 'done' ? todo.done : !todo.done);
    const matchesQuery = needle === '' || todo.title.toLowerCase().includes(needle);
    return matchesStatus && matchesQuery;
  });
};

const PRIORITY_ORDER = { high: 0, normal: 1, low: 2 };

const sortTodos = (todos, by = 'createdAt') => {
  // Copy first: sort mutates, and we promised not to mutate the input.
  const copy = [...todos];

  switch (by) {
    case 'priority':
      return copy.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    case 'createdAt':
    default:
      return copy.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
};

const todosSummary = (todos) => {
  const done = todos.filter((todo) => todo.done).length;

  // reduce builds an object of counts per priority
  const byPriority = todos.reduce((acc, todo) => {
    acc[todo.priority] = (acc[todo.priority] ?? 0) + 1;
    return acc;
  }, {});

  return { total: todos.length, done, active: todos.length - done, byPriority };
};

// ---------------------------------------------------------------- demo

function main() {
  let todos = [];

  todos = addTodo(todos, createTodo({ title: 'Read Chapter 1' }));
  todos = addTodo(todos, createTodo({ title: 'Build todo app', priority: 'high' }));
  todos = addTodo(todos, createTodo({ title: 'Ship it', priority: 'low' }));
  todos = addTodo(todos, createTodo({ title: 'Take a break' }));

  const firstId = todos[0].id;
  const before = todos[0];

  todos = toggleTodo(todos, firstId);
  todos = setPriority(todos, todos[1].id, 'low');

  console.log('summary:', todosSummary(todos));
  // { total: 4, done: 1, active: 3, byPriority: { normal: 2, low: 2 } }

  console.log('active todos:', filterTodos(todos, { status: 'active' }).map((t) => t.title));
  // [ 'Build todo app', 'Ship it', 'Take a break' ]

  console.log('search "app":', filterTodos(todos, { query: 'APP' }).map((t) => t.title));
  // [ 'Build todo app' ]

  console.log('by priority:', sortTodos(todos, 'priority').map((t) => t.priority));
  // [ 'normal', 'normal', 'low', 'low' ]

  console.log('by title:', sortTodos(todos, 'title').map((t) => t.title));
  // [ 'Build todo app', 'Read Chapter 1', 'Ship it', 'Take a break' ]

  // --- immutability proof ---
  console.log('original object unchanged?', before.done === false); // true
  console.log('toggle returned a new object?', todos[0] !== before); // true

  // --- validation demo ---
  try {
    createTodo({ title: '   ' });
  } catch (error) {
    console.error('rejected:', error.message); // "Todo title is required"
  }
}

main();
```

**Why this solution is shaped the way it is**

- `createTodo` **validates and throws** instead of returning `null`. Throwing
  forces the caller to deal with the problem; `null` silently becomes a
  `TypeError` later, far from the cause.
- Every update function returns new arrays, and reuses untouched objects by
  reference (`: todo`). This is exactly what React needs to skip re-rendering
  unchanged rows later (Part 10).
- `filterTodos(todos, { status = 'all', query = '' } = {})` combines
  **destructuring with defaults AND a default value for the whole options
  object**. Without the trailing `= {}`, calling `filterTodos(todos)` would throw.
  This idiom is everywhere in real code.
- `sortTodos` copies with `[...todos]` **before** sorting — `sort` mutates, and
  mutating a React state array is one of the most common bugs there is.
- `todosSummary` uses `reduce` to build an object of counts, with
  `(acc[todo.priority] ?? 0) + 1` handling the first occurrence of each key.
- `switch` with a `default` makes the sort fallback explicit.

**Expected result:** the four `console.log` arrays and the summary object printed
above, in order, plus `rejected: Todo title is required`.

> ⚠️ Note: `todos[1]` is used to set priority. `toggleTodo` uses `map`, which
> preserves order, so `todos[1]` is still "Build todo app" — its priority becomes
> `'low'`, leaving two `low` and two `normal` todos. That is why `byPriority` shows
> `{ normal: 2, low: 2 }`, and why sorting by priority puts the two `normal` items
> first (with ties keeping their original order).

---

## 11. Summary

- **Arrow functions**: short function expressions; concise body has an implicit
  return; returning an object needs `( )`; no own `this`.
- **Template literals**: backticks + `${expression}`; used for dynamic class
  names, URLs and messages.
- **Default parameters** apply only for `undefined` — `??` handles `null`.
- **Shorthand properties** and **computed keys** (`[name]: value`) power
  generic form handlers.
- **Optional chaining `?.`** prevents crashes on missing data and short-circuits
  the whole chain.
- **`??`** falls back only for `null`/`undefined`; **`||`** falls back for any
  falsy value. Choose deliberately.
- Modern syntax is **not React syntax** — it is just JavaScript, and it is why
  React code looks dense at first and obvious later.

**What's next →** [`05-destructuring.md`](./05-destructuring.md): the syntax that
unpacks objects and arrays, and the reason `const { name } = props` is everywhere
in React.
