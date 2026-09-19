# 08 — Enums (and What Most Code Should Use Instead)

> **Part 2 · TypeScript · File 8 of 11**
>
> **Why this file exists:** `enum` is the one TypeScript feature that both adds
> runtime code and fights with modern build tooling. You will meet enums in
> existing codebases, in job interviews, and in tutorials written before 2020 — so
> you must understand them precisely. But you also need to know why most
> experienced TypeScript teams now reach for `as const` objects and union types
> first. This file teaches both, with evidence, and no dogma.

---

## 1. What an enum is

An **enum** defines a named set of constants.

```ts
enum Direction {
  Up,      // 0
  Down,    // 1
  Left,    // 2
  Right,   // 3
}
```

That is a **numeric enum**: members get sequential numbers by default. You can also
choose the numbers — and doing so is often a mistake, because the numbers leak:

```ts
enum HttpStatus {
  Ok = 200,
  NotFound = 404,
  ServerError = 500,
}
```

A **string enum** is usually what people intend:

```ts
enum TicketStatus {
  Open = 'open',
  InProgress = 'in-progress',
  Blocked = 'blocked',
  Closed = 'closed',
}
```

A **heterogeneous enum** mixes both — legal, and almost always a bug generator:

```ts
enum Mixed { No = 0, Yes = 'YES' }   // ❌ avoid: no consistent runtime shape
```

Access members with dot notation (`TicketStatus.Open`) or, for string enums, the
string **without** a cast (`'open'` is not assignable — see section 4).

---

## 2. What an enum is at runtime (this is the important part)

Enums are **not** type-only syntax. They compile to real JavaScript objects.
Compiled with `tsc` for ES2022, an enum becomes an IIFE:

```js
// Input:  enum TicketStatus { Open = 'open', InProgress = 'in-progress' }
// Output:
export var TicketStatus;
(function (TicketStatus) {
    TicketStatus["Open"] = "open";
    TicketStatus["InProgress"] = "in-progress";
})(TicketStatus || (TicketStatus = {}));
```

A **numeric** enum is worse — it emits a **reverse mapping**, assigning both
directions:

```js
// Input:  enum Stage { Draft, Review, Published }
// Output:
export var Stage;
(function (Stage) {
    Stage[Stage["Draft"] = 0] = "Draft";
    Stage[Stage["Review"] = 1] = "Review";
    Stage[Stage["Published"] = 2] = "Published";
})(Stage || (Stage = {}));
```

The consequences, verified by running it:

```ts
enum Stage { Draft, Review, Published }
enum StringKind { Draft = 'draft', Review = 'review' }

JSON.stringify(Stage);
// {"0":"Draft","1":"Review","2":"Published","Draft":0,"Review":1,"Published":2}

Object.keys(Stage);
// [ '0', '1', '2', 'Draft', 'Review', 'Published' ]     ← 2× as many keys as members

Object.values(Stage);
// [ 'Draft', 'Review', 'Published', 0, 1, 2 ]           ← names AND numbers in one array

Object.entries(Stage);
// [ ['0','Draft'], ['1','Review'], ['2','Published'], ['Draft',0], ['Review',1], ['Published',2] ]

JSON.stringify(StringKind);
// {"Draft":"draft","Review":"review"}                   ← string enums have no reverse mapping
```

So iterating a numeric enum needs a filter that looks like a workaround:

```ts
const names = Object.values(Stage).filter((value) => typeof value === 'string');
// [ 'Draft', 'Review', 'Published' ]
```

> ⚠️ **The `Object.values` trap.** A loop like
> `for (const value of Object.values(Stage))` visits **six** things for a
> three-member enum, three of which are numbers. The bug it produces is subtle: a
> `switch` with a `default` that throws will throw on every numeric key. If you
> iterate an enum, filter — or better, do not iterate an enum at all.

**The reverse mapping is occasionally a feature** (a numeric protocol code that
must map back to a name for logging), and that is one of the few honest reasons to
keep a numeric enum. It is not a reason to model your UI states as numbers.

---

## 3. `const enum`

`const enum` is a promise: "do not emit an object; inline the values at each use
site".

```ts
const enum Local { A = 1, B = 2 }
console.log(Local.A, Local.B);
```

Verified emit — there is **no runtime object at all**:

```js
console.log(1 /* Local.A */, 2 /* Local.B */);
```

That is genuinely as efficient as writing the numbers by hand. But it comes with
costs that make it a poor default:

- **It only inlines when TypeScript can see the declaration.** `const enum` in a
  library consumed by a *different* compiler configuration may not inline, which is
  how "it worked in dev, it is slow/broken in prod" stories start.
- **Ambient `const enum` + `isolatedModules` is a hard error**, because a
  single-file transpiler has nothing to inline from:

  ```ts
  declare const enum Ambient { A = 1 }
  export const v: Ambient = Ambient.A;
  // TS2748: Cannot access ambient const enums when 'isolatedModules' is enabled.
  ```

  `isolatedModules` is enabled by Vite, esbuild, Babel, SWC, Next.js, and most
  modern setups — including the `tsconfig.json` used throughout these notes.
- **It is not erasable syntax**, so it breaks Node's type stripping exactly like a
  regular enum (the compiler *must* rewrite the line, and stripping cannot):

  ```text
  $ node --experimental-strip-types src/status-models.ts
  SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]:
    TypeScript enum is not supported in strip-only mode
  ```

  The same applies to `--erasableSyntaxOnly` (TypeScript 5.8+):

  ```text
  TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
  ```

  Both errors are about the same thing: **enums are not "types that get erased";
  they are code that gets generated.**

---

## 4. The friction that makes teams leave enums

