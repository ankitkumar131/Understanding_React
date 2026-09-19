# 06 — PUT APIs: Full Replacement, Prefilled Forms, and Lost Updates

> **Part 7 · API Integration · File 6 of 11**
> Why this file exists: `PUT` means *"here is the new version of this resource"* — the whole thing. That single sentence is behind the most common data-loss bug in app development, and the lab reproduced it: after the `PUT`, the product's `blurb` was **gone**, because the client sent a body without it. This file teaches the edit flow properly: prefill from the server, keep the form from going stale, send a complete body, handle the server's verdict, and protect against two people saving over each other.

---

## 1. What `PUT` means, precisely

| Property | `PUT` | `PATCH` (file 07) |
| --- | --- | --- |
| Semantic | "replace the resource with this" | "apply these changes" |
| Body contains | **every field you want the resource to have** | only the fields that change |
| A field you omit | becomes missing/default (**it is removed**) | is left untouched |
| Idempotent | ✅ yes | ✅ usually |
| Safe | ❌ | ❌ |
| Typical UI | a full edit form with a Save button | a single toggle, a quick inline edit |

Verified in the lab, with the same record:

```text
=== PUT (file 06) — a full replacement ===
PUT /products/TV3WWSe → 200
   blurb before: "Created by the CRUD probe." · after: undefined   ← the field is GONE
   keys after the PUT: id, name, priceMinor, category, inStock
```

```text
=== PATCH (file 07) — a partial update ===
PATCH /products/TV3WWSe {inStock:false} → 200
   inStock=false · name still "Scratch Webcam Cover v2" · priceMinor still 54900
```

The `PUT` was *correct* according to the spec — the client sent a body without `blurb`, so the record no longer has a `blurb`. The server did nothing wrong; the client sent an incomplete "new version".

⚠️ **Servers differ, and that is a trap of its own.** Some implementations (and `json-server`) replace wholesale, dropping missing keys. Others are lenient and treat `PUT` like a merge. Your code must not depend on which one you happen to be talking to: **send the complete record**, and confirm the server's behaviour once with `curl` (as the transcript above does) so you know exactly what you are dealing with.

---

## 2. The edit flow, end to end

```text
1. GET /api/products/p-monitor-arm        → the current record      (file 04)
2. prefill the form with valuesFrom(record)
3. the user edits some fields
4. PUT /api/products/p-monitor-arm        → the record they were shown, with their edits applied
5. 200 + the updated record               → update the screen, show "Saved"
```

Each step has a failure mode this file addresses:

| Step | Failure mode | Defence |
| --- | --- | --- |
| 1 | the record was deleted meanwhile | a `404` state (file 04, section 7) |
| 2 | the form was created before the record arrived | render the form only when the record exists |
| 3 | the user navigates between two edit pages | force a remount with `key={record.id}` (section 3) |
| 4 | an incomplete body deletes fields | build the body from the **loaded record** plus the edits (section 4) |
| 5 | somebody else saved first | `ETag`/`If-Match` → `412` (section 6) |

---

## 3. Prefill without staleness

A form that keeps its own copy of the record is a form that goes stale — measured in Part 5, section F of the communication lab:

```text
   after the prop changes to ₹3799:
     stale   = ₹ 4999.00   ← useState kept the first value forever
     derived = ₹ 3799.00   ← no state at all, always correct
```

`ProductForm` initialises `values` once (`useState(() => valuesFrom(product))`), which is right *when the component mounts with the record already loaded*. The routes must therefore guarantee that:

```tsx
// File: src/part7/EditProductPage.tsx
import { Link, useParams } from 'react-router';
import { useEffect, useState } from 'react';
import { HttpError } from '../api/http';
import { getProduct } from '../api/products';
import type { ApiProduct } from '../api/types';
import { ProductForm } from './ProductForm';

export function EditProductPage() {
  const { productId = '' } = useParams();
  const [product, setProduct] = useState<ApiProduct | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setProduct(null);
    setError(null);

    void (async () => {
      try {
        setProduct(await getProduct(productId, controller.signal));
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof HttpError && caught.status === 404 ? 'That product no longer exists.' : 'Could not load the product.');
      }
    })();

    return () => controller.abort();
  }, [productId]);

  if (error) {
    return (
      <section>
        <p role="alert">{error}</p>
        <Link to="/products">Back to all products</Link>
      </section>
    );
  }

  if (product === null) return <p>Loading product…</p>;

  // key: navigating straight from one edit page to another remounts the form,
  // so the inputs are re-initialised from the newly loaded record.
  return <ProductForm key={product.id} product={product} />;
}
```

