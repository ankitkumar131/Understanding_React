# 05 — Destructuring

> **Part 1 · Prerequisites · File 5 of 11**
>
> **Why this file exists:** this is the syntax that makes React code look like
> `const { name } = props` and `const [count, setCount] = useState(0)`. Once you
> understand destructuring, those lines stop being magic. It also explains *why*
> `useState` returns an array and not an object.

---

## 1. The problem destructuring solves

Imagine an object and a need to use three of its fields.

```js
const user = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  city: 'London',
  role: 'admin',
};

// Without destructuring: repeat the object name every time
const name = user.name;
const email = user.email;
const city = user.city;
```

It works, but it is repetitive — and in React you do this constantly, because
props and state arrive as objects:

```tsx
// Without destructuring
function UserCard(props) {
  return (
    <div>
      <h2>{props.user.name}</h2>
      <p>{props.user.email}</p>
    </div>
  );
}
```

**Destructuring** extracts properties into variables in one step:

```js
const { name, email, city } = user;

console.log(name);  // "Ada Lovelace"
console.log(email); // "ada@example.com"
console.log(city);  // "London"
```

**How to read it:** `const { ... } = user` means "from `user`, take these named
properties and create variables with the same names."

The left side uses `{ }` because it is *pattern matching an object*, not creating
one. This is the part that confuses beginners: `{ }` on the **left** of `=` in a
declaration means destructuring; `{ }` on the **right** means an object literal.

```js
const { name } = user;         // destructuring: reads user.name
const obj = { name: 'Ada' };   // object literal: creates an object
```

> ⚠️ When a line starts with `{` and is *not* a declaration, JavaScript treats it
> as a block. That is why destructuring statements need to be wrapped in
> parentheses if they are not preceded by `const`/`let`:
>
> ```js
> let a, b;
> // ❌ SyntaxError: Unexpected token '='
> // { a, b } = obj;
>
> // ✅ Wrapped in parentheses
> ({ a, b } = obj);
> ```
> In practice, always use `const { ... } = something`, and you will never hit this.

---

## 2. Object destructuring in detail

```js
const product = {
  id: 'p1',
  title: 'Mechanical Keyboard',
  price: 4999,
  specs: { layout: '75%', switches: 'brown' },
  tags: ['hardware', 'input'],
};

// Basic
const { title, price } = product;

// Rename while extracting: variableName: propertyName
const { title: productTitle } = product;
console.log(productTitle); // "Mechanical Keyboard"

// Defaults: used only when the property is `undefined`
const { stock = 0, price: unitPrice = 0 } = product;
console.log(stock);     // 0   (property missing)
console.log(unitPrice); // 4999

// Rename + default together
const { discount: discountAmount = 0 } = product;
console.log(discountAmount); // 0
```

### Defaults only apply to `undefined`

```js
const settings = { theme: null, retries: 0, label: '' };

const { theme = 'light', retries = 5, label = 'x' } = settings;

console.log(theme);   // null   ⚠️ not 'light' — null is not undefined
console.log(retries); // 0      ⚠️ not 5
console.log(label);   // ''     ⚠️ not 'x'
```

This is the same rule as default parameters (file 4). If you need to handle
`null` too, do it after destructuring or use `??`:

```js
const { theme } = settings;
const activeTheme = theme ?? 'light'; // handles null and undefined
```

### Skipping properties you don't need

```js
const { id, ...rest } = product;
console.log(id);   // 'p1'
console.log(rest); // { title, price, specs, tags } — a new object
```

That `...rest` is the **rest pattern** in a destructuring position (file 6 covers
the operator fully). It is genuinely useful in React: "take the prop I care
about, forward everything else."

```tsx
// A wrapper <input> that applies a custom class but forwards all other props
function TextInput({ className, ...inputProps }: React.ComponentProps<'input'>) {
  return <input className={`text-input ${className ?? ''}`} {...inputProps} />;
}
```

### Nested destructuring