String enums feel like unions but behave like **nominal** types: the value and the
literal are different types.

```ts
enum TicketStatusEnum { Open = 'open', InProgress = 'in-progress' }

const fromApi: TicketStatusEnum = 'open';
// ❌ TS2322: Type '"open"' is not assignable to type 'TicketStatusEnum'.
```

Every string that arrives from the real world — `fetch` JSON, `localStorage`,
`URLSearchParams`, `process.env`, a `<select>` value, a test fixture — is a plain
`string`, and none of them are assignable to the enum without a cast or a mapping
function. With a union type derived from `as const`, the *same values* are accepted
directly:

```ts
const TICKET_STATUS = { Open: 'open', InProgress: 'in-progress' } as const;
type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

const fromApi: TicketStatus = 'open';   // ✅
```

For a React codebase this is the decisive difference. Props, route params, query
strings, and API payloads are all string-literal territory:

```tsx
// With a union type — callers pass literals, no import required
<Alert severity="warning" />

// With a string enum — every call site needs the enum as a VALUE import
<Alert severity={Severity.Warning} />

// …and this fails, which is exactly what people try first:
<Alert severity="warning" />   // ❌ TS2322
```

> 🔍 **Both approaches need a runtime guard.** A type — enum or union — validates
> nothing at runtime. `statusFromApi(raw: string)` in the intermediate exercise uses
> `ALL_STATUSES.find(...)` plus a `value is Flag` type predicate, and it is needed
> with *either* approach. If you believed enums gave you runtime validation, that
> belief is the actual bug: see Part 7 for runtime validation with Zod.

---

## 5. The alternative: `as const` objects + derived unions

```ts
const TICKET_STATUS = {
  Open: 'open',
  InProgress: 'in-progress',
  Blocked: 'blocked',
  Closed: 'closed',
} as const;

// The type is DERIVED from the object, so there is exactly one source of truth:
//   typeof TICKET_STATUS                  → { readonly Open: 'open'; … }
//   keyof typeof TICKET_STATUS            → 'Open' | 'InProgress' | 'Blocked' | 'Closed'
//   TICKET_STATUS[keyof typeof …]         → 'open' | 'in-progress' | 'blocked' | 'closed'
type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

const ALL_STATUSES: readonly TicketStatus[] = Object.values(TICKET_STATUS);
```

Emitted JavaScript: **one plain object, no IIFE, no reverse mapping**, and every
use site inlines the plain string:

```js
// The object itself
export const TICKET_STATUS = { Open: 'open', InProgress: 'in-progress' };

// A use site
export const a = 'open';      // ← the literal, no runtime lookup at all
```

Trade-offs to be honest about:

- **You must write `Object.values` for iteration.** There is no free "list of
  members" — but you *can* get one, typed, as shown above. In fact this is
  *better*, because `Object.values` on the as-const object returns exactly the four
  strings, not six mixed entries.
- **`as const` is a compile-time idea only.** It does **not** freeze the object:

  ```ts
  const KIND = { Draft: 'draft' } as const;
  (KIND as Record<string, string>).Draft = 'hacked';   // ← allowed at runtime!
  console.log(KIND.Draft);                              // "hacked"
  ```

  If you need runtime immutability, use `Object.freeze` (and remember from file 2
  that it is **shallow** — nested objects stay mutable).
- **The union carries no namespace.** `TICKET_STATUS.Open` works, but there is no
  `TicketStatus.Open` *value* — the type and the object have different names by
  convention (`TicketStatus` type, `TICKET_STATUS` value). That convention is worth
  following precisely because it makes the distinction visible.

### The keys-as-type variant

```ts
const PRIORITY = { Low: 'low', Normal: 'normal', High: 'high' } as const;

type PriorityKey = keyof typeof PRIORITY;               // 'Low' | 'Normal' | 'High'
type PriorityValue = (typeof PRIORITY)[PriorityKey];     // 'low' | 'normal' | 'high'
```

Use this when the **keys** are the meaningful identifiers (a map of handlers, a
registry of adapters, a `Record` of per-mode configuration) and the values are
payloads or implementations. Use the value-derived union (`TICKET_STATUS`) when the
**values** are what crosses your API boundary — which is the common case for
statuses and severities, because the wire format is the string.

### Making a config object exhaustive with `satisfies`

```ts
interface FlagConfig {
  readonly id: Flag;
  readonly state: 'off' | 'on' | 'rollout';
  readonly rolloutPercent: number;
  readonly description: string;
}

const FLAG_CONFIG = {
  'new-checkout': { id: 'new-checkout', state: 'rollout', rolloutPercent: 25, description: '…' },
  'dark-mode':    { id: 'dark-mode',    state: 'on',      rolloutPercent: 100, description: '…' },
  'bulk-edit':    { id: 'bulk-edit',    state: 'off',     rolloutPercent: 0,   description: '…' },
} as const satisfies Record<Flag, FlagConfig>;
```

`satisfies` gives you **both** halves of what you want: the object is *checked*
against `Record<Flag, FlagConfig>` (so a missing or misspelled flag is a compile
error) **and** it keeps its narrow literal types (so `keyof typeof FLAG_CONFIG` is
still the exact union). This is the pattern the challenge below uses, and it is the
closest thing TypeScript has to "an enum, but honest". File 10 covers the `Record`
utility in depth.

---

## 6. Which should you use? A fair comparison

