# 03 — JavaScript Basics (the Language React Is Written In)

> **Part 1 · Prerequisites · File 3 of 11**
>
> **Why this file exists:** React is not a language. It is a JavaScript library.
> Every `useState`, every `map` in JSX, every `onClick` you write is JavaScript.
> When beginner React code breaks, the cause is usually JavaScript, not React.
> This file makes sure the foundation is solid.

---

## 1. Where JavaScript runs

JavaScript is a programming language that runs:

- **in the browser** — it can touch the DOM, handle clicks, make network requests
- **in Node.js** — on your computer or a server, no DOM, but files and networks
- **inside React** — which is just a JavaScript library running in the browser

You will use two "playgrounds" in this part:

**Playground A — the browser console.** Open any web page, press `F12`, click
**Console**. Type a line, press Enter, see the result immediately. Perfect for
one-liners.

**Playground B — Node.js files.** Better for multi-line programs and for
keeping your experiments.

```bash
mkdir js-playground
cd js-playground
npm init -y          # creates package.json
```

Then open `package.json` and add one line so we can use modern `import`/`export`
syntax later (Part 1 file 9 explains it):

```json
{
  "name": "js-playground",
  "type": "module",
  "private": true,
  "version": "1.0.0"
}
```

Now any `.js` file in this folder can use modern syntax, and you run it with:

```bash
node basics.js
```

**Expected result:** whatever `console.log` prints appears in your terminal.

> 💡 **`console.log` is your best debugging tool.** It prints values to the
> console. In React you will use it constantly to see what a component actually
> received. Learn to reach for it without hesitation.

```js
console.log('hello');           // hello
console.log(1 + 2);             // 3
console.log({ name: 'Ada' });   // { name: 'Ada' }
console.log([1, 2, 3]);         // [ 1, 2, 3 ]
```

There is also `console.error`, `console.warn`, `console.table` (prints arrays of
objects as a table — excellent for lists of data) and `console.dir`.

---

## 2. Variables: naming values so you can reuse them

A **variable** is a named box holding a value.

```js
let message = 'Hello';   // a box named `message` containing "Hello"
message = 'Hi there';    // put a new value in the same box
```

Without variables you would have to rewrite `'Hello'` everywhere; change one and
you'd miss the others. Variables also let you *compute* once and reuse:

```js
const price = 4999;
const quantity = 3;
const total = price * quantity; // computed once
console.log(total);             // 14997
```

### `let`, `const`, and the `var` you should avoid

```js
let count = 0;
count = 1;            // ✅ allowed: `let` can be reassigned

const name = 'Ada';
// name = 'Grace';    // ❌ TypeError: Assignment to constant variable.

var old = 'legacy';   // ⚠️ avoid in modern code
```

| | `let` | `const` | `var` |
| --- | --- | --- | --- |
| Reassignable | yes | no | yes |
| Scope | block `{ }` | block `{ }` | function |
| Usable before declaration | no (error) | no (error) | yes — `undefined` (confusing!) |
| Redeclarable in same scope | no | no | yes (confusing!) |
| Use in modern code | when the value changes | **default choice** | basically never |

**Rule of thumb:** **`const` by default, `let` only when you genuinely reassign.**
You will be surprised how rarely that is.

> ❌ `var` leaks out of blocks and can be used before its declaration, which hides
> bugs. Any modern codebase you join will lint against it. If you see `var` in a
> tutorial, the tutorial is old.

### Block scope, shown by example

A **block** is anything between `{ }` — including `if`, `for` and function bodies.

```js
if (true) {
  let inside = 'visible only here';
  const alsoInside = true;
  console.log(inside); // ✅ works
}
// console.log(inside); // ❌ ReferenceError: inside is not defined
```

```js
// `var` does NOT respect the block — one of the reasons to avoid it
if (true) {
  var leaked = 'I escaped!';
}
console.log(leaked); // "I escaped!" 😖
```

### Temporal Dead Zone — a precise error message you will meet

```js
console.log(a); // ❌ ReferenceError: Cannot access 'a' before initialization
let a = 1;

console.log(b); // undefined  (var does not error — it lies to you)
var b = 1;
```

`let`/`const` are *hoisted* like `var`, but they stay in an unusable "temporal
dead zone" until the declaration line runs. This is a feature: it turns a silent
bug into a loud error.

### Naming rules and conventions

```js
const userName = 'ada';        // ✅ camelCase for variables and functions
const MAX_RETRIES = 3;         // ✅ SCREAMING_SNAKE_CASE for true constants
class UserAccount {}           // ✅ PascalCase for classes and React components
// const 2fast = 1;            // ❌ must not start with a digit
// const user-name = 'a';      // ❌ hyphen means subtraction
// const let = 1;              // ❌ reserved word
```

Choose names that describe the *content*: `totalPrice` beats `tp` beats `x`. In
React this matters double, because a component's names *are* the documentation of
your UI.

---

## 3. Data types

