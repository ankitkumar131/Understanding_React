# 05 — Zod: Schemas, Transforms, and One Source of Truth

> **Part 8 · Forms and Validation · File 5 of 5**

Why this file exists: files 03 and 04 both have a hidden duplication. The rules live in one place (`validateProduct`, or `register` options) and the types live in another (`ProductFormValues`, `ApiProductDraft`). Nothing forces them to agree, and they drift — a rule is loosened, a field is added, and the type lags behind. A **schema library** removes the duplication: you write the rules once, and the types are *derived* from them. This file uses **Zod** — the most widely used option — and covers the part that surprises people most: a schema has **two** types, its input (what the user typed) and its output (what your API receives), and the gap between them is where parsing belongs.

---

## 1. The duplication problem, stated precisely

```ts
// File 03's version: two definitions of the same truth.
interface ProductFormValues {
  name: string;
  price: string;                            // ← "price is text in the form"
  category: Category | '';
  blurb: string;
  inStock: boolean;
}

export function validateProduct(values: ProductFormValues): ProductErrors {
  if (values.name.trim().length < 2) errors.name = 'Name must be at least 2 characters.';   // ← rule
  if (!/^\d+(\.\d{1,2})?$/.test(values.price.trim())) errors.price = '…';                   // ← rule
  // …and so on
}
```

```ts
// Part 7's version: the API's shape, written again.
export interface ApiProductDraft {
  name: string;
  priceMinor: number;                       // ← "price is a number on the wire"
  category: Category;
  blurb: string | null;
  inStock: boolean;
}
```

Three separate writings of one idea (the form type, the rules, the API type). A schema collapses the last two into one artefact, and derives the first from it:

```ts
const productSchema = z.object({ … });      // rules
type ProductFormValues = z.input<typeof productSchema>;    // what the form holds
type ProductDraft = z.output<typeof productSchema>;        // what the API receives
```

---

## 2. Install and the two ways to validate

```bash
npm install zod
```

```ts
// File: src/part8/productSchema.ts
import { z } from 'zod';

const CATEGORIES = ['audio', 'keyboards', 'accessories'] as const;

export const productSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(60, 'Name must be 60 characters or fewer.'),
  price: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Use digits only, e.g. 1299.50 (at most 2 decimals).'),
  category: z.enum(CATEGORIES, { message: 'Choose a category.' }),
  blurb: z.string().trim().max(200, 'Blurb must be 200 characters or fewer.'),
  inStock: z.boolean(),
});
```

Two API styles, and the difference matters:

| Call | On success | On failure | Use for |
| --- | --- | --- | --- |
| `schema.parse(value)` | returns the typed, transformed data | **throws** a `ZodError` | server-side parsing, `try`/`catch` control flow |
| `schema.safeParse(value)` | `{ success: true, data }` | `{ success: false, error }` | form validation, anything where failure is expected |

`ZodError` carries **`issues`** — an array of `{ code, path, message }` — and the path is what lets you point at the right field:

```text
=== A. one schema, all the rules ===
   safeParse failed with 6 issues:
      · name: Name must be at least 2 characters.
      · price: Use digits only, e.g. 1299.50 (at most 2 decimals).
      · price: Price must be greater than ₹0.
      · category: Choose a category.
      · blurb: Blurb must be 200 characters or fewer.
      · price: In-stock items must be priced at ₹100 or more.
   fieldErrorsFrom(error) → {"name":"Name must be at least 2 characters.","price":"Use digits only, e.g. 1299.50 (at most 2 decimals).","category":"Choose a category.","blurb":"Blurb must be 200 characters or fewer."}
```

Note what happened there: Zod ran **every** rule on **every** field (six issues from one call), and several rules are attached to the same path (`price`) because Zod collects issues rather than stopping at the first. `fieldErrorsFrom` folds them into one message per field for display — exactly the `ProductErrors` shape file 03 used.

⚠️ `issues` is an **array**, so a field can have more than one problem. Deciding which one to show is a UI decision, and "the first one" (as `fieldErrorsFrom` does) is usually right — a user fixing rule 1 often fixes rule 2 by accident.

---

## 3. The rule catalogue

The subset you will actually use, in the order you will meet it:

```ts
// Strings
z.string().min(2).max(60)
z.string().trim()                      // transform first, then validate what remains
z.string().regex(/^\d+(\.\d{1,2})?$/)
z.email()                              // v4's top-level form; z.string().email() is deprecated
z.url()                                // likewise; both exist, the top-level form is current
z.string().startsWith('p-')
z.string().nonempty()                  // v3 name; in v4 use .min(1)
z.string().nullable()                  // string | null
z.string().optional()                  // string | undefined
z.string().nullish()                   // string | null | undefined
z.string().default('')                 // fills in a value when the key is missing

// Numbers
z.number().int().nonnegative().max(100_000_000)
z.coerce.number()                      // parses "42" → 42 before validating

// Booleans, literals and enums (literal unions!)
z.boolean()
z.literal('accessories')
z.enum(['audio', 'keyboards', 'accessories'])
z.nativeEnum(ColorEnum)                // if you must keep an enum around

// Objects, arrays, records, unions
z.object({ name: z.string(), inStock: z.boolean() })
z.array(z.string())
z.record(z.string(), z.number())
z.union([z.string(), z.number()])
z.discriminatedUnion('kind', [ … ])    // tagged unions: fast and precise
```

Custom messages come in two shapes; both appear in real code:

```ts
z.string().min(2, 'Name must be at least 2 characters.');        // shorthand: message only
z.string().min(2, { message: 'Name must be at least 2 characters.' });
z.enum(CATEGORIES, { message: 'Choose a category.' });           // for errors that are not about a length
```

💡 `z.enum([...])` gives you a **literal union type** (`'audio' | 'keyboards' | 'accessories'`), which is what you want for a `Category` — a hand-written `enum` also creates runtime objects, and TypeScript's `enum` behaves differently from a union in several ways (Part 2 covered this).

---

## 4. Cross-field rules with `.refine()`

A schema for a single field cannot see its siblings. `.refine()` runs over the **whole object** once the object itself is valid:

```ts
export const productSchema = z
  .object({
    name: z.string().trim().min(2, '…').max(60, '…'),
    price: z.string().trim().refine(…).refine(…).transform(…),
    category: z.enum(CATEGORIES, { message: 'Choose a category.' }),
    blurb: z.string().trim().max(200, '…'),
    inStock: z.boolean(),
  })
  .refine((values) => !values.inStock || values.price >= 10_000, {
    message: 'In-stock items must be priced at ₹100 or more.',
    path: ['price'],              // ← attach the error to the price input
  });
```

```text
   cross-field rule → {"price":"In-stock items must be priced at ₹100 or more."}
   same price, in-stock off → passed
```

Two details that make this usable:

- **`path: ['price']`** puts the message under the price field. Without it the issue's path is empty (a "form-level" error), and you would have to decide where to render it.
- **`.refine()` runs after the object's rules pass** — that is why the rule reads `values.price` as a number (the transform already ran) and why the cross-field rule does not fire when the price is unparseable.

`.superRefine()` is the escape hatch when you need to report **several** issues with different paths:

```ts
.superRefine((values, ctx) => {
  if (values.price < 10_000 && values.category === 'audio') {
    ctx.addIssue({ code: 'custom', path: ['price'], message: 'Audio items under ₹100 need a blurb.' });
  }
  if (values.blurb === '' && values.inStock === false) {
    ctx.addIssue({ code: 'custom', path: ['blurb'], message: 'Please explain why this is out of stock.' });
  }
})
```

⚠️ Refinements are **not** a place for network calls. A schema should be a pure description of valid data; a uniqueness check inside a schema is called on every validation pass (including in resolvers that run per keystroke), and its async nature makes message ordering unpredictable. Keep server-truth checks where file 03 put them: at the boundary, debounced, with a race guard.

---

## 5. Transforms, and the two types

This is the concept that repays the whole file. A form field holds **text**; the API wants **an integer**. Zod can do the conversion *inside* the schema, and the schema then has two types:

```ts
const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;
const stripPrice = (value: string) => value.replace(/[₹,\s]/g, '');
export function parsePrice(value: string): number {
  const cleaned = stripPrice(value.trim());
  if (!PRICE_PATTERN.test(cleaned)) return 0;
  return Math.round(Number(cleaned) * 100);        // rupees → paise
}

price: z
  .string()
  .trim()
  .refine((value) => PRICE_PATTERN.test(stripPrice(value)), 'Use digits only, e.g. 1299.50 (at most 2 decimals).')
  .refine((value) => parsePrice(value) > 0, 'Price must be greater than ₹0.')
  .refine((value) => parsePrice(value) <= 100_000_000, 'Price must be ₹10,00,000 or less.')
  .transform((value) => parsePrice(value)),         // ← the type changes here
```

```text
   input  : {"name":"Desk Lamp Pro","price":"1,299.50","category":"accessories","blurb":"","inStock":true}
   output : {"name":"Desk Lamp Pro","price":129950,"category":"accessories","blurb":"","inStock":true}
   price went from "1,299.50" (string, with a comma and ₹ symbol) to 129950 minor units
   category is now the literal type 'accessories' (z.enum, not just string)
   blurb was trimmed: ""
```

The two derived types do different jobs:

| Type | Meaning | Used for |
| --- | --- | --- |
| `z.input<typeof schema>` | before parsing | **the form's values** — `price` is a string, `category` may be `''` |
| `z.output<typeof schema>` | after parsing | **the API payload / domain model** — `price` is an integer, `category` is the union |
| `z.infer<typeof schema>` | alias of `z.output` | the common case when you only need the parsed type |

```ts
export type ProductFormValues = z.input<typeof productSchema>;
export type ProductDraft = z.output<typeof productSchema>;
```

Why this is better than doing the conversion by hand in `onSubmit`:

1. **It happens exactly once**, in one place, and it is impossible to forget on one code path and not another.
2. **The rules and the conversion cannot disagree.** The same `parsePrice` that validates is the one that converts.
3. **The types follow the transform.** `ProductFormValues['price']` is `string`; `ProductDraft['price']` is `number` — the compiler enforces the boundary, so a component cannot accidentally send the raw string to the API.

⚠️ **Do not put the transform before the rules.** `z.number().min(100)` on a value that is still a string will not behave as you expect; the ordering in the schema is the ordering of the pipeline: *normalise → validate → convert* (or, when a rule needs the parsed value, *normalise → convert → validate*, as the cross-field rule above does by running at the object level).

💡 `z.coerce.number()` is the quick version of a transform (`"42"` → `42`, `""` → `0`) and it is exactly the `Number('') === 0` trap from file 02 in library form. Prefer explicit `.transform()` with your own parse for anything a user types (especially money), and keep `z.coerce` for values your own code produced.

---

## 6. Wiring a schema into react-hook-form

`@hookform/resolvers` adapts Zod to RHF. The resolver validates the whole object on every pass — which is also how it fixes file 04's cross-field staleness:

```bash
npm install @hookform/resolvers
```

```tsx
// File: src/part8/SchemaProductForm.tsx (the essential lines)
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { productSchema, type ProductDraft, type ProductFormValues } from './productSchema';

const defaultValues: ProductFormValues = { name: '', price: '', category: '', blurb: '', inStock: true };

export function SchemaProductForm({ onSaved }: { onSaved?: (product: { id: string }) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues, unknown, ProductDraft>({
    resolver: zodResolver(productSchema),          // ← rules + transform in one option
    defaultValues,
  });

  const onSubmit: SubmitHandler<ProductDraft> = async (data) => {
    // `data` is the OUTPUT type: data.price is a number, data.category is the literal union.
    const created = await createProduct({
      name: data.name,
      priceMinor: data.price,
      category: data.category,
      blurb: data.blurb === '' ? null : data.blurb,
      inStock: data.inStock,
    });
    reset(defaultValues);
    onSaved?.(created);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      {errors.name !== undefined && <p className="error">{errors.name.message}</p>}
      {/* …the other fields… */}
      <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save product'}</button>
    </form>
  );
}
```

The generic signature is worth understanding rather than copying:

```ts
useForm<ProductFormValues, unknown, ProductDraft>
//      ↑ what the form holds   ↑ context  ↑ what onSubmit receives after the resolver runs
```

`ProductFormValues = z.input<…>` and `ProductDraft = z.output<…>` — RHF types the fields from the first, and `handleSubmit`'s callback from the third. That is why `register('price')` accepts a string and `data.price` is a number, with no casts in sight.

