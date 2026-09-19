# 05 — POST APIs: Creating Records, Server Validation, and the Double-Submit Problem

> **Part 7 · API Integration · File 5 of 11**
> Why this file exists: `POST` is where your app stops reading the server's data and starts changing it. Everything that makes a write risky lives here — a payload that has to be exactly right, a request that must not be sent twice, validation that only the server can do, and a response that tells you what the server actually stored. This file builds the create half of the shop-admin CRUD screen and measures every failure path.

---

## 1. What POST means

`POST` sends data **to** a resource so that the server creates something. Four properties to hold on to:

| Property | Meaning | Consequence |
| --- | --- | --- |
| **Not idempotent** | sending the same POST twice creates two records | you must prevent accidental duplicates |
| **Not cacheable** | browsers and proxies do not cache POST responses | no stale-data surprises |
| **Has a body** | the payload lives in the request body, not the URL | `Content-Type: application/json` matters |
| **Usually returns `201 Created`** | the response often includes the new resource, with its server-assigned `id` | use the server's copy, not your local guess |

The id is the part people get wrong: **the client does not decide the id.** The server does, and it tells you in the response body (and sometimes a `Location` header pointing at the new resource).

```text
POST /products           →  201 Created
{ "name": "Desk Lamp", ... }   { "id": "w0xjz_C", "name": "Desk Lamp", ... }
```

⚠️ If you write your own id (a `Date.now()` or a UUID) and *also* let the server assign one, you now have two identities for one record. Save the id from the response and use it.

---

## 2. Where POST sits in the CRUD shape of an app

| Verb | Purpose | Idempotent? | Returns |
| --- | --- | --- | --- |
| `GET /products` | read a list | yes | `200` + array |
| `GET /products/:id` | read one | yes | `200` or `404` |
| **`POST /products`** | **create** | **no** | `201` + created record |
| `PUT /products/:id` | replace | yes | `200` (+ updated record) |
| `PATCH /products/:id` | update partly | no (in theory) | `200` |
| `DELETE /products/:id` | remove | yes | `200`/`204` |

A create screen is a form (Part 8 goes deep) plus one POST. The interesting engineering is in the four "what ifs": what if the data is invalid, what if the user clicks twice, what if the server says no, and what if the response is not what you expected.

---

## 3. The request, piece by piece

```ts
const response = await fetch('/api/products', {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(draft),
});
```

| Part | Why | What breaks without it |
| --- | --- | --- |
| `method: 'POST'` | declares a create | `fetch` defaults to `GET`, and a GET with a body is silently dropped |
| `Content-Type: application/json` | tells the server how to parse the body | Express's `json()` body parser ignores the body → your fields arrive `undefined` |
| `JSON.stringify` | converts the object to text | passing an object sends `[object Object]` |
| `Accept: application/json` | asks for JSON back | some servers default to HTML errors, which you then try to `JSON.parse` |

`JSON.stringify` has three behaviours worth knowing before they surprise you on the wire:

```ts
JSON.stringify({ a: undefined, b: null, c: () => {}, d: new Date(0), e: Symbol('x') });
// → '{"b":null,"d":"1970-01-01T00:00:00.000Z"}'
```

- **`undefined` values and functions disappear entirely.** This is the trap Part 7's PATCH file revisits: an omitted key and a `null` key mean different things to a server.
- **`null` survives** as `null` — "explicitly empty" is a value.
- **`Date` becomes an ISO string**, so a `Date` in your state arrives as a string on the server. Type it accordingly.

The lab's typed helper hides all of this, and it is the only place in the app that knows about `fetch`, headers, and status codes:

```ts
// File: src/api/http.ts (excerpt)
export async function sendJson<T>(path: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', payload?: unknown): Promise<T> {
  const response = await fetch(url(path), {
    method,
    headers: payload === undefined
      ? { Accept: 'application/json' }
      : { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  if (!response.ok) {
    const { parsed, raw } = await readJson(response).catch(() => ({ parsed: null, raw: '' }));
    throw new HttpError(response.status, `Request failed with ${response.status}`, parsed ?? raw);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
```

Three decisions in that function that pay off at every call site:

1. **Only sends `Content-Type` when there is a body.** A `POST` without a payload with a JSON content type confuses some servers.
2. **Turns non-2xx into an `HttpError` that carries the parsed body.** That is what the form uses to read the server's field errors (section 8).
3. **Handles `204 No Content`** so a delete does not try to parse an empty body (a real crash, and the reason `response.json()` needs guarding).