JavaScript has **eight** types. Seven are *primitives* (simple, immutable values)
and one is special.

```js
// Primitives
const title = 'Clean Code';        // string
const pages = 464;                 // number
const isAvailable = true;          // boolean
const author = null;               // null: deliberately "no value"
let rating;                        // undefined: declared but not assigned yet
const id = Symbol('id');           // symbol: a unique identifier (rare)
const big = 9007199254740993n;     // bigint: integers beyond Number.MAX_SAFE_INTEGER

// Objects (the everything-else type)
const book = { title: 'Clean Code', pages: 464 };
const list = [1, 2, 3];            // arrays are objects
const format = () => 'x';          // functions are objects
const map = new Map();             // also objects
```

```js
typeof 'hello';       // "string"
typeof 42;            // "number"
typeof true;          // "boolean"
typeof undefined;     // "undefined"
typeof null;          // "object"     ⚠️ famous historical bug — check with === null
typeof Symbol('s');   // "symbol"
typeof 10n;           // "bigint"
typeof {};            // "object"
typeof [];            // "object"     ⚠️ arrays are objects — use Array.isArray()
typeof (() => {});    // "function"   ⚠️ functions get their own typeof
```

> 💡 `typeof null === 'object'` is a bug from 1995 that can never be fixed without
> breaking the web. Always test for null explicitly: `value === null`.

### `null` vs `undefined`

Both mean "nothing", but they are used differently:

| | `undefined` | `null` |
| --- | --- | --- |
| Who sets it | JavaScript, automatically | You, deliberately |
| Means | "not set yet" | "intentionally empty" |
| Appears when | variable declared but unassigned; missing object property; function with no `return` | API sent an empty value; you clear a reference |
| In React | `useRef` without an argument; props you forgot to pass | "there is no logged-in user" |

```js
const user = { name: 'Ada' };
console.log(user.name);   // "Ada"
console.log(user.email);  // undefined — the property does not exist

const currentUser = null; // we deliberately have no user
```

**Checking for "no value" correctly (this pattern appears everywhere in React):**

```js
// ✅ catches both null and undefined
if (user == null) { /* user is null OR undefined */ }

// ❌ misses the empty string, 0, false — see truthiness in section 7
if (!user) { /* also true for '', 0, false */ }
```

### Strings

```js
const first = 'Ada';
const last = 'Lovelace';

// Concatenation with + (works, but see the next line)
console.log('Hello, ' + first + ' ' + last);

// Template literals: backticks, with ${ } interpolation  ← use this
console.log(`Hello, ${first} ${last}!`);       // Hello, Ada Lovelace!
console.log(`2 + 2 = ${2 + 2}`);               // 2 + 2 = 4
console.log(`Multiline
works too.`);

// Common operations
'ada'.toUpperCase();          // "ADA"
'ADA'.toLowerCase();          // "ada"
'  hi  '.trim();              // "hi"
'ada@example.com'.includes('@');  // true
'a,b,c'.split(',');           // ['a', 'b', 'c']
['a', 'b'].join('-');         // "a-b"
'abc'.length;                 // 3
'hello'[0];                   // "h"
'hello'.slice(1, 3);          // "el"
'price: ' + String(4999);     // explicit conversion to string
Number('42');                 // 42
Number('abc');                // NaN  ("Not a Number")
```

> 🏭 **React relevance:** template literals are how you build dynamic class
> names, URLs and messages:
> `` className={`card ${isActive ? 'card--active' : ''}`} `` and
> `` `/users/${id}/edit` ``.

### Numbers

```js
1 + 2;          // 3
10 / 4;         // 2.5       (no integer division by default)
7 % 3;          // 1         (remainder — great for zebra striping rows)
2 ** 10;        // 1024      (exponent)
0.1 + 0.2;      // 0.30000000000000004  ⚠️ floating point
Number.isInteger(4.5);      // false
Math.round(4.5);            // 5
Math.floor(4.9);            // 4
Math.ceil(4.1);             // 5
Math.max(1, 9, 3);          // 9
parseInt('42px', 10);       // 42   (always pass the radix 10)
parseFloat('3.14rad');      // 3.14
(1234.5678).toFixed(2);     // "1234.57"  ← returns a STRING
(1234567).toLocaleString('en-IN'); // "12,34,567"  ← Indian grouping
```

> ⚠️ Because of floating point, **never compare money with `===`**:
> `0.1 + 0.2 === 0.3` is `false`. Store money as integers (paise/cents) and
> format at the edge. This bites real production apps.

### Booleans and falsy values

```js
true; false;
```

Every value in JavaScript is either **truthy** or **falsy**. This matters
enormously in React, where `{condition && <Component />}` relies on it.

**The eight falsy values** (memorise this list):

```text
false
0
-0
0n            (bigint zero)
""            (empty string)
null
undefined
NaN
```

**Everything else is truthy** — including these surprises:

```js
Boolean('false');   // true   ← a non-empty string, even the word "false"
Boolean('0');       // true   ← non-empty string!
Boolean([]);        // true   ← empty array is truthy
Boolean({});        // true   ← empty object is truthy
Boolean(' ');       // true   ← a space is a non-empty string
Boolean(0);         // false
Boolean('');        // false
```

> ⚠️ **The most common React bug from this list:**
> `{items.length && <List />}` prints `0` on the screen when the list is empty,
> because `0` is falsy *and* React renders the number `0`. The fix is an explicit
> comparison: `{items.length > 0 && <List />}`. This is explained again in
> Part 3, because you will hit it.

### Explicit conversion

```js
Boolean(0);        // false
Boolean('hi');     // true
Number('42');      // 42
Number('');        // 0     ⚠️ surprising
Number('abc');     // NaN
String(42);        // "42"
parseInt('7', 10); // 7
```

---

## 4. Objects: grouping related data

An **object** is a collection of **key → value** pairs. In React, almost
everything you deal with is an object: props, state, API responses, config.

```js
const user = {
  id: 1,
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  isAdmin: false,
  address: {
    city: 'London',
    country: 'UK',
  },
  hobbies: ['mathematics', 'writing'],
};

// Reading: dot notation
console.log(user.name);              // "Ada Lovelace"
console.log(user.address.city);      // "London"
console.log(user.hobbies[0]);        // "mathematics"

// Reading: bracket notation (needed for dynamic keys)
const key = 'email';
console.log(user[key]);              // "ada@example.com"
// console.log(user.key);            // ❌ undefined — looks for a literal "key" property

// Adding / changing
user.isAdmin = true;                 // mutates the object
user.role = 'admin';                 // adds a new property

// Deleting
delete user.role;

// Checking whether a property exists
'name' in user;                      // true
Object.hasOwn(user, 'name');         // true  (modern, safer)
user.name !== undefined;             // works, but fails if the value is undefined
```

### Methods: functions stored in properties

```js
const counter = {
  count: 0,
  increment() {
    // `this` refers to the object the method was called on
    this.count += 1;
    return this.count;
  },
};

counter.increment(); // 1
counter.increment(); // 2
console.log(counter.count); // 2
```

> ⚠️ `this` is one of the trickiest parts of JavaScript, and it behaves
> differently inside arrow functions. Part 1 file 8 covers it fully. In React you
> will almost never need `this`, because modern React uses functions and hooks
> instead of classes — one of the best things about modern React.

### Useful object tools

```js
const user = { id: 1, name: 'Ada', email: 'ada@example.com' };

Object.keys(user);    // ['id', 'name', 'email']
Object.values(user);  // [1, 'Ada', 'ada@example.com']
Object.entries(user); // [['id',1], ['name','Ada'], ['email','ada@example.com']]

// Object.entries + map: a real React pattern for rendering an object as a list
Object.entries(user).map(([key, value]) => `${key}: ${value}`);
```

### Property shorthand

```js
const name = 'Ada';
const age = 36;

// Long form
const person1 = { name: name, age: age };

// Shorthand: if the variable name equals the key, write it once
const person2 = { name, age };
```

You will use this constantly in React:

```tsx
// Instead of: <UserCard name={user.name} email={user.email} />
// You can spread (Part 1 file 6): <UserCard {...user} />
```

### Computed keys

```js
const field = 'email';
const formState = {
  [field]: 'ada@example.com', // key comes from a variable
};
console.log(formState); // { email: 'ada@example.com' }
```

This is how generic form handlers work in React:

```tsx
setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
```

---

## 5. Arrays: ordered lists

An **array** is an ordered collection, indexed from `0`.

```js
const fruits = ['apple', 'banana', 'cherry'];

fruits[0];              // "apple"      (first)
fruits[fruits.length - 1]; // "cherry"  (last)
fruits.length;          // 3

fruits.push('date');    // add to END      → ['apple','banana','cherry','date']
fruits.pop();           // remove from END → ['apple','banana','cherry']
fruits.unshift('aa');   // add to START    → ['aa','apple','banana','cherry']
fruits.shift();         // remove START    → ['apple','banana','cherry']

fruits.includes('banana');      // true
fruits.indexOf('cherry');       // 2
fruits.join(', ');              // "apple, banana, cherry"

['a', 'b'].concat(['c']);       // ['a','b','c']
[1, [2, [3]]].flat(2);          // [1,2,3]
[3, 1, 2].sort();               // [1,2,3]      ⚠️ sorts as STRINGS by default
[10, 9, 100].sort();            // [10, 100, 9] ⚠️ because "10" < "9" alphabetically
[10, 9, 100].sort((a, b) => a - b); // [9, 10, 100] ✅ numeric sort
```

> ⚠️ **`push`, `pop`, `shift`, `unshift`, `sort`, `reverse`, `splice` all MUTATE
> the original array.** In React, mutating state is the single most common cause
> of "the UI doesn't update". You will learn the non-mutating alternatives
> (`concat`, `slice`, `toSorted`, `toReversed`, spread, `map`, `filter`) in files
> 6 and 7 — those are the ones you will use in React.