| Criterion | `enum` (string) | `as const` object + union |
| --- | --- | --- |
| Runtime output | IIFE creating an object | one plain object |
| Accepts a plain string literal | ❌ `TS2322` | ✅ |
| Works with JSON/URL/`<select>` values directly | ❌ needs a mapping or cast | ✅ |
| Erasable (Node strip-only, `erasableSyntaxOnly`) | ❌ `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` / `TS1294` | ✅ |
| Iterating all members | awkward (reverse mapping); string enums are fine | `Object.values` works cleanly |
| Needs a value import at every use site | ✅ yes | ❌ no (only if you need the object) |
| Names are automatically referenced (`Status.Open`) | ✅ | via the object: `STATUS.Open` |
| Reverse lookup number → name | ✅ built in | ❌ not applicable (do not use numbers) |
| Tree-shaking friendliness | the enum object is a value; may survive | object survives, but constant-folded literals help |
| Familiarity for newcomers from Java/C# | ✅ high | lower (needs the `keyof typeof` idiom) |
| Risk of confusing type and value names | low | medium (naming convention required) |

**Guidance, not a verdict:**

- **Default to `as const` + derived union** for statuses, severities, variants,
  modes, roles, flags, and anything that crosses a string boundary. This is where
  95% of React code lives.
- **Use a string `enum`** when you are in a codebase that already uses enums
  consistently and consistency outweighs the frictions — a mixed codebase is worse
  than a slightly suboptimal convention. (Migration tip: `as const` objects are
  assignable *from* older enum values if the values match, so a gradual refactor is
  feasible file by file.)
- **Use a numeric `enum` genuinely rarely**: wire protocols and persisted numeric
  codes where the reverse mapping and stability of numbers matter. Even then,
  document the wire format separately — the numbers are a data contract, not a
  language feature.
- **Avoid `const enum` in library code** (inlining depends on your compiler seeing
  the declaration) and **avoid heterogeneous enums** entirely.
- **Never use an enum or union as validation.** Both are erased; runtime data needs
  a runtime guard.

> 🏭 **What React's own ecosystem does.** React's types use **string literal unions**
> for almost everything: `type?: 'button' | 'submit' | 'reset'`, `mode?: 'development' | 'production'`,
> `position?: 'top' | 'bottom'`. The React docs, TanStack Query's `status`, and
> Redux Toolkit's `status` fields all follow the same style. When the library you
> depend on models its API with unions, your props should match — passing a plain
> string is pleasant, and `as const` keeps your side of the contract just as safe.

---

## 7. Common mistakes

| ⚠️ Mistake | Symptom | Fix |
| --- | --- | --- |
| Expecting a string to be assignable to a string enum | `TS2322: Type '"open"' is not assignable to type 'Status'` | use an `as const` union, or map the string explicitly |
| Iterating a numeric enum | Loop body runs 2× per member; numeric values appear | filter `typeof value === 'string'`, or do not iterate |
| `Object.values(numericEnum)` treated as names | Mixed `["Draft", …, 0, 1, 2]` | filter, or use string enums / `as const` |
| Forgetting to assign explicit values in a numeric enum | Adding a member in the middle renumbers everything | assign explicit numbers *and* keep them stable |
| Persisting numeric enum values to a database/API | Renumbering silently corrupts stored data | persist the **string**, treat numbers as internal |
| `const enum` in a library | Inlining depends on the consumer's compiler | use a regular `const` object |
| `declare const enum` with `isolatedModules` | `TS2748` | use `const`/`as const` objects |
| Heterogeneous enum | Inconsistent runtime shape; branches differ per member | split into two enums, or use a union |
| Using an enum for validation | Bad data flows through unchallenged | add a type guard (`value is Status`) |
| `as const` assumed to be a runtime freeze | Values can still be mutated | `Object.freeze` (shallow!) |
| `keyof typeof X` used without checking for `number` keys | Surprising union members | keep `X` free of numeric index signatures |
| Enum member shadows a type of the same name | Confusing autocomplete | suffix values (`X_VALUES`) or use distinct names |

---

## 8. Practice exercises

### Beginner

1. Predict the exact output, then verify by running it:

```ts
enum Level { Low, Medium, High }
console.log(JSON.stringify(Level));
console.log(Object.keys(Level).length);
console.log(Object.values(Level).length);
console.log(Level[1], Level.Medium);
```

2. How many compile errors are in this snippet, and why?

```ts
enum Role { Admin = 'admin', Editor = 'editor' }

interface User { id: string; role: Role }

const u1: User = { id: 'u1', role: Role.Editor };   // line A
const u2: User = { id: 'u2', role: 'editor' };      // line B
const u3: User = { id: 'u3', role: 'superadmin' };  // line C
```

3. Rewrite `Role` above as an `as const` object + derived union so that line B
   compiles and line C still fails.

**Solution**

**1.**

```text
{"0":"Low","1":"Medium","2":"High","Low":0,"Medium":1,"High":2}
6
6
Medium 1
```

Line by line:

- `JSON.stringify(Level)` shows **six** properties for a three-member enum: three
  forward (`"Low":0`) and three reverse (`"0":"Low"`).
- `Object.keys(Level).length` is `6`, not `3`.
- `Object.values(Level).length` is `6`, and the values are
  `[ 'Low', 'Medium', 'High', 0, 1, 2 ]` — names *and* numbers.
- The last line prints `Medium 1`: `Level[1]` goes **number → name** (the reverse
  mapping), while `Level.Medium` goes **name → number** (the forward mapping). Both
  directions exist simultaneously, which is precisely why numeric enums are
  confusing to print and iterate.

**2.** One error, on **line B**:

```text
TS2322: Type '"editor"' is not assignable to type 'Role'.
```

Line A is fine (the enum member is the right type). Line C is a *different* error —
`'superadmin'` is not a member, so it is rejected too:

```text
TS2322: Type '"superadmin"' is not assignable to type 'Role'.
```