`key={product.id}` is doing real work here. Part 6 measured that changing a route param **re-renders** the matched component rather than remounting it, and Part 5 measured the consequence for state initialised from props (it stays at the first value). The `key` forces React to throw the old component away and build a new one whenever the id changes — so the form can never show one product's data while saving another's.

| Approach | Result |
| --- | --- |
| `<ProductForm product={product} />` | navigating `/edit/p-mouse` → `/edit/p-keyboard` keeps the **old** values |
| `<ProductForm key={product.id} product={product} />` | a fresh form per product — the correct default |
| `<ProductForm product={product} />` + `useEffect` syncing on `product` | works, but you re-implement what `key` does, and you fight the user's in-progress typing |

---

## 4. Building a complete `PUT` body

The API layer (file 04) already has the call:

```ts
// File: src/api/products.ts
export function replaceProduct(id: string, product: ApiProductDraft): Promise<ApiProduct> {
  return sendJson<ApiProduct>(`products/${id}`, 'PUT', product);
}
```

And `ProductForm` always sends **all five** draft fields, whether or not the user touched them:

```text
body sent: {"name":"Monitor Arm","priceMinor":379900,"category":"accessories","blurb":null,"inStock":true}
```

That is the whole trick: `ApiProductDraft` is `Pick<ApiProduct, 'name' | 'priceMinor' | 'category' | 'blurb' | 'inStock'>`, so a body of that type is complete **by construction**. A field cannot be forgotten, because TypeScript will not compile the object without it.

```ts
// Three ways to get a complete PUT body, in order of preference
const draft: ApiProductDraft = {                                  // 1. build it explicitly (the form does this)
  name: values.name.trim(),
  priceMinor: Math.round(Number(values.price) * 100),
  category: values.category,
  blurb: values.blurb.trim() === '' ? null : values.blurb.trim(),
  inStock: values.inStock,
};

// 2. spread the record you loaded, then apply edits — safe because every key is present
const updated: ApiProductDraft = { ...loadedRecord, name: 'New name', blurb: null };

// 3. ❌ never: { name: 'New name' } — that deletes priceMinor, category, blurb and inStock
```

⚠️ Option 2 has a hidden risk: the record you loaded may contain **server-managed fields** (`updatedAt`, `createdBy`, `id`) that are not writable. Spreading them into a `PUT` body sends them back; a strict server rejects the request, and a naive one may accept data it should own. Prefer option 1 for anything that matters.

---

## 5. What the server sends back, and what to do with it

Verified (case F of the form transcript):

```text
   request: PUT http://127.0.0.1:3001/products/p-monitor-arm
   body sent: {"name":"Monitor Arm","priceMinor":379900,"category":"accessories","blurb":null,"inStock":true}
   messages: Saved Monitor Arm (id p-monitor-arm)
   after:       {"name":"Monitor Arm","priceMinor":379900,"category":"accessories","blurb":null,"inStock":true,"id":"p-monitor-arm"}
   blurb became null (empty textarea → null in the draft) and the price is 379900
```

A `200 OK` with the stored record is the strongest possible confirmation: the server's version — not your assumption about it — is what you now display. Three choices for the UI:

| Approach | Code | When |
| --- | --- | --- |
| Trust the response | `setProduct(response)` | the server normalises data (trimming, rounding, computing fields) |
| Refetch | `setReloadToken(t => t + 1)` | other records changed too (a list page behind you) |
| Optimistic | update state, roll back on failure | rare for a full edit; the user is watching a Save button anyway |

The `ProductForm` uses the response (`setSaved(result)`) and shows `Saved Monitor Arm (id p-monitor-arm)`. Note what it does **not** do: it does not tell the user "saved" *before* the server answers, because a `PUT` can be rejected for reasons the client cannot know.

---

## 6. Lost updates: the conflict two people cannot see

Two editors, one record:

```text
10:00  Asha loads Monitor Arm (price ₹3,499)
10:01  Ben  loads Monitor Arm (price ₹3,499)
10:02  Asha changes the price to ₹3,799 and saves        → 200, server has 3799
10:03  Ben  (still looking at ₹3,499) changes the name and saves
        → his body carries priceMinor: 349900 — Asha's price change is overwritten
```

Ben never saw Asha's edit, and his `PUT` — being a **full replacement** — silently reverted it. This is a *lost update*, and it is a protocol problem, not a React problem. The defences, in order of effort:

| Defence | How it works | Cost |
| --- | --- | --- |
| **Optimistic locking with `If-Match`** | the server sends an `ETag`; you send it back on save; the server answers `412 Precondition Failed` if the record moved on | one header, one error branch |
| **Version field** | the record has `version: 7`; you send the version you loaded; the server rejects a mismatch with `409` | a schema change |
| **Last-write-wins** | nothing — the last save wins and the earlier edit vanishes | free, and occasionally catastrophic |
| **Refetch before save** | `GET` the record again, show a diff, let the user decide | more UI |

```ts
// Optimistic locking with fetch () — the headers are the whole implementation
const response = await fetch(`/api/products/${id}`, { headers: { Accept: 'application/json' } });
const etag = response.headers.get('etag');

await fetch(`/api/products/${id}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : {}) },
  body: JSON.stringify(draft),
});
// → 412 Precondition Failed when somebody else saved in between
```

```ts
// The UI branch you need for that 412
if (error instanceof HttpError && error.status === 412) {
  setFormError('This product changed while you were editing it. Reload to see the current values, then re-apply your changes.');
  return;   // never overwrite silently
}
```

⚠️ **"Someone else changed it" is a product decision, not just an error code.** The three reasonable behaviours: block the save and offer a reload (safest), show a field-by-field diff (best UX for small forms), or merge automatically (only for genuinely independent fields). What is *not* reasonable is a silent overwrite.

`PUT` is idempotent, which is worth something here: if the response is lost and the user clicks Save again, the server ends up in the same state — no duplicate records, unlike the `POST` case in file 05.

---

## 7. `PUT` versus `PATCH`: choosing for the screen in front of you

| The screen | Use | Why |
| --- | --- | --- |
| A full edit form with Save | **`PUT`** | the form *is* the new version of the record; all fields are on screen |
| A single toggle ("in stock") | **`PATCH`** | replacing the whole record to change one boolean invites data loss |
| Inline edit of one cell | **`PATCH`** | same reason |
| A wizard that edits different field groups | **`PATCH` per step** (or a `PUT` of the accumulated model) | each step owns a subset |
| Import/replace from a file | **`PUT`** | replacement is the intent |
| A drag-and-drop reorder | **`PATCH`** on positions | only positions change |

The test is simple: **does the request body describe the entire resource?** If yes, `PUT`; if it describes a change, `PATCH`. File 07 takes `PATCH` apart in detail, including the "send only what changed, and only what you own" rule.

---

## 8. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | sending only the edited fields with `PUT` | other fields vanish (verified: `blurb` disappeared) | send a complete `ApiProductDraft` |
| 2 | assuming your server merges on `PUT` | works locally, destroys data in production | confirm with `curl`; treat `PUT` as replacement |
| 3 | spreading server-managed fields into the body | `400`s, or writing `updatedAt` yourself | build the draft explicitly |
| 4 | prefilling a form with `useState(props)` and no `key` | the previous record's values are saved onto the new one | `key={record.id}` on the form (verified in Part 5) |
| 5 | rendering the form before the record loads | an empty form that "saves" blank values | render only when the record exists |
| 6 | no `404` branch on the edit route | a blank form for a deleted record | a not-found state with a link back |
| 7 | showing "Saved" before the response | a lie when the server rejects it | show it after the `200` |
| 8 | ignoring `412`/`409` | silent overwrites of someone else's work | handle the conflict in the UI |
| 9 | clearing the form after a failed save | the user loses their edits | keep values on failure (as in file 05) |
| 10 | using `PUT` for a single-field toggle | unnecessary data loss risk, bigger payloads | `PATCH` (file 07) |
| 11 | forgetting `Content-Type: application/json` | an empty body and a `200` that changed nothing | `sendJson` always sets it |
| 12 | saving on every keystroke | a `PUT` per character, last-write-wins chaos | save on submit, or debounce an explicit autosave with conflict handling |

---

## 9. Best practices

1. **Treat `PUT` as full replacement** in your own code, whatever your current server does.
2. **Model the body with a type that cannot be incomplete** (`ApiProductDraft`) so forgetting a field is a compile error.
3. **Load, then prefill, then render** — and `key` the form by record id so switching records cannot mix data.
4. **Convert at the edge** exactly as in file 05: strings → numbers → minor units, `""` → `null`.
5. **Display the server's response**, not your request, as the new truth.
6. **Handle `404`** (gone), **`412`/`409`** (changed under you), **`401`** (session), **`422`** (validation) — four branches, each with a specific message.
7. **Never claim success optimistically** for a save the user is waiting on; the Save button already communicates progress.
8. **Keep `PUT` for whole-record screens and reach for `PATCH`** the moment the request describes a change rather than a replacement.
9. **Send `If-Match`/version identifiers** when the data is shared, and give the user a reload path when the precondition fails.
10. **Test the conflict path** — two probes editing the same record, in any order — because it is the one path nobody exercises by hand.

---

## 10. Practice

### Beginner — see the replacement happen

1. With the API running, create a product, then `PUT` it with only two fields (`name`, `priceMinor`) using `curl`. `GET` the record: which fields disappeared? Explain in one sentence why the server did what it did.
2. Repeat with `PATCH` and the same two fields. Compare the two results side by side, and write down the sentence that describes the difference.
3. In the app, edit a product through the form and watch the Network tab: confirm the body contains **five** fields even though you changed only one, and that the response body is the full record.
4. `PUT` the same record twice with the same body. Confirm both responses are `200` and the record is identical, then explain how that differs from the `POST` case in file 05.

### Intermediate — prefill, staleness, and conflicts

1. Build `EditProductPage` (section 3) for two products and navigate directly from `/products/p-mouse/edit` to `/products/p-keyboard/edit`. Remove the `key={product.id}` and prove the bug: which values are shown, and which product do they belong to?
2. Add optimistic locking to the lab: the middleware returns an `ETag` header based on the record's JSON; your save sends `If-Match`. Then simulate the conflict — load the edit page, `PUT` the record with `curl` to change it, and press Save in the browser. What status comes back, and what does the user see?
3. Implement the "reload and re-apply" recovery for that `412`: fetch the current record, show the user which fields differ, and let them re-save deliberately.
4. Write a probe that asserts: `PUT` with a complete draft keeps all five fields; `PUT` with two fields drops the other three; a `404` on a missing id renders the not-found branch.

### Challenge — a real edit workflow

1. Turn the edit page into a three-part workflow: a **form**, a **preview** of the record as the server currently has it, and a **diff** of only the changed fields. The Save button sends a `PUT`; the diff must be computed from the loaded record and the current form values.
2. Add a "discard changes" button that restores the loaded record (and warns if the form is dirty when the user navigates away — Part 8 shows the router-level version of this).
3. Make the save resilient: retry **once** on a network failure (a `PUT` is idempotent, file 10), never on a `412`, and never silently.
4. Write the test list (as text) a reviewer should run before this screen ships: which status codes, which edge values (empty description, zero price, a 200-character description), which concurrency scenario, and what the user must see in each case.

---

## 11. Solutions

### Beginner

1. `curl -X PUT http://127.0.0.1:3001/products/<id> -H 'Content-Type: application/json' -d '{"name":"Only Two Fields","priceMinor":100}'` leaves a record with exactly those keys — `category`, `blurb` and `inStock` are gone (verified: `keys after the PUT: id, name, priceMinor, category, inStock` in the equivalent probe). The server interpreted `PUT` as "this is the new resource", so anything absent is absent. It did not "lose" your data; the request described a smaller resource.
2. `PATCH` with the same two fields changes only those two; `category`, `blurb` and `inStock` survive (verified). The sentence: *`PUT` replaces the resource, `PATCH` updates the fields you send.*
3. The request body has all five fields, and the response body is the full record including `id` — because `ApiProductDraft` requires every field and the server echoes the stored record.
4. Two identical `PUT`s both answer `200` and leave the same state — no duplicates, because `PUT` is idempotent (file 01, section 4). Two identical `POST`s create two records. That asymmetry is what makes a retry policy safe for `PUT` and dangerous for `POST`.