Measured, end to end:

```text
=== B. zodResolver: the same rules, wired into react-hook-form ===
   submitting an empty form → 3 errors
      · Name must be at least 2 characters.
      · Use digits only, e.g. 1299.50 (at most 2 decimals).
      · Choose a category.
   POST requests: 0

   after a valid submit → POST requests: 1
   body: {"name":"Zod Lamp","priceMinor":129950,"category":"accessories","blurb":"Validated by zod.","inStock":true}
   note what the body does NOT contain: the form's "1,299.50" string. The transform ran before onSubmit,
   so the handler received priceMinor as a number — the schema, not the component, did the parsing.
   success message: Product saved.
```

Read the third line again: **the component never parsed anything.** No `Math.round(Number(...))` in the submit handler, no `as Category` cast, no `?? null` decisions — the schema's output *is* the API payload, field for field. That is the whole promise of a schema library, delivered in one measurement.

⚠️ The same-tick double-submit rule from files 03 and 04 still applies: the resolver runs before `onSubmit`, but `isSubmitting` is still not a synchronous guard. Keep the `useRef`.

---

## 7. One schema, two boundaries

The schema does not care where the data came from. The same definitions validate what your **form** produces and what the **server** returns — Part 7, file 11's argument, with the types derived instead of written twice:

```ts
export const productResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  priceMinor: z.number().int().nonnegative(),
  category: z.enum(CATEGORIES),
  blurb: z.string().nullable(),
  inStock: z.boolean(),
});

export type ApiProduct = z.output<typeof productResponseSchema>;
export const productListResponseSchema = z.array(productResponseSchema);
```

```text
=== C. the same schema validates what the API sends back ===
   GET /products?_limit=3 → 200
   productListResponseSchema.safeParse → ok · 3 products
   productResponseSchema.safeParse(first) → ok · p-keyboard · priceMinor=499900
   after a server bug (priceMinor as a string, inStock as 1):
      · priceMinor: Invalid input: expected number, received string
      · inStock: Invalid input: expected boolean, received number
```

Three uses of one file:

| Boundary | Schema | What it catches |
| --- | --- | --- |
| The form | `productSchema` (input → output) | user mistakes, and it converts units |
| The API response | `productResponseSchema` | the server changing shape, proxies returning HTML, a `200` with a bad body |
| The API request (server-side) | the same `productSchema` | anything that bypasses your UI — `curl`, an old client, another service |

💡 Sharing a schema between client and server is the real prize: put it in a package both import (or a `shared/` folder), and the server rejects what the client rejects, with the same messages. The lab cannot do that across `src/` (TypeScript) and `server/middlewares.cjs` (CommonJS), which is itself a lesson about project layout — the schema belongs in a place both sides can import, ideally as a compiled package or with a build step.

---

## 8. Turning issues into form errors

RHF already maps resolver errors onto fields by **path**, which handles nesting for free (`tags.0.label` becomes `errors.tags[0].label`). For the non-RHF path — or for a summary — one small function is enough:

```ts
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.join('.') || '_form';       // nested paths: 'tags.0.label'
    if (fieldErrors[field] === undefined) fieldErrors[field] = issue.message;   // first message wins
  }
  return fieldErrors;
}
```

| Decision | Why |
| --- | --- |
| `issue.path.join('.')` | turns `['tags', 0, 'label']` into `'tags.0.label'`, a key you can look up |
| `'_form'` for an empty path | object-level refinements without a `path` are form-level errors |
| first message wins | matches the "one message per field" rule from file 03 |
| no `any` | `ZodError.issues` is fully typed; `issue.message` is a string |

For server errors, the flow is identical to file 04: catch the `HttpError`, map the API's field names (`priceMinor` → `price`), and call `setError` with `type: 'server'`.

---

## 9. Which schema library?

