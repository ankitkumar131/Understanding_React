# 07 — PATCH APIs: Changing One Thing Without Touching the Rest

> **Part 7 · API Integration · File 7 of 11**
> Why this file exists: most user actions are tiny — flip a switch, rename a row, tick a box. Doing that with a `PUT` means sending the whole record back, which is how a single field edit wipes out somebody else's work (file 06). `PATCH` says only what changed. This file covers what `PATCH` means, what "falsey", `null` and *omitted* mean after it, how to build a body containing only the changed fields, and three ways to drive it from the UI — one measured pessimistic, one optimistic (file 08), one debounced.

---

## 1. What `PATCH` means, precisely

`PATCH` applies a **set of changes** to a resource. Fields you do not mention keep their current values.

Verified side by side on the same record:

```text
=== PUT (file 06) — a full replacement ===
PUT /products/TV3WWSe → 200
   blurb before: "Created by the CRUD probe." · after: undefined   ← the field is GONE
   keys after the PUT: id, name, priceMinor, category, inStock

=== PATCH (file 07) — a partial update ===
PATCH /products/TV3WWSe {inStock:false} → 200
   inStock=false · name still "Scratch Webcam Cover v2" · priceMinor still 54900
```

One field in the body; one field changed on the server. Nothing else moved.

| | `PUT` | `PATCH` |
| --- | --- | --- |
| Body describes | the resource's new state | the change to apply |
| Unmentioned fields | **removed**/reset | left alone |
| Good for | a form that shows the whole record | toggles, inline edits, partial updates |
| Body size | the whole record | the changed keys |
| Data-loss risk | high if the body is incomplete | low |

⚠️ **`PATCH` is not automatically safe.** It prevents *accidental* destruction of fields you did not mean to touch. It does not prevent two people patching the **same** field; that still needs `If-Match`/versioning (file 06, section 6). `PATCH` narrows the blast radius; it does not remove the conflict.

---

## 2. Two flavours of `PATCH`: merge patch and JSON Patch

The HTTP spec deliberately leaves the body format to the media type, and the world settled on two:

**(a) JSON Merge Patch (RFC 7386)** — the common one, and what the lab (and most REST APIs) implement:

```json
PATCH /api/products/p-mouse
Content-Type: application/json

{ "inStock": false }
```

The body looks like the resource, but only the keys you include are applied. To set a field to nothing:

```json
{ "blurb": null }
```

**(b) JSON Patch (RFC 6902)** — an array of operations, for lists and precise edits:

```json
PATCH /api/products/p-mouse
Content-Type: application/json-patch+json

[
  { "op": "replace", "path": "/inStock", "value": false },
  { "op": "add", "path": "/tags/-", "value": "sale" }
]
```

| | Merge patch | JSON Patch |
| --- | --- | --- |
| Content type | `application/json` | `application/json-patch+json` |
| Body | `{ "field": value }` | `[{ "op", "path", "value" }]` |
| Sets a field to null | `{ "field": null }` | `{ "op": "replace", "path": "/field", "value": null }` |
| Array operations | replaces the whole array | add/remove/move individual items |
| Used by | most APIs, `json-server` | Kubernetes, some JSON:API implementations |

**Check which one your API implements before writing code.** Sending a merge-patch object to a JSON-Patch endpoint produces a `400` and a confused afternoon.

---

## 3. Omitted, `null`, and `""` are three different things

With merge patch you get a genuinely useful three-way distinction:

| Body | Meaning | Server result |
| --- | --- | --- |
| `{ }` (field omitted) | "do not touch this field" | unchanged |
| `{ "blurb": null }` | "this field has no value" | `blurb: null` (verified) |
| `{ "blurb": "" }` | "this field is an empty string" | `blurb: ""` — a *value*, usually not what you mean |

Verified on the lab API:

```text
PATCH {}             → 200  (a no-op patch is accepted; the record is unchanged)
PATCH {"blurb":null} → 200  (blurb becomes null — null is a VALUE, not "delete the key")
```

In your UI, the "clear the description" action must send `null`, not `""` — and "the user did not edit the description" must send **nothing at all**. The diff builder in section 4 is what keeps those apart.

---

## 4. Send only what changed

The API layer from file 04 already exposes the partial type:

```ts
// File: src/api/products.ts
export function updateProduct(id: string, changes: Partial<ApiProductDraft>): Promise<ApiProduct> {
  return sendJson<ApiProduct>(`products/${id}`, 'PATCH', changes);
}
```

`Partial<ApiProductDraft>` is the honest type for the body: any subset of the writable fields. What it does *not* do is stop you sending fields the user never touched, so build the body from a diff:

```ts
// File: src/part7/fieldDiff.ts (a small, testable helper)
import type { ApiProduct, ApiProductDraft } from '../api/types';

export function changedFields(before: ApiProduct, next: ApiProductDraft): Partial<ApiProductDraft> {
  const changes: Partial<ApiProductDraft> = {};

  (Object.keys(next) as (keyof ApiProductDraft)[]).forEach((key) => {
    if (before[key] !== next[key]) changes[key] = next[key] as never;
  });

  return changes;
}
```

```ts
const changes = changedFields(loaded, draft);
if (Object.keys(changes).length === 0) return;     // nothing to save (section 6)
await updateProduct(loaded.id, changes);
```

```text
loaded:  { name: "Monitor Arm", priceMinor: 349900, category: "accessories", blurb: "Holds 2–9 kg.", inStock: true }
draft:   { name: "Monitor Arm", priceMinor: 379900, category: "accessories", blurb: "Holds 2–9 kg.", inStock: true }
body:    { priceMinor: 379900 }        ← one key on the wire instead of five
```

Two rules that this helper encodes:

1. **Never patch a field the user cannot see or edit.** A hidden field you send back is a field you can corrupt — and on shared data it is how "I only changed the price" becomes "and reset the description".
2. **Never patch a field you do not own.** Server-managed values (`id`, `createdAt`, `updatedBy`, counters) are written by the server; sending them back invites `403`s or silent damage.

---

## 5. The `undefined` trap

JavaScript objects can hold `undefined`, JSON cannot. `JSON.stringify` silently **drops** keys whose value is `undefined`:

```ts
JSON.stringify({ inStock: undefined, name: 'Desk Lamp' });   // '{"name":"Desk Lamp"}'
```

So `updateProduct(id, { inStock: undefined })` sends `{}` — a valid, harmless, **completely useless** request that still returns `200`. That is how a "nothing happened" bug looks on the wire: the request succeeds, the response looks fine, and the field never changed.

Hand-written JSON is worse — a literal `undefined` is a syntax error, and the error body is not even JSON:

```text
PATCH {"blurb":undefined} → 400  body is text/html
   (the body parser: SyntaxError: Unexpected token 'u', "{"blurb":undefined}" is not valid JSON)
```

Three defences:

```ts
// 1. Build the body with the diff helper (undefined never enters it).
const changes = changedFields(loaded, draft);

// 2. Strip undefined defensively before sending.
const body = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));

// 3. Make "no changes" impossible to submit in the first place (section 6).
if (Object.keys(body).length === 0) return;
```

💡 This is also why a `PATCH` returning `200` is not proof that anything changed. Compare the response's fields with what you sent:

```ts
const updated = await updateProduct(id, changes);
const stillWrong = Object.entries(changes).filter(([key, value]) => updated[key as keyof ApiProduct] !== value);
if (stillWrong.length > 0) setNotice(`The server did not apply: ${stillWrong.map(([key]) => key).join(', ')}`);
```

---

## 6. Don't send an empty patch

A `PATCH` with `{}` is accepted (`200`, nothing changes — verified), but it is still a wasted round trip, a spurious entry in the audit log, and a chance to overwrite something: if the server attaches `updatedAt`/`updatedBy` to *any* patch, an empty save bumps them anyway.

```tsx
// Disable the save control when there is nothing to save.
const changes = changedFields(loaded, draft);
const nothingToSave = Object.keys(changes).length === 0;

<button type="submit" disabled={pending || nothingToSave}>
  {pending ? 'Saving…' : nothingToSave ? 'No changes' : 'Save changes'}
</button>
```

The same principle applies to a toggle: the control already knows the current value, so a "click" that sets the value it already has should be a no-op.

---

## 7. Three ways to drive a `PATCH` from the UI

### (a) Pessimistic — the row freezes until the server answers

This is what the lab's `ProductsTable` does, and it is the right default for a **single field with a visible state** (stock, status, published):

```tsx
/** PATCH one field — the row is frozen until the server answers (pessimistic). */
async function toggleStock(product: ApiProduct) {
  setBusyRow(product.id);
  setNotice(null);
  try {
    const updated = await updateProduct(product.id, { inStock: !product.inStock });
    setState((current) => (current.status === 'ready' ? { ...current, items: current.items.map((item) => (item.id === updated.id ? updated : item)) } : current));
    setNotice(`${updated.name} is now ${updated.inStock ? 'in stock' : 'out of stock'}.`);
  } catch (error) {
    setNotice(`Could not update ${product.name}: ${error instanceof Error ? error.message : 'unknown error'}`);
  } finally {
    setBusyRow(null);
  }
}
```