---

## 4. The draft: what actually goes on the wire

The form holds strings (what the user typed) and the API holds typed, normalised data. Converting between them is the form's job, at the edge:

```ts
function toDraft(values: FormValues): ApiProductDraft {
  return {
    name: values.name.trim(),
    priceMinor: Math.round(Number(values.price) * 100),   // rupees → paise, integer
    category: values.category,
    blurb: values.blurb.trim() === '' ? null : values.blurb.trim(),
    inStock: values.inStock,
  };
}
```

Measured, with real numbers:

```text
=== C. a valid create (POST → 201) ===
   filled in: name="Desk Lamp" price="1299.5" inStock=false
   while the request is in flight: button="Saving…" disabled=true
   after the response: Created Desk Lamp (id w0xjz_C)
   request: POST http://127.0.0.1:3001/products?delay=400
   body sent: {"name":"Desk Lamp","priceMinor":129950,"category":"accessories","blurb":"Warm light, USB-C.","inStock":false}
   form reset? name="" price=""
   server now has: w0xjz_C "Desk Lamp" 129950 inStock=false blurb="Warm light, USB-C."
   ↑ 1299.5 rupees became 129950 paise — the form converts at the edge, with Math.round
```

Four conversion rules, each with a reason:

| Input | Output | Why |
| --- | --- | --- |
| `"1299.5"` | `129950` (`priceMinor`) | integers avoid float drift; the API's contract says minor units |
| `"Warm light "` | `"Warm light"` | trim before sending: the server should not store your stray spaces |
| `""` (empty textarea) | `null` | the API distinguishes "no description" from "an empty description" |
| `"accessories"` | `"accessories"` (literal union) | `ApiProductDraft['category']` types it, so a typo is a compile error |

⚠️ `Math.round(Number(price) * 100)` is the *last* line of defence, not a validator: `Number('abc') * 100` is `NaN`, and `NaN` serialised to JSON is `null`. Validate first (section 6), convert second.

---

## 5. The complete create screen

```text
shop-admin/
├── src/
│   ├── api/
│   │   ├── http.ts          ← getJson / sendJson / HttpError
│   │   ├── products.ts      ← createProduct, replaceProduct, updateProduct, deleteProduct
│   │   └── types.ts         ← ApiProduct, ApiProductDraft
│   ├── part7/
│   │   ├── ProductForm.tsx      ← the form (create AND edit modes)
│   │   ├── NewProductPage.tsx   ← uses ProductForm with no product
│   │   └── ProductsTable.tsx    ← the list screen (file 08)
│   └── main.tsx
└── server/
    ├── db.json              ← the "database"
    └── middlewares.cjs      ← /profile, ?fail=…, ?delay=…
```

```tsx
// File: src/part7/NewProductPage.tsx
import { useNavigate } from 'react-router';
import { ProductForm } from './ProductForm';

export function NewProductPage() {
  const navigate = useNavigate();

  return (
    <section>
      <h2>New product</h2>
      <ProductForm
        onSaved={(product) => {
          navigate(`/products/${product.id}`);   // use the id the SERVER assigned
        }}
      />
    </section>
  );
}
```