```js
const { specs: { layout, switches } } = product;
console.log(layout);   // "75%"
console.log(switches); // "brown"

// With a rename and a default
const { specs: { connector = 'USB-C' } } = product;
console.log(connector); // "USB-C"
```

> ⚠️ Nested destructuring throws if the nested object is missing:
> ```js
> const user = {};
> const { address: { city } } = user; // ❌ TypeError: Cannot destructure property
>                                     //    'city' of 'undefined'
> ```
> Destructure in two steps instead when intermediate values may be missing:
> ```js
> const { address } = user;
> const city = address?.city;
> ```

### Destructuring in function parameters

This is the form React uses for props.

```js
// Without destructuring
function renderProduct(product) {
  return `${product.title} — ₹${product.price}`;
}

// With destructuring in the parameter list
function renderProduct({ title, price }) {
  return `${title} — ₹${price}`;
}

renderProduct(product); // "Mechanical Keyboard — ₹4999"
```

Note the argument is still a **single object**; destructuring just unpacks it on
arrival. The call site does not change.

With defaults and renaming:

```js
function createButton({
  label,
  variant = 'primary',
  size: buttonSize = 'md',
  onClick,
}) {
  return { label, variant, size: buttonSize, onClick };
}

createButton({ label: 'Save' });
// { label: 'Save', variant: 'primary', size: 'md', onClick: undefined }
```

### Destructuring in loops

```js
const users = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Grace' },
];

for (const { id, name } of users) {
  console.log(id, name);
}

// Object.entries + destructuring: pairs of [key, value]
const totals = { food: 1200, travel: 800 };
for (const [category, amount] of Object.entries(totals)) {
  console.log(category, amount);
}
```

### Destructuring returns a copy of the *reference*, not a deep copy

```js
const state = { user: { name: 'Ada' }, theme: 'dark' };
const { user } = state;

user.name = 'Grace';
console.log(state.user.name); // "Grace"  ⚠️ same nested object!
```

Destructuring does not clone anything. It just gives you another name for the
same value. For objects and arrays, that value is a reference (file 3, section 6).

---

## 3. Array destructuring

Arrays are destructured **by position**, and the names are yours to choose.

```js
const rgb = [255, 128, 0];

const [red, green, blue] = rgb;
console.log(red, green, blue); // 255 128 0

const coordinates = [10, 20];
const [x, y] = coordinates;

// Skip items with an empty slot
const [, second, third] = [1, 2, 3];
console.log(second, third); // 2 3

// Defaults (again: only for undefined)
const [a = 1, b = 2] = [undefined, 5];
console.log(a, b); // 1 5

// Rest: everything from this position on
const [first, ...others] = [1, 2, 3, 4];
console.log(first);  // 1
console.log(others); // [2, 3, 4]

// Swapping variables without a temporary
let p = 1, q = 2;
[p, q] = [q, p];
console.log(p, q); // 2 1
```

### Strings and other iterables

```js
const [initial, ...tail] = 'React';
console.log(initial); // "R"
console.log(tail.join('')); // "eact"
```

### Array destructuring in function parameters

```js
const distance = ([x1, y1], [x2, y2]) => Math.hypot(x2 - x1, y2 - y1);
distance([0, 0], [3, 4]); // 5
```

---

## 4. **Why `useState` returns an array** (the big realisation)

You have seen this line many times already in these notes:

```tsx
const [count, setCount] = useState(0);
```

Now you can read it precisely:

```tsx
const result = useState(0);      // result is an array: [value, setterFunction]
const [count, setCount] = result; // destructured by position
```

`useState` **returns an array of exactly two items**:

```js
[ currentValue, functionToUpdateIt ]
```

React could have returned an object:

```js
// Hypothetical design — NOT how React works
const { value: count, setValue: setCount } = useState(0);
```

So why an array? The React team's reasoning (documented in their early design
discussions) was:

1. **Names are yours.** With array destructuring, *you* choose the names:
   `const [count, setCount]`, `const [name, setName]`, `const [todos, setTodos]`.
   With an object you would be stuck with fixed keys and forced renames:
   `const { value: count, setValue: setCount }`.
