# 05 — POST APIs: Creating Records, Validation, and the Double-Submit Problem

> **Part 7 · API Integration · File 5 of 11**
> Why this file exists: reads fail harmlessly; writes are permanent. This file builds a real create form end to end — typed state, field-by-field validation *before* the request, a submit handler that cannot fire twice, `201 Created` and the server-assigned id, and `422` field errors mapped back onto the exact inputs that caused them. Two measurements drive the design: a state-only double-submit guard let **two** `POST`s through in one tick, a synchronous ref guard let **one**.

---

## 1. What `POST` means

`POST` **creates a new resource** in a collection. The client sends data; the server decides the identity (usually an id) and returns the created record.

```text
POST /api/products
Content-Type: application/json

{ "name": "Desk Lamp", "priceMinor": 129950, "category": "accessories", "blurb": "Warm light, USB-C.", "inStock": false }
```

```text
201 Created
{ "name": "Desk Lamp", "priceMinor": 129950, …, "id": "w0xjz_C" }
```

Verified against the lab API:

```text
POST /products → 201 · server-assigned id="TV3WWSe"
   body back: {"name":"Scratch Webcam Cover","priceMinor":49900,"category":"accessories","blurb":"Created by the CRUD probe.","inStock":true,"id":"TV3WWSe"}
```

Two facts from file 01 that shape everything here:

1. **`POST` is not idempotent.** Sending it twice creates two records (file 01, section 4) — and the lab made this concrete: a body-less `POST` returned `201` and left a stray seventh product in the database. The double-submit section below is not theoretical pedantry; it is the difference between one order and two.
2. **`201 Created` carries the new resource in the body.** That response is your only reliable source of the server-assigned id, timestamps, and any server-side defaults — so put it into your state instead of refetching.

### `POST` versus `PUT` versus `PATCH`

| Question | `POST /collection` | `PUT /collection/id` | `PATCH /collection/id` |
| --- | --- | --- | --- |
| Who decides the id? | the **server** | the **client** | — |
| Creates a record? | yes | only if the server implements "upsert" (json-server answered `404` instead) | no |
| Sends the whole record? | yes (a new one) | yes (a replacement) | no, only the changed fields |
| Safe to repeat? | **no** | yes | yes (usually) |
| Typical use | "Create product" | "Save this product" (file 06) | "Toggle in stock" (file 07) |

---

## 2. The form component, in one piece

```text
shop-admin/src/
├── api/
│   ├── http.ts          ← getJson / sendJson / HttpError (file 04)
│   ├── types.ts         ← ApiProduct, ApiProductDraft
│   └── products.ts      ← createProduct, replaceProduct, updateProduct, deleteProduct
└── part7/
    └── ProductForm.tsx  ← this file: create mode and edit mode in one component
```

```tsx
// File: src/part7/ProductForm.tsx (complete)
import { useRef, useState, type FormEvent } from 'react';
import { HttpError } from '../api/http';
import { createProduct, replaceProduct } from '../api/products';
import type { ApiProduct, ApiProductDraft } from '../api/types';

type FieldErrors = Partial<Record<'name' | 'price' | 'blurb' | 'category', string>>;

interface FormValues {
  name: string;
  price: string; // rupees, as typed
  category: ApiProductDraft['category'];
  blurb: string;
  inStock: boolean;
}

const emptyValues: FormValues = { name: '', price: '', category: 'accessories', blurb: '', inStock: true };

function valuesFrom(product: ApiProduct): FormValues {
  return {
    name: product.name,
    price: (product.priceMinor / 100).toFixed(2),
    category: product.category,
    blurb: product.blurb ?? '',
    inStock: product.inStock,
  };
}

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
  const submittingRef = useRef(false);          // the synchronous guard (section 7)

  function setField<K extends keyof FormValues>(field: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;

    const errors = validate(values);
    setFieldErrors(errors);
    setFormError(null);
    setSaved(null);
    if (Object.keys(errors).length > 0) return;

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
      <h2>{isEdit ? `Edit ${product.name}` : 'New product'}</h2>

      {saved && <p className="saved" role="status">{isEdit ? 'Saved' : 'Created'} <strong>{saved.name}</strong> (id {saved.id})</p>}
      {formError && <p className="form-error" role="alert">{formError}</p>}

      <label>
        Name
        <input
          className="f-name"
          value={values.name}
          onChange={(event) => setField('name', event.target.value)}
          aria-invalid={fieldErrors.name !== undefined}
          aria-describedby={fieldErrors.name ? 'name-error' : undefined}
        />
      </label>
      {fieldErrors.name && <p className="f-name-error" id="name-error">{fieldErrors.name}</p>}

      <label>
        Price (₹)
        <input className="f-price" inputMode="decimal" value={values.price} onChange={(event) => setField('price', event.target.value)} />
      </label>
      {fieldErrors.price && <p className="f-price-error">{fieldErrors.price}</p>}

      <label>
        Category
        <select className="f-category" value={values.category} onChange={(event) => setField('category', event.target.value as FormValues['category'])}>
          <option value="audio">Audio</option>
          <option value="keyboards">Keyboards</option>
          <option value="accessories">Accessories</option>
        </select>
      </label>

      <label>
        Description
        <textarea className="f-blurb" value={values.blurb} onChange={(event) => setField('blurb', event.target.value)} />
      </label>
      {fieldErrors.blurb && <p className="f-blurb-error">{fieldErrors.blurb}</p>}

      <label>
        <input className="f-instock" type="checkbox" checked={values.inStock} onChange={(event) => setField('inStock', event.target.checked)} />
        In stock
      </label>

      <button className="f-submit" type="submit" disabled={pending}>
        {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
      </button>
    </form>
  );
}
```