```tsx
// File: src/part7/ProductForm.tsx (the create path, annotated)
import { useRef, useState, type FormEvent } from 'react';
import { HttpError } from '../api/http';
import { createProduct, replaceProduct } from '../api/products';
import type { ApiProduct, ApiProductDraft } from '../api/types';

type FieldErrors = Partial<Record<'name' | 'price' | 'blurb' | 'category', string>>;

interface FormValues {
  name: string;
  price: string;                                  // rupees, as typed
  category: ApiProductDraft['category'];
  blurb: string;
  inStock: boolean;
}

const emptyValues: FormValues = { name: '', price: '', category: 'accessories', blurb: '', inStock: true };

function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};

  if (values.name.trim().length < 3) errors.name = 'Name must be at least 3 characters.';
  if (values.name.trim().length > 60) errors.name = 'Name must be 60 characters or fewer.';

  const price = Number(values.price);
  if (values.price.trim() === '' || Number.isNaN(price)) errors.price = 'Enter a price, for example 2499 or 2499.50.';
  else if (price <= 0) errors.price = 'Price must be greater than zero.';
  else if (price > 100000) errors.price = 'Price looks wrong — is it above ₹1,00,000?';

  if (values.blurb.length > 200) errors.blurb = `Description is ${values.blurb.length} characters; the limit is 200.`;

  return errors;
}

export function ProductForm({ product, onSaved }: { product?: ApiProduct; onSaved?: (product: ApiProduct) => void }) {
  const isEdit = product !== undefined;
  const [values, setValues] = useState<FormValues>(() => (product ? valuesFrom(product) : emptyValues));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<ApiProduct | null>(null);

  // A ref, not state: it must be readable SYNCHRONOUSLY by a second click handler
  // in the same tick, before React has re-rendered the disabled button.
  const submittingRef = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;             // ← the guard that actually works (section 7)

    const errors = validate(values);
    setFieldErrors(errors);
    setFormError(null);
    setSaved(null);
    if (Object.keys(errors).length > 0) return;    // no request while the form is invalid

    const draft: ApiProductDraft = {
      name: values.name.trim(),
      priceMinor: Math.round(Number(values.price) * 100),
      category: values.category,
      blurb: values.blurb.trim() === '' ? null : values.blurb.trim(),
      inStock: values.inStock,
    };

    submittingRef.current = true;
    setPending(true);
    try {
      const result = isEdit ? await replaceProduct(product.id, draft) : await createProduct(draft);
      setSaved(result);
      if (!isEdit) setValues(emptyValues);
      onSaved?.(result);
    } catch (error) {
      if (error instanceof HttpError) {
        const body = error.body as { errors?: Record<string, string>; message?: string } | null;
        if (error.status === 422 && body?.errors) {
          setFieldErrors({
            name: body.errors.name,
            price: body.errors.priceMinor,
            blurb: body.errors.blurb,
            category: body.errors.category,
          });
          setFormError('The server rejected this product. Fix the fields below.');
        } else if (error.status === 401) {
          setFormError('Your session expired. Sign in again to save your changes.');
        } else {
          setFormError(body?.message ?? error.message);
        }
      } else {
        setFormError(error instanceof Error ? error.message : 'Something went wrong');
      }
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  return (
    <form className="product-form" onSubmit={handleSubmit} noValidate>
      {/* …fields (see Part 8)… */}
      <button className="f-submit" type="submit" disabled={pending}>
        {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
      </button>
    </form>
  );
}
```

Line by line, the create-specific parts:

| Line | Why it is like that |
| --- | --- |
| `if (submittingRef.current) return;` | reads a **ref** written synchronously — the only guard that sees a second click in the same tick (measured in section 7) |
| `if (Object.keys(errors).length > 0) return;` | zero requests for an invalid form (transcript A) |
| `Math.round(Number(values.price) * 100)` | rupees → paise, exact, at the boundary |
| `blurb.trim() === '' ? null : …` | the API distinguishes empty from missing |
| `await createProduct(draft)` | POST + 201 + parsed record, from `sendJson` |
| `setValues(emptyValues)` **only when creating** | a create form clears so the user can add another; an edit form must keep showing what was saved |
| `onSaved?.(result)` | the parent decides what happens next (navigate, toast, close a modal) |
| the `catch` block | `422` → field errors; `401` → session message; anything else → a message the user can act on |

---

## 6. Client-side validation: the request that never happens

```text
=== A. create mode: client-side validation runs before any request ===
   first paint: name="" price="" submit="Create product"
   after submitting an empty form: Name must be at least 3 characters. | Enter a price, for example 2499 or 2499.50.
   POSTs sent: 0  ← validate() stopped it before the network

=== B. field-by-field validation ===
   after typing a valid name: Enter a price, for example 2499 or 2499.50.
   after typing "abc" as the price: Enter a price, for example 2499 or 2499.50.
   after typing "-5" as the price: Price must be greater than zero.
```

"POSTs sent: 0" is the number that matters. A client-side check is not a security boundary — the server must validate again — but it is the difference between a fast, friendly form and one that fires a doomed request per click. Note also that `"abc"` and `""` share a message (both are "not a number"), while `-5` is a different problem (a number, but out of range): message quality comes from being precise about *which* rule failed.

---

## 7. The double-submit problem

Every create button eventually gets clicked twice — a double-click, an impatient second tap, a slow network, or a keyboard `Enter` followed by a click. Measured:

```text
=== D. double submit: a synchronous ref guard versus a state-only guard ===
   ProductForm (ref guard): two clicks in one tick → 1 POST(s)
   NaiveForm (state-only guard): two clicks in one tick → 2 POST(s) ← the duplicate is real
   one normal click with a slow server: button disabled=true label="Saving…"
   two impatient clicks while disabled → 1 POST(s) for that submit
   server-side: 1 "Guarded Again Lamp" record (one submit, three clicks)
   server-side totals: "Ref Guard Lamp"=1, "Naive Lamp"=2
```