2. **Less typing.** `[count, setCount] = useState(0)` is shorter than
   `{ value: count, setValue: setCount }` — and you write this line hundreds of
   times.
3. **Order is intentional.** The pair is *always* "the value, then the setter".
   There is no ambiguity, so position is enough.

> 💡 **The convention that follows from this:** name the pair
> `<thing>` and `set<Thing>`. `count`/`setCount`, `user`/`setUser`,
> `isOpen`/`setIsOpen`. Any React developer reading `const [items, setItems]`
> knows immediately what both halves are. Following this convention is a
> professional habit, not a rule of the framework.

You will meet the same "returns an array" shape in other hooks:

```tsx
const [state, dispatch] = useReducer(reducer, initialState); // Part 4
const [isPending, startTransition] = useTransition();        // Part 10
const [isDark, toggle] = useToggle(false);                   // your own hook, Part 4
const [params, setParams] = useSearchParams();               // Part 6
```

**Every one of them is destructured the same way.** That is why this file comes
before hooks.

---

## 5. Destructuring in React: the full tour

### 5.1 Props

```tsx
interface UserCardProps {
  user: {
    id: number;
    name: string;
    email: string;
  };
  isAdmin?: boolean;
  onFollow: (userId: number) => void;
}

// ❌ Repetitive
function UserCardA(props: UserCardProps) {
  return (
    <div>
      <h2>{props.user.name}</h2>
      <p>{props.user.email}</p>
      <button onClick={() => props.onFollow(props.user.id)}>Follow</button>
    </div>
  );
}

// ✅ Destructured in the parameter list
function UserCardB({ user, isAdmin = false, onFollow }: UserCardProps) {
  const { id, name, email } = user; // destructure the nested object too

  return (
    <div>
      <h2>{name}{isAdmin ? ' (admin)' : ''}</h2>
      <p>{email}</p>
      <button onClick={() => onFollow(id)}>Follow</button>
    </div>
  );
}
```

Why the destructured version is preferred in practice:

- **Shorter and self-documenting.** The signature lists exactly which props the
  component uses. A reviewer can see the component's contract at a glance.
- **Defaults are expressed directly** (`isAdmin = false`).
- **No `props.` noise** in the JSX.

> 💡 Note that `onFollow(id)` is inside an arrow function: `onClick={() => onFollow(id)}`.
> Writing `onClick={onFollow(id)}` would *call* it during render. That distinction
> is covered in the events chapter (Part 3) — for now, notice the arrow.

### 5.2 `useState`

```tsx
const [count, setCount] = useState(0);
const [user, setUser] = useState<User | null>(null);
const [form, setForm] = useState({ name: '', email: '' });
```

### 5.3 Destructuring state inside handlers

```tsx
const [form, setForm] = useState({ name: '', email: '', city: '' });

function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
  const { name, value } = event.target;   // from the DOM event
  setForm((previous) => ({ ...previous, [name]: value }));
}
```

`event.target` is an object with many properties; you only want two.

### 5.4 Destructuring API responses

```ts
interface ApiUser {
  id: number;
  name: string;
  email: string;
}

interface UsersResponse {
  data: ApiUser[];
  page: number;
  totalPages: number;
}

const response = await fetch('/api/users').then((r) => r.json() as Promise<UsersResponse>);
const { data: users, totalPages } = response; // rename `data` to something meaningful
```

Renaming here is not cosmetic: `data` is a meaningless name in a component, while
`users` says what it holds.

### 5.5 Destructuring route params and search params

```tsx
// URL: /products/42
const { id } = useParams();                 // { id: '42' }

// URL: /products?page=2&sort=price
const [searchParams, setSearchParams] = useSearchParams(); // ← array
const page = Number(searchParams.get('page') ?? '1');
const sort = searchParams.get('sort') ?? 'name';
```

(You will build both in Part 6. Note the array destructuring for
`useSearchParams` — same two-item shape as `useState`.)