Line by line, the parts that are doing real work:

| Line | Why it is there |
| --- | --- |
| `useState<FormValues>(() => …)` | **every field is a string or boolean**, exactly as the DOM hands it over. Numbers are converted once, at the edge (section 4) |
| `validate(values)` returning an **object keyed by field** | the error belongs to an input, not to the form; a single `message` string cannot be shown in the right place |
| `setSubmitted(false)`… `if (Object.keys(errors).length > 0) return;` | validation happens **before** any network work, so an empty form cannot even reach the API |
| `Math.round(Number(values.price) * 100)` | rupees → paise, with rounding, because `1299.5 * 100` is `129949.999…` in floating point in general |
| `blurb.trim() === '' ? null : values.blurb.trim()` | the API's contract is `string | null`; "no description" is `null`, not `""` |
| `if (submittingRef.current) return;` | the *synchronous* double-submit guard (section 7 explains why `pending` alone is too slow) |
| `submittingRef.current = true; setPending(true);` | the ref protects the logic, the state drives the UI. Both, always |
| `finally { submittingRef.current = false; setPending(false); }` | every exit path — success, validation error, `500`, abort — must release the guard, or the form is dead forever |
| `saved && <p role="status">` | `role="status"` announces the success politely to screen readers (Part 6, file 08) |
| `aria-invalid` + `aria-describedby` | the error text is *associated* with the field, so assistive tech reads it with the input |
| `noValidate` on the `<form>` | stops the browser's own bubble messages so the app's messages are the single, consistent source of feedback |

---

## 3. Controlled inputs: one source of truth per field

Every input is controlled — `value={values.name}` with `onChange` writing back into the same state object. The mechanics were established in Part 5 (files 03–05); the Part 7 rules are:

1. **The form's state type is `FormValues`**, not `ApiProductDraft`. The two differ on purpose: the UI works in strings (a number input holds `""` while the user types `2`, and `Number("")` is `0`), while the API wants numbers and `null`.
2. **The conversion happens exactly once**, in `handleSubmit`, so there is exactly one place where "what the user typed" becomes "what we send".
3. **Validate the *parsed* value, not the string.** `Number("abc")` is `NaN` — that is a valid check (`Number.isNaN`), while `"abc" > 0` is nonsense.
4. **Never trust the field type.** `<input type="number">` still gives you a string in `event.target.value`, and a determined user can type `1e5` or paste text into it.

⚠️ **Client-side validation is for the user's benefit, not for security.** It gives fast, friendly feedback; it stops nothing. Anyone can call your API with `curl` (file 01, section 10) — so the server must re-validate everything, and its answer is the authoritative one. That is exactly why the 422 path below exists.

---

## 4. Units, `null`, and other edge conversions

Small decisions in `handleSubmit` that prevent an entire class of bugs:

| Field | User sees | State holds | Sent to the API |
| --- | --- | --- | --- |
| price | `1299.5` | `"1299.5"` (string) | `priceMinor: 129950` (integer paise) |
| description | (empty textarea) | `""` | `blurb: null` |
| description | `"  Warm light "` | with spaces | `blurb: "Warm light"` (trimmed) |
| in stock | unchecked | `false` | `inStock: false` |
| category | "Accessories" | `"accessories"` | `category: "accessories"` |