### Intermediate

1. Without the `key`, navigating between edit pages keeps the form's initial state: the inputs still show the **first** product's name and price while the URL (and the Save request) targets the second. With `key={product.id}` React remounts the form and `useState(() => valuesFrom(product))` re-runs — the values match the id in the URL. (This is the same trap the Part 5 lab measured for `useState` initialised from props.)
2. A minimal `ETag` middleware:

```js
// server/middlewares.cjs (addition, before the other rules)
const crypto = require('node:crypto');

if (method === 'GET' && /^\/products\/[^/]+$/.test(req.path)) {
  res.set('ETag', `"${crypto.createHash('sha1').update(JSON.stringify(originalJson)).digest('hex').slice(0, 12)}"`);
}
```

   json-server 0.17 does not implement `If-Match`, so for a realistic test either write a small Express route alongside it or simulate the server's answer (a `412` middleware triggered by `?stale=1`). The important part is your client's behaviour: on `412`, do not overwrite — show the conflict and offer a reload.
3. The recovery flow:

```ts
async function recoverFromConflict() {
  const current = await getProduct(productId);      // what the server has now
  setServerVersion(current);
  setFormError(null);
  setConflict({ current, mine: values });           // show the differences
}
```

   Then the user either re-applies their values onto `current` and saves again, or abandons their edit. Nothing is written until they choose.