So: **two errors (B and C), for two different reasons.** B is the friction case
(the value is right, the type is wrong); C is the desired case (the value is
genuinely invalid). The as-const rewrite fixes B and keeps C.

**3.**

```ts
const ROLE = { Admin: 'admin', Editor: 'editor' } as const;
type Role = (typeof ROLE)[keyof typeof ROLE];   // 'admin' | 'editor'

interface User { id: string; role: Role }

const u1: User = { id: 'u1', role: ROLE.Editor };   // ✅
const u2: User = { id: 'u2', role: 'editor' };      // ✅ now valid — the literal IS the type
const u3: User = { id: 'u3', role: 'superadmin' };
// ❌ TS2322: Type '"superadmin"' is not assignable to type '"admin" | "editor"'.
```

The safety you wanted (C rejected) is unchanged; the friction you did not want
(B rejected) is gone.

### Intermediate

Model a **ticket lifecycle** three ways — numeric enum, string enum, and `as const`
union — and compare them at runtime. Then drive a ticket through its states with an
event-based transition table.

```text
ts-playground/src/status-models.ts
```

Requirements:

1. `enum NumericStage { Draft, Review, Published }` — for the reverse-mapping demo only.
2. `enum TicketStatusEnum` with string values `'open' | 'in-progress' | 'blocked' | 'closed'`.
3. The same statuses as a `const TICKET_STATUS = { … } as const` object with a
   derived `TicketStatus` union and an `ALL_STATUSES` array.
4. A second variant: `const PRIORITY` where the **keys** are the type
   (`PriorityKey = keyof typeof PRIORITY`) alongside `PriorityValue`.
5. `TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]>` — data, not code.
6. `assertNever`, `describeStatus(status)` with an exhaustive switch, and
   `applyEvent(status, event)` for `'start' | 'block' | 'unblock' | 'close'`,
   **throwing a clear error** for illegal transitions.
7. `statusFromApi(raw: string): TicketStatus` — a runtime guard, proving types do
   not validate data.
8. Demo: print all three runtime shapes, iterate the transitions, walk a ticket
   through a lifecycle including one illegal transition, and show the API guard
   rejecting an unknown status.
9. A comment block with the real error codes for the enum frictions and the
   exhaustive-record failure.

**Solution**

```text
ts-playground/src/status-models.ts
```

```ts
export {};

// ============================================================================
// Approach 1 — a numeric enum (worst of both worlds: extra runtime object AND
// reverse mapping that doubles the keys)
// ============================================================================
enum NumericStage {
  Draft,      // 0
  Review,     // 1
  Published,  // 2
}

// ============================================================================
// Approach 2 — a string enum (readable values, still a runtime object)
// ============================================================================
enum TicketStatusEnum {
  Open = 'open',
  InProgress = 'in-progress',
  Blocked = 'blocked',
  Closed = 'closed',
}

// ============================================================================
// Approach 3 — an `as const` object + a derived union (the modern default)
// ============================================================================
const TICKET_STATUS = {
  Open: 'open',
  InProgress: 'in-progress',
  Blocked: 'blocked',
  Closed: 'closed',
} as const;

// `typeof TICKET_STATUS[keyof typeof TICKET_STATUS]`:
//   typeof TICKET_STATUS                    → the object's type (readonly literals)
//   keyof typeof TICKET_STATUS              → 'Open' | 'InProgress' | 'Blocked' | 'Closed'
//   TICKET_STATUS[keyof typeof TICKET_STATUS] → 'open' | 'in-progress' | 'blocked' | 'closed'
type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

// ============================================================================
// Approach 4 — same idea, but the KEYS carry the meaning ('Low' | 'High')
// ============================================================================
const PRIORITY = { Low: 'low', Normal: 'normal', High: 'high' } as const;
type PriorityKey = keyof typeof PRIORITY;          // 'Low' | 'Normal' | 'High' (the keys)
type PriorityValue = (typeof PRIORITY)[PriorityKey]; // 'low' | 'normal' | 'high'  (the values)

// ============================================================================
// Using the union type: exhaustive data and exhaustive switches
// ============================================================================
const ALL_STATUSES: readonly TicketStatus[] = Object.values(TICKET_STATUS);

// A Record keyed by the union is exhaustive *by construction*: add a fifth status
// and this object fails to compile until you describe its transitions.
const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ['in-progress', 'blocked', 'closed'],
  'in-progress': ['blocked', 'closed'],
  blocked: ['in-progress', 'closed'],
  closed: [],                       // terminal
};

function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${String(value)}`);
}

function describeStatus(status: TicketStatus): string {
  switch (status) {
    case 'open':
      return 'Waiting to be picked up';
    case 'in-progress':
      return 'Someone is working on it';
    case 'blocked':
      return 'Waiting on something else';
    case 'closed':
      return 'Done';
    default:
      return assertNever(status);       // ← a 5th status breaks the build here
  }
}

type TicketEvent = 'start' | 'block' | 'unblock' | 'close';

function applyEvent(status: TicketStatus, event: TicketEvent): TicketStatus {
  const target: Record<TicketEvent, Partial<Record<TicketStatus, TicketStatus>>> = {
    start: { open: 'in-progress', blocked: 'in-progress' },
    block: { open: 'blocked', 'in-progress': 'blocked' },
    unblock: { blocked: 'in-progress' },
    close: { open: 'closed', 'in-progress': 'closed', blocked: 'closed' },
  };
  const next = target[event][status];
  if (next === undefined) {
    throw new Error(`Cannot "${event}" a ticket that is "${status}"`);
  }
  return next;
}