### Arrays of objects: the shape of real data

```js
const products = [
  { id: 1, name: 'Keyboard', price: 4999, inStock: true },
  { id: 2, name: 'Mouse', price: 1299, inStock: false },
  { id: 3, name: 'Monitor', price: 18999, inStock: true },
];

// This is exactly what an API returns, and exactly what React renders.
```

### Finding things

```js
products[0];                                  // the first product
products.at(-1);                              // the LAST product (negative index)
products.length;                              // 3
products.some((p) => !p.inStock);             // true  — "at least one?"
products.every((p) => p.price > 1000);        // true  — "all of them?"
products.find((p) => p.name === 'Mouse');     // the Mouse object
products.findIndex((p) => p.name === 'Mouse');// 1
products.filter((p) => p.inStock);            // array of the in-stock ones
```

Files 7 explains these methods properly — they are the workhorses of React
list rendering.

---

## 6. Values vs references (the concept behind React immutability)

This section looks theoretical. It is not: it explains half of React's rules.

**Primitives are copied by value.**

```js
let a = 1;
let b = a;      // b gets its own copy of 1
b = 2;
console.log(a); // 1  ← unchanged
```

**Objects and arrays are copied by reference** — the variable holds a *pointer*
to the object, not the object itself.

```js
const user1 = { name: 'Ada' };
const user2 = user1;      // user2 points to the SAME object
user2.name = 'Grace';
console.log(user1.name);  // "Grace"  😲 — we changed both!
console.log(user1 === user2); // true — same object in memory

const a1 = [1, 2, 3];
const a2 = a1;
a2.push(4);
console.log(a1);          // [1, 2, 3, 4] — same array!
```

To copy, create a **new** object/array — this needs spread syntax (next files):

```js
const original = { name: 'Ada', age: 36 };

const copy1 = { ...original };        // shallow copy: new object, same primitive values
copy1.name = 'Grace';
console.log(original.name);           // "Ada"  ✅ original untouched

const numbers = [1, 2, 3];
const copy2 = [...numbers, 4];        // new array
console.log(numbers);                 // [1, 2, 3] ✅ untouched
```

> ⚠️ **"Shallow" is important.** `{ ...original }` copies only the *top level*.
> A nested object is still shared:
>
> ```js
> const state = { user: { name: 'Ada' }, theme: 'dark' };
> const next = { ...state };
> next.user.name = 'Grace';
> console.log(state.user.name); // "Grace" 😖 — nested object is the same reference
> ```
> The React-correct update is a nested copy:
> ```js
> const next = { ...state, user: { ...state.user, name: 'Grace' } };
> ```

**Why React cares:** React decides whether to re-render partly by comparing
references (`oldState !== newState`). If you mutate the same object, the
reference does not change, and React reasonably concludes "nothing changed".
This is why the rules are:

```text
Never mutate state. Always create a new object or array.
```

Part 4 turns this into muscle memory; here you just need the vocabulary.

---

## 7. Operators and truthiness

### Arithmetic

```js
5 + 2;      // 7
5 - 2;      // 3
5 * 2;      // 10
5 / 2;      // 2.5
5 % 2;      // 1     remainder
5 ** 2;     // 25    power
count++;    // add 1 (post-increment)
count--;    // subtract 1
count += 5; // count = count + 5
count *= 2; // count = count * 2
```

> ⚠️ `count++` works on variables but **never** on React state:
> `count++` mutates a variable without telling React. `setCount(count + 1)` tells
> React. That is the whole difference, and it is why the notes keep hammering it.

### Comparison: `===` vs `==` (always use `===`)

```js
1 === 1;          // true   strict: same type AND value
1 === '1';        // false  ✅ different types
1 == '1';         // true   ⚠️ loose: converts types first ("1" → 1)
null == undefined;// true   ⚠️
null === undefined;// false ✅
0 == false;       // true   ⚠️
0 === false;      // false  ✅
'' == false;      // true   ⚠️
NaN === NaN;      // false  ⚠️ (use Number.isNaN(x))
'abc' < 'b';      // true   (string comparison, alphabetical)
5 > 3;            // true
```

**Rule: use `===` and `!==` always.** The one accepted exception is
`value == null`, which conveniently means "null or undefined" in one check.

**Objects compare by reference, not content:**

```js
{ a: 1 } === { a: 1 };   // false  😲 — two different objects
[1,2] === [1,2];         // false
const x = { a: 1 };
const y = x;
x === y;                 // true   — same reference
```

This single fact is why `useEffect` dependency arrays can behave surprisingly
(Part 4) and why memoization exists (Part 10).

### Logical operators and short-circuiting