| Library | Shape | Things to weigh |
| --- | --- | --- |
| **Zod** | `z.object({...})`, `.refine`, `.transform`, `z.infer` | the largest ecosystem (RHF resolvers, tRPC, framework integrations), the default choice for most teams |
| **Valibot** | function composition (`v.object`, `v.pipe`, `v.safeParse`) | tree-shakable and typically smaller in a bundle; modular API, growing ecosystem |
| **ArkType** | TypeScript-like syntax (`type({ name: 'string' })`) | elegant inference, deep TS integration, smaller community |
| **Yup** | `yup.object({...})`, promise-based | older, very common in Formik-era code; heavier and weaker inference |
| **Joi** | server-side focused, mature | great on Node, not designed for the browser bundle |
| **Hand-written parsers** | your own `parseProduct` (Part 7, file 11) | zero dependencies, total control, more code per field and easy to let drift |

How to choose honestly:

- **Hand-written** is genuinely fine for a handful of flat payloads — Part 7's parser is 30 lines and catches everything in that file's examples.
- **Zod (or Valibot)** pays for itself the moment you have nested payloads, several forms sharing rules, or you want the *types derived from the rules*. The price is a dependency (bundle size) and a new vocabulary.
- Do not mix libraries in one app. A "zod schema for the form and a hand-written parser for the response" is two sources of truth for the same shape — the exact problem this file exists to remove.
- Check the current docs before pinning versions: Zod 4 changed several APIs (top-level `z.email()`, error customisation, performance work), and the ecosystem adapts on its own schedule.

---

## 10. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `schema.parse` without `try`/`catch` | an exception escapes into a click handler | use `safeParse` for user input |
| 2 | Reading `error.errors` | `undefined` in newer majors | read `error.issues` |
| 3 | Forgetting `path` on a `.refine()` | the message cannot be attached to a field | `{ message, path: ['price'] }` |
| 4 | Putting the `.transform()` before the rules | rules see the wrong type, messages confuse | normalise → validate → transform |
| 5 | Using `z.coerce.number()` on a clearable input | `""` becomes `0` | explicit parse with an empty-state decision |
| 6 | Async refinement doing a network call | a request per keystroke in a resolver | move it to a debounced check at the boundary |
| 7 | Typing the form with `z.infer` instead of `z.input` | the types say `number` where the input holds a string | `z.input<typeof schema>` for form values |
| 8 | Duplicating the type by hand next to the schema | they drift | derive every type from the schema |
| 9 | Schema for the form, nothing for responses | a changed API shape crashes deep in a component | parse responses at the boundary (Part 7, file 11) |
| 10 | One giant schema for unrelated forms | every change risks every form | compose small schemas (`.extend()`, `.pick()`, `.omit()`) |
| 11 | Using `z.any()`/`z.unknown()` to make it pass | validation that validates nothing | model the shape; `z.unknown()` only where you truly do not care |
| 12 | Ignoring the second issue for a field | a user fixes one rule and is rejected by the next | show the first, but log/collect all |

---

## 11. Best practices

1. **One schema per shape**, in a module named after the domain (`productSchema.ts`), with all field types derived from it.
2. **`z.input` for the form, `z.output` for the API** — and let the compiler enforce the boundary.
3. **Transform to the API's units inside the schema** (`"1,299.50"` → `129950`) so no component ever converts.
4. **`.refine` with an explicit `path`** for every cross-field rule; use `.superRefine` when a rule reports several issues.
5. **Compose**: `.extend({ id: z.string() })` for the edit form, `.pick({ name: true })` for a partial update, `.partial()` for a PATCH body — reuse instead of re-writing.
6. **Validate responses with the same style of schema** (file 11 of Part 7) and keep the parser next to the request that uses it.
7. **Keep schemas pure.** No fetching, no dates "now", no `Math.random()` — validation of the same input must always give the same answer.
8. **Map issues to fields once** (`fieldErrorsFrom`) and keep the field names identical between schema paths and form fields.
9. **Test the schema directly** — a table of `{ input, expected }` rows is a complete, fast unit test with no React involved (the same benefit file 03's `validateProduct` had).
10. **Choose one library for the project** and note in the README why, so the next person does not add a second one.

---

## 12. Practice

### Beginner

1. Write a `signupSchema` for `{ email, password, confirmPassword }`: a valid email, a password of at least 8 characters, and a cross-field rule that the two passwords match (with `path: ['confirmPassword']`). Run `safeParse` on three inputs: empty, mismatched, valid. Print every issue with its path.
2. Add a `name` rule that strips and trims whitespace and requires at least 2 characters *after* trimming. Prove with a probe that `"  A  "` fails and `"  Asha  "` passes with `name === 'Asha'` in the output.
3. Change `z.string().email()` to `z.string()` (dropping the rule) and watch what TypeScript *does not* complain about. What does that tell you about where correctness lives?

### Intermediate

1. Add an `orders` schema: an array of `{ sku: string; quantity: number; unitPriceMinor: number }` with at least one item and a total computed by a transform (`totalMinor`). Validate the API's `/orders` response with it and report any mismatch (the lab's seeded orders are a good corpus).
2. Give `productSchema` three variants using composition: `createProductSchema` (as now), `updateProductSchema = productSchema.partial()` wrapped to require at least one key, and `responseSchema = productSchema.extend({ id: z.string(), updatedAt: z.string() })`. Then use the right one at each boundary: form, PATCH body, API response.
3. Wire `updateProductSchema` into a PATCH form and send only the changed fields (`dirtyFields` from file 04). Confirm the request body contains exactly what changed — and explain why a `PUT` form must use the *full* schema instead.
4. Replace the hand-written `validateProduct` in file 03's `ValidatedProductForm` with a `zodResolver` version and diff the two files: how many lines of rules, types and messages disappeared?