Verified behaviour, from `/tmp/part7-table.txt`:

```text
=== A. PATCH a single field: the row waits for the server (pessimistic) ===
   immediately after the click: "Optimistic Lamp₹111In stockSaving…"
   button label while pending: "Saving…"
   after the response:          "Optimistic Lamp₹111Out of stockMark in stock Delete"
   notice: Optimistic Lamp is now out of stock.
   request: PATCH http://127.0.0.1:3001/products/MUI4K4E?delay=400 body={"inStock":false}
   server: status=200 inStock=false name=Optimistic Lamp priceMinor=11100
   ↑ a PATCH sent only { inStock } — the name and price were untouched
```

Notice the four properties worth copying:

- **The row's state does not change until the server agrees** — the label still reads `In stock` while `Saving…` is showing. No lie is displayed.
- **Only the changed key is on the wire** (`body={"inStock":false}`), and the server confirmed `name` and `priceMinor` survived.
- **The response is merged into the list by id**, not by index (Part 5, file 05: index-as-key breaks on reorder/removal).
- **The failure path leaves the row exactly as it was**, with a specific message.

### (b) Optimistic — flip now, roll back if the server refuses

Best for toggles the user is confident about and for fast, repeated clicks (a star, a like, a checkbox in a list). The mechanics — including the rollback and the "already gone" case — are measured in file 08's table transcript, because deletes and optimistic toggles share the same pattern.

```tsx
async function toggleOptimistic(product: ApiProduct) {
  const next = { ...product, inStock: !product.inStock };
  updateRow(next);                                            // 1. show it immediately
  try {
    const saved = await updateProduct(product.id, { inStock: next.inStock });
    updateRow(saved);                                         // 2. reconcile with the server
  } catch {
    updateRow(product);                                        // 3. roll back to the snapshot
    setNotice(`Could not update ${product.name}.`);
  }
}
```

### (c) Debounced autosave — for free-text fields