```js
// AND (&&): returns the first FALSY value, else the last value
true && 'yes';        // "yes"
false && 'yes';       // false
0 && 'yes';           // 0        ← this is why {0 && <X/>} prints 0
'hello' && 'world';   // "world"

// OR (||): returns the first TRUTHY value, else the last value
false || 'default';   // "default"
'' || 'fallback';     // "fallback"
0 || 42;              // 42
'given' || 'default'; // "given"

// NOT (!): converts to boolean and inverts
!true;        // false
!!'text';     // true   ← double-negation: any value → boolean

// Nullish coalescing (??): only falls back for null/undefined
0 ?? 42;              // 0      ✅ keeps 0
'' ?? 'fallback';     // ''     ✅ keeps empty string
null ?? 'fallback';   // "fallback"
undefined ?? 0;       // 0
```

**`||` vs `??` — choose deliberately:**

```js
const quantity = 0;

// ❌ || treats 0 as "missing" and returns 1 — a real bug with numbers and empty strings
const a = quantity || 1;   // 1  😖

// ✅ ?? only falls back when the value is null/undefined
const b = quantity ?? 1;   // 0  ✅
```

> 💡 **React relevance:** `??` is how you write prop defaults that must respect
> falsy-but-valid values:
> `const label = props.label ?? 'Submit';`

### Optional chaining `?.`

```js
const user = { name: 'Ada', address: null };

user.address.city;        // ❌ TypeError: Cannot read properties of null
user.address?.city;       // undefined ✅ no crash
user.address?.city ?? 'Unknown'; // "Unknown"

// Also works for methods and dynamic keys
user.getName?.();          // calls only if it exists
user.profile?.['avatar'];  // safe bracket access
```

> 💡 In React, data arrives from APIs *after* the first render. The initial value
> is often `null` or missing, so `user?.name` and `data?.items?.length` are
> everywhere. Without `?.`, you get the classic
> "Cannot read properties of undefined (reading 'name')".

### Ternary operator

```js
const age = 20;
const label = age >= 18 ? 'Adult' : 'Minor';   // condition ? ifTrue : ifFalse
```

Nest it sparingly:

```js
const status =
  score >= 90 ? 'A' :
  score >= 80 ? 'B' :
  score >= 70 ? 'C' : 'F';
```

More than two levels of nesting is a signal to use `if`/`else` or a lookup
object. In JSX you will use ternaries constantly for "show A or B".

---

## 8. Conditionals

```js
const age = 20;

// if / else if / else
if (age >= 18) {
  console.log('Adult');
} else if (age >= 13) {
  console.log('Teenager');
} else {
  console.log('Child');
}

// Guard clause: handle the bad case early, then continue unindented
function greet(user) {
  if (!user) return 'Hello, guest';
  return `Hello, ${user.name}`;
}

// switch: compare one value against many cases
function iconFor(status) {
  switch (status) {
    case 'loading':
      return '⏳';
    case 'success':
      return '✅';
    case 'error':
      return '❌';
    default:
      return '❓';
  }
}
```

> 💡 **React relevance:** guard clauses at the top of a component are the
> cleanest way to handle loading/error/empty states (Part 3, conditional
> rendering):
> ```tsx
> if (isLoading) return <Spinner />;
> if (error) return <ErrorMessage error={error} />;
> return <UserList users={users} />;
> ```

---

## 9. Loops

```js
// Classic for: when you need the index and full control
for (let i = 0; i < 3; i++) {
  console.log(i); // 0, 1, 2
}

// for...of: the modern choice for arrays
const fruits = ['apple', 'banana', 'cherry'];
for (const fruit of fruits) {
  console.log(fruit); // "apple", "banana", "cherry"
}

// for...of with index using entries()
for (const [index, fruit] of fruits.entries()) {
  console.log(index, fruit); // 0 "apple" …
}

// while: repeat until a condition changes
let attempts = 0;
while (attempts < 3) {
  attempts += 1;
}

// do...while: always runs at least once
let n = 10;
do {
  n += 1;
} while (n < 5);
```

**`for...in` is for objects, not arrays:**

```js
const user = { name: 'Ada', age: 36 };
for (const key in user) {
  console.log(key, user[key]); // "name Ada", "age 36"
}
```

> ⚠️ Do not use `for...in` on arrays — it iterates over *indices as strings* and
> can include inherited properties. Use `for...of`, `map`, or `forEach`.

**`break` and `continue`:**

```js
for (const n of [1, 2, 3, 4, 5]) {
  if (n === 3) continue; // skip 3
  if (n === 5) break;    // stop the loop
  console.log(n);        // 1, 2, 4
}
```

> 🔍 **Why you will rarely write loops in React:** to render a list you do not
> loop and push; you `map` an array to an array of elements. React renders the
> returned array. `map` is file 7's main topic, and it is the single most used
> method in React code.

---

## 10. Scope

**Scope** = where a variable is visible.