Two rules generalise:

- **Money is stored in the smallest unit as an integer.** `1299.5 * 100` exactly is `129950` here, but `0.1 + 0.2 !== 0.3` in binary floating point, and a rounding bug in a price is a business bug. Convert once with `Math.round`, and keep every server-side amount an integer.
- **"Empty" has exactly one representation on the wire.** Sending `blurb: ""` and `blurb: null` and omitting the field are three different things to a server; pick one contract (`null` above) and convert in the same place every time.

---

## 5. What `201` gives you, and what to do with it

Verified response body from the lab:

```text
body sent: {"name":"Desk Lamp","priceMinor":129950,"category":"accessories","blurb":"Warm light, USB-C.","inStock":false}
server now has: w0xjz_C "Desk Lamp" 129950 inStock=false blurb="Warm light, USB-C."
```

The server echoed the record back **with an id the client never had**. Now choose deliberately:

| After a successful create | When it is right | What to write |
| --- | --- | --- |
| **Append the returned record to the list** | the list is already on screen | `setItems((items) => [...items, created])` |
| **Refetch the list** | there is sorting/filtering/pagination the server does | `setReloadToken((token) => token + 1)` — the same lever as file 04 |
| **Navigate to the new record** | the next step is editing it | `navigate(`/products/${created.id}`)` (Part 6, file 08) |
| **Reset the form for another entry** | data entry in bulk | `setValues(emptyValues)` — verified: `form reset? name="" price=""` |

Everything except "append" needs the id from the response, which is why **`POST` responses are never ignored**.

⚠️ The one thing you must *not* do is invent the id client-side (`id: crypto.randomUUID()`) to "save a round trip" unless the API explicitly supports client-generated ids — otherwise your optimistic row and the server's record will disagree forever.

---

## 6. Server-side validation errors: `422` mapped back onto fields

The lab's `?fail=422` middleware answers with the shape real APIs use:

```text
POST /products?fail=422 → 422 · content-type=application/json; charset=utf-8
{
  "error": "validation_failed",
  "message": "The product could not be saved.",
  "errors": { "name": "Name must be at least 3 characters.", "priceMinor": "Price must be a positive number." }
}
```

And the component turns that into field-level feedback:

```text
=== E. the server says no: 422 with field errors ===
   request: POST http://127.0.0.1:3001/products?fail=422
   messages: The server rejected this product. Fix the fields below. | Name must be at least 3 characters. | Price must be a positive number.
   ↑ the field errors came from the SERVER body (errors.name / errors.priceMinor), not from validate()
```

Notice the mapping in the code: the server speaks `priceMinor`, the form speaks `price` — the boundary translates once, and the rest of the component never learns the API's field names. That mapping is the same discipline file 11 formalises.

Three rules for server errors:

1. **`422` (or `400`) with a field map → show the messages under the fields.** Never show a generic "Something went wrong" when the server told you precisely which field failed.
2. **`401` → "your session expired", and send the user to sign in** (Part 6, file 07). Do not retry a `401` (file 10).
3. **Keep the user's input.** A failed submit must never clear the form; the user retypes nothing.

```ts
// The shape used above, typed instead of guessed
interface ValidationErrorBody {
  error: 'validation_failed';
  message: string;
  errors?: Partial<Record<'name' | 'priceMinor' | 'blurb' | 'category', string>>;
}
```

---

## 7. The double-submit problem (measured, not guessed)

A user double-clicks. A slow network makes them click again. A `POST` that runs twice creates two records. The obvious fix — `if (pending) return;` — is **not enough**, because React state updates are asynchronous: in the same tick, the second click handler still sees the old `pending === false`.

```text
=== D. double submit: a synchronous ref guard versus a state-only guard ===
   ProductForm (ref guard): two clicks in one tick → 1 POST(s)
   NaiveForm (state-only guard): two clicks in one tick → 2 POST(s) ← the duplicate is real
   one normal click with a slow server: button disabled=true label="Saving…"
   two impatient clicks while disabled → 1 POST(s) for that submit
   server-side: 1 "Guarded Again Lamp" record (one submit, three clicks)
   server-side totals: "Ref Guard Lamp"=1, "Naive Lamp"=2
```

Read those numbers as the three-layer defence, weakest to strongest:

| Layer | What it stops | What it misses | Cost |
| --- | --- | --- | --- |
| `disabled={pending}` on the button | real user clicks after the re-render (~16 ms later) | two clicks in the same tick, Enter pressed twice, a keyboard repeat | one prop |
| `if (pending) return;` | nothing extra, for the same-tick case | the same tick | one line |
| `if (submittingRef.current) return;` **plus** setting it synchronously | every client-side duplicate, including same-tick | two different tabs, a proxy retry, a flaky network | one `useRef` |
| **Server-side idempotency** (unique constraint, idempotency key) | everything, including the cases the client cannot see | — (costs server work) | the real fix |

The `useRef` guard is not a hack: it is a *synchronous* flag, and synchronous is exactly what "has this submit already started?" needs to be.

```ts
const submittingRef = useRef(false);

async function handleSubmit(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (submittingRef.current) return;      // ← synchronous check
  // …validate…
  submittingRef.current = true;           // ← set BEFORE the first await
  setPending(true);
  try {
    await createProduct(draft);
  } finally {
    submittingRef.current = false;        // ← released on every path
    setPending(false);
  }
}
```

💡 The same reasoning explains two other "impossible" bugs: a `POST` retried automatically by your own retry policy (file 10 — never retry non-idempotent requests), and a form submitted twice because pressing Enter in a text input fires `submit` *and* clicking the button fires another one.

Verified in the transcript: while the server was slow, the button read `Saving…` with `disabled=true`, and two impatient clicks produced **no** extra request. The moment the request finished, the guard released and the form was usable again.

---

## 8. Optimistic or pessimistic? (for a create, pessimistic wins)

| Approach | What the user sees | Fits a create? |
| --- | --- | --- |
| **Pessimistic** (wait, then show) | spinner on the button → "Created Desk Lamp (id w0xjz_C)" | ✅ **yes** — you cannot show a row without the server's id, and the server may reject the data |
| Optimistic (show first, fix later) | the row appears instantly, rolls back on failure | ❌ for a create; ✅ for a delete (file 08) and usually for a field toggle (file 07) |

The rule: **optimistic UI is for changes you are confident about and can undo locally.** Creating a record is neither — you lack the identity and the validation decision.

---

## 9. Where the create form lives in the app

```tsx
// File: src/part7/NewProductPage.tsx
import { Link, useNavigate } from 'react-router';
import { ProductForm } from './ProductForm';

export function NewProductPage() {
  const navigate = useNavigate();

  return (
    <section>
      <nav aria-label="Breadcrumb">
        <Link to="/products">← All products</Link>
      </nav>
      <ProductForm
        onSaved={(created) => {
          // Option A: stay here for bulk entry (the form already reset itself).
          // Option B: go to the record that was just created.
          void navigate(`/products/${created.id}`, { replace: true });
        }}
      />
    </section>
  );
}
```

The `onSaved` callback is the composition lesson from Part 5: `ProductForm` knows how to create a product; the *page* decides what happens next. The same component is reused in edit mode (file 06) — a small `product` prop is the only difference.

---

## 10. Sending something other than JSON

`sendJson` from file 04 always JSON-encodes. Two other bodies you will meet:

```ts
// 1. File upload — never set Content-Type yourself; the browser adds the multipart boundary.
const data = new FormData();
data.set('name', values.name);
data.set('priceMinor', String(draft.priceMinor));
data.set('image', fileInput.files![0]);

await fetch('/api/products', { method: 'POST', body: data });
```

```ts
// 2. Traditional form encoding, for backends that expect it.
const body = new URLSearchParams({ name: values.name, priceMinor: String(draft.priceMinor) });
await fetch('/api/products', { method: 'POST', body });     // Content-Type: application/x-www-form-urlencoded
```

⚠️ Setting `Content-Type: multipart/form-data` by hand **breaks** the upload: `FormData` needs a generated `boundary` parameter that only the browser knows. Let the browser set it, and never set `Content-Type` yourself when the body is `FormData`.

---

## 11. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `if (pending) return;` as the only double-submit guard | duplicate records from a fast double-click (verified: 2 POSTs) | a `useRef` flag set before the first `await` |
| 2 | forgetting `finally` | the form is permanently stuck on `Saving…` after one error | release the guard and `pending` in `finally` |
| 3 | sending the form state as-is | `priceMinor: "1299"` (a string) or `blurb: ""` | convert once, in the submit handler |
| 4 | `Number(values.price)` without validation | `priceMinor: 0` from `NaN` | check `Number.isNaN` and `> 0` first |
| 5 | `Math.round(x * 100)` skipped | prices like `129949.999` | round to the smallest unit, always |
| 6 | clearing the form on failure | the user retypes everything after a `500` | reset only on success |
| 7 | client-side validation treated as protection | invalid data reaches the database | re-validate on the server; map its `422` back |
| 8 | ignoring the `201` body | the list is stale, the id is unknown | use the returned record |
| 9 | `fetch` without `Content-Type` | the server sees an empty body and still answers `201` (verified in file 01) | always send the header with JSON |
| 10 | setting `Content-Type` on a `FormData` upload | `400`/boundary errors, or an empty file | let the browser set it |
| 11 | `noValidate` missing | browser bubbles and app messages disagree | `noValidate` on the form, your messages win |
| 12 | error text rendered far from the field | the user cannot tell which input is wrong | one error node per field, `aria-describedby` linking them |