### 5.6 Destructuring inside `map` for lists

```tsx
{todos.map(({ id, title, done }) => (
  <li key={id}>
    <span style={{ textDecoration: done ? 'line-through' : 'none' }}>{title}</span>
  </li>
))}
```

Instead of `todos.map((todo) => ...todo.title...)`, destructure in the parameter.
Both are fine; destructuring is tidier when you use three or more fields.

### 5.7 Destructuring context values

```tsx
// Part 5 builds this
const { user, login, logout } = useAuth();
const { theme, toggleTheme } = useTheme();
```

This is why context hooks return an **object**: consumers pick only the fields
they need. (An object, not an array, because there is no meaningful order and
you will often use just one field.)

---

## 6. When destructuring makes code *worse*

Destructuring is a tool, not a religion.

```js
// ❌ Over-destructured: you lose the context that makes the code readable
const { a, b, c, d, e, f, g } = complexConfig;

// ✅ Sometimes direct access is clearer
const timeout = complexConfig.network.timeoutMs;
```

```tsx
// ❌ Destructuring 12 props into a flat namespace hides where things come from
function Dashboard({ title, subtitle, user, theme, onSave, onCancel, ...  }) {

// ✅ Destructure what you use; keep a grouped prop as one object
function Dashboard({ header, user, onSave, onCancel }: DashboardProps) {
  const { title, subtitle } = header; // still local, still obvious
  ...
}
```

Rules of thumb:

- Destructure when you use **2+** properties from the same object.
- Destructure in the **parameter list** for props — that is idiomatic React.
- Keep a **grouped** prop grouped if it belongs together (`header`, `footer`).
- Avoid destructuring one level deep *and* renaming *and* defaulting at the same
  time; split it into two lines. Readability beats cleverness.

```js
// Too dense to read
const { data: { items: list = [], meta: { total: count = 0 } = {} } = {} } = response;

// Readable
const { data } = response ?? {};
const items = data?.items ?? [];
const count = data?.meta?.total ?? 0;
```

---

## 7. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| `const { name } = props.name` | `undefined` | you passed a value, not the object: `const { name } = props` |
| Defaults not applying | value stays `null`/`0`/`''` | defaults only apply to `undefined`; use `??` |
| Nested destructuring a missing object | `TypeError: Cannot destructure property 'x' of undefined` | destructure one level, then use `?.` |
| Starting a statement with `{` | `SyntaxError: Unexpected token` | `const { a } = obj;` or wrap in `( )` |
| `const [value, value] = useState()` | duplicate declaration error | use `[count, setCount]` naming |
| Swapping the `useState` pair | `setCount` is the value, `count` is a function | order is always `[value, setter]` |
| Assuming destructuring copies deeply | mutating the destructured object still affects the original | spread to copy (file 6) |
| Destructuring unused fields "for completeness" | lint warnings, noise | destructure only what you use |
| `const { length } = 'abc'` works but surprises | works (strings are objects for access) | prefer `.length` directly for readability |

---

## 8. Practice exercises

### Beginner

What does each line print? Predict first, then verify.

```js
const user = { name: 'Ada', age: 36, city: 'London' };

const { name, age } = user;
console.log(name, age);

const { name: fullName, country = 'UK' } = user;
console.log(fullName, country);

const nums = [10, 20, 30, 40];
const [first, , third] = nums;
console.log(first, third);

const [, , , fourth = 99] = nums;
console.log(fourth);

const settings = { theme: null, retries: 0 };
const { theme = 'dark', retries = 3 } = settings;
console.log(theme, retries);

const { city, ...rest } = user;
console.log(rest);

function greet({ name, greeting = 'Hello' }) {
  return `${greeting}, ${name}!`;
}
console.log(greet({ name: 'Grace' }));
console.log(greet());
```

**Solution**

