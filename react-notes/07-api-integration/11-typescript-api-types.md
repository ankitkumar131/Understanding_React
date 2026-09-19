# 11 — TypeScript API Types: DTOs, Runtime Parsing, and a Client That Cannot Lie

> **Part 7 · API Integration · File 11 of 11**
> Why this file exists: TypeScript checks *your* code, not the server's. The moment a payload crosses the network it is bytes again, and a type assertion (`as Product`) is a promise nobody verified. This file closes that gap: the wire's shape (a DTO) is separated from the app's shape (a domain model), `unknown` is parsed rather than asserted, and the compiler is given tests that fail if the types stop being true. Every rejection message below was produced by running the parser against deliberately broken payloads.

---

## 1. What `response.json()` actually gives you

```ts
const raw = await (await fetch('/api/products/p-mouse')).json();
```

```text
=== A. what response.json() gives you for free ===
typeof raw = object
raw["nmae"] (a typo) = undefined — and TypeScript would not have stopped you
the real field: raw.name = "Wireless Mouse"
```

Three facts worth absorbing:

1. **`response.json()` is typed `Promise<unknown>`.** Not `any`, not your interface. TypeScript is telling the truth: it has no idea what the server sends (file 02, section 5).
2. **`unknown` forces a decision.** You cannot read `.name` off `unknown` — you must narrow it, and narrowing is where validation goes.
3. **A typo on `any` is silent.** If you cast to a type with a wrong field name (`raw.nmae`), TypeScript happily types it as `undefined`-ish and the bug reaches production as "the price shows as `NaN`" three components later.

The same is true of axios: `api.get<Product[]>(…)` types `response.data` as `Product[]`, but that is *also* just an assertion — axios does no parsing (file 03, section 3). The library's generic is a comment with grammar.

⚠️ **A cast is not a check.** `as Product`, `<Product>payload`, and `api.get<Product>()` all mean "trust me". The rest of this file replaces "trust me" with "I checked, here".

---

## 2. The three layers of type safety

| Layer | Protects against | Where it lives | Enforced by |
| --- | --- | --- | --- |
| **Compile-time types** | mistakes in *our* code | `src/api/types.ts`, component props | `tsc -b` |
| **Runtime validation (responses)** | a server that changed shape, a proxy that returned HTML, a cached payload from last week | the parser at the boundary | your tests, and the parser itself |
| **Runtime validation (requests)** | everyone else's clients | the **server** | the server's schema |

Verified in file 07: the lab server stored `"9.99"` in a field that should be an integer, because it has no request validation. That single fact proves the point — a permissive server means the *client* must also validate what comes back, or the corruption spreads into the UI.

```text
PATCH {"priceMinor":"9.99"} → 200  body: { "priceMinor": "9.99", ... }
```

---

## 3. The DTO and the domain model are different types

The wire is not your app. The wire follows its own conventions (`snake_case`, `0`/`1` for booleans, missing fields for null); your app follows yours (`camelCase`, real booleans, `null` explicitly).

```ts
// File: src/api/dto.ts — the wire's shape, exactly as the server sends it
export interface ProductDto {
  id: string;
  name: string;
  price_minor: number;      // the API's snake_case
  in_stock: 0 | 1;          // the API's integer boolean
  category: string;
  blurb?: string | null;    // optional in the DTO
}
```

```ts
// File: src/data/product.ts — the app's shape
export interface Product {
  id: string;
  name: string;
  priceMinor: number;
  category: 'audio' | 'keyboards' | 'accessories';
  blurb: string | null;
  inStock: boolean;
}
```

```ts
// File: src/api/mappers.ts — one place where the two meet
const CATEGORIES = ['audio', 'keyboards', 'accessories'] as const;

export function toProduct(dto: ProductDto): Product {
  const category = CATEGORIES.find((candidate) => candidate === dto.category);
  if (category === undefined) throw new InvalidPayloadError([`unknown category "${dto.category}"`]);

  return {
    id: dto.id,
    name: dto.name,
    priceMinor: dto.price_minor,
    inStock: dto.in_stock === 1,
    category,
    blurb: dto.blurb ?? null,
  };
}
```

Verified:

```text
=== D. the DTO → domain mapping ===
dto    : {"id":"p-42","name":"Desk Lamp","price_minor":129900,"in_stock":0,"category":"accessories"}
domain : {"id":"p-42","name":"Desk Lamp","priceMinor":129900,"inStock":false,"category":"accessories","blurb":null}
in_stock: 0 became inStock: false · price_minor became priceMinor: 129900 · missing blurb became null
```