// ============================================================================
// Runtime data still needs a runtime guard — with enums too!
// ============================================================================
function statusFromApi(raw: string): TicketStatus {
  const candidate = ALL_STATUSES.find((status) => status === raw);
  if (candidate === undefined) {
    throw new Error(`Unknown status from API: ${JSON.stringify(raw)}`);
  }
  return candidate;
}

// ============================================================================
// Demo
// ============================================================================
function main(): void {
  console.log('=== runtime shape: numeric enum (note the reverse mapping) ===');
  // JSON.stringify keeps it on one line: note every name appears TWICE
  console.log('  NumericStage      :', JSON.stringify(NumericStage));
  console.log('  Object.keys       :', Object.keys(NumericStage));
  console.log('  forward lookup    : NumericStage.Draft =', NumericStage.Draft);
  console.log('  reverse lookup    : NumericStage[0] =', NumericStage[0], '← the number maps back to a name');

  console.log('\n=== runtime shape: string enum ===');
  console.log('  TicketStatusEnum  :', JSON.stringify(TicketStatusEnum));
  console.log('  Object.keys       :', Object.keys(TicketStatusEnum));

  console.log('\n=== runtime shape: as const object (identical values, no machinery) ===');
  console.log('  TICKET_STATUS     :', JSON.stringify(TICKET_STATUS));
  console.log('  Object.keys       :', Object.keys(TICKET_STATUS));
  console.log('  ALL_STATUSES      :', ALL_STATUSES);

  console.log('\n=== string literals work directly with the union type ===');
  const literal: TicketStatus = 'open';               // ✅ no cast, no import of a runtime value
  console.log('  literal === TICKET_STATUS.Open:', literal === TICKET_STATUS.Open);

  console.log('\n=== keys-as-type variant ===');
  const key: PriorityKey = 'High';
  const value: PriorityValue = PRIORITY[key];
  console.log(`  ${key} → ${value}`);

  console.log('\n=== transitions are data, so they are discoverable at runtime ===');
  for (const status of ALL_STATUSES) {
    const nexts = TRANSITIONS[status];
    console.log(`  ${status.padEnd(12)} → ${nexts.length === 0 ? '(terminal)' : nexts.join(', ')}`);
  }

  console.log('\n=== a ticket moving through its lifecycle ===');
  let current: TicketStatus = 'open';
  const events: TicketEvent[] = ['start', 'block', 'unblock', 'close', 'close'];
  console.log(`  start: ${current} — ${describeStatus(current)}`);
  for (const event of events) {
    try {
      const next = applyEvent(current, event);
      console.log(`  ${event.padEnd(8)} ${current} → ${next} — ${describeStatus(next)}`);
      current = next;
    } catch (error) {
      console.log(`  ${event.padEnd(8)} ✖ ${(error as Error).message}`);
    }
  }

  console.log('\n=== runtime guards are needed no matter which approach you pick ===');
  console.log('  statusFromApi("blocked"):', statusFromApi('blocked'));
  try {
    statusFromApi('archived');
  } catch (error) {
    console.log('  statusFromApi("archived") ✖', (error as Error).message);
  }
}

main();

/* ---------------------------------------------------------------------------
   WHAT THE TYPES REJECT, VERSION BY VERSION

   // 1. A plain string is NOT assignable to a string enum — the single biggest
   //    practical complaint about enums, and it applies to JSON/API data too:
   // const a: TicketStatusEnum = 'open';
   //   TS2322: Type '"open"' is not assignable to type 'TicketStatusEnum'.

   // 2. The same literal IS assignable to the union derived from `as const`:
   const b: TicketStatus = 'open';   // ✅

   // 3. Adding a status without describing its transitions:
   // const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
   //   open: [], 'in-progress': [], blocked: [],
   // };
   //   TS2739: Type '{ open: never[]; "in-progress": never[]; blocked: never[]; }' is
   //           missing the following properties from type 'Record<TicketStatus, …>': closed

   // 4. An unknown status in a switch body:
   // function f(s: TicketStatus) { switch (s) { case 'open': return 1; } }
   //   TS2366: Function lacks ending return statement and return type does not include 'undefined'.

   // 5. Enums do not exist at runtime under Node's type stripping:
   //    $ node --experimental-strip-types src/status-models.ts
   //    SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]:
   //      TypeScript enum is not supported in strip-only mode

   // 6. Enums are also rejected by --erasableSyntaxOnly (TS 5.8+):
   //    TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
---------------------------------------------------------------------------- */
```

**Run it**

```bash
npx tsx src/status-models.ts
```

**Expected output**

```text
=== runtime shape: numeric enum (note the reverse mapping) ===
  NumericStage      : {"0":"Draft","1":"Review","2":"Published","Draft":0,"Review":1,"Published":2}
  Object.keys       : [ '0', '1', '2', 'Draft', 'Review', 'Published' ]
  forward lookup    : NumericStage.Draft = 0
  reverse lookup    : NumericStage[0] = Draft ← the number maps back to a name

=== runtime shape: string enum ===
  TicketStatusEnum  : {"Open":"open","InProgress":"in-progress","Blocked":"blocked","Closed":"closed"}
  Object.keys       : [ 'Open', 'InProgress', 'Blocked', 'Closed' ]

=== runtime shape: as const object (identical values, no machinery) ===
  TICKET_STATUS     : {"Open":"open","InProgress":"in-progress","Blocked":"blocked","Closed":"closed"}
  Object.keys       : [ 'Open', 'InProgress', 'Blocked', 'Closed' ]
  ALL_STATUSES      : [ 'open', 'in-progress', 'blocked', 'closed' ]

=== string literals work directly with the union type ===
  literal === TICKET_STATUS.Open: true

=== keys-as-type variant ===
  High → high