Typing sends a patch per keystroke only if you let it. Debounce (file 09's `useDebouncedValue`, or a timer in a ref), and make the field's dirty state visible (`Saving…` / `Saved`):

```tsx
// The pattern, in outline: the form stays controlled, the network call is debounced,
// and the last write wins. Add an If-Match header if two people can edit the same field.
useEffect(() => {
  if (name === loaded.name) return;
  const timer = setTimeout(() => {
    void updateProduct(loaded.id, { name });
  }, 600);
  return () => clearTimeout(timer);
}, [name, loaded.name, loaded.id]);
```

| Pattern | Feels | Fits | Test it with |
| --- | --- | --- | --- |
| Pessimistic | deliberate, safe | toggles, status changes, anything with consequences | a slow server (`?delay=800`) |
| Optimistic | instant | likes, stars, checkboxes, deletes | a failing server (`?fail=500`) |
| Debounced autosave | invisible | notes, titles, descriptions | fast typing + `AbortController` |

---

## 8. The server may not validate types — and that is a real risk

Verified, and worth reading twice:

```text
PATCH {"priceMinor":"9.99"} → 200  body: { "priceMinor": "9.99", ... }
   ← the server accepted a STRING where a number belongs and stored it.
```

The lab's `json-server` has no schema, so it stored a string where the rest of the codebase expects an integer. Your TypeScript types said `priceMinor: number`; the API accepted `"9.99"`; the database now contains a lie. Later, some component will call `priceMinor.toFixed(2)` and crash — in a completely different file, hours after the request that caused it.

Three layers, all of which are needed:

1. **Client types** stop *you* from writing the wrong thing in the app.
2. **Server validation** stops everyone else (a different client, a script, `curl`). Without it, the database is only as good as your most careless caller.
3. **Response validation** (file 11) stops a broken server from poisoning your UI — parse and check what comes back, then you find out at the boundary, not three components later.

---

## 9. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | sending every field with `PATCH` | it behaves like a `PUT`; the data-loss risk is back | send only the diff |
| 2 | `{ inStock: undefined }` | `JSON.stringify` drops it → `{}` sent, `200` returned, nothing changed | build the body from the diff, strip `undefined` |
| 3 | `""` where `null` is meant | an empty string in the database | convert at the edge (`"" → null`) as in file 05 |
| 4 | sending an empty patch | a useless round trip; `updatedAt` may still bump | disable the control when nothing changed |
| 5 | patching fields the user cannot see | silently corrupting hidden data | own the fields you send |
| 6 | patching server-managed fields | `403`s, or writing `updatedAt` yourself | never send them |
| 7 | optimistic toggle with no rollback | the UI shows a state the server rejected | snapshot → update → reconcile/catch-restore |
| 8 | a debounced save with no cancellation | out-of-order responses (an old value wins) | `AbortController` + a request id, or a trailing-edge flush |
| 9 | trusting `200` as proof | "nothing happened" bugs | compare the response with what you sent |
| 10 | assuming `PATCH` means merge patch | `400`s against a JSON-Patch endpoint | check the media type your API expects |
| 11 | merging the response by array index | the wrong row updates after a sort/delete | merge by `id` |
| 12 | ignoring conflicts because "it is only one field" | two people toggling the same field, the loser is silently reverted | `If-Match` when the field is shared |

---

## 10. Best practices

1. **Send the change, not the record** — build the body with a diff helper and keep it in a testable module.
2. **Distinguish omitted from `null` from `""`** in your UI code, and convert at the boundary.
3. **Never send `undefined`.** Strip it, or make it impossible with the diff helper.
4. **Make the control's pending state visible** (`Saving…`, `disabled`) whether you choose pessimistic or optimistic.
5. **Choose per control**: pessimistic for consequential state, optimistic for confident toggles, debounced for text.
6. **Merge responses by `id`**, never by index.
7. **Show only what changed** in autosave UIs; a diff of one key is much easier to reason about than a whole-record save.
8. **Treat an empty change set as "nothing to save"** and disable the affordance.
9. **Do not rely on your own types for the server's data** — validate the response (file 11).
10. **Patch the same field from two places and prove the outcome** before you ship; conflicts on single fields are easy to miss in review.

---

## 11. Practice

### Beginner — observe the difference

1. With the API running, `PATCH` a product's `inStock` with `curl`. `GET` the record and list every key that changed. Then do the same with `PUT` and `{}` as the body — what happened to the record, and why is that a different (and dangerous) answer?
2. Send `PATCH` with `{ "blurb": null }`, then with `{ "blurb": "" }`. Compare the stored values and write the sentence that distinguishes them.
3. Send a patch containing a field with the wrong type (`{"priceMinor": "9.99"}`) and inspect the response. What did the server do, and what would have caught it?
4. In the app's products table, click a stock toggle on a throttled connection and watch the request and the row: what does the row show while the request is in flight, and what changes when it finishes?

### Intermediate — build the diff and the guards

1. Implement `changedFields(before, next)` (section 4) and use it to build the `PATCH` body from a small edit form. Prove with the Network tab that changing one field sends one key.
2. Add the "no changes" guard and confirm the Save button is disabled until something actually changes.
3. Write a probe that asserts:
   - patching one field leaves the others byte-identical (compare the full JSON before/after);
   - `undefined` values never reach the wire (spy on the request body);
   - an empty diff does not send a request at all;
   - a `500` from the server leaves the row exactly as it was.
4. Add optimistic toggling to the table next to the pessimistic version (two buttons per row), and compare the perceived speed and the failure behaviour. Which one would you ship, and for which field?

### Challenge — a debounced autosave with conflict safety

1. Build a "quick rename" input for a product's `name` that patches 600 ms after the user stops typing, showing `Saving…` and `Saved` states, and cancels its in-flight request when the user types again.
2. Make it safe against out-of-order responses: attach a monotonically increasing request id (a ref) and ignore any response that is not the latest.
3. Combine it with optimistic locking: send `If-Match` from the last `GET`, and on `412` stop autosaving, show "this product changed elsewhere", and offer a reload. Verify with two browser tabs.
4. Write the reviewer's checklist for this control: what happens on a network failure mid-typing, on a `401`, on a `412`, when the user navigates away with an unsaved change, and when the same field is edited in two tabs.

---

## 12. Solutions

### Beginner

1. `PATCH {"inStock":false}` changes exactly one key; every other value is identical in the `GET` afterwards (the table transcript prints `name` and `priceMinor` to prove it). `PUT` with `{}` is a *full replacement with an empty resource*: the server keeps the `id` and drops everything else — the record is destroyed while answering `200`. That is why the verb, not the URL, is the dangerous part.
2. `null` means "no value" and is stored as `null`; `""` means "the empty string" and is stored as `""`. Only one of them is what "the user cleared the description" should mean — and it is `null`, because then a null-check (`blurb ?? 'No description yet.'`) behaves correctly everywhere.
3. The server stored `"9.99"` as a string (verified) — no validation. What would have caught it: server-side schema validation (the only real defence), plus response validation on the client (file 11), which would flag the type mismatch at the boundary instead of letting a `.toFixed()` crash three components later.
4. The row stays as it was and its button reads `Saving…` while the request is in flight; when the response arrives, the new value is rendered and the notice says "… is now out of stock". Nothing changes on screen until the server agrees — that is the pessimistic contract.

### Intermediate

```ts
// File: src/part7/fieldDiff.ts (with the undefined guard built in)
export function changedFields<T extends object>(before: T, next: T): Partial<T> {
  const changes: Partial<T> = {};
  (Object.keys(next) as (keyof T)[]).forEach((key) => {
    const value = next[key];
    if (value === undefined) return;            // never send undefined
    if (before[key] !== value) changes[key] = value;
  });
  return changes;
}
```

```text
PASS  patching one field leaves the rest byte-identical
PASS  undefined never reaches the wire (body was {"inStock":false})
PASS  an empty diff sends no request
PASS  a 500 leaves the row exactly as it was
```

The comparison for the probe: capture `JSON.stringify(before)` and `JSON.stringify(after)` from the server and assert that exactly one key differs — a stronger check than eyeballing the response.

The optimistic-versus-pessimistic answer: ship **optimistic for `inStock`** if the toggle is cheap and reversible and the server is fast, because users click toggles in quick succession and want instant feedback; ship **pessimistic for anything financial or irreversible** (publishing, refunding, cancelling). If in doubt, pessimistic is the honest default — it never shows a state the server did not accept.

### Challenge

```tsx
// File: src/part7/QuickNameEdit.tsx (the essential parts)
const requestId = useRef(0);
const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'conflict'>('idle');

useEffect(() => {
  if (name === loaded.name) return;

  const timer = setTimeout(() => {
    const id = ++requestId.current;
    const controller = new AbortController();
    setStatus('saving');

    void (async () => {
      try {
        const saved = await updateProduct(loaded.id, { name }, controller.signal);   // + If-Match when supported
        if (id !== requestId.current) return;                                       // a newer keystroke won
        setLoaded(saved);
        setStatus('saved');
      } catch (error) {
        if (controller.signal.aborted) return;
        if (id !== requestId.current) return;
        if (error instanceof HttpError && error.status === 412) setStatus('conflict');
        else setStatus('idle');
      }
    })();

    return () => controller.abort();
  }, 600);

  return () => clearTimeout(timer);
}, [name, loaded]);
```

The reviewer's checklist, with the expected behaviour for each row:

| Situation | Expected |
| --- | --- |
| network failure mid-typing | the field keeps the typed value, the status returns to `idle`, the user can retype or blur |
| `401` | stop autosaving, prompt sign-in, keep the text |
| `412` | stop autosaving, show "changed elsewhere", offer reload — never overwrite |
| navigating away unsaved | warn (router `useBlocker` in Part 8) or flush the pending save |
| two tabs on the same field | the second save gets `412` (with `If-Match`) or the user is warned; no silent overwrite |
| fast typing | exactly one request after the typing stops (verified by counting requests in the spy) |

---

## 13. Summary

- `PATCH` applies **only the changes you send**; verified side by side with `PUT`, where one omitted field disappeared and one patched field left the rest intact.
- Check the flavour: **merge patch** (`application/json`, `{ "field": value }`) versus **JSON Patch** (`application/json-patch+json`, an array of operations).
- **Omitted ≠ `null` ≠ `""`** — verified: omitted leaves the field, `null` sets it to null, `""` stores an empty string.
- **Build the body from a diff** (`changedFields`), never send `undefined` (it vanishes from JSON — verified: an empty patch still returns `200`), and disable the control when nothing changed.
- Three UI patterns, all measured somewhere in this part: **pessimistic** (row frozen with `Saving…`, then the server's value), **optimistic** (instant, rollback on failure — file 08), **debounced autosave** (with a request id to defeat out-of-order responses).
- **A `200` from a permissive server is not validation**: the lab stored `"9.99"` in a numeric field. Server validation and response validation (file 11) are the real defences.
- `PATCH` limits accidental damage; it does **not** make conflicts disappear — use `If-Match`/versions for shared fields.

---

**What's next →** [`08-delete-api.md`](./08-delete-api.md): removing records, the only operation where optimistic UI is usually the right default. Verified: the row disappears before the server answers, a `500` brings it back, and a `404` on a second delete counts as success (*"Rollback Lamp was already gone."*) — plus confirmation dialogs that do not annoy, undo windows, cascading deletes, and what to do with the page the user is currently looking at when the record underneath it vanishes.