4. The probe's three assertions are the three behaviours the transcript already demonstrates: a complete draft preserves all fields, a partial draft drops the rest, and the `404` branch renders "That product no longer exists." (the same shape as `ProductDetailPage` in file 04).

### Challenge

```tsx
// File: src/part7/EditProductPage.tsx (diff + save, condensed)
const changed = useMemo(
  () =>
    Object.entries(valuesToDraft(values)).filter(([key, value]) => value !== loaded[key as keyof ApiProductDraft]),
  [values, loaded],
);

// Preview: what the server has right now
<p className="server-version">{loaded.name} · ₹{(loaded.priceMinor / 100).toFixed(2)} · {loaded.inStock ? 'in stock' : 'out of stock'}</p>

// Diff: only what the user actually changed
<ul className="diff">
  {changed.length === 0 ? <li>No changes yet.</li> : changed.map(([key, value]) => <li key={key}>{key}: {String(value)}</li>)}
</ul>

// Save: a PUT of the complete draft, never a partial body
<button type="submit" disabled={pending || changed.length === 0}>{pending ? 'Saving…' : 'Save changes'}</button>
```

The reviewer's test list for this screen: `200` (happy path), `401` (session expired → sign-in prompt, values kept), `403` (no permission → explain, values kept), `404` (deleted → not-found branch), `412`/`409` (conflict → reload path), `422` (field errors mapped), network failure (one retry for a `PUT`, then a clear message — file 10), empty description (becomes `null`, not `""`), zero/`NaN` price (blocked by validation), 200-character description (blocked by validation), overlapping edits from two tabs (the conflict path), and a "dirty form" navigation warning.

---

## 12. Summary

- `PUT` **replaces the whole resource**: omit a field and it is removed (verified — the `blurb` disappeared).
- Model the body with a **type that cannot be incomplete** (`ApiProductDraft`), and build it in one place with the same conversions as file 05.
- **Load → prefill → render**, and put `key={record.id}` on the form so switching records cannot mix data (Part 5's stale-state measurement explains why).
- **Show the server's response** as the new truth; keep the user's input on failure; handle `401`, `404`, `412`/`409` and `422` explicitly.
- Two editors on one record produce **lost updates** unless you send an `If-Match`/version and handle `412`; that is a product decision, not just an error code.
- `PUT` is **idempotent** (a retry is safe, unlike `POST`), and it is the right verb whenever the screen describes the entire resource — reach for `PATCH` when the request describes a change.

---

**What's next →** [`07-patch-api.md`](./07-patch-api.md): partial updates. Verified side by side with `PUT` (`inStock:false` changed while `name` and `priceMinor` survived), plus the rules that make `PATCH` safe: send only fields the user actually changed, never patch a field you do not own, distinguish "set to null" from "not sent", and decide per-control between pessimistic, optimistic, and debounced saves.
