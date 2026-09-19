# 08 — DELETE APIs: Optimistic Removal, Rollback, and Undo

> **Part 7 · API Integration · File 8 of 11**
> Why this file exists: deletes are the one write where users expect instant feedback, and the one write where a mistake is hardest to forgive. This file builds the safest fast pattern there is — **optimistic removal with rollback** — and proves every branch by running it: the row vanished 10 ms after the click while the server still needed 400 ms, a `500` brought the row back with *"The row was restored."*, and a second delete that reached a `404` was treated as success (*"Rollback Lamp was already gone."*).

---

## 1. What `DELETE` means

`DELETE` removes a resource. It is **idempotent**: deleting the same thing twice leaves the server in the same state as deleting it once — the second call usually answers `404`.

Verified against the lab API:

```text
=== DELETE (file 08) ===
DELETE /products/TV3WWSe → 200 · body={}
DELETE again → 404 (the record is gone)
GET after delete → 404 body={}
```

| Response | Meaning | Client behaviour |
| --- | --- | --- |
| `200 OK` with a body | "deleted; here is something (the record, or `{}`)" | success |
| `204 No Content` | "deleted; there is nothing to say" | success — **do not parse the body** (file 02, section 6) |
| `202 Accepted` | "queued for deletion" | success, but the row may linger; tell the user |
| `404 Not Found` | already gone | **treat as success in the UI** (the user's intent is satisfied) |
| `403 Forbidden` | not allowed to delete this | explain; the row stays |
| `409 Conflict` | something still references it | explain what blocks the delete |

Two HTTP details that trip people up:

- **A `DELETE` body is strongly discouraged** and some servers ignore it (`fetch` will send it if you insist, which is exactly how "the delete ignored my reason" bugs happen). Put the "reason" in a separate request or a query parameter the API defines.
- **`DELETE` is not "safe"** — it changes state — so it must not be triggered by a `GET`, a page load, or a prefetch.

---

## 2. The API function

```ts
// File: src/api/products.ts
export function deleteProduct(id: string, delayMs = 0): Promise<void> {
  return sendJson<void>(`products/${id}${delayMs ? `?delay=${delayMs}` : ''}`, 'DELETE');
}
```

`sendJson` (file 04) checks `response.ok` and throws a typed `HttpError` for anything outside `2xx` — which means a `404` arrives as an error, and **the UI decides that a `404` means "already gone"**. That decision belongs in the UI layer, not in the transport, because only the UI knows what the user intended.

```ts
// The three cases the caller must handle
await deleteProduct(id);
// → resolved: the server deleted it
// → throws HttpError(404): it was already gone (usually a success for the user)
// → throws HttpError(403/409/500) or a transport error: it is still there
```

---

## 3. Optimistic removal, line by line

```tsx
// File: src/part7/ProductsTable.tsx (excerpt)
/** DELETE optimistically: the row leaves now, and comes back only if the server refuses. */
async function remove(product: ApiProduct) {
  if (state.status !== 'ready') return;
  const snapshot = state.items;          // 1. keep the old list for rollback
  const snapshotTotal = state.total;

  setState({ status: 'ready', items: state.items.filter((item) => item.id !== product.id), total: state.total - 1 });
  setNotice(`Removing ${product.name}…`); // 2. tell the user what is happening

  try {
    await deleteProduct(product.id, deleteDelayMs);
    setNotice(`${product.name} deleted.`); // 3. confirm
  } catch (error) {
    // A 404 means somebody else already deleted it — that is a success for us.
    if (error instanceof HttpError && error.status === 404) {
      setNotice(`${product.name} was already gone.`);
      return;                              // 4. stay deleted, but say why
    }

    setState({ status: 'ready', items: snapshot, total: snapshotTotal });   // 5. roll back
    setNotice(`Could not delete ${product.name}: ${error instanceof Error ? error.message : 'unknown error'}. The row was restored.`);
  }
}
```

| Line | Why it is there |
| --- | --- |
| `const snapshot = state.items;` | the *only* thing that makes rollback possible. Without it, a failed delete has nothing to restore |
| `items.filter((item) => item.id !== product.id)` | removal by **id**, never by index (Part 5, file 05) |
| `total: state.total - 1` | the count is part of the optimistic state too, or the pager lies |
| `setNotice('Removing …')` | the user must know a request is in flight; optimistic does not mean silent |
| `await deleteProduct(...)` | one request; no retry, because a delete is idempotent but a duplicate is worse than waiting |
| `catch (404 → success)` | idempotency, expressed in the UI. The desired end state ("no such product") already holds |
| `setState({ items: snapshot, … })` | rollback on any other failure (`403`, `409`, `500`, network) |
| `not finally` — no cleanup needed | there is no local "pending" flag to clear; the row is either there or gone |

⚠️ **No `busyRow` here, on purpose.** A delete makes the row disappear, which is feedback enough; a "Deleting…" state on a row that no longer exists is noise. (The `PATCH` toggle in file 07 *does* need one, because the row stays on screen.)

---

## 4. Proof: every branch, measured

Full transcript: `/tmp/part7-table.txt`.

```text
=== B. DELETE optimistically: the row disappears before the server answers ===
   in the same tick as the click: rows=8, row for DFT7El8 = Optimistic Lamp₹111Out of stockMark in stock Delete
   10 ms later (the server still needs ~400 ms): rows=7, row for DFT7El8 = (no row)
   notice: Removing Optimistic Lamp…
   after the response:          row for DFT7El8 = (no row)
   notice: Optimistic Lamp deleted.
   server: status=404  ← 404 means it really is gone
```

Read it in three moments: the click (React had not flushed yet, so the row was still in the DOM *inside the same tick*), then 10 ms later the row is **gone while the request is still in flight** (the `?delay=400` proves it was not the server that removed it — the UI did), then the confirmation. The last line is the server's own answer: a follow-up `GET` returns `404`, so the record really is gone rather than merely hidden.

```text
=== C. a failed DELETE restores the row (rollback) ===
   in the same tick as the click: row = Rollback Lamp₹111In stockMark out of stock Delete
   10 ms later: rows=6, row = (no row)
   after the 500:               row = Rollback Lamp₹111In stockMark out of stock Delete
   notice: Could not delete Rollback Lamp: Request failed with 500. The row was restored.
   request: DELETE http://.../products/ioW4BrQ?delay=400&fail=500
   server still has it: status=200
```

The row disappears optimistically, the server answers `500` after 400 ms, and the snapshot brings the row back **with its original data** — verified from the server's side too (`status=200`, still there). The message names the product, the failure, and the recovery ("The row was restored"), which is exactly what a user needs to trust the screen again.

```text
=== D. deleting something that is already gone ===
   deleted ioW4BrQ behind the UI's back → status=200
   click in the UI → notice: Rollback Lamp was already gone.
   row for ioW4BrQ: (no row) (stays gone — a 404 is a success for a delete)
   server: status=404
```

Somebody else (or another tab) deleted it first. The user's intent — "this row should not exist" — is satisfied, so the row stays gone and the message explains why no error is being shouted about. This is the single most under-implemented branch in CRUD screens.

```text
=== E. the final list ===
   ids: p-speaker, p-keycap-set, p-keyboard, p-monitor-arm, p-headphones, p-mouse
   count line: 6 of 6 products · Refresh
```

The temporary probe products are gone, the count went from 8 back to 6, and the seeded data is untouched — the same discipline your cleanup should have: **deletes are verified, not assumed**.

---

## 5. Confirmation dialogs versus undo

Both exist to prevent regret, and they are not interchangeable:

| Approach | Blocks the mistake | Cost | Use when |
| --- | --- | --- | --- |
| **No friction** (delete immediately) | ✗ | a mistake is permanent | the item is trivial, or there is an undo |
| **Confirm dialog** | ✅ | friction on every delete, worse for power users | the action is destructive and **hard to reverse** |
| **Undo window** (~5 s) | partially | a temporary state the user must understand | the action is frequent and reversible |
| **Soft delete** (server-side `deletedAt`) | ✅ | schema + every query must filter it | data must be recoverable by support |
| **Typed confirmation** ("type the product name") | ✅ | high friction | catastrophic, rare actions (deleting a workspace) |

Practical rules:

1. **Do not confirm and undo at the same time** ("Are you sure?" *and* a 5-second undo toast) — pick one.
2. **Confirm when the data is not recoverable** from the user's point of view, and say what will happen: *"Delete Desk Lamp? This cannot be undone."*
3. **Prefer undo for frequent actions**, and make the deleted item recoverable *before* you show the toast.
4. **Bulk deletes always confirm**, with the count: *"Delete 12 products?"*
5. **Accessible dialogs** need a `role="dialog"`, `aria-modal="true"`, a labelled title, focus moved into the dialog, focus returned on close, `Escape` to cancel, and a visible focus ring. (Part 6, file 08 has the focus rules; a `<dialog>` element with `showModal()` gives most of this for free.)

---

## 6. Making undo *actually* work

An undo button that re-sends a `POST` is not a real undo:

```ts
// ❌ Deleted p-mouse (id p-mouse) → "Undo" → POST → a NEW record with a NEW id
//    Any order that referenced p-mouse now points at a dead id.
await fetch('/api/products', { method: 'POST', body: JSON.stringify(deletedProduct) });
```

Two honest implementations:

**(a) Server-side soft delete (recommended for anything users care about).**

```json
// The record keeps its identity; queries filter it out.
{ "id": "p-mouse", "name": "Wireless Mouse", "deletedAt": "2026-09-19T09:14:02.113Z" }
```

```ts
// Delete becomes a PATCH (file 07), and undo becomes another PATCH.
export function softDelete(id: string) {
  return updateProduct(id, { deletedAt: new Date().toISOString() });
}

export function restore(id: string) {
  return updateProduct(id, { deletedAt: null });
}
```

The list query then adds a filter (`?deletedAt=null`, or the server hides them by default). Every reference stays valid, and "undo" is a one-field change.

**(b) Client-side undo window with a held payload.** Only workable when the server can restore the record *with the same id* (an admin endpoint, or a `POST /products/:id/restore`). If ids change, say so in the UI: *"Restored as a new product."*

```ts
// The pattern: hold the snapshot, offer undo for N seconds, then let it go.
const [undo, setUndo] = useState<{ product: ApiProduct; timer: number } | null>(null);

function offerUndo(product: ApiProduct) {
  const timer = window.setTimeout(() => setUndo(null), 5000);
  setUndo({ product, timer });
}
```

---

## 7. References: when a delete should be refused

Deletes rarely happen in isolation. An order references a product; a comment references a post. Three server strategies, three UIs:

| Server strategy | Response | UI |
| --- | --- | --- |
| **Refuse while referenced** | `409 Conflict` with the references | *"3 orders include this product. Remove it from them first."* with links |
| **Cascade** | `200` and the children go too | warn in the confirmation: *"This also removes 3 order lines."* |
| **Nullify / reassign** | `200`, children point at nothing/`unknown` | "Deleted product" fallbacks everywhere the reference is rendered |

```ts
if (error instanceof HttpError && error.status === 409) {
  const body = error.body as { message?: string; references?: { type: string; count: number }[] } | null;
  setNotice(
    body?.references?.length
      ? `Cannot delete ${product.name}: it is used by ${body.references.map((r) => `${r.count} ${r.type}`).join(', ')}.`
      : `Cannot delete ${product.name}: other records still reference it.`,
  );
  setState({ status: 'ready', items: snapshot, total: snapshotTotal });   // rollback, as always
  return;
}
```

⚠️ Whatever you do, **do not** decide cascade behaviour in the client by deleting children one by one. That is a transaction, and transactions belong on the server — five successful child deletes followed by a failed parent delete leaves corrupt data.

---

## 8. Deleting the record the user is looking at

On a **detail** page, the delete removes the very thing being rendered. The sequence matters:

```tsx
// File: src/part7/ProductDetailPage.tsx (delete action, condensed)
async function handleDelete() {
  setPending(true);
  try {
    await deleteProduct(product.id);
    // 1. leave the page first (replace: the deleted page must not stay in history),
    // 2. then refresh the list the user is going back to.
    void navigate('/products', { replace: true, state: { deleted: product.name } });
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      void navigate('/products', { replace: true });     // it was already gone
      return;
    }
    setError('Could not delete this product.');
  } finally {
    setPending(false);
  }
}
```

Three rules:

1. **Navigate after the server confirms** (a detail page is not a good place for an optimistic delete: the user would watch the page vanish on a request that might fail).
2. **Use `replace`** so the Back button does not return to a page whose record no longer exists (Part 6, file 08 covered `replace`).
3. **Invalidate the list you are returning to** — a reload token, a refetch on mount, or a loader (Part 8) — otherwise the deleted row is still on screen and a click on it produces the `404` you just handled.

If the record is deleted *while* the page is open (another tab, another user), the next action produces a `404`. Handle it as "gone" rather than "broken" (file 04's `notFound` state) — the lab's `DELETE` then `GET → 404 body={}` is exactly that shape.

---

## 9. Bulk deletes

Selecting twenty rows and deleting them one by one is the wrong shape: twenty requests, twenty chances to fail, and no atomicity.

```ts
// Ask for (or build) a bulk endpoint.
await sendJson<{ deleted: string[]; failed: { id: string; reason: string }[] }>('products/bulk-delete', 'POST', { ids: selectedIds });
```

If the API only offers single deletes, do the honest thing:

```tsx
async function deleteSelected(ids: string[]) {
  const results = await Promise.allSettled(ids.map((id) => deleteProduct(id)));
  const failed = ids.filter((_, index) => results[index].status === 'rejected');

  setSelected(failed);                                   // keep exactly the failures selected
  setNotice(failed.length === 0 ? `Deleted ${ids.length} products.` : `Deleted ${ids.length - failed.length}; ${failed.length} failed and are still selected.`);
  setReloadToken((token) => token + 1);
}
```

`Promise.allSettled` (not `Promise.all`) is the important detail: `all` rejects on the first failure and you lose track of the rest. Then report honestly — partial success is a real outcome and the user must see exactly which rows survived.

---

## 10. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | optimistic delete with no snapshot | a failed delete leaves the row gone forever on screen | snapshot before removing (verified rollback) |
| 2 | treating `404` as a failure | an error toast for a row that is exactly as gone as the user wanted | `404` = success for deletes |
| 3 | removing by array index | the wrong row disappears after a sort | remove by `id` |
| 4 | no confirmation for an irreversible delete | data loss nobody can undo | confirm, and say it cannot be undone |
| 5 | confirmation *and* undo | confusing, contradictory UI | pick one |
| 6 | "Undo" that re-creates with a new id | broken references everywhere | soft delete, or a restore endpoint |
| 7 | ignoring `409` | "the button does nothing" | show what references the record |
| 8 | cascading deletes in the client | half-deleted data after a mid-way failure | let the server transact |
| 9 | `Promise.all` for bulk deletes | one failure hides the others | `Promise.allSettled` + partial reporting |
| 10 | staying on a deleted detail page | actions on it `404` one by one | navigate away with `replace` |
| 11 | leaving the deleted row in the cached list | clicking it produces `404`s | refetch/invalidate on return |
| 12 | no loading feedback for a slow delete | users click Delete repeatedly | a pending state on the confirm button, and disable it |

---

## 11. Best practices

1. **Default to optimistic removal for a row in a list** — it is the fastest and, with a snapshot, the safest.
2. **Snapshot the list and the count** before removing anything, and restore both on failure.
3. **Merge `404` into success**, with a message that distinguishes the cases ("deleted" versus "was already gone").
4. **Confirm irreversible deletes, undo cheap ones**, never both at once.
5. **Prefer soft delete** (`deletedAt`) when the data matters; it makes undo real and keeps references alive.
6. **Let the server own transactions and cascades**; surface `409` with the blocking references.
7. **On detail pages, delete then navigate with `replace`**, and refresh the list behind you.
8. **Refresh rather than surgically patching hidden caches** — a reload token is boring and always correct.
9. **Report partial failures in bulk operations**, and keep the failed rows selected.
10. **Verify the delete from the server's side** in tests (`GET → 404`), because "the row left the screen" and "the row left the database" are different events.

---

## 12. Practice

### Beginner — watch a delete happen

1. In the running app, delete a product with the Network tab open. Record: status code, content type, whether the response had a body, and what the row and the count line did before and after the request.
2. Repeat with the API stopped. What does the row do, what does the notice say, and what is `error.status` in that case?
3. `curl` a `DELETE` for a product, then `curl` it again. Record both status codes and explain why the second one does not mean "failure".
4. Delete a product in one browser tab and, in a second tab that still shows the list, click Delete on the same product. What message do you get, and why is that the right behaviour?

### Intermediate — confirm, undo, and bulk

1. Add a confirmation dialog to a **single** delete, using `<dialog>` with `showModal()`. Check: focus moves into the dialog, `Escape` cancels, focus returns to the Delete button, and the delete only runs on confirm.
2. Add an **undo window** to the optimistic delete: after a successful delete, show "Undo" for 5 seconds. Implement it with a client-held snapshot and a restore endpoint. If your API cannot restore the same id, print a comment explaining what breaks.
3. Add multi-select checkboxes and a bulk delete using `Promise.allSettled`. Verify with `?fail=500` on one of the requests (you can make the spy fail a specific id) that the failed rows stay selected and the message reports both counts.
4. Write the probe assertions for all of it: optimistic removal visible before the response, rollback on `500`, `404` treated as success, no request sent when the dialog is cancelled, and one request per selected row in bulk mode.

### Challenge — soft delete end to end

1. Add `deletedAt: string | null` to the product record in `server/db.json` and to `ApiProduct`, and make `listProducts` fetch only live records (a query parameter the middleware understands).
2. Convert the delete action to a `PATCH { deletedAt }`, add a "Deleted products" view filtered to `deletedAt != null`, and a Restore action that patches it back to `null`.
3. Make the undo toast call Restore and reload the list; verify with the server that the id is unchanged and any order referencing the product still resolves.
4. Write down — in a short `DELETE-NOTES.md` — what changed for each of these: the list query, the detail route (what should a soft-deleted product's page show?), search, the orders page that references products, and any unique constraints (can two products have the same name if one is soft-deleted?).

---

## 13. Solutions

### Beginner

1. Status `200`, `application/json; charset=utf-8`, body `{}`. The row disappears as soon as you click (optimistic), the count drops immediately, and the notice changes from "Removing …" to "… deleted." (Verified in section 4's transcripts.)
2. With the API stopped, the row still disappears for a moment and then **comes back** with a notice naming the failure ("The row was restored"), because the request throws a transport error (`fetch failed` / `Failed to fetch`) and `error.status` is `undefined` (no response at all — file 03, section 4). That is exactly the rollback branch.
3. `DELETE` → `200`; the second `DELETE` → `404` with body `{}` (verified). The second is not a failure because the requested end state ("this record does not exist") already holds; idempotency means repeating a `DELETE` is safe.
4. The second tab gets a `404` (or a `409`, depending on the server) and shows "… was already gone." — correct, because the user's intent is satisfied, and nothing is broken. Had the second delete restored the row or shown a red error, the user would be told to fix a state they cannot fix.

### Intermediate

```tsx
// 1. A dialog with the accessibility basics handled by <dialog>
const dialogRef = useRef<HTMLDialogElement>(null);
const [target, setTarget] = useState<ApiProduct | null>(null);

function askToDelete(product: ApiProduct) {
  setTarget(product);
  dialogRef.current?.showModal();          // moves focus in, enables Escape
}

async function confirmDelete() {
  if (!target) return;
  const product = target;
  setTarget(null);
  dialogRef.current?.close();              // focus returns to the invoking button
  await remove(product);
}
```

```tsx
// 2. The undo window (client-held snapshot)
{undo && (
  <p className="undo" role="status">
    Deleted {undo.product.name}.{' '}
    <button type="button" onClick={undoRestore}>Undo</button>
  </p>
)}
```

   If the API cannot restore the same id, `POST`ing the snapshot back creates a new record: any reference to the old id (an order's `productId`) now points at nothing, and any link the user bookmarked breaks. Say so in the UI, or switch to a soft delete (section 6) — which is the honest fix.

```ts
// 3. Bulk delete with partial-failure reporting (sections 9's snippet)
const results = await Promise.allSettled(ids.map((id) => deleteProduct(id)));
const failed = ids.filter((_, index) => results[index].status === 'rejected');
```

```text
PASS  the row disappeared before the server answered (rows=7 at 10 ms, response at ~400 ms)
PASS  a 500 restored the row and reported it
PASS  a 404 stayed deleted and said "already gone"
PASS  cancelling the dialog sent no request
PASS  bulk delete sent one request per selected row (3 selected → 3 requests)
PASS  a partial failure kept the failed row selected (2 deleted, 1 failed)
```

### Challenge

```json
// server/db.json (excerpt)
{ "id": "p-mouse", "name": "Wireless Mouse", "priceMinor": 249900, "category": "accessories", "blurb": "Silent clicks, 70-day battery.", "inStock": true, "deletedAt": null }
```

```ts
// src/api/products.ts (changed by the soft delete)
export function listProducts(query: ProductQuery, signal?: AbortSignal) {
  // …build params…
  params.set('deletedAt', 'null');        // only live products by default
  // …
}

export function softDelete(id: string) {
  return updateProduct(id, { deletedAt: new Date().toISOString() });
}

export function restore(id: string) {
  return updateProduct(id, { deletedAt: null });
}
```

`DELETE-NOTES.md`, in the form the challenge asks for:

| Area | What changes with a soft delete |
| --- | --- |
| List query | must filter `deletedAt = null`; the default for every list and search |
| Detail route | a soft-deleted product's page should show "This product was deleted" with a Restore action (admins) rather than a generic 404 |
| Search | must exclude deleted rows, or users find ghosts |
| Orders page | references keep resolving — that is the whole point; render a "deleted" badge on the product name |
| Unique constraints | a unique index on `name` must exclude soft-deleted rows (`WHERE deletedAt IS NULL`), or restoring becomes impossible |
| Storage/retention | deleted rows need a purge policy ("delete permanently after 30 days") and a way to find them |
| Permissions | restoring is usually an admin action, not a user one |

---

## 14. Summary

- `DELETE` is **idempotent**: a second call answers `404` and that is not a failure (verified `200` → `404` → `GET 404`).
- **Optimistic removal with a snapshot** is the right default for lists: verified — the row left the DOM 10 ms after the click while the server needed ~400 ms.
- **Rollback on failure** restores the row *and* the count, with a message that says so: *"The row was restored."* (verified against a `500`).
- **`404` means "already gone"** and is a success for the user's intent: *"Rollback Lamp was already gone."* (verified).
- **Confirm irreversible deletes, undo cheap ones — not both.** Real undo needs a soft delete or a restore endpoint; re-`POST`ing a snapshot changes the id and breaks references.
- **References and cascades are the server's job**: surface `409` with the blocking records instead of deleting children from the client.
- On detail pages, **delete, then `navigate(..., { replace: true })`**, and refresh the list you return to.
- Bulk deletes use **`Promise.allSettled`** and report partial success honestly.

---

**What's next →** [`09-loading-states.md`](./09-loading-states.md): what the user sees while all of this is happening. Skeletons versus spinners versus nothing, the four-state machine applied to a whole screen, keeping old data visible while refreshing, the race condition measured with a naive hook (`results: p-keyboard, p-keycap-set` — the *old* query's data winning) and fixed with `AbortController`, debouncing keystrokes, and disabling exactly the right controls while a request is in flight.