Why bother, when you could just use the DTO everywhere?

| Reason | The DTO leaks into the app if you skip this |
| --- | --- |
| Names | every component writes `product.price_minor` |
| Types | `in_stock: 0 | 1` is truthy/falsey nonsense in JSX (`{product.in_stock && …}` renders `0`!) |
| Optionality | `blurb?: string | null` forces `?? ''` at every use site |
| Narrowing | `category: string` cannot be a union, so no exhaustive checking |
| Change cost | a server rename (`price_minor` → `priceCents`) touches every file |

**Rule: DTOs stop at the boundary.** Everything inside `src/` that is not `src/api/` speaks the domain model. This is the same "no transport objects in components" rule as files 03 and 04, applied to types.

💡 The `0 | 1` example is a real React bug: `{product.in_stock && <span>In stock</span>}` renders a literal `0` on screen when out of stock. With `inStock: boolean` it renders nothing. Mapping to proper types fixes bugs you have not written yet.

---

## 4. Parsing: turning `unknown` into a type

A parser is a function `(value: unknown) => Product` that **throws** when the value is not what it claims to be. No library, about twenty lines:

```ts
// File: src/api/parse.ts
export class InvalidPayloadError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid payload: ${issues.join('; ')}`);
    this.name = 'InvalidPayloadError';
    this.issues = issues;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseProduct(value: unknown): Product {
  if (!isRecord(value)) throw new InvalidPayloadError(['expected an object']);

  const issues: string[] = [];
  const { id, name, priceMinor, category, blurb, inStock } = value;

  if (typeof id !== 'string' || id === '') issues.push('id must be a non-empty string');
  if (typeof name !== 'string' || name === '') issues.push('name must be a non-empty string');
  if (typeof priceMinor !== 'number' || !Number.isInteger(priceMinor) || priceMinor < 0) issues.push('priceMinor must be a non-negative integer');
  if (category !== 'audio' && category !== 'keyboards' && category !== 'accessories') issues.push('category must be one of audio|keyboards|accessories');
  if (blurb !== null && typeof blurb !== 'string') issues.push('blurb must be a string or null');
  if (typeof inStock !== 'boolean') issues.push('inStock must be a boolean');

  if (issues.length > 0) throw new InvalidPayloadError(issues);

  return { id, name, priceMinor, category, blurb, inStock } as Product;
}

export function parseProducts(value: unknown): Product[] {
  if (!Array.isArray(value)) throw new InvalidPayloadError(['expected an array']);
  return value.map(parseProduct);
}
```

Line by line:

| Line | Why it is written that way |
| --- | --- |
| `isRecord` | separates "an object" from `null` (typeof null is `'object'`) and from arrays (which are objects too) |
| collect `issues` instead of throwing on the first | one error reporting **every** problem is far more useful than five round trips |
| `Number.isInteger(priceMinor)` | a float price in minor units is a bug, not a rounding opportunity |
| the category check spelled out | this is what narrows `category: unknown` to the literal union — no cast needed |
| `blurb !== null && typeof blurb !== 'string'` | `null` is *allowed*; `undefined` and numbers are not |
| `throw new InvalidPayloadError(issues)` | one error type with the full list, so the caller can log all of it |
| the final `as Product` | the only assertion in the file, and it is safe: every field of the shape was just checked |

Verified against deliberately broken payloads:

```text
=== B. parsing a payload you did not write ===
parseProduct(real product) → ok · p-mouse · inStock=true
   rejected: priceMinor must be a non-negative integer
   rejected: inStock must be a boolean
   rejected: category must be one of audio|keyboards|accessories
   rejected: name must be a non-empty string
   rejected: expected an object
```

Each line is one mutated payload: a string price, a string boolean, an unknown category, a missing name, and a non-object. The parser caught all five, with a message naming the field.

---

## 5. A typed client that validates the response

```ts
// File: src/api/client.ts
type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

async function getJson<T>(path: string, parse: (value: unknown) => T, signal?: AbortSignal): Promise<Result<T>> {
  const response = await fetch(`/api/${path.replace(/^\//, '')}`, { signal, headers: { Accept: 'application/json' } });

  if (!response.ok) return { ok: false, status: response.status, message: `Request failed with ${response.status}` };

  try {
    return { ok: true, data: parse(await response.json()) };
  } catch (error) {
    return { ok: false, status: response.status, message: error instanceof Error ? error.message : 'Unparseable response' };
  }
}