```js
const globalConst = 'visible everywhere in this file';

function outer() {
  const outerVar = 'visible inside outer and inner';

  function inner() {
    const innerVar = 'visible only inside inner';
    console.log(globalConst, outerVar, innerVar); // ✅ all three
  }

  // console.log(innerVar); // ❌ not defined here
  inner();
}

outer();
// console.log(outerVar); // ❌ not defined here
```

Scope rules, in one list:

1. **Inner scopes can read outer scopes.** Outer scopes cannot read inner ones.
2. **Block scope** (`{ }`) applies to `let`/`const`; `var` ignores it.
3. **Function scope** applies to everything declared in a function.
4. **Module scope** is the top level of a file — not global. Each file has its
   own scope unless it explicitly exports (file 9).

### Shadowing

```js
const theme = 'light';

function render() {
  const theme = 'dark';   // shadows the outer `theme`
  console.log(theme);     // "dark"
}

render();
console.log(theme);       // "light" — outer one unchanged
```

> ⚠️ Shadowing causes real bugs in React: naming an inner variable the same as a
> prop or a state value hides the outer one. If your component "uses the wrong
> value", check for a shadowed name.

---

## 11. Errors: reading them is a skill

```js
// Throw your own errors
function divide(a, b) {
  if (b === 0) {
    throw new Error('Cannot divide by zero');
  }
  return a / b;
}

// Catch them
try {
  divide(1, 0);
} catch (error) {
  console.error('Something went wrong:', error.message); // "Cannot divide by zero"
} finally {
  // runs whether or not an error was thrown — good for cleanup
}
```

**Error types you will see constantly:**

| Error | Typical cause |
| --- | --- |
| `ReferenceError: x is not defined` | typo, or using something out of scope / before declaration |
| `TypeError: Cannot read properties of undefined (reading 'name')` | accessing a property of `undefined` — usually missing API data; fix with `?.` |
| `TypeError: x is not a function` | calling something that is not a function (often a wrong import) |
| `SyntaxError: Unexpected token` | malformed code, missing bracket/brace |
| `RangeError: Maximum call stack size exceeded` | infinite recursion — or an infinite `useEffect` loop in React |
| `ReferenceError: Cannot access 'x' before initialization` | temporal dead zone |

**How to read a stack trace:**

```text
TypeError: Cannot read properties of undefined (reading 'name')
    at UserCard (/src/components/UserCard.tsx:12:18)     ← the actual failure
    at renderWithHooks (react-dom.development.js:16305:18)
    at ... (react-dom internals — usually ignore these)
```

Read **your** frames first: file, line, column. The first line naming *your* file
is almost always the culprit. Everything below it is the call chain that led
there.

### Custom errors with extra data (a React pattern)

```js
class ApiError extends Error {
  constructor(message, status, body) {
    super(message);            // sets error.message
    this.name = 'ApiError';
    this.status = status;      // e.g. 404
    this.body = body;          // parsed error response
  }
}

try {
  throw new ApiError('Not found', 404, { detail: 'User missing' });
} catch (e) {
  if (e instanceof ApiError && e.status === 404) {
    console.log('Show a "not found" screen');
  }
}
```

Part 7 uses exactly this to decide between "show a 404 page", "show a
validation error" and "show a generic error banner".

---

## 12. Why each concept shows up in React

| JavaScript concept | Where React uses it |
| --- | --- |
| `const` / `let` | `const [count, setCount] = useState(0)` — state is `const`, the setter changes it |
| Objects | Props, state objects, API payloads, config |
| Arrays | Lists to render, cart items, API collections |
| Truthiness | `{isLoading && <Spinner />}`, `{error ? <E/> : <List/>}` |
| `===` | `useEffect` dependency comparison, conditional rendering |
| References vs values | Why state updates must create new objects/arrays |
| `typeof` | Narrowing types, runtime guards for API data |
| `?.` and `??` | Safe access to not-yet-loaded API data; defaults that respect `0` and `''` |
| Template literals | Dynamic class names, URLs, messages |
| Scope & shadowing | Variables inside components and hooks |
| `try` / `catch` | `async` API calls in effects and event handlers |
| `console.log` | Debugging renders, props and state |
| Errors | Error boundaries, API error handling, form validation messages |

---

## 13. Common mistakes in this chapter's material

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| Using `var` | Values leaking out of blocks; confusing bugs | `const`, then `let` |
| Reassigning a `const` object's *properties* and expecting an error | No error — objects are mutable by reference | `const` locks the binding, not the contents |
| `==` instead of `===` | `'0' == false` surprises | always `===` (except `x == null`) |
| Assuming `{ a: 1 } === { a: 1 }` | Comparison is `false`; `useEffect` re-runs unexpectedly | compare by id/value, or memoize |
| Mutating an array with `push` in React state | UI does not update | `[...arr, item]` (file 6) |
| `user.address.city` on possibly-missing data | `TypeError: Cannot read properties of undefined` | `user?.address?.city` |
| `count || 1` when `count` can be `0` | Wrong fallback | `count ?? 1` |
| Ignoring the `undefined` vs `null` distinction | `if (!x)` incorrectly treats `0` and `''` as missing | check explicitly |
| Sorting `[10, 9, 100]` without a comparator | `[10, 100, 9]` | `.sort((a, b) => a - b)` |
| Using floating point for money | `0.1 + 0.2 !== 0.3` | store integer paise/cents |
| Shadowing a variable name | Wrong value used silently | rename the inner variable |