### Challenge

1. Build a **shared schema package**: a `shared/` folder with `productSchema.ts`, imported by both the Vite app and a small Node script that validates incoming payloads (stand in for the server). Show the same payload being accepted by the client and rejected by the "server" when a rule is tightened. Then describe what a real monorepo setup would add (build step, versioning, publishing).
2. Add **localised messages**: a `messages` map keyed by issue code (`too_small`, `invalid_type`, `custom`) that produces messages from the schema's own metadata (minimum length, expected type) instead of hard-coded strings. What breaks for messages you *want* to be custom per field?
3. Draft the validation plan for a form that must work offline: which rules run locally, which need the server, how a submission is queued, what happens when the same entity is edited on two devices, and where schema versioning matters (a queued payload validated by next week's schema).

---

## 13. Solutions

### Beginner

1. ```ts
   const signupSchema = z
     .object({
       email: z.string().trim().email('Enter a valid email address.'),
       password: z.string().min(8, 'Use at least 8 characters.'),
       confirmPassword: z.string(),
     })
     .refine((values) => values.password === values.confirmPassword, {
       message: 'The passwords do not match.',
       path: ['confirmPassword'],
     });
   ```
   Empty → three issues (or fewer, depending on your messages); mismatched → one issue at `['confirmPassword']`; valid → `success: true` with the trimmed email in `data`. Printing `{ path: issue.path.join('.'), message: issue.message }` for each is the fastest way to learn the error shape.
2. `z.string().trim().min(2)` — the `.trim()` runs before `.min()`, so `"  A  "` becomes `"A"` and fails, while `"  Asha  "` becomes `"Asha"` and passes with the trimmed value in the output. Ordering *is* the semantics; this is the same "normalise → validate" rule as the price pipeline.
3. TypeScript only knows that `email` is a `string` either way, so removing the rule changes no type and no compile error — validation of *values* lives at runtime. That is the boundary Part 7, file 11 drew: types protect your code from itself; parsers protect you from the world.

### Intermediate

1. ```ts
   const orderItemSchema = z.object({
     sku: z.string().min(1),
     quantity: z.number().int().positive(),
     unitPriceMinor: z.number().int().nonnegative(),
   });

   const orderSchema = z
     .object({ items: z.array(orderItemSchema).min(1, 'An order needs at least one item') })
     .transform((order) => ({
       ...order,
       totalMinor: order.items.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0),
     }));
   ```
   Validating the seeded orders catches exactly the kind of drift the schema exists for: a `totalMinor` computed the client's way and the server's way must agree, and if the API's item shape uses `qty` instead of `quantity`, `safeParse` says so at the boundary instead of a `NaN` appearing in a total.
2. ```ts
   const updateProductSchema = productSchema
     .partial()
     .refine((values) => Object.keys(values).length > 0, { message: 'Nothing to update.' });
   ```
   Use `productSchema` for the create/`PUT` form (all fields required, transform runs), `updateProductSchema` for a `PATCH` body (only changed keys), and `responseSchema` for responses (server-owned fields included). Note the asymmetry that makes this necessary: `PUT` replaces the whole record, so a partial body would delete fields — a `409`/`500` waiting to happen.
3. Build the body from `dirtyFields`: `const changed = Object.fromEntries(Object.keys(dirtyFields).map((key) => [key, values[key]]))`, validate it with `updateProductSchema` (which now also rejects an empty object), and send only that. If you used `productSchema`, every field would be required and the request would carry values the user never touched — turning a small edit into a full overwrite (the lost-update risk from file 07).
4. The rewrite typically deletes the `ProductFormValues`/`ProductErrors` types, the whole `validateProduct` body, the conversion in `handleSubmit`, and most of the message strings — half the file — while gaining the schema module and the resolver import. The behaviour that must stay identical (and is worth re-running the file 03 probe to confirm): blur timing, focusing the first invalid field, the cross-field rule, keeping values on failure, and the same-tick submit guard.

### Challenge

1. A `shared/` folder imported by both sides works in a monorepo with path aliases (`@shared/productSchema`) or, more portably, as a small published package. On the client, Vite compiles it like any module; on the server it must be importable by Node (ESM or a build step). The demonstration to insist on: tighten one rule in the schema, and the client's form and the server's rejection move together with no second edit anywhere. Real setups add versioning (a queued payload from an old client may not satisfy a new schema) and tests that run against both runtimes.
2. Message factories keyed by issue code work for generic rules (`too_small` with `minimum`, `invalid_type` with `expected`) and let you localise without rewriting the schema. What breaks: field-specific wording, and anything where the *reason* matters more than the rule ("that username is taken" vs "too short"). The usual compromise is localised defaults plus per-field overrides for the handful of messages where voice matters.
3. Offline plan: run all synchronous rules (types, ranges, cross-field) locally so the user gets instant feedback; treat server-only rules (uniqueness, stock) as *hints* that can be stale, and always send the payload for the real decision; queue submissions with an explicit state machine (`draft → queued → sending → confirmed | rejected`), a stable client-generated id and an idempotency key so retries cannot duplicate; store the payload with the schema version that produced it; on conflict, fetch the server's copy and offer "keep mine / use theirs / merge". The honest constraint: schema changes are a *compatibility* problem — validate queued payloads with the schema version recorded in the queue, and expect to migrate them.

---

## 14. Summary

- A schema removes the duplication between **rules** and **types**: `z.infer<typeof schema>` (and `z.input`/`z.output`) derive the TypeScript types from the runtime rules, so they cannot drift.
- `safeParse` returns a result (`{ success, data }` / `{ success, error }`); `parse` returns the data and **throws** a `ZodError`. Zod collects **all** issues with **paths**, which is what makes per-field error display straightforward (measured: 6 issues from one call, folded into 4 field messages).
- `.refine()` sees the whole object — that is where cross-field rules live, and `path` decides which field shows the message. Measured: the in-stock rule lands on `price`.
- **Transforms make the schema the parser**: `"1,299.50"` → `129950`, and the schema's **input type** (the form) differs from its **output type** (the API payload). The measured `POST` body contains the number, not the string, because the resolver ran the transform before `onSubmit`.
- `zodResolver` + `useForm<z.input<…>, unknown, z.output<…>>` wires it into RHF, validating the **whole object** — which also fixes file 04's cross-field staleness and restores file 03's whole-form model with less code.
- The **same** schemas validate responses (measured: a mutated payload rejected with `priceMinor`/`inStock` issues), which closes the loop with Part 7, file 11 — one definition, two boundaries.
- Schema libraries are a trade, not a rule: **hand-written** for a few flat payloads, **Zod/Valibot** when rules and types must agree across forms, endpoints and the server. Pick one, keep schemas pure, and derive every type from them.

---

**What's next →** **Part 9 — State Management** ([`../09-state-management/`](../09-state-management/)) picks up the question this part kept deferring: where should state live when the app grows? You will meet `useReducer` patterns and state machines, context with reducers for app-wide data, when to reach for Redux Toolkit (and why "large apps need Redux" is a myth), the modern server-state split with TanStack Query, and how to decide between local, lifted, context, URL and server state for a given piece of data.