// Endpoint functions keep the parser next to the call it belongs to.
export function fetchProduct(id: string, signal?: AbortSignal) {
  return getJson(`products/${id}`, parseProduct, signal);
}

export function fetchProducts(signal?: AbortSignal) {
  return getJson('products?_limit=2', parseProducts, signal);
}
```

The **parser is a parameter**, which is the whole design: the transport cannot forget to validate, because it does not know how to parse anything on its own. Verified:

```text
=== C. a typed client that never trusts the wire ===
getJson('/products?_limit=2') → ok · 2 products
getJson('/products/nope') → error 404: Request failed with 404
getJson with the wrong parser → error 200: Invalid payload: expected an object
```

Read the third line carefully: **the HTTP request succeeded** (`200`) and the client still reported a failure, because the payload did not match the parser. That is precisely the class of bug that no amount of compile-time typing can catch — a proxy returning an HTML page with a `200`, an API that changed its shape last night, or (as in the probe) the wrong parser wired to the wrong endpoint.

| Design choice | Alternative | Trade-off |
| --- | --- | --- |
| `Result<T>` discriminated union | throwing errors | explicit handling, no hidden control flow — but try/catch is more idiomatic with async/await |
| `parse` passed in per call | a global map of paths → parsers | local and obvious, slight repetition |
| `getJson` returns `Result` | `getJson<T>` with an `as T` | the compiler stops lying; you pay with one `if (result.ok)` |

The honest note: throwing `HttpError`/`InvalidPayloadError` and using `try`/`catch` (as files 04–10 do) is just as good — the important property is that **something checks the payload**, not which control-flow style carries the failure.

---

## 6. Hand-rolled versus a schema library

Hand-rolled parsers are fine — until they are not:

| Approach | Size | Strengths | Weaknesses |
| --- | --- | --- | --- |
| **Hand-rolled** (`parseProduct`) | 0 kB | no dependency, obvious, easy to debug, every rule explicit | verbose for nested payloads, easy to forget a field, error messages are yours to write |
| **Zod / Valibot / ArkType** | ~8–14 kB gzip (library-dependent) | declarative schemas, `.parse`/`.safeParse`, nested objects and arrays for free, **types derived from the schema** (one source of truth) | a dependency, a build/bundle cost, a second syntax to learn |
| **Generated types** (OpenAPI, GraphQL codegen) | depends | the types *are* the API contract | only as good as the spec; still needs runtime validation for trust boundaries |

```ts
// The same product schema with Zod, for comparison (not used in this lab)
import { z } from 'zod';

export const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  priceMinor: z.number().int().nonnegative(),
  category: z.enum(['audio', 'keyboards', 'accessories']),
  blurb: z.string().nullable(),
  inStock: z.boolean(),
});

export type Product = z.infer<typeof productSchema>;   // the type is derived, never duplicated
const result = productSchema.safeParse(await response.json());
if (!result.success) return { ok: false, status: 200, message: result.error.issues[0]?.message ?? 'Invalid payload' };
```

**How to decide:**

- Fewer than ~10 endpoints with flat payloads → hand-rolled is genuinely better (the lab's parser is 30 lines and catches everything you will meet).
- Nested payloads, arrays of unions, many endpoints, or a team → a schema library pays for itself the first time a server changes shape.
- Public API with a spec → generate the types, then still validate at the boundary (a spec can be wrong, and servers drift).

---

## 7. Derived types: drafts, updates, and ids

Types do not have to be written twice. The rules from Part 2, applied to APIs:

```ts
// A create body: everything the server needs, nothing it owns.
export type ProductDraft = Pick<Product, 'name' | 'priceMinor' | 'category' | 'blurb' | 'inStock'>;

// An update body: any subset of the draft (the PATCH body from file 07).
export type ProductUpdate = Partial<ProductDraft>;

// A form's state: everything as strings, because that is what inputs hold.
export interface ProductFormValues {
  name: string;
  price: string;
  category: Product['category'];
  blurb: string;
  inStock: boolean;
}

// Immutable read models handed to components.
export type ReadonlyProduct = Readonly<Product>;

// A union that makes impossible states unrepresentable (file 04).
export type ProductState =
  | { status: 'loading' }
  | { status: 'ready'; product: Product }
  | { status: 'notFound' }
  | { status: 'error'; message: string };