---

## 14. Practice exercises

### Beginner

Predict each output before running it, then verify in the console or with
`node`.

```js
console.log(typeof null);
console.log(Boolean([]));
console.log('5' + 3);
console.log('5' - 3);
console.log(1 === '1');
console.log(null ?? 'fallback');
console.log(0 || 'fallback');
console.log(0 ?? 'fallback');
const x = { a: 1 };
const y = x;
y.a = 2;
console.log(x.a);
```

**Solution and explanations**

```text
"object"        typeof null is a historical bug — check with x === null
true            an empty array is an object, and objects are truthy
"53"            + with a string concatenates
2               - forces numeric conversion: 5 - 3
false           strict equality compares types too
"fallback"      null is nullish, so ?? uses the right side
"fallback"      0 is falsy, so || uses the right side
0               ✅ 0 is not nullish, so ?? keeps it
2               x and y point to the same object; mutating one changes both
```

**The lesson from the last pair:** `||` treats `0` and `''` as missing; `??` does
not. In React this decides whether a user who typed `0` (or an empty search box)
gets their value or your default.

### Intermediate

Write a function `describeOrder(order)` that takes an object like the one below
and returns a string. Then write `validateOrder(order)` that returns an array of
problem descriptions.

```js
const order = {
  id: 'ORD-1042',
  customer: { name: 'Ada', email: 'ada@example.com' },
  items: [
    { name: 'Keyboard', price: 4999, quantity: 1 },
    { name: 'Mouse', price: 1299, quantity: 2 },
  ],
  coupon: null,
};
```

Requirements:

- `describeOrder` returns e.g.
  `"Order ORD-1042 for Ada: 3 items, total ₹7597"`.
  (`3 items` = sum of quantities, `total` = sum of price × quantity.)
- Handle a missing customer name with `'Guest'` (use `??`, not `||`).
- `validateOrder` returns `[]` for a valid order, or messages such as
  `"No items"`, `"Invalid email"`, `"Item has non-positive quantity"`.

**Solution**

```text
js-playground/orders.js
```

```js
/**
 * Builds a human-readable summary of an order.
 * @param {object} order
 * @returns {string}
 */
function describeOrder(order) {
  const customerName = order.customer?.name ?? 'Guest';
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const total = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // toLocaleString formats the number with Indian digit grouping
  return `Order ${order.id} for ${customerName}: ${itemCount} items, total ₹${total.toLocaleString('en-IN')}`;
}

/**
 * Returns a list of problems with the order. Empty array = valid.
 * @param {object} order
 * @returns {string[]}
 */
function validateOrder(order) {
  const problems = [];

  if (!order) {
    return ['Order is missing'];
  }

  if (!Array.isArray(order.items) || order.items.length === 0) {
    problems.push('No items');
  } else {
    for (const item of order.items) {
      if (!item.quantity || item.quantity <= 0) {
        problems.push(`Item "${item.name}" has non-positive quantity`);
      }
      if (typeof item.price !== 'number' || item.price < 0) {
        problems.push(`Item "${item.name}" has an invalid price`);
      }
    }
  }

  const email = order.customer?.email;
  if (email && !email.includes('@')) {
    problems.push('Invalid email');
  }

  return problems;
}

// --- demo ---
console.log(describeOrder(order));
// "Order ORD-1042 for Ada: 3 items, total ₹7,597"

console.log(validateOrder(order)); // []
console.log(validateOrder({ id: 'X', items: [] })); // [ 'No items' ]
console.log(validateOrder({ id: 'X', customer: { email: 'bad' }, items: [{ name: 'Cable', price: 10, quantity: 0 }] }));
// [ 'Item "Cable" has non-positive quantity', 'Invalid email' ]
```

**Line by line**

- `order.customer?.name ?? 'Guest'` — safe access *plus* a default that respects
  an empty string. If `customer` is missing, `?.` short-circuits to `undefined`,
  and `??` supplies `'Guest'`.
- `order.items.reduce((sum, item) => sum + item.quantity, 0)` — starts at `0`
  and accumulates. The second argument (`0`) is essential: without it, `reduce`
  uses the first item as the initial value and your maths is wrong.
- `.toLocaleString('en-IN')` — formats `7597` as `"7,597"`. Presentation belongs
  at the edge, not in stored data.
- `!Array.isArray(order.items) || order.items.length === 0` — `Array.isArray` is
  the correct check because `typeof []` is `"object"`.
- Guard clause `if (!order) return [...]` — handle the "no data at all" case
  first, then the rest of the function can assume an order exists. This is the
  same shape you will use in React components.