```text
Ada 36                  basic destructuring
Ada UK                  rename + default (country is missing → default)
10 30                   first and third; the empty slot skips 20
40                      fourth item exists, so the default 99 is not used
null 0                  ⚠️ null and 0 do not trigger defaults
{ age: 36, city: 'London' }   rest excludes the destructured `city`
"Hello, Grace!"         parameter destructuring with a default
TypeError: Cannot destructure property 'name' of 'undefined' as it is undefined.
```

**The last line is the important one.** `greet()` passes no object at all, so the
destructuring has nothing to unpack. In React, this is exactly the error you get
when a required prop is missing — and it is a *good* error, because it points at
the component that forgot to pass it.

To make it safe (for genuinely optional arguments), give the whole parameter a
default:

```js
function greet({ name = 'friend', greeting = 'Hello' } = {}) {
  return `${greeting}, ${name}!`;
}

greet();               // "Hello, friend!"
greet({ name: 'Ada' }); // "Hello, Ada!"
```

Note the trailing `= {}`: without it, calling `greet()` still throws, because the
default only kicks in when nothing (or `undefined`) is passed — and then there
would be nothing to destructure. This idiom appears constantly in real code.

### Intermediate

Convert `UserCardA` to a fully destructured component, then write a `Card` layout
component that takes `title`, `subtitle`, and `children`, plus a
`StatsRow` that receives a `stats` object
`{ posts: 12, followers: 340, following: 87 }` and renders each number.

Types: use TypeScript interfaces. Requirements:

- `UserCard` destructures `user`, `isAdmin` (default `false`) and `onFollow`.
- `StatsRow` destructures `stats` **and** the individual numbers from it.
- No use of `props.` anywhere.

**Solution**

```text
src/components/UserCard.tsx
```

```tsx
import type { ReactNode } from 'react';

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface UserCardProps {
  user: User;
  isAdmin?: boolean;
  onFollow: (userId: number) => void;
  children?: ReactNode;
}

export function UserCard({ user, isAdmin = false, onFollow, children }: UserCardProps) {
  // Destructure the nested object too: the component only needs these fields.
  const { id, name, email } = user;

  return (
    <article className="card">
      <h2 className="card__title">
        {name}
        {isAdmin && <span className="badge">admin</span>}
      </h2>
      <p className="card__email">{email}</p>

      <button type="button" className="button" onClick={() => onFollow(id)}>
        Follow
      </button>

      {children}
    </article>
  );
}
```

```text
src/components/StatsRow.tsx
```

```tsx
export interface Stats {
  posts: number;
  followers: number;
  following: number;
}

export function StatsRow({ stats }: { stats: Stats }) {
  // A second destructuring step: now the names are local and readable.
  const { posts, followers, following } = stats;

  return (
    <dl className="stats">
      <div>
        <dt>Posts</dt>
        <dd>{posts.toLocaleString('en-IN')}</dd>
      </div>
      <div>
        <dt>Followers</dt>
        <dd>{followers.toLocaleString('en-IN')}</dd>
      </div>
      <div>
        <dt>Following</dt>
        <dd>{following.toLocaleString('en-IN')}</dd>
      </div>
    </dl>
  );
}
```

**Notes on the solution**

- `isAdmin = false` gives the optional prop a default **without** `defaultProps`.
  This is the pattern React's docs recommend for function components.
- `children?: ReactNode` — the type of anything React can render (text, elements,
  arrays, `null`). Part 3 covers this fully.
- `onFollow: (userId: number) => void` — a **function prop** typed as taking a
  number and returning nothing. The `void` return type means "the return value is
  ignored", which is exactly right for event handlers.
- `{isAdmin && <span>}` renders nothing when `isAdmin` is `false` — the
  short-circuit behaviour from file 4. (Careful with numbers here; Part 3
  explains the `{0 && ...}` trap.)
- `dt`/`dd` inside `dl` is the semantically correct markup for label/value pairs
  (file 1, section 6).

**A minimal usage example** (add this to `App.tsx`):