=== transitions are data, so they are discoverable at runtime ===
  open         → in-progress, blocked, closed
  in-progress  → blocked, closed
  blocked      → in-progress, closed
  closed       → (terminal)

=== a ticket moving through its lifecycle ===
  start: open — Waiting to be picked up
  start    open → in-progress — Someone is working on it
  block    in-progress → blocked — Waiting on something else
  unblock  blocked → in-progress — Someone is working on it
  close    in-progress → closed — Done
  close    ✖ Cannot "close" a ticket that is "closed"

=== runtime guards are needed no matter which approach you pick ===
  statusFromApi("blocked"): blocked
  statusFromApi("archived") ✖ Unknown status from API: "archived"
```

**Design notes**

- **`Record<TicketStatus, readonly TicketStatus[]>` is exhaustiveness by
  construction.** Delete a key and the object fails to compile
  (`TS2739: … is missing the following properties from type 'Record<TicketStatus, …>': closed`)
  — which is strictly better than an enum plus a `switch` that might not be updated.
- **`describeStatus` keeps a `never` tripwire** (file 5): the day someone adds
  `'reopened'`, this function fails to compile until it is handled.
- **`applyEvent` stores transitions as data**, so the illegal-transition case is a
  runtime error with a readable message, and the whole transition graph is
  inspectable at runtime (the loop that prints it is a real feature, not a demo trick).
- **`statusFromApi` is the honest bit.** `TicketStatus` is erased at runtime; only
  `ALL_STATUSES.find(...)` actually protects the program. Enums would not have
  helped here at all.
- **`ALL_STATUSES: readonly TicketStatus[] = Object.values(TICKET_STATUS)`** is the
  typed equivalent of "all enum members", and it returns exactly four strings —
  compare with the numeric enum's six mixed entries.

### Challenge

Take an **enum-based feature-flag module** and rewrite it with `as const` unions,
`satisfies`, and runtime parsing. This is the "refactor the legacy code" task you
will face in a real codebase, and it exercises the whole part: unions (5),
functions (6), generics (7) and enums (8).

```text
ts-playground/src/feature-flags.ts
```

Requirements:

1. `const FLAGS = { NewCheckout: 'new-checkout', DarkMode: 'dark-mode', BulkEdit: 'bulk-edit' } as const`
   with `type Flag` derived from its values, plus `ALL_FLAGS`.
2. `type FlagState = 'off' | 'on' | 'rollout'` and a `FLAG_STATES` array for runtime checks.
3. `interface FlagConfig { readonly id: Flag; readonly state: FlagState; readonly rolloutPercent: number; readonly description: string }`.
4. `FLAG_CONFIG` declared with **`as const satisfies Record<Flag, FlagConfig>`** so it
   is exhaustive by construction while keeping literal types; derive
   `type ConfiguredFlag = keyof typeof FLAG_CONFIG` and use it as a **parameter type**.
5. Type guards `isFlag(value: string): value is Flag` and
   `isFlagState(value: string): value is FlagState`.
6. `parseOverrides(raw: Record<string, string>): { overrides: FlagOverride; rejected: Array<{ key: string; reason: string }> }` —
   reporting **both** unknown flags and invalid states with useful messages.
7. `bucketFor(flag, userId): number` — a deterministic FNV-1a style hash so the same
   user always gets the same answer; `isEnabled(flag, userId, overrides = {})` using
   an exhaustive `switch` with `assertNever`.
8. `describeFlag(flag: ConfiguredFlag)` and a `reduce` that counts flags per state
   into `Record<FlagState, number>`.
9. Demo: the config table, deterministic rollout over several users, accepted **and
   rejected** overrides, overrides beating config, and the state counts.
10. A comment block with real error codes for: a missing flag, an unknown flag, a
    bad state, and a missing state in the counts record.

**Solution**

```text
ts-playground/src/feature-flags.ts
```

```ts
export {};

// ============================================================================
// THE BEFORE (enum-based) — kept only as a comment, because it is what you will
// find in existing codebases. Note the three frictions it causes:
//
//   enum Flag { NewCheckout = 'new-checkout', DarkMode = 'dark-mode', BulkEdit = 'bulk-edit' }
//
//   1. `Flag` requires a value import wherever it is used.
//   2. A literal from JSON is NOT assignable:  const f: Flag = 'dark-mode'  →  TS2322
//   3. It emits a runtime object, and breaks Node's type stripping:
//        SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]
//
// THE AFTER (as const + union) — the same names, all three problems gone.
// ============================================================================

const FLAGS = {
  NewCheckout: 'new-checkout',
  DarkMode: 'dark-mode',
  BulkEdit: 'bulk-edit',
} as const;

type Flag = (typeof FLAGS)[keyof typeof FLAGS];   // 'new-checkout' | 'dark-mode' | 'bulk-edit'

const ALL_FLAGS: readonly Flag[] = Object.values(FLAGS);

// ============================================================================
// States are their own union — deliberately NOT an enum: 'on'/'off'/'rollout'
// are also valid strings in config files and query params.
// ============================================================================
type FlagState = 'off' | 'on' | 'rollout';
const FLAG_STATES: readonly FlagState[] = ['off', 'on', 'rollout'];

interface FlagConfig {
  readonly id: Flag;
  readonly state: FlagState;
  readonly rolloutPercent: number;
  readonly description: string;
}