---

## 12. Best practices

1. **Model the form as its own type** (strings and booleans) and convert to the API shape in exactly one function.
2. **Validate before the request and show errors next to the fields**, with `aria-invalid` and `aria-describedby`.
3. **Guard submits synchronously** with a ref, and also disable the button for the user's benefit.
4. **Keep the input on failure**, reset only on success.
5. **Use the `201` body**: append the returned record, or refetch with the same lever as file 04.
6. **Map server field errors onto the same `fieldErrors` state** the client validator uses — one rendering path for both sources of truth.
7. **Treat `401` as a workflow** ("session expired, sign in"), not as a generic error.
8. **Never retry a `POST` automatically** (file 10) — make the server idempotent if retries are needed.
9. **Prefer pessimistic UI for creates** and optimistic only where rollback is trivial.
10. **Test the sad paths** — `?fail=422`, `?fail=500`, and a slow server — as the transcripts in this file do; the happy path is the one case that never breaks.

---

## 13. Practice

### Beginner — create a product by hand and by form

1. With the API running, create a product using `curl` (file 01, section 10). Then do the same in the browser form and compare: which fields did you *not* have to send, and who decided the id?
2. Delete one of the two records with `curl -X DELETE`. Explain in one sentence why the `POST` created two records but the `DELETE` twice would leave the same state.
3. Open the Network tab, submit an empty form, and confirm **no request** is sent. Then submit a valid one and read: status `201`, `content-type`, and the `id` in the response body.
4. Double-click the submit button as fast as you can on a throttled connection ("Slow 3G" in DevTools). Then repeat with your `submittingRef` removed. Count the records created each time.

### Intermediate — test the form properly

1. Write a jsdom probe (start from `src/dev/form-probe.tsx`) that asserts all of these, printing `PASS`/`FAIL` per line:
   - an empty submit sends **0** requests and shows both field errors;
   - a valid submit sends **1** request with `priceMinor` as an integer;
   - two clicks in one tick send **1** request;
   - a `422` response renders the server's messages under the right fields;
   - a `500` keeps the typed values and shows a form-level error.
2. Add a `unitMinor` and a `taxPercent` field to the API record (edit `server/db.json` and `types.ts`), and send both from the form. Verify with `curl` that the stored record matches what the form sent.
3. Add client-side validation for a **unique name** by calling `GET /api/products?name=<value>` on blur. Explain why the server still needs a unique constraint, and what status code it should return for a conflict (`409`, file 01).

### Challenge — a create flow with navigation and a list that stays correct