```tsx
import { UserCard } from './components/UserCard';
import { StatsRow } from './components/StatsRow';

const user = { id: 1, name: 'Ada Lovelace', email: 'ada@example.com' };
const stats = { posts: 12, followers: 340, following: 87 };

export default function App() {
  const handleFollow = (userId: number) => {
    // eslint-disable-next-line no-console
    console.log(`Followed user ${userId}`);
  };

  return (
    <UserCard user={user} isAdmin onFollow={handleFollow}>
      <StatsRow stats={stats} />
    </UserCard>
  );
}
```

**Expected result:** a card with "Ada Lovelace" and an "admin" badge, the email
below it, a Follow button that logs `Followed user 1`, and three stats
(12, 340, 87).

> 💡 `isAdmin` with no value means `isAdmin={true}`. In JSX, a prop written
> without `=` is shorthand for `true` — just like boolean HTML attributes.

### Challenge

Build a **destructuring-heavy** data transformation with no React at all: a
function that turns a raw API response into exactly the shape a UI needs, then
demonstrate it.

Raw input:

```js
const rawResponse = {
  status: 'ok',
  payload: {
    users: [
      {
        id: 1,
        profile: { first: 'Ada', last: 'Lovelace', avatar: null },
        contact: { email: 'ada@example.com', phone: null },
        permissions: ['read', 'write'],
        meta: { lastLoginAt: '2026-09-01T10:00:00.000Z', logins: 42 },
      },
      {
        id: 2,
        profile: { first: 'Grace', last: 'Hopper' },
        contact: { email: 'grace@example.com' },
        permissions: [],
        meta: { logins: 7 },
      },
    ],
    pagination: { page: 1, perPage: 20, total: 2 },
  },
};

const rawResponseShape = rawResponse; // keep a reference for the immutability check
```

Write `toViewModel(rawResponse)` that returns:

```js
{
  users: [
    {
      id: 1,
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      avatar: '/default-avatar.png',   // null → default
      isAdmin: true,                   // permissions includes 'write'
      lastSeenDays: <integer>,         // days since lastLoginAt, or null if absent
    },
    ...
  ],
  page: 1,
  totalPages: 1,                       // Math.ceil(total / perPage)
  hasNext: false,
}
```

Rules:

- Use destructuring everywhere: parameters, nested objects, arrays, and in
  `map`'s callback.
- Use defaults for missing values (`avatar`, `permissions`, `lastLoginAt`).
- Never mutate `rawResponse` — prove it with a deep comparison at the end.
- `lastSeenDays` should be `null` when `lastLoginAt` is missing, and an integer
  otherwise (use `Math.floor` on a difference in days).

**Solution**

```text
js-playground/view-model.js
```

```js
const DEFAULT_AVATAR = '/default-avatar.png';

// ---------------------------------------------------------------- helpers

// Destructure the parameters, provide defaults for the whole options object.
function daysSince(isoString) {
  if (!isoString) return null;
  const then = new Date(isoString).getTime();
  const now = Date.now();
  return Math.floor((now - then) / 86_400_000); // ms in a day
}

// Destructure the nested `profile` and `contact` objects in the parameter list,
// and give the whole object a default so a user without a profile cannot crash us.
function toUserViewModel({
  id,
  profile: { first, last } = {},
  contact: { email = '' } = {},
  permissions = [],
  meta: { lastLoginAt } = {},
}) {
  return {
    id,
    fullName: `${first ?? ''} ${last ?? ''}`.trim(),
    email,
    avatar: DEFAULT_AVATAR, // replaced below if a real avatar exists
    isAdmin: permissions.includes('write'),
    lastSeenDays: daysSince(lastLoginAt),
  };
}

// ---------------------------------------------------------------- transform

function toViewModel(response) {
  // Destructure with defaults so a malformed response degrades gracefully.
  const {
    payload: {
      users = [],
      pagination: { page = 1, perPage = 20, total = 0 } = {},
    } = {},
  } = response ?? {};

  const totalPages = perPage > 0 ? Math.ceil(total / perPage) : 0;

  const viewModels = users.map((user) => {
    // Nested array destructuring works on arrays; here we need profile.avatar,
    // which may be missing, so we read it safely and apply the default.
    const avatar = user?.profile?.avatar ?? DEFAULT_AVATAR;
    // toUserViewModel already destructures everything else.
    return { ...toUserViewModel(user), avatar };
  });

  return {
    users: viewModels,
    page,
    totalPages,
    hasNext: page < totalPages,
  };
}

// ---------------------------------------------------------------- demo

function main() {
  const rawResponse = /* ...the object above... */;
  const snapshot = JSON.stringify(rawResponse);

  const viewModel = toViewModel(rawResponse);
  console.log(JSON.stringify(viewModel, null, 2));

  console.log('raw response untouched?', JSON.stringify(rawResponse) === snapshot); // true
  console.log('view model:', viewModel.users.map(({ fullName, isAdmin, avatar }) => ({ fullName, isAdmin, avatar })));
}

main();
```