// `satisfies` checks exhaustiveness WITHOUT widening the literal types.
// A missing flag is a compile error; a typo'd flag is a compile error.
const FLAG_CONFIG = {
  'new-checkout': {
    id: FLAGS.NewCheckout,
    state: 'rollout',
    rolloutPercent: 25,
    description: 'Rebuilt checkout with saved payment methods',
  },
  'dark-mode': {
    id: FLAGS.DarkMode,
    state: 'on',
    rolloutPercent: 100,
    description: 'Dark theme for the app shell',
  },
  'bulk-edit': {
    id: FLAGS.BulkEdit,
    state: 'off',
    rolloutPercent: 0,
    description: 'Multi-select editing in the order table',
  },
} as const satisfies Record<Flag, FlagConfig>;

// Derived from the object: the union of flag ids, straight from the source of truth.
type ConfiguredFlag = keyof typeof FLAG_CONFIG;

// ============================================================================
// Runtime validation: overrides arrive as strings from a query string or a
// localStorage blob. Types never validate runtime data — a guard must.
// ============================================================================
type FlagOverride = Partial<Record<Flag, FlagState>>;

interface OverrideResult {
  overrides: FlagOverride;
  rejected: Array<{ key: string; reason: string }>;
}

function isFlag(value: string): value is Flag {
  return (ALL_FLAGS as readonly string[]).includes(value);
}

function isFlagState(value: string): value is FlagState {
  return (FLAG_STATES as readonly string[]).includes(value);
}

function parseOverrides(raw: Record<string, string>): OverrideResult {
  const overrides: FlagOverride = {};
  const rejected: OverrideResult['rejected'] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (!isFlag(key)) {
      rejected.push({ key, reason: `unknown flag (expected one of ${ALL_FLAGS.join(', ')})` });
      continue;
    }
    if (!isFlagState(value)) {
      rejected.push({ key, reason: `invalid state "${value}" (expected ${FLAG_STATES.join(' | ')})` });
      continue;
    }
    overrides[key] = value;
  }

  return { overrides, rejected };
}

// ============================================================================
// Evaluation: deterministic bucketing, so the same user always gets the same answer
// ============================================================================
function bucketFor(flag: Flag, userId: string): number {
  // FNV-1a style hash over flag+user: stable, fast, and good enough for bucketing.
  let hash = 0x811c9dc5;
  for (const char of `${flag}:${userId}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % 100;
}

function isEnabled(flag: Flag, userId: string, overrides: FlagOverride = {}): boolean {
  const state = overrides[flag] ?? FLAG_CONFIG[flag].state;

  switch (state) {
    case 'off':
      return false;
    case 'on':
      return true;
    case 'rollout': {
      const percent = FLAG_CONFIG[flag].rolloutPercent;
      return bucketFor(flag, userId) < percent;
    }
    default:
      return assertNever(state);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled flag state: ${String(value)}`);
}

// The parameter type is `ConfiguredFlag` — the union of FLAG_CONFIG's own keys.
// Deriving it from the data (rather than importing `Flag`) is what makes a missing
// config entry a compile error at the CALL site as well as at the object literal.
function describeFlag(flag: ConfiguredFlag): string {
  const config = FLAG_CONFIG[flag];
  const state = config.state === 'rollout' ? `rollout ${config.rolloutPercent}%` : config.state;
  return `${flag.padEnd(13)} [${state.padEnd(11)}] ${config.description}`;
}

// ============================================================================
// Demo
// ============================================================================
function main(): void {
  console.log('=== configured flags (exhaustive by construction) ===');
  for (const flag of ALL_FLAGS) {
    console.log(`  ${describeFlag(flag)}`);
  }

  console.log('\n=== deterministic rollout: same user, same answer ===');
  const users = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8'];
  for (const userId of users) {
    const on = isEnabled(FLAGS.NewCheckout, userId);
    console.log(`  ${userId}: bucket ${String(bucketFor(FLAGS.NewCheckout, userId)).padStart(3)} → ${on ? '✅ enabled' : '❌ disabled'}`);
  }
  console.log('  new-checkout is at', FLAG_CONFIG['new-checkout'].rolloutPercent + '%');

  console.log('\n=== query-string overrides ===');
  const { overrides, rejected } = parseOverrides({
    'bulk-edit': 'on',
    'new-checkout': 'off',
    'dark-mode': 'enabled',    // ← known flag, invalid state
    'legacy-nav': 'on',        // ← unknown flag
  });
  console.log('  accepted:', JSON.stringify(overrides));
  for (const item of rejected) {
    console.log(`  rejected ${item.key}: ${item.reason}`);
  }

  console.log('\n=== overrides win over config ===');
  for (const userId of users.slice(0, 3)) {
    const without = isEnabled(FLAGS.NewCheckout, userId);
    const withOverride = isEnabled(FLAGS.NewCheckout, userId, overrides);
    console.log(`  ${userId}: default ${without ? 'on ' : 'off'} → overridden ${withOverride ? 'on ' : 'off'}`);
  }

  console.log('\n=== state counts ===');
  const counts = ALL_FLAGS.reduce<Record<FlagState, number>>(
    (totals, flag) => {
      totals[FLAG_CONFIG[flag].state] += 1;
      return totals;
    },
    { off: 0, on: 0, rollout: 0 }
  );
  console.log(' ', counts);
}

main();