1. Build `POST /api/orders` support: add `ApiOrderDraft` and `createOrder` to `src/api/orders.ts`, with fields `customer`, `status` (default `packed`), and three line items summing into `totalMinor`.
2. Build `NewOrderPage` with a validated form, the ref guard, `422` handling, and a success path that navigates to the new order's detail route (Part 6, file 08).
3. Make the orders list (file 04's challenge) update correctly after a create: the new order appears in the right *sort position*, on the correct page, without a full reload. Decide between appending, refetching, and navigating, and write a comment explaining the choice.
4. Prove double-submit safety at the server too: add a middleware that rejects a `POST /orders` whose `customer` + `totalMinor` match a record created in the last 5 seconds with `409 Conflict`, then show your client handling a `409` gracefully (message, no data loss).

---

## 14. Solutions

### Beginner

1. `curl -X POST http://127.0.0.1:3001/products -H 'Content-Type: application/json' -d '{"name":"Desk Lamp","priceMinor":129950,"category":"accessories","blurb":null,"inStock":true}'` → `201` with `"id":"…"` added by the server. The form sent the same fields — you never sent an `id`, and you never set the price in paise yourself. **The server decides identity; the client decides content.**
2. `POST` is not idempotent — two calls create two records (two different ids). `DELETE` is idempotent — the second call answers `404` but the server state is the same as after one call (file 01, section 4).
3. No request appears in the Network tab for an empty submit because `validate()` returns errors and the handler returns before `createProduct` is called. A valid submit shows `POST /api/products` → `201`, `content-type: application/json; charset=utf-8`, and a body containing `"id":"w0xjz_C"`-style text.
4. With the ref guard: 1 record. Without it: 2 records (verified: `"Naive Lamp"=2`). The repeat is exactly the duplicate the guard exists to prevent.

### Intermediate

```ts
// File: src/dev/form-assert-probe.tsx (outline of the five checks)
let posts = 0;
spyFetch(() => posts++);

// 1. empty submit
await submit(container);
check('empty submit sends no request', posts === 0);
check('both field errors are shown', container.querySelectorAll('.f-name-error, .f-price-error').length === 2);

// 2. valid submit
await type(container, '.f-name', 'Probe Lamp');
await type(container, '.f-price', '1299.5');
await submit(container);
check('one request for one submit', posts === 1);

// 3. same-tick double click
await act(async () => {
  button.click();
  button.click();
});
check('two clicks in one tick send one request', posts === 2);   // +1 from the previous step
```

Expected output:

```text
PASS  empty submit sends no request
PASS  both field errors are shown
PASS  one request for one submit
PASS  two clicks in one tick send one request
PASS  the 422 body is rendered per field
PASS  a 500 keeps the typed values
```

2. Sending `unitMinor` and `taxPercent` means: adding them to `ApiProductDraft` (or a new draft type), adding inputs, converting with `Number(...)`/`Math.round` for money, and validating ranges (`taxPercent` between 0 and 100). `curl` verification: `curl -s http://127.0.0.1:3001/products/<id>` shows exactly what the form sent — and if it does not, the difference tells you which side converted wrongly.
3. The uniqueness check on blur is a **courtesy**: it gives the user fast feedback before they submit. It cannot be trusted, because two users can pass the check at the same moment and both submit. The server must enforce uniqueness (a database constraint) and answer **`409 Conflict`**; your client shows "A product with that name already exists" and keeps the form data.

### Challenge

```ts
// File: src/api/orders.ts (additions)
export interface ApiOrderDraft {
  customer: string;
  status: ApiOrder['status'];
  items: { productId: string; quantity: number }[];
  totalMinor: number;
}

export function createOrder(draft: ApiOrderDraft): Promise<ApiOrder> {
  return sendJson<ApiOrder>('orders', 'POST', draft);
}
```

```tsx
// File: src/part7/NewOrderPage.tsx (success path)
const created = await createOrder(draft);
// Choice: navigate to the detail route, because the next action is usually
// "review the order" — and the list needs a refetch either way, since a new
// order changes the total count and the page the user was on.
void navigate(`/orders/${created.id}`, { replace: true });
```

The comment is the important part of the answer: appending is correct when the list is sorted client-side and unpaginated; refetching is correct when the server sorts or counts. Guessing wrong is how "the new order never appears" bugs get shipped.

Handling `409`:

```ts
if (error instanceof HttpError && error.status === 409) {
  setFormError('An order for that customer with the same total was just created. Check the list before submitting again.');
  return;   // keep the values, offer a way to retry deliberately
}
```

---

## 15. Summary

- `POST` creates a record in a collection; the **server assigns the id**, and the **`201` body is your source for it** (verified: `id w0xjz_C`).
- **Validate before the request** with a per-field error map, and re-validate on the server — client validation is UX, never security.
- Convert at the edge: rupees → **integer paise with `Math.round`**, empty description → **`null`**, one conversion point in `handleSubmit`.
- **Double submits are real** and a state-only guard misses same-tick clicks (verified: 2 `POST`s). A `useRef` flag set before the first `await` sends 1, and a server-side guard is the only complete answer.
- **Use the returned record**: append it, refetch with a reload token, or navigate to it.
- **Map server `422` field errors onto the same field state** the client validator uses; treat `401` as "sign in again"; keep the user's input on every failure.
- Creates are **pessimistic**: you need the server's id and its validation verdict before you can show anything true.

---

**What's next →** [`06-put-api.md`](./06-put-api.md): full replacement. The same form in edit mode, why `PUT` silently deleted a `blurb` field in the lab (`keys after the PUT: id, name, priceMinor, category, inStock`), how to prefill from the server and keep the form in sync when the record changes, `409`/`412` conflict handling for stale edits, and how to decide between `PUT` and `PATCH` for the screen in front of you.