Why the "obvious" guard fails:

```tsx
// ❌ the guard everyone writes first
if (pending) return;
setPending(true);
```

`pending` is a **state value captured by the render**. Two clicks in the same tick run the *same* handler closure, which still sees `pending === false`. React has not re-rendered between them, so `disabled={pending}` is not set yet either. Result: two POSTs, two records (verified: `"Naive Lamp"=2`).

```tsx
// ✅ a ref, written before the first await
const submittingRef = useRef(false);

async function handleSubmit(event) {
  event.preventDefault();
  if (submittingRef.current) return;
  …
  submittingRef.current = true;
  setPending(true);
  try { … } finally { submittingRef.current = false; setPending(false); }
}
```

A ref's `.current` is read and written **immediately**, with no render in between, so the second call in the same tick sees `true` and returns. `setPending` is still there — for the *visual* state (disabled button, "Saving…") — but it is no longer the thing preventing duplicates.

Three layers, in order of strength:

| Layer | Catches | Cost |
| --- | --- | --- |
| `submittingRef` (sync guard) | same-tick double clicks, Enter + click | 4 lines |
| `disabled={pending}` + "Saving…" | a user who clicks again after a render | 1 line, also good UX |
| idempotency key / unique constraint on the server | retries, flaky networks, two devices, a user who reloads mid-submit | server work; the only layer that survives a page reload |

⚠️ **Client guards are never enough.** A retried request (mobile networks retry `POST` in some cases), a user on two tabs, or a reload mid-flight can still duplicate. The professional version of this screen sends an idempotency key (a UUID generated once per form instance) in a header, and the server returns the *same* record for a repeat. The lab does not implement it; know that it exists and when you need it (payments, orders, anything with side effects beyond a row).

💡 The measured line `two impatient clicks while disabled → 1 POST(s)` shows the *disabled button* doing its job once React has re-rendered. That is why the layer is still worth adding — it stops the accidental click, while the ref stops the same-tick race.

---

## 8. When the server says no: `422` and field errors

Client validation can only check what the client knows. The lab's mock API rejects short names and non-positive prices with `422` and a body of field errors:

```text
=== E. the server says no: 422 with field errors ===
   request: POST http://127.0.0.1:3001/products?fail=422
   messages: The server rejected this product. Fix the fields below. | Name must be at least 3 characters. | Price must be a positive number.
   ↑ the field errors came from the SERVER body (errors.name / errors.priceMinor), not from validate()
```

The mapping is the interesting part. The server's vocabulary is `priceMinor`; the form's is `price`:

```ts
const body = error.body as { errors?: Record<string, string>; message?: string } | null;
if (error.status === 422 && body?.errors) {
  setFieldErrors({
    name: body.errors.name,
    price: body.errors.priceMinor,       // ← API key → form key
    blurb: body.errors.blurb,
    category: body.errors.category,
  });
  setFormError('The server rejected this product. Fix the fields below.');
}
```

Rules for handling a rejected write:

1. **Never clear the form.** The user's typing is the most valuable state on the screen; keep it and let them fix one field.
2. **Put the message next to the field it belongs to** (mapped, not dumped at the top). A banner alone makes the user hunt.
3. **Keep a form-level summary** as well — it tells the user that *something* changed after they pressed the button.
4. **Don't retry a `422` automatically.** It is a data problem; retrying sends the same bad data.
5. **Handle `401` separately** ("your session expired") because the fix is different: sign in again, and the data should ideally survive that trip.

---

## 9. What the response is for

After a successful create, use the response — not your local object:

| Response field | Use it for | Why not your local copy |
| --- | --- | --- |
| `id` | navigating to the new record, inserting into a list | the server generated it; you cannot guess it |
| normalised values | showing what was stored (trimmed, defaults applied) | the server may have changed your payload |
| `createdAt`, `updatedAt`, `version` | display, cache keys, conflict detection | only the server knows these |
| status `201` | the success branch | `response.ok` also covers `200`/`204` |

```tsx
const created = await createProduct(draft);
// ✅ created.id exists and is authoritative
navigate(`/products/${created.id}`);
// ❌ never: insert { id: crypto.randomUUID(), ...draft } into your list and hope it matches
```

The lab's success path does exactly this: `setSaved(result)` renders `Created Desk Lamp (id w0xjz_C)` — with the id from the response.