- `if (email && !email.includes('@'))` — note `email &&` first: a missing email
  is not an error here, only a malformed one is.

> `reduce` is not explained in depth until file 7. If it looks opaque, run this
> file, then return after file 7 — it will click.

### Challenge

Write `inventory.js` that manages a small shop's stock **without mutating the
original arrays**. Implement:

1. `addProduct(products, product)` — returns a **new** array with the product
   appended.
2. `removeProduct(products, id)` — returns a **new** array without that product.
3. `updatePrice(products, id, price)` — returns a **new** array where that
   product's price changed. The changed product must also be a **new object**
   (do not mutate it).
4. `totalValue(products)` — returns the sum of `price * stock` for in-stock
   items.
5. `lowStock(products, threshold)` — returns names of products with
   `stock <= threshold`.
6. A `main()` that prints the results and **proves** the original array is
   unchanged after all operations (print it at the start and at the end).

This is *exactly* the set of operations you will perform on React state.

**Solution**

```text
js-playground/inventory.js
```

```js
const products = [
  { id: 'p1', name: 'Keyboard', price: 4999, stock: 12 },
  { id: 'p2', name: 'Mouse', price: 1299, stock: 3 },
  { id: 'p3', name: 'Monitor', price: 18999, stock: 0 },
];

// 1. Add — spread creates a new array; the original is untouched
function addProduct(list, product) {
  return [...list, product];
}

// 2. Remove — filter returns a new array of items that pass the test
function removeProduct(list, id) {
  return list.filter((product) => product.id !== id);
}

// 3. Update — map returns a new array; only the matching item is replaced,
//    and it is replaced with a NEW object (spread + override)
function updatePrice(list, id, price) {
  return list.map((product) =>
    product.id === id ? { ...product, price } : product
  );
}

// 4. Total value — reduce accumulates price * stock
function totalValue(list) {
  return list.reduce((total, product) => total + product.price * product.stock, 0);
}

// 5. Low stock — filter, then map to names
function lowStock(list, threshold) {
  return list
    .filter((product) => product.stock <= threshold)
    .map((product) => product.name);
}

function main() {
  console.log('--- before ---');
  console.log(products);

  const withNew = addProduct(products, { id: 'p4', name: 'Webcam', price: 3499, stock: 7 });
  const withoutMouse = removeProduct(products, 'p2');
  const repriced = updatePrice(products, 'p1', 4499);

  console.log('--- results ---');
  console.log('added:', withNew.map((p) => p.name));        // [ 'Keyboard', 'Mouse', 'Monitor', 'Webcam' ]
  console.log('removed:', withoutMouse.map((p) => p.name)); // [ 'Keyboard', 'Monitor' ]
  console.log('repriced:', repriced[0].price);              // 4499
  console.log('total value: ₹', totalValue(products).toLocaleString('en-IN')); // ₹63,885
  console.log('low stock (<=5):', lowStock(products, 5));   // [ 'Mouse', 'Monitor' ]

  console.log('--- after (must be identical to before) ---');
  console.log(products);
  console.log('original keyboard price still 4999?', products[0].price === 4999); // true
  console.log('original length still 3?', products.length === 3);                 // true
}

main();
```

**Why this is the React way**

- **Every function returns new data.** Nothing outside it changes.
- `map` for "same length, change one item", `filter` for "remove", spread for
  "add" — those three cover ~90% of state updates you will ever write.
- `updatePrice` replaces the matching product with `{ ...product, price }`. The
  spread copies the old object, then `price` overrides one key. This is the
  canonical React immutability pattern.
- The "original product object" identity is preserved for untouched items
  (`: product`), which matters for memoization later (Part 10): unchanged rows
  keep the same reference, so React can skip re-rendering them.

**Expected result:** the "after" log is identical to the "before" log, and both
booleans print `true`.

---

## 15. Summary

- Prefer **`const`**; use `let` only when reassigning; avoid `var`.
- Seven primitives + objects. `typeof null` is `"object"` — a legacy bug.
- Objects are **key → value** maps; arrays are ordered lists; both are
  **compared and copied by reference**.
- **Never mutate** data you intend React to notice; create new objects/arrays.
- `===` always (except `x == null`); `??` for defaults that must respect `0` and
  `''`; `?.` to avoid crashes on missing data.
- **Falsy**: `false, 0, -0, 0n, "", null, undefined, NaN`. Everything else is
  truthy — including `[]`, `{}` and `"0"`.
- `if`/`else`, ternaries and guard clauses drive conditional UI.
- Loops exist, but in React you will use `map`/`filter`/`reduce` instead.
- Scope and shadowing explain "why is this variable the wrong value?".
- Read error messages from your own frames first; `console.log` is your friend.

**What's next →** [`04-modern-javascript.md`](./04-modern-javascript.md): the ES6+
syntax — arrow functions, template literals, optional chaining patterns — that
makes React code look the way it does.