**Expected output (with today's date, 2026-09-19, as "now")**

```json
{
  "users": [
    {
      "id": 1,
      "fullName": "Ada Lovelace",
      "email": "ada@example.com",
      "avatar": "/default-avatar.png",
      "isAdmin": true,
      "lastSeenDays": 17
    },
    {
      "id": 2,
      "fullName": "Grace Hopper",
      "email": "grace@example.com",
      "avatar": "/default-avatar.png",
      "isAdmin": false,
      "lastSeenDays": null
    }
  ],
  "page": 1,
  "totalPages": 1,
  "hasNext": false
}
```

> `lastSeenDays` depends on the current date **and time of day**, because it is
> `Math.floor` of the elapsed days: with `lastLoginAt` at 10:00 and "now" at 09:00
> seventeen days later, you get `17`; after 10:00 you get `18`. So `17` or `18` is
> correct depending on when you run it — that is expected. Everything else must
> match exactly.

**Why this solution is structured this way**

- **`toUserViewModel` destructures in its parameter list**, including nested
  objects, with `= {}` defaults at each level. That is what makes it impossible
  for a missing `profile` or `contact` to crash the transform.
- **`permissions = []` then `.includes('write')`** — an array default plus a
  boolean derivation. This "derive, don't store" idea is the core of Part 4's
  "derived state" rule.
- **`toViewModel` renames `payload.users` to `users`** — the rename makes the rest
  of the function read naturally.
- **The avatar default is applied at the point of use** rather than inside
  `toUserViewModel`, showing both styles side by side. In real code, pick one
  place and be consistent.
- **The immutability check** (`JSON.stringify` before and after) is a practical
  habit you will reuse: it is the cheapest way to prove a function is pure.

**A note on the `avatar` line:** `user?.profile?.avatar ?? DEFAULT_AVATAR`
handles `null`, `undefined` *and* a missing nested `profile`. That is exactly why
`?.` and `??` are companions: one protects the path, the other supplies the
fallback. Part 7 uses this same pattern for API data, and Part 11 shows how
TypeScript can tell you *which* paths need protection.

---

## 9. Summary

- **Object destructuring** extracts properties by name:
  `const { name, age } = user`.
- **Array destructuring** extracts by position: `const [first, second] = arr`.
- **Rename** with `prop: newName`, **default** with `= value`, and remember that
  defaults apply **only to `undefined`**.
- **Rest** (`...rest`) collects the remainder — the basis of "forward other
  props".
- **Nested destructuring throws** if an intermediate object is missing; destructure
  in two steps or use `?.`.
- Destructuring does **not** deep-copy. Nested values stay shared references.
- React uses destructuring everywhere: props, `useState`'s two-item array,
  `useContext`, `useParams`, `useSearchParams`, `map` callbacks and API responses.
- **`useState` returns an array** so you can name the pair yourself:
  `const [count, setCount] = useState(0)`.
- Over-destructuring hurts readability. Destructure what you use, keep grouped
  data grouped.

**What's next →** [`06-spread-rest.md`](./06-spread-rest.md): the `...` operator —
how React copies and updates data without ever mutating it.