---

## 10. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | Forgetting `method: 'POST'` | the request goes out as `GET` and nothing is created | set the method explicitly (or use `sendJson`) |
| 2 | Forgetting `Content-Type: application/json` | the server sees an empty body | set it whenever you send a body |
| 3 | Sending an object instead of a string | the body is `[object Object]` | `JSON.stringify` |
| 4 | Guessing the id client-side | duplicates or a broken link after refresh | use the id from the response |
| 5 | `if (pending) return` as the double-submit guard | two records in the database | use a ref written before the first `await` |
| 6 | Disabling the button but not guarding the handler | a fast double-click still fires twice | do both |
| 7 | Losing the form on failure | users retype everything after a `500` | never reset in `catch` |
| 8 | Dumping the error at the top of the page | the user cannot tell which field is wrong | map errors to fields |
| 9 | `Number(price)` without validating | `NaN` → `null` on the wire → a `400`/`500` later | validate, then convert |
| 10 | Sending floats for money | `1299.499999` in the database | integer minor units, `Math.round` once |
| 11 | Retrying a `422` | the same rejection, forever | only retry `429`/`5xx`/network errors |
| 12 | `response.json()` on a `204` | `Unexpected end of JSON input` | check the status, or use a helper that does |

---

## 11. Best practices

1. **One typed create function per resource** (`createProduct(draft)`) — components never see `fetch`.
2. **Build the draft explicitly.** Trimming, type conversion and `null` decisions belong in one function, not scattered across inputs.
3. **Validate locally first, then trust the server.** Zero requests for an obviously invalid form; server errors rendered on the fields.
4. **Convert units exactly once**, at the boundary, with integers (`Math.round`), and never for a float.
5. **Guard with a ref, visualise with state.** A disabled button is UX; the ref is correctness.
6. **Use the response.** The id, the normalised fields and the status are the server's answer to "what is true now".
7. **Keep the values on failure** and give the error a home: field-level messages plus a form-level summary.
8. **Tell the user something happened**: a success message with the created name/id, or a navigation to the new record.
9. **Consider idempotency** for anything with real-world side effects (orders, payments, emails), and say why in a comment.
10. **Test the four paths**: valid, invalid (client), rejected (server `422`), and broken (server `500`) — the lab's probe does, and the transcripts in this file are its output.

---

## 12. Practice

### Beginner

1. Add a **SKU** field to `FormValues` and `ApiProductDraft`-style validation: required, uppercase letters/digits only, 3–10 characters. Post a valid product and confirm the SKU appears in the response and in a follow-up GET.
2. Change the create form so that the same product name cannot be submitted twice in a row (keep the last created name in state and show a warning). Then explain why this is *not* the same as the server's uniqueness check.
3. Log `JSON.stringify({ name: undefined, priceMinor: null, tags: [], note: '' })` in the console and write down exactly what goes on the wire. Which of those four keys would the server fail to see?

### Intermediate

1. Reproduce the double-submit bug on purpose: build a `NaiveForm` with `if (pending) return`, click twice in one tick in a probe, and show two records in the database. Then fix it with a ref and prove one record.
2. Add optimistic list insertion: after a successful create, insert the returned product at the top of an already-loaded list (no refetch). Which fields can you trust? What breaks if the list is sorted by price?
3. Send an intentional `422` and render the server's messages; then send a `500` and render a *retry* button that resends the same draft. Confirm the values are still in the form after the failure.
4. Add an idempotency key: generate `crypto.randomUUID()` once per form instance (in a ref), send it as `Idempotency-Key`, and explain what the *server* would need to do to make a duplicate POST return the first record.

### Challenge

1. Build a "create many" screen: paste a CSV of products, validate each row locally, `POST` them with `Promise.allSettled`, and show a per-row result table (created / rejected with reason / failed to send). Then answer: how many concurrent requests is too many, and what does the UI do at row 400?
2. Add a draft-preserving flow: if the user navigates away with unsaved input, keep the draft in `sessionStorage`, restore it on return, and clear it after a successful create. What are the privacy considerations (what should *not* be persisted)?
3. Design the create flow for a resource with a side effect (an order): idempotency key, a "processing" state that survives reloads, a server-side unique constraint, and a UI that can tell the user "this may already have been created". Write the sequence as a numbered list of state transitions, then implement the happy path.

---

## 13. Solutions

### Beginner