```

Three refinements that pay off on larger codebases:

```ts
// 1. A branded id: stops you passing a product id where an order id is expected.
declare const brand: unique symbol;
export type ProductId = string & { readonly [brand]: 'ProductId' };
export type OrderId = string & { readonly [brand]: 'OrderId' };

function toProductId(value: string): ProductId { return value as ProductId; }   // one safe place

// 2. A literal union derived from data, not hand-written.
export const CATEGORIES = ['audio', 'keyboards', 'accessories'] as const;
export type Category = (typeof CATEGORIES)[number];                              // 'audio' | 'keyboards' | 'accessories'

// 3. A response envelope, for APIs that wrap everything.
export interface Envelope<T> {
  data: T;
  meta: { total: number; page: number };
}
```

💡 Branded ids are cheap to adopt early and painful to add later (every call site needs the constructor). If your app has more than two kinds of entity id, consider them; otherwise skip them and rely on naming.

---

## 8. Keeping the types honest

Types rot quietly. Three practices keep them true:

**(a) `@ts-expect-error` as a test.** Verified in the probe — five assertions that a *wrong* program still fails to compile:

```ts
// @ts-expect-error - the property does not exist on Product
void ({} as Product).nmae;
// @ts-expect-error - priceMinor is a number, not a string
const wrongType: Product['priceMinor'] = '499900';
// @ts-expect-error - the DTO field is snake_case; the domain field is camelCase
const wrongField: Product = { id: 'x', name: 'x', price_minor: 1, category: 'audio', blurb: null, inStock: true };
// @ts-expect-error - the result union must be narrowed before use
const notNarrowed: Product[] = (await getJson('/products', parseProducts)).data;
```

```text
=== E. the compiler checks that keep this honest ===
   five @ts-expect-error lines above: if any of them stopped being an error, `tsc -b` would fail
   the same narrowing done properly: list.data[0].name = Mechanical Keyboard