/* ---------------------------------------------------------------------------
   WHAT THE TYPES REJECT

   // 1. Missing a flag from the config object (thanks to `satisfies`):
   //    remove 'bulk-edit' from FLAG_CONFIG →
   //   TS1360: Type '{ … }' does not satisfy the expected type 'Record<Flag, FlagConfig>'.
   //           Property 'bulk-edit' is missing in type '{ … }' but required in type
   //           'Record<Flag, FlagConfig>'.

   // 2. Unknown flag in the config object:
   //   TS2353: Object literal may only specify known properties, and ''legacy-nav''
   //           does not exist in type 'Record<Flag, FlagConfig>'.

   // 3. Bad state value:
   // FLAG_CONFIG['dark-mode'].state = 'enabled';
   //   TS2322: Type '"enabled"' is not assignable to type 'FlagState'.
   //   (and because the object is `as const`, the assignment itself is also
   //    TS2540: Cannot assign to 'state' because it is a read-only property)

   // 4. Missing state in the counts reducer:
   //   TS2741: Property 'rollout' is missing in type '{ off: number; on: number; }'
   //           but required in type 'Record<FlagState, number>'.

   // 5. A literal from anywhere is directly assignable — no enum wrapper needed:
   const fromJson: Flag = 'dark-mode';   // ✅ (compare with the enum version's TS2322)

   // 6. And it all survives Node's type stripping, because there is no syntax to erase:
   //    $ node --experimental-strip-types src/feature-flags.ts   → runs
---------------------------------------------------------------------------- */
```

**Run it**

```bash
npx tsx src/feature-flags.ts
```

**Expected output**

```text
=== configured flags (exhaustive by construction) ===
  new-checkout  [rollout 25%] Rebuilt checkout with saved payment methods
  dark-mode     [on         ] Dark theme for the app shell
  bulk-edit     [off        ] Multi-select editing in the order table

=== deterministic rollout: same user, same answer ===
  u1: bucket  76 → ❌ disabled
  u2: bucket  33 → ❌ disabled
  u3: bucket  14 → ✅ enabled
  u4: bucket  71 → ❌ disabled
  u5: bucket  52 → ❌ disabled
  u6: bucket   9 → ✅ enabled
  u7: bucket  90 → ❌ disabled
  u8: bucket  47 → ❌ disabled
  new-checkout is at 25%

=== query-string overrides ===
  accepted: {"bulk-edit":"on","new-checkout":"off"}
  rejected dark-mode: invalid state "enabled" (expected off | on | rollout)
  rejected legacy-nav: unknown flag (expected one of new-checkout, dark-mode, bulk-edit)

=== overrides win over config ===
  u1: default off → overridden off
  u2: default off → overridden off
  u3: default on  → overridden off

=== state counts ===
  { off: 1, on: 1, rollout: 1 }
```

**What to take away**

- **`as const satisfies X` is the best of both worlds**: the checker enforces
  exhaustiveness (`Record<Flag, FlagConfig>`) and the literal types survive for
  `keyof typeof`. Without `satisfies`, writing `const FLAG_CONFIG: Record<Flag, FlagConfig> = {…}`
  would check the same thing but **widen** every value — and `keyof typeof FLAG_CONFIG`
  would degrade to `string`.
- **Deriving parameter types from data** (`describeFlag(flag: ConfiguredFlag)`) means
  the compiler complains in *two* places when a flag is missing — at the config object
  and at the call — instead of silently accepting a stale list.
- **The rollout is deterministic, not random.** `bucketFor` hashes `flag:userId`, so
  the same user always gets the same branch. A `Math.random()` "rollout" would make
  the expected output impossible to write — and would give users a different
  experience on every render, which in React means **flashing UI**. Determinism is a
  correctness requirement here, not a nicety.
- **Both rejection paths are in the output**, and that matters: a parser that only
  reports unknown keys silently swallows `'dark-mode': 'enabled'`.
- **It runs under `node --experimental-strip-types`.** Verified: the same file with
  an `enum` instead throws `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. If you are writing
  code that must run under Node's built-in TypeScript support, `enum` is not an
  option at all.

> 🏭 **Where you will meet enums next:** Redux/Redux Toolkit reducers historically
> used string enums for action types; modern RTK uses `createSlice` with string
> literals instead. Angular and NestJS codebases use enums heavily. When you join a
> team, match the existing convention — and when you *start* a file, reach for
> `as const` unions first. Both of you will be able to read the other's code; only
> one of you will hit `TS2322` on a string from an API.

---

## 9. Summary

- An **enum** is a named set of constants that **emits runtime JavaScript**.
- **Numeric enums emit a reverse mapping**, so `Object.keys`/`Object.values` return
  **twice** as many entries as members — and `Object.values` mixes names with numbers.
- **String enums** avoid the reverse mapping but still emit an object, and their
  members are **nominal**: a plain `'open'` is **not** assignable (`TS2322`).
- **`const enum`** inlines values (`console.log(1 /* Local.A */, …)`), but it cannot
  inline across compiler boundaries, and **ambient const enums fail under
  `isolatedModules`** (`TS2748`).
- **Enums are not erasable syntax**: Node type-stripping throws
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, and `--erasableSyntaxOnly` reports `TS1294`.
- The **modern default** is `as const` object + derived union
  (`(typeof X)[keyof typeof X]`), optionally with `keyof typeof` when the keys are
  the identifier. It emits one plain object, accepts string literals directly, and
  iterates cleanly with `Object.values`.
- **`as const satisfies Record<K, V>`** gives exhaustiveness **and** narrow literal
  types — the closest thing to a "safe enum".
- **`as const` does not freeze at runtime**; that is `Object.freeze`, which is shallow.
- **Neither enums nor unions validate runtime data.** Use type guards
  (`value is Flag`) and, for real input, a schema library (Part 7, Part 8).
- Keep enums for protocol codes, for consistency in enum-heavy codebases, and in
  libraries that must expose stable runtime values — with the frictions understood
  rather than discovered.

**What's next →** [`09-narrowing.md`](./09-narrowing.md): how TypeScript actually
learns *which* member of a union you are holding — `typeof`, `in`, `instanceof`,
discriminants, custom type predicates, assertion functions, and the analysis that
makes all of it work.