1. Add `sku: string` to `FormValues`, validate with `if (!/^[A-Z0-9]{3,10}$/.test(values.sku)) errors.sku = 'SKU must be 3–10 uppercase letters or digits.'`, and include `sku: values.sku` in the draft. The response contains it (json-server stores whatever you send), and a follow-up `GET /products/:id` proves persistence. Note that nothing stops a *second* product from having the same SKU — that is a server rule.
2. Keeping the last name in state prevents an accidental duplicate *from this form in this session*, and nothing more: another tab, another user, a refresh, or a direct API call all bypass it. Uniqueness is a fact about the database, so only the server can enforce it (usually with a unique index, returning `409`/`422`).
3. `JSON.stringify` produces `{"priceMinor":null,"tags":[]}`. `undefined` and functions are dropped entirely (so `name` is absent, and the server stores its default), `null` survives, `[]` survives (an empty array is a value), and `''` survives as an empty string. Missing vs empty is a real distinction on the wire — that is the lesson.

### Intermediate

1. The bug reproduces because two clicks in one tick share one closure with `pending === false`. The database shows two rows (the lab's own transcript: `"Naive Lamp"=2`). The fix is the ref; the disabled button is the visible half.
2. Insert `created` at the top — it is the server's record, so `id` and all fields are correct. If the list is sorted by price, insert by sorting again with the same comparator, or refetch; appending blindly puts the row in the wrong place, and pagination counts go stale (that is why Part 7's delete file prefers removing-and-reconciling over hand-maintaining counters).
3. On `422`, set field errors from the body (keep the values). On `500`, set a form-level message with a Retry button that calls the same `handleSubmit` logic with the **same draft** — but only after re-checking the ref guard, and never automatically in a loop.
4. `crypto.randomUUID()` in a `useRef` gives one key per form instance (a new key per *submission attempt* would defeat the purpose). Server-side, the key is stored with the created record; a repeat POST with a known key returns the stored record and `200`/`201` instead of creating a second one. The client cannot implement this alone — it is a contract.

### Challenge

1. `Promise.allSettled` gives you `[{status:'fulfilled', value}, {status:'rejected', reason}]` in input order, so mapping results back to rows is straightforward. Practical limits: browsers cap concurrent connections per host (≈6 over HTTP/1.1, more over HTTP/2), and a server has its own limits; a concurrency pool of 4–8 with a progress bar is friendlier than 400 parallel requests, and it lets you cancel the run. At row 400, batch endpoints (`POST /products/bulk`) or a job queue are the real answer — one request that the server processes in bulk beats 400 requests.
2. Persist only what is cheap to lose and safe to store: the form fields, not tokens, not payment details, not anything personal that the user did not type into the form. Clear it on success, expire it (a timestamp), and key it per user. Restoring a draft is a feature that surprises people if it is silent — show a "we restored your draft" banner with a discard button.
3. The sequence: (1) user submits → generate/lookup idempotency key; (2) POST with the key; (3) server checks the key: new → create, known → return the existing order; (4) client stores the key + a `pending` marker before the request, so a reload can re-send the same key instead of creating a new order; (5) on success show the order; on failure keep the key for retry, or expire it after a timeout; (6) a "check status" path for the ambiguous case (the request timed out but the server may have created it). The rule behind all of it: **the client can retry safely only if the server can recognise a repeat.**

---

## 14. Summary

- `POST` creates; it is **not idempotent**, so preventing duplicate submits is a design requirement, not a polish item.
- A create request is `method`, `Content-Type: application/json`, `JSON.stringify(body)`, and a body that matches the API's field names and units (measured: `1299.5` → `129950`).
- **Validate locally first** — the probe sends **0** requests for an invalid form — and still handle the server's `422` by mapping `errors.priceMinor` onto the form's `price` field.
- **A same-tick double click beats every state-based guard** (measured: 2 POSTs vs 1). Use a `useRef` written before the first `await`; keep `disabled`/`pending` for the visible state; use an idempotency key when the write has real-world side effects.
- **Use the response**: the server's `id` and normalised values are the truth; your local copy is a guess.
- On failure, **keep the values**, put messages next to fields, and distinguish `422` (fix the data) from `401` (sign in) from `500` (try later).
- The next three files do the same job for the other three write verbs: `PUT` (replace), `PATCH` (partially update), `DELETE` (remove, with undo).

---

**What's next →** [`06-put-api.md`](./06-put-api.md) turns this form into an **edit** form: prefilling from the server, the "whole record replaced" semantics of `PUT` (including the fields you forget to send), and the lost-update problem that appears the moment two people edit the same row.