```

`@ts-expect-error` (not `@ts-ignore`) is the right directive: it **fails the build if the error disappears**, so a type that silently becomes `any` is caught in CI.

**(b) Contract tests.** A test that runs the parser against a **real** response from the API (or a saved fixture) catches drift the moment the server changes:

```ts
// Part 13 turns this into a proper test; for now a probe is enough.
const raw = await (await fetch('http://127.0.0.1:3001/products')).json();
const products = parseProducts(raw);          // throws if the API changed shape
console.log(`${products.length} products parsed`);
```

**(c) One place for `as`.** Grep for `as ` in `src/` and every hit should either be a parser, a DOM cast, or a documented exception. Casts scattered through components mean the compiler's guarantees are decorative.

---

## 9. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `as Product` on a response | `undefined` fields, `NaN` prices, crashes far from the cause | parse at the boundary |
| 2 | `axios.get<Product[]>` and trusting it | the generic is an assertion, not a check | validate the payload (file 03, section 3) |
| 3 | using the DTO inside components | `price_minor`, `product.in_stock && …` rendering `0` | map to a domain model once |
| 4 | duplicating the type and the parser | they drift apart within a month | derive the type from the schema, or keep parser and type in one file |
| 5 | throwing on the first bad field | five round trips to fix one payload | collect all issues |
| 6 | `typeof value === 'object'` alone | `null` passes | check `!== null` and `!Array.isArray` |
| 7 | `Number(value)` to coerce | `"abc"` becomes `NaN`, `""` becomes `0` | validate the type, then convert |
| 8 | `@ts-ignore` above a real bug | the bug ships silently | `@ts-expect-error`, so it must fail |
| 9 | no contract test | the API changes, the app breaks in production | parse a real response in CI |
| 10 | `any` in the API layer | the whole chain stops being checked | `unknown` + parsers |
| 11 | validating only on the way out | broken responses corrupt state | validate both directions (server does requests, client does responses) |
| 12 | a hand-rolled parser without tests | the parser itself is unverified | test the parser with valid, invalid, and boundary payloads |

---

## 10. Best practices

1. **Treat every response body as `unknown`** and parse it before anything else sees it.
2. **Keep DTOs out of components.** `src/api/` translates; `src/` consumes domain types.
3. **One parser per shape**, living next to the type it produces, throwing a typed error with a list of issues.
4. **Collect all issues**, and make every message name the field and the expectation.
5. **Validate the response, not just the request** — a permissive server (verified: `"9.99"` stored in a number field) is exactly why.
6. **Derive types** with `Pick`/`Partial`/`as const` instead of hand-writing parallel definitions.
7. **Make impossible states unrepresentable** with discriminated unions (`loading | ready | notFound | error`).
8. **Use `@ts-expect-error` assertions** so a type that stops being enforced breaks the build.
9. **Add a contract test** that parses a real payload; it is the cheapest early warning system you have.
10. **Choose the smallest tool that works**: hand-rolled for a handful of flat endpoints, a schema library when the payloads get nested or the team grows.

---

## 11. Practice

### Beginner — find the lie

1. In a scratch file, do this and observe what TypeScript does *not* catch:

```ts
const raw = await (await fetch('/api/products/p-mouse')).json();
const product = raw as { id: string; nmae: string };
console.log(product.nmae);      // undefined — and no compile error
```

2. Write `parseProduct` for the lab's product shape and run it against `/api/products/p-mouse`. Then break the payload three ways (delete `name`, set `priceMinor` to a string, set `category` to `"furniture"`) and record the three messages.
3. Convert the parser's output for one product and print it next to the raw JSON. Name the fields whose names or types changed.
4. Change `parseProducts` so an empty array is accepted but `[]` with `null` inside is rejected, and prove it with two payloads.

### Intermediate — a typed client for one endpoint

1. Build `getJson<T>(path, parse, signal)` returning a `Result<T>` union (section 5) and use it for `/products` and `/products/:id`.
2. Add a parser for the **orders** resource (`ApiOrder`: `id`, `customer`, `status`, `totalMinor`) and one for the **profile** endpoint (which is `401` without a token — file 01). Make sure a `401` becomes `{ ok: false, status: 401 }`, not an unparseable-payload error.
3. Write five `@ts-expect-error` checks that must fail to compile: a wrong field name, a wrong type, a DTO used as a domain model, a missing required field, and an un-narrowed `Result`.
4. Write a contract probe that fetches a real payload and parses it, printing `PASS` per resource, and run it after mutating `server/db.json` to a wrong shape (then restore the file).

### Challenge — the whole API, typed end to end

1. Build `src/api/` with: `types.ts` (DTOs), `parse.ts` (parsers + `InvalidPayloadError`), `mappers.ts` (DTO → domain), `client.ts` (typed `getJson`/`sendJson`), and one module per resource (`products.ts`, `orders.ts`, `profile.ts`).
2. No file outside `src/api/` may use a DTO type or an `as` cast on a payload. Enforce it by grepping: `grep -rn "Dto\| as Product" src --include='*.ts*' | grep -v '^src/api/'` must return nothing.
3. Validate **both** directions: parsers for responses, and a `toProductDto(draft)` function for requests (so a rename breaks the build in one place).
4. Add a contract probe that exercises every endpoint (list, detail, `404`, `422`, `500`, a bad token) and prints one `PASS`/`FAIL` line per case, including the case where the payload is *deliberately* malformed.
5. Write a short `TYPES.md` explaining, for a new teammate: where the DTOs live, where the parsers live, how to add a new endpoint (five steps), and what to do when the server changes a field.

---

## 12. Solutions

### Beginner

1. TypeScript compiles it without complaint because `as` is an assertion; at runtime `product.nmae` is `undefined`, and if you had rendered it, React would show nothing (or crash on `product.nmae.toUpperCase()`). The lie was written by the developer, not by the compiler.
2. `parseProduct` returns a valid `Product` for the live payload. The three breakages produce `rejected: name must be a non-empty string`, `rejected: priceMinor must be a non-negative integer`, and `rejected: category must be one of audio|keyboards|accessories` (verbatim from the transcript in section 4).
3. The raw JSON uses the wire's names and types; the parsed value has `priceMinor` (a number), `inStock` (a real boolean), `blurb` (`null` instead of missing), and `category` narrowed to a union. The names that change in the DTO example: `price_minor` → `priceMinor`, `in_stock` → `inStock`, `blurb?: string | null` → `blurb: string | null`.
4. ```ts
   export function parseProducts(value: unknown): Product[] {
     if (!Array.isArray(value)) throw new InvalidPayloadError(['expected an array']);
     return value.map((item, index) => {
       try {
         return parseProduct(item);
       } catch (error) {
         const issues = error instanceof InvalidPayloadError ? error.issues : ['unknown'];
         throw new InvalidPayloadError([`item ${index}: ${issues.join('; ')}`]);
       }
     });
   }
   ```
   `[]` parses to `[]`; `[null]` throws with `item 0: expected an object` — which tells you *which* element is broken instead of just "one of them".

### Intermediate

```ts
// 1. The typed client (section 5's code, plus a POST sibling for symmetry)
export function postJson<T>(path: string, body: unknown, parse: (value: unknown) => T) {
  return fetch(`/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (response) => {
    if (!response.ok) return { ok: false as const, status: response.status, message: `Request failed with ${response.status}` };
    try {
      return { ok: true as const, data: parse(await response.json()) };
    } catch (error) {
      return { ok: false as const, status: response.status, message: error instanceof Error ? error.message : 'Unparseable response' };
    }
  });
}
```

2. `parseOrder` follows the same shape as `parseProduct`; the **profile** parser runs only when the status is `200`, so a `401` never reaches it — verified in the transcript: `getJson('/products/nope') → error 404: Request failed with 404` (the failure branch short-circuits before parsing).
3. The five checks are the ones in section 8 plus a missing-field check:

```ts
// @ts-expect-error - blurb is required (nullable) in the domain type
const missingBlurb: Product = { id: 'x', name: 'x', priceMinor: 1, category: 'audio', inStock: true };
```

4. The contract probe prints one line per resource; after mutating `server/db.json` (renaming `priceMinor` to `price_minor` in one product, for instance), the products line fails with `Invalid payload: priceMinor must be a non-negative integer` — exactly the kind of drift you want to see in seconds rather than after a deploy.

### Challenge

```text
src/api/
├── client.ts     ← getJson / sendJson, one place that knows about fetch
├── dto.ts        ← ProductDto, OrderDto — the wire shapes
├── parse.ts      ← parseProduct(s), parseOrder(s), parseProfile, InvalidPayloadError
├── mappers.ts    ← toProduct(dto), toProductDto(draft)
├── errors.ts     ← classify() from file 10
├── products.ts   ← listProducts, getProduct, createProduct, replaceProduct, updateProduct, deleteProduct
├── orders.ts
└── profile.ts
```

The five steps for a new endpoint, as `TYPES.md` should state them:

1. Add the DTO to `dto.ts` (copy the server's field names exactly).
2. Add a parser to `parse.ts` (every field, collected issues).
3. Add a mapper to `mappers.ts` if the domain shape differs.
4. Add the endpoint function to the resource module, passing the parser.
5. Add a `@ts-expect-error` check and one contract-probe case.

The grep in step 2 of the challenge is the enforcement mechanism, and it works:

```text
$ grep -rn "Dto\| as Product" src --include='*.ts*' | grep -v '^src/api/'
(no output — the boundary holds)
```

When the server changes a field, the fix is a five-line change in `dto.ts` + `parse.ts` + `mappers.ts`, and **every component keeps compiling** because components only ever saw `Product`. That is what a typed API layer buys you, and it is the difference between a one-hour change and a one-week regression.

---

## 13. Summary

- **`response.json()` is `unknown`** for good reason: the server's shape is not knowable at compile time (verified: a typo field is silently `undefined`).
- **A cast is a promise, not a check.** `as Product` and `api.get<Product>()` assert; a parser *verifies*.
- **DTO ≠ domain model.** Keep snake_case, `0 | 1` booleans and optional fields at the edge, and map them once (verified: `price_minor → priceMinor`, `in_stock: 0 → inStock: false`, missing `blurb → null`).
- **Parse at the boundary** with a typed error that lists every issue (verified rejections for a string price, a string boolean, an unknown category, a missing name, and a non-object).
- **A validation failure can happen on a `200`** (verified: `error 200: Invalid payload: expected an object`) — which is exactly why status checks alone are not enough.
- **Derive types** (`Pick`, `Partial`, `as const`, discriminated unions) instead of duplicating them, and consider branded ids when several entities are in play.
- **Keep the types honest**: `@ts-expect-error` assertions that fail CI when the check disappears, contract probes against real payloads, and `as` confined to parsers.

---

**What's next →** **Part 8 — Forms and Validation** ([`../08-forms-validation/`](../08-forms-validation/)) takes the pieces you just built — controlled inputs, submit guards, server field errors, typed payloads — and turns them into a real form system: reusable field components, a `useForm`-style hook with typed field names, validation schemas shared between client and server, dirty/touched state, multi-step forms, and the router's `action` + `Form` APIs (whose automatic revalidation replaces several round trips from this part).
