# 03 — Form Validation: A Complete System You Build Yourself

> **Part 8 · Forms and Validation · File 3 of 5**

Why this file exists: validation is where forms stop being markup and become logic. Almost every "form bug" in real apps is one of four things: rules living in three places that disagree, errors appearing at the wrong moment, the server's answer being thrown away, or a failure that loses the user's typing. This file builds one complete validation system — rules in a pure function, errors typed against the field names, timing rules that do not shout at users, a focus strategy, server errors mapped back onto fields, and one async rule with a debounce and a race guard. Every claim is measured against the real API with jsdom transcripts.

---

## 1. What validation is, and the four places it lives

Validation answers one question: **is this data acceptable?** The honest answer is that nobody can answer it alone:

| Layer | Knows | Cannot know |
| --- | --- | --- |
| **HTML attributes** (`required`, `type="email"`, `pattern`) | syntax and shape | anything about your data |
| **Client-side JS** (this file) | your domain rules, instantly, with zero latency | what is true right now on the server |
| **Server** | uniqueness, permissions, current state, the database | nothing — it is the authority |
| **Database** (constraints, `UNIQUE`, `NOT NULL`) | integrity under concurrency | how to explain the failure to a person |

The design that follows from this: **each layer validates what only it can**, and the client's job is to be fast and friendly, never authoritative.

```text
Who is responsible for what
─────────────────────────────────────────────────────────────
shape / emptiness / format / ranges / cross-field consistency  → client (fast feedback)
uniqueness / permissions / stock / business rules / drift      → server (truth)
integrity under concurrent writes                              → database (last resort)
```

⚠️ Because the client is not authoritative, **a form that validates perfectly on the client can still fail** — and that failure path is not an edge case to be added later. It is built in section 9, and measured in transcript E.

---

## 2. The taxonomy of rules

Before writing code, sort your rules. The categories behave differently — in timing, in messaging, and in whether they can even be checked on the client.

| Kind | Example | Where | When to show |
| --- | --- | --- | --- |
| **Required** | `name` must not be empty | client | on submit, then live |
| **Format** | price matches `^\d+(\.\d{1,2})?$` | client | on blur, then live |
| **Range** | price > 0, ≤ ₹10,00,000 | client | on blur, then live |
| **Cross-field** | in-stock items must cost ≥ ₹100 | client | after the fields it depends on change |
| **Async** | name must be unique | client *checking* server | after a debounce, on blur/submit |
| **Server-only** | "you cannot delete the last admin" | server | on the response |
| **Permission** | `403` — not yours to edit | server | on the response, as a form-level error |

Cross-field rules are where naive implementations break: the rule depends on more than one value, so it must be evaluated with the **whole values object**, not one field. In the lab's `validateProduct`, the in-stock rule is a good example — it is written inside the same function that checks the price alone, so it can never drift out of sync with it.

---

## 3. Rules as one pure function

The heart of the system is a function with no React in it at all:

```ts
// File: src/part8/validation.ts
export const CATEGORIES = ['audio', 'keyboards', 'accessories'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface ProductFormValues {
  name: string;
  price: string; // rupees, exactly as typed
  category: Category | '';
  blurb: string;
  inStock: boolean;
}

export type ProductField = keyof ProductFormValues;
export type ProductErrors = Partial<Record<ProductField, string>>;

export const initialProductValues: ProductFormValues = {
  name: '',
  price: '',
  category: '',
  blurb: '',
  inStock: true,
};

/** "₹1,299.50" → 129950. Returns null when the text is not a valid price. */
export function parsePriceToMinor(price: string): number | null {
  const cleaned = price.trim().replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const minor = Math.round(Number(cleaned) * 100);
  return Number.isFinite(minor) ? minor : null;
}

/** The name rules alone, so the async check can use exactly the same ones. */
export function validateName(rawName: string): string | undefined {
  const name = rawName.trim();
  if (name === '') return 'Name is required.';
  if (name.length < 2) return 'Name must be at least 2 characters.';
  if (name.length > 60) return 'Name must be 60 characters or fewer.';
  return undefined;
}

/** The whole form's rules, in one pure function: values in, errors out. */
export function validateProduct(values: ProductFormValues): ProductErrors {
  const errors: ProductErrors = {};

  const nameError = validateName(values.name);
  if (nameError !== undefined) errors.name = nameError;

  const priceMinor = parsePriceToMinor(values.price);
  if (values.price.trim() === '') errors.price = 'Price is required.';
  else if (priceMinor === null) errors.price = 'Use digits only, e.g. 1299.50 (at most 2 decimals).';
  else if (priceMinor <= 0) errors.price = 'Price must be greater than ₹0.';
  else if (priceMinor > 100_000_000) errors.price = 'Price must be ₹10,00,000 or less.';

  if (values.category === '') errors.category = 'Choose a category.';

  if (values.blurb.trim().length > 200) errors.blurb = 'Blurb must be 200 characters or fewer.';

  // Cross-field rule: only when the price itself is well-formed.
  if (values.inStock && errors.price === undefined && priceMinor !== null && priceMinor < 10_000) {
    errors.price = 'In-stock items must be priced at ₹100 or more.';
  }

  return errors;
}

export function hasErrors(errors: ProductErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** The fields with an error, in the order they appear on screen. */
export function firstInvalidField(errors: ProductErrors): ProductField | null {
  const order: ProductField[] = ['name', 'price', 'category', 'blurb', 'inStock'];
  return order.find((field) => errors[field] !== undefined) ?? null;
}
```

Line by line, the decisions that matter:

| Lines | Decision | Why |
| --- | --- | --- |
| `ProductField = keyof ProductFormValues` | field names are *derived* from the values type | adding a field to the interface automatically extends the error map — you cannot forget one |
| `ProductErrors = Partial<Record<ProductField, string>>` | one message per field, optional | matches how forms are displayed; a `string[]` per field is the alternative (section 6) |
| `initialProductValues` | the initial values live next to the type | resetting a form is `setValues(initialProductValues)`, exactly as file 02's best practices say |
| `parsePriceToMinor` | parsing and validating in **one** function | a price that "looks numeric" but has three decimals is invalid; a separate `Number(...)` call would have accepted `12.345` |
| `cleaned = price.replace(/[₹,\s]/g, '')` | strip the currency symbol, thousands separators, whitespace | users paste `₹1,299.50` from a spreadsheet; rejecting that is user-hostile |
| `validateName` extracted | the async uniqueness check reuses the same rules | one rule, one place — the async check must not run for a name that is already invalid |
| `errors.name = nameError` | first failing rule wins | "Name is required" and "name must be 2 characters" are the same problem; do not stack messages |
| the `else if` chain for price | ordered from most specific to least | `''` → required; not a number → format; ≤ 0 → range; too big → range |
| `errors.price === undefined` in the cross-field rule | never overwrite a more fundamental error | if the price is unparseable, "must be ₹100 or more" is confusing noise |
| `Math.round(Number(cleaned) * 100)` | money in integer minor units | floats lie (`0.1 + 0.2`), and Part 7's API expects `priceMinor` |
| `Object.keys(errors).length` | "is the form valid?" | an empty object means valid; a field explicitly set to `undefined` would not, which is why `delete` is used instead of assigning `undefined` |
| `firstInvalidField` with a literal order array | focus order matches the visual order | `Object.keys` order would be insertion order, which is not screen order |

Three properties worth noticing, because they are what make this function pleasant to live with:

1. **It is pure.** No React import, no network, no DOM. It can be unit-tested with a table of values (`Part 13`), run on the server, and used to disable a button.
2. **It is total.** Every value of `ProductFormValues` produces an answer; there is no state where the function is unsure.
3. **It returns data, not side effects.** It does not set state, focus fields, or show toasts. The component decides what to do with the answer.

---

## 4. When to validate: the timing rules

The same rules, run at the wrong moment, turn a helpful form into an accusation. The measured behaviour of this implementation:

```text
=== A. silent until submit, then all four problems at once ===
   errors before any interaction: 0
   after submitting an empty form: 3 errors
      · Name is required.
      · Price is required.
      · Choose a category.
   focused element: input[name="name"]
   aria-invalid on the name field: true
   POST requests sent: 0 (nothing is sent while the form is invalid)

=== C. before the first submit, errors wait for blur ===
   typed "A" (too short), still focused → error: (none yet)
   after blur                          → error: Name must be at least 2 characters.
```

The rules those transcripts encode:

| Moment | Validate? | Why |
| --- | --- | --- |
| **Initial render** | no | An empty form is not an error; it is a form nobody has filled in yet. |
| **On every keystroke, before first submit** | no | "A" is not an invalid name while you are still typing it. Waiting for **blur** gives the user a chance to finish. |
| **On blur (before first submit)** | yes, that field only | The user has declared the field finished. Showing one message about the field they just left is helpful, not noisy. |
| **On submit** | yes, everything | This is the honest moment: the user asked to save. Show every problem, focus the first one. |
| **After first submit** | yes, re-validate live | From here on the user is fixing things. Errors appearing and disappearing as they type is exactly the feedback they need. |
| **After an async rule resolves** | yes, show on blur/submit | A uniqueness message has to respect the same blur/submit timing as everything else. |
| **After a server rejection** | map and show immediately | The user did submit; they are owed the answer now. |

The implementation of "validate that field on blur, everything on submit, everything live after the first submit" is small enough to read in one sitting:

```tsx
  /** Before the first submit, only show an error for a field the user has already left. */
  function visibleError(field: ProductField): string | undefined {
    if (submitted || touched[field]) {
      if (field === 'name' && errors.name === undefined && nameTaken) {
        return 'A product with this name already exists.';
      }
      return errors[field];
    }
    return undefined;
  }

  function setField<K extends ProductField>(field: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    if (submitted) {
      setErrors(validateProduct({ ...values, [field]: value }));
    }
  }

  function markTouched(field: ProductField) {
    setTouched((current) => ({ ...current, [field]: true }));

    // Leaving a field is a good moment to tell the user about that field — and only that field.
    const checked = validateProduct(values);
    setErrors((current) => {
      const updated = { ...current };
      const message = checked[field];
      if (message === undefined) delete updated[field];
      else updated[field] = message;
      return updated;
    });
  }
```

⚠️ Two subtleties that a naive version gets wrong:

- **`touched` is not `dirty`.** `touched` ("has the user left this field?") controls *when* messages may appear. `dirty` ("does the value differ from the initial value?") controls save buttons and discard prompts. They are different booleans with different jobs; file 02's challenge asked you to argue about exactly this.
- **Blur validates the whole form but writes back only one field's error.** The full `validateProduct(values)` call keeps cross-field rules correct, while the merge keeps other fields' existing errors untouched. Validating *only* the field being touched would break the cross-field rule (it needs the price to be valid to decide about it, and the price might be the field that just changed).

💡 There is no universal "best" moment — there are two defensible defaults: **validate on blur, show on blur** (chosen here for a form the user fills once) and **validate on change, show after submit** (better for wizards where every keystroke is meaningful). What is almost always wrong is **validate on change and show immediately from the first keystroke**: it marks a half-typed email as invalid while the user is still typing it.

---

## 5. Focusing the first invalid field

```text
   focused element: input[name="name"]
   aria-invalid on the name field: true
```

Two lines of code produce that:

```tsx
  function focusField(field: ProductField | null) {
    if (field === null) return;
    const element = formRef.current?.elements.namedItem(field);
    if (element instanceof HTMLElement) element.focus();
  }

  // inside handleSubmit, when the form is invalid:
  focusField(firstInvalidField(nextErrors));
```

Why `form.elements.namedItem(field)` instead of a `querySelector('[name=...]')`? Because `form.elements` is the form's own registry, keyed by the `name` attribute — the exact same mechanism the browser uses for `FormData` (file 01) and for `form.elements.length`. It cannot accidentally match an input from a *different* form on the page, and it handles names with characters that would need escaping in CSS selectors.

Why focus at all? For a long form, scrolling to the first problem and putting the caret there is the difference between "what did I do wrong" and a visible answer. It also puts screen-reader users into the field whose description contains the error.

⚠️ Do not focus fields on *every* revalidation — only when a submit fails. Stealing focus while someone is typing elsewhere is hostile.

---

## 6. The error state shape

`Partial<Record<ProductField, string>>` gives:

```ts
{
  name: 'Name is required.',
  price: 'Use digits only, e.g. 1299.50 (at most 2 decimals).',
}
```

Alternatives, and why they are usually worse:

| Shape | Looks like | Trade-off |
| --- | --- | --- |
| `Record<Field, string>` (all required) | `{ name: '', price: '' }` | "no error" and "error" are both `''` — you will write `if (errors.name)` forever, and empty strings leak into the DOM |
| `Partial<Record<Field, string>>` **(used here)** | `{ name: '…' }` | absence means no error; `visibleError(field)` returns `string \| undefined` |
| `Partial<Record<Field, string[]>>` | `{ price: ['Too small', 'Not a whole number'] }` | good for dense rule sets; more rendering work, and most fields deserve one message |
| `Record<Field, { message: string; code: string }>` | typed codes for i18n | useful when messages are translated; adds ceremony early |
| One global error string | `'Please fix the highlighted fields'` | useless without the field mapping; keep it as a *form-level* message alongside the field map (section 9 does exactly this) |

Two rules that matter more than the shape:

1. **Delete the key rather than assigning `undefined`.** With `exactOptionalPropertyTypes` (Part 2), `errors.name = undefined` is not the same as deleting the key, and `Object.keys` would still count it — making `hasErrors` lie.
2. **Derive the field names from the values type.** `keyof ProductFormValues` means a new field cannot be forgotten in the error map; a hand-written `type Errors = { name?: string; price?: string }` can silently fall out of sync.

---

## 7. Showing errors accessibly

The markup half of the system, from the `TextInput` used by the form:

```tsx
// File: src/components/TextInput.tsx
import { useId, type ChangeEvent } from 'react';

interface TextInputProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'password' | 'number' | 'search';
  hint?: string;
  error?: string | undefined;
  disabled?: boolean;
  autoComplete?: string;
  onBlur?: () => void;
}

export function TextInput({
  label, name, value, onChange, type = 'text', hint, error, disabled = false, autoComplete, onBlur,
}: TextInputProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        onBlur={onBlur}
        aria-invalid={error !== undefined}
        aria-describedby={
          [hint !== undefined ? hintId : null, error !== undefined ? errorId : null].filter(Boolean).join(' ') || undefined
        }
      />
      {hint !== undefined && <small id={hintId}>{hint}</small>}
      {error !== undefined && (
        <p id={errorId} className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

What each accessibility decision buys:

| Attribute | Effect |
| --- | --- |
| `htmlFor={id}` on the `<label>` | clicking the label focuses the input; screen readers announce the label |
| `aria-invalid={error !== undefined}` | announces "invalid entry" — and drives the `[aria-invalid="true"]` selector the form uses for focus and styling |
| `aria-describedby` joining hint + error ids | the field is read as "Price (₹), Digits and at most 2 decimals…, Use digits only…" — the message is attached to the field, not floating nearby |
| `role="alert"` on the error `<p>` | assistive technology announces the message when it appears |
| `useId()` | unique ids, so two copies of the field cannot collide (Part 4's `useId` chapter) |

⚠️ **Announce messages once, not on every keystroke.** `role="alert"` is announced when the element is added to the DOM. Because `visibleError` only returns a message when it should be shown, and because messages change text (rather than the element being removed and re-added on each render), this stays quiet until something meaningful changes. A form that re-announces on every keystroke is unusable with a screen reader — that is another reason the blur-timing rules in section 4 matter.

---

## 8. Re-validation after the first submit, traced

This is the transcript that most clearly separates a well-timed form from an annoying one:

```text
=== B. re-validation while the user fixes things (after the first submit) ===
   name fixed      → name error: (none)
   price "abc"     → Use digits only, e.g. 1299.50 (at most 2 decimals).
   price "50"      → In-stock items must be priced at ₹100 or more. (cross-field: in-stock items need ₹100+)
   in-stock off    → (none — the cross-field rule no longer applies)
   price 1299.50   → (none)
   remaining errors: Choose a category.
```

Read it as a story:

- The user submitted an empty form, saw four fields flagged, and started fixing them.
- **Fixing the name cleared its error immediately** — the message disappeared the moment the value became valid, with no submit needed.
- `abc` produced a *format* message; then `50` produced a *cross-field* message; unchecking "In stock" made the cross-field rule inapplicable, and the message vanished.
- When the price became valid, only the untouched category error remained — the form did not re-shout about fields the user had already fixed.

That behaviour is the direct result of two lines: `if (submitted) setErrors(validateProduct(...))` in `setField`, and the updater-based reset in `markTouched` that deletes cleared errors.

💡 Notice how the messages are written. Each names the field's expectation, not the user's mistake: "Use digits only, e.g. 1299.50 (at most 2 decimals)" tells you what to type; "Invalid input" does not. Keep messages short, specific, and action-oriented — and never blame ("You entered an invalid value").

---

## 9. When the server disagrees: `422` and `500`

The client is fast but blind. Two different server failures need two different UI responses:

```text
=== E. when the server rejects the payload (422) ===
   requests: 1 (the client thought the form was valid)
   name  → Name must be at least 3 characters.
   price → Price must be a positive number.
   form-level: The server rejected some fields. See the messages below.
   focused: input[name="name"]

=== F. when the server breaks (500) ===
   form-level: Something went wrong on the server. Your values are safe — try again.
   field errors: 0 (a server failure is not the user's fault — keep the values)
   values kept: name="Breakage Lamp" price="999"
   button text: "Save product" (back to enabled after the failure)
```

**`422` — the data was rejected.** The server returned per-field messages, and they are mapped onto the *same* error state the client rules use, so the user sees them in the same place as client errors:

```tsx
/** Maps the API's field names onto this form's field names. */
export function mapServerErrors(body: unknown): ProductErrors {
  if (typeof body !== 'object' || body === null) return {};
  const raw = (body as { errors?: Record<string, string> }).errors;
  if (raw === undefined) return {};

  const mapped: ProductErrors = {};
  for (const [key, message] of Object.entries(raw)) {
    if (key === 'priceMinor') mapped.price = message;
    else if (key === 'name') mapped.name = message;
    else if (key === 'category') mapped.category = message;
    else if (key === 'blurb') mapped.blurb = message;
  }
  return mapped;
}
```

`mapServerErrors` is the **translation layer between the API's vocabulary and the form's**. The API talks about `priceMinor` (Part 7, file 11's DTO-to-domain idea); the form talks about `price` (the text the user typed). Without this mapping you would render "priceMinor must be a positive number" next to a field called "Price (₹)" — technically true, useless to a person.

Three details in the response handling:

```tsx
      if (error instanceof HttpError && error.status === 422) {
        const serverErrors = mapServerErrors(error.body);
        setErrors(serverErrors);
        setFormError('The server rejected some fields. See the messages below.');
        focusField(firstInvalidField(serverErrors));
      } else if (error instanceof HttpError && error.status === 500) {
        setFormError('Something went wrong on the server. Your values are safe — try again.');
      } else {
        setFormError('Could not reach the server. Check your connection and try again.');
      }
```

1. **`422` replaces the client errors** with the server's (the server knew something the client could not: in the lab, the middleware rejects short names and non-positive prices).
2. **`500` and network errors do NOT touch field errors.** A server bug is not the user's mistake; the values stay, the button re-enables, and the message says what to do next. Verified in transcript F: `field errors: 0`, both values kept, button text back to "Save product".
3. **A form-level message accompanies field-level ones.** "The server rejected some fields" tells the user *why* red text appeared under fields they thought were fine.

⚠️ The `422` in transcript E arrived for a payload the client considered valid — the client's rules were looser than the middleware's ("at least 3 characters", "positive number"). **That is the system working**, not a bug: the server is the authority, and the client's job was only to catch the obvious problems cheaply. If a mismatch like this recurs, tighten the client rule to match the server's — but never remove the server's.

---

## 10. The async rule: debounce, guard, and only check what is valid

Uniqueness cannot be decided on the client, so the form asks the server — carefully:

```text
   async uniqueness rule (the name check runs through a 400 ms debounce)
   typed 14 characters → name-check requests so far: 0
   after the debounce  → name-check requests: 1
   request: /products?name=Wireless%20Mouse
   hint text: Checking availability…
   error while the field is focused: (none — not shown until blur/submit)
   hint text after the check settled: 2–60 characters. Must be unique.
   after blur: A product with this name already exists.
   renamed to a free name → (none)
   total name-check requests: 2 for 20+ keystrokes
```

The implementation:

```tsx
  import { useDebouncedValue } from '../hooks/useDebouncedValue';
  const debouncedName = useDebouncedValue(values.name, 400);

  useEffect(() => {
    const name = debouncedName.trim();
    if (validateName(name) !== undefined) {          // 1. never ask about a name that is already invalid
      setNameCheck('idle');
      return;
    }

    let cancelled = false;                            // 4. the race guard
    setNameCheck('checking');                         // 2. tell the user a check is running

    fetch(`/api/products?name=${encodeURIComponent(name)}`)
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: unknown) => {
        if (cancelled) return;
        setNameCheck(Array.isArray(rows) && rows.length > 0 ? 'taken' : 'idle');
      })
      .catch(() => {
        if (!cancelled) setNameCheck('idle');         // 5. a failed check never blocks the form
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedName]);
```

Five decisions, each visible in the transcript:

| # | Decision | Evidence |
| --- | --- | --- |
| 1 | **Only check names that pass the local rules** | typing `A` produced no request (the request appears only after a valid 14-character name) |
| 2 | **Debounce 400 ms** | 14 keystrokes, 40 ms apart → **1** request, not 14. The hint switches to "Checking availability…" so the wait is visible |
| 3 | **Reuse `validateName`** | the same rule that says "2–60 characters" decides whether it is worth asking; one source of truth |
| 4 | **Cancel with a flag in the effect cleanup** | typing "Wireless Mouse" then "Desk Lamp Pro" produces 2 requests, and only the *last* one's answer is allowed to set state — otherwise the older, slower response could overwrite the newer verdict (Part 7, file 09's race, in one flag) |
| 5 | **A failed check stays silent** | `catch` sets `idle`; a flaky network must not block a form. The server will reject it on submit if it really is taken |

⚠️ `cancelled` is a *state-writing* guard, not a network guard: the request still happens (the probe's request counter proves it). To also abort the request you would pass an `AbortSignal` and abort it in the cleanup — which is what Part 7's guarded `useProducts` did. Choose by cost: a cheap `?name=` query is fine to let finish; a heavy search endpoint is not.

💡 Debouncing the *field* rather than the *check* would make the input feel laggy. The state (`values.name`) updates instantly; only `debouncedName` lags. That is the pattern from Part 7, file 09 applied to a different problem.

---

## 11. The complete form

```text
shop-admin/
├── src/
│   ├── api/
│   │   ├── http.ts                 ← HttpError + getJson/sendJson (Part 7)
│   │   ├── products.ts             ← createProduct (Part 7)
│   │   └── types.ts                ← ApiProduct, ApiProductDraft
│   ├── components/
│   │   └── TextInput.tsx           ← file 02: label + hint + error + a11y
│   ├── hooks/
│   │   └── useDebouncedValue.ts    ← Part 7, file 09's debounce
│   ├── part8/
│   │   ├── validation.ts           ← section 3: rules as a pure function
│   │   └── ValidatedProductForm.tsx ← this section
│   └── dev/
│       ├── validation-probe.tsx    ← the probe that produced every transcript
│       └── run-validation-probe.tsx
└── server/
    ├── db.json
    └── middlewares.cjs             ← ?fail=422 returns { errors: { name, priceMinor } }
```

```tsx
// File: src/part8/ValidatedProductForm.tsx
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { TextInput } from '../components/TextInput';
import { HttpError } from '../api/http';
import { createProduct } from '../api/products';
import type { ApiProduct, ApiProductDraft } from '../api/types';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  CATEGORIES,
  firstInvalidField,
  hasErrors,
  initialProductValues,
  parsePriceToMinor,
  validateName,
  validateProduct,
  type Category,
  type ProductErrors,
  type ProductField,
  type ProductFormValues,
} from './validation';

type Status = 'idle' | 'saving' | 'saved';
type NameCheck = 'idle' | 'checking' | 'taken';

interface ValidatedProductFormProps {
  onSaved?: (product: ApiProduct) => void;
}

/** Maps the API's field names onto this form's field names. */
export function mapServerErrors(body: unknown): ProductErrors {
  if (typeof body !== 'object' || body === null) return {};
  const raw = (body as { errors?: Record<string, string> }).errors;
  if (raw === undefined) return {};

  const mapped: ProductErrors = {};
  for (const [key, message] of Object.entries(raw)) {
    if (key === 'priceMinor') mapped.price = message;
    else if (key === 'name') mapped.name = message;
    else if (key === 'category') mapped.category = message;
    else if (key === 'blurb') mapped.blurb = message;
  }
  return mapped;
}

export function ValidatedProductForm({ onSaved }: ValidatedProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>(initialProductValues);
  const [errors, setErrors] = useState<ProductErrors>({});
  const [touched, setTouched] = useState<Partial<Record<ProductField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [nameCheck, setNameCheck] = useState<NameCheck>('idle');

  const formRef = useRef<HTMLFormElement>(null);
  const submittingRef = useRef(false);
  const debouncedName = useDebouncedValue(values.name, 400);

  useEffect(() => {
    const name = debouncedName.trim();
    if (validateName(name) !== undefined) {
      setNameCheck('idle');
      return;
    }

    let cancelled = false;
    setNameCheck('checking');

    fetch(`/api/products?name=${encodeURIComponent(name)}`)
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: unknown) => {
        if (cancelled) return;
        setNameCheck(Array.isArray(rows) && rows.length > 0 ? 'taken' : 'idle');
      })
      .catch(() => {
        if (!cancelled) setNameCheck('idle');
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedName]);

  const nameTaken = nameCheck === 'taken';

  function visibleError(field: ProductField): string | undefined {
    if (submitted || touched[field]) {
      if (field === 'name' && errors.name === undefined && nameTaken) {
        return 'A product with this name already exists.';
      }
      return errors[field];
    }
    return undefined;
  }

  function setField<K extends ProductField>(field: K, value: ProductFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    if (submitted) {
      setErrors(validateProduct({ ...values, [field]: value }));
    }
  }

  function markTouched(field: ProductField) {
    setTouched((current) => ({ ...current, [field]: true }));

    const checked = validateProduct(values);
    setErrors((current) => {
      const updated = { ...current };
      const message = checked[field];
      if (message === undefined) delete updated[field];
      else updated[field] = message;
      return updated;
    });
  }

  function focusField(field: ProductField | null) {
    if (field === null) return;
    const element = formRef.current?.elements.namedItem(field);
    if (element instanceof HTMLElement) element.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;                 // Part 7's same-tick double-submit guard

    setSubmitted(true);
    setFormError(null);

    const nextErrors = validateProduct(values);
    if (nameTaken && nextErrors.name === undefined) nextErrors.name = 'A product with this name already exists.';
    setErrors(nextErrors);

    if (hasErrors(nextErrors)) {
      focusField(firstInvalidField(nextErrors));
      return;                                          // no request while the form is invalid
    }

    const priceMinor = parsePriceToMinor(values.price);
    if (priceMinor === null) {
      setErrors({ price: 'Use digits only, e.g. 1299.50 (at most 2 decimals).' });
      return;
    }

    submittingRef.current = true;
    setStatus('saving');

    const draft: ApiProductDraft = {
      name: values.name.trim(),
      priceMinor,
      category: values.category as Category,
      blurb: values.blurb.trim() === '' ? null : values.blurb.trim(),
      inStock: values.inStock,
    };

    try {
      const created = await createProduct(draft);
      setStatus('saved');
      setValues(initialProductValues);
      setErrors({});
      setTouched({});
      setSubmitted(false);
      onSaved?.(created);
    } catch (error) {
      setStatus('idle');
      if (error instanceof HttpError && error.status === 422) {
        const serverErrors = mapServerErrors(error.body);
        setErrors(serverErrors);
        setFormError('The server rejected some fields. See the messages below.');
        focusField(firstInvalidField(serverErrors));
      } else if (error instanceof HttpError && error.status === 500) {
        setFormError('Something went wrong on the server. Your values are safe — try again.');
      } else {
        setFormError('Could not reach the server. Check your connection and try again.');
      }
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <form ref={formRef} className="validated-product-form" onSubmit={handleSubmit} noValidate>
      <TextInput
        label="Product name"
        name="name"
        value={values.name}
        onChange={(next) => setField('name', next)}
        hint={nameCheck === 'checking' ? 'Checking availability…' : '2–60 characters. Must be unique.'}
        error={visibleError('name')}
        onBlur={() => markTouched('name')}
      />

      <TextInput
        label="Price (₹)"
        name="price"
        type="text"
        value={values.price}
        onChange={(next) => setField('price', next)}
        hint="Digits and at most 2 decimals, e.g. 1299.50"
        error={visibleError('price')}
        onBlur={() => markTouched('price')}
      />

      <div className="field">
        <label htmlFor="category">Category</label>
        <select
          id="category"
          name="category"
          value={values.category}
          onChange={(event) => setField('category', event.target.value as Category | '')}
          onBlur={() => markTouched('category')}
          aria-invalid={visibleError('category') !== undefined}
        >
          <option value="">Choose…</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        {visibleError('category') !== undefined && (
          <p className="error" role="alert">
            {visibleError('category')}
          </p>
        )}
      </div>

      <div className="field">
        <label htmlFor="blurb">Blurb (optional)</label>
        <textarea
          id="blurb"
          name="blurb"
          value={values.blurb}
          onChange={(event) => setField('blurb', event.target.value)}
          onBlur={() => markTouched('blurb')}
          aria-invalid={visibleError('blurb') !== undefined}
        />
        <small>{values.blurb.trim().length}/200</small>
        {visibleError('blurb') !== undefined && (
          <p className="error" role="alert">
            {visibleError('blurb')}
          </p>
        )}
      </div>

      <div className="field">
        <label>
          <input
            type="checkbox"
            name="inStock"
            checked={values.inStock}
            onChange={(event) => setField('inStock', event.target.checked)}
          />
          In stock
        </label>
      </div>

      {formError !== null && (
        <p className="form-error" role="alert">
          {formError}
        </p>
      )}
      {status === 'saved' && (
        <p className="saved" role="status">
          Product saved.
        </p>
      )}

      <button type="submit" disabled={status === 'saving'}>
        {status === 'saving' ? 'Saving…' : 'Save product'}
      </button>
    </form>
  );
}
```

Five things this file does that a hand-rolled form usually forgets, in one place each:

| Concern | Where |
| --- | --- |
| Rules are pure and testable | `validation.ts` |
| Errors are typed against the field names | `ProductErrors` |
| Timing (blur → field, submit → all, after submit → live) | `visibleError`, `markTouched`, `setField` |
| Server truth mapped back to the form's field names | `mapServerErrors` + the `catch` block |
| It cannot be submitted twice in the same tick | `submittingRef` |

---

## 12. Run it

**a. Prerequisites.** The mock API from Part 7 must be running:

```bash
cd shop-admin
npm run api
# ➜  http://0.0.0.0:3001  (json-server with server/middlewares.cjs)
```

**b. Put the files in place** — the tree in section 11.

**c. Render the form.** In the app (or a scratch page):

```tsx
// File: src/App.tsx
import { ValidatedProductForm } from './part8/ValidatedProductForm';

export default function App() {
  return (
    <main style={{ maxWidth: 480, margin: '2rem auto', fontFamily: 'system-ui' }}>
      <h1>Add a product</h1>
      <ValidatedProductForm onSaved={(product) => console.log('saved', product)} />
    </main>
  );
}
```

```bash
npm run dev
# ➜  Local:   http://localhost:5173/
```

**d. Reproduce every transcript.** The probe runs the same component inside jsdom, against the real API:

```bash
npx tsx --tsconfig tsconfig.app.json src/dev/run-validation-probe.tsx
```

**Expected result** (abridged — the full output is the transcript quoted throughout this file):

```text
=== A. silent until submit, then all four problems at once ===
   errors before any interaction: 0
   after submitting an empty form: 3 errors
   POST requests sent: 0 (nothing is sent while the form is invalid)

=== D. a valid submit ===
   requests: 1
   POST /products
   body: {"name":"Probe Lamp","priceMinor":129950,"category":"accessories","blurb":"A lamp for probing.","inStock":true}
   success message: Product saved.

=== cleanup ===
   deleted GMl6C6p
   products in the database: 6 → p-keyboard, p-mouse, p-headphones, p-speaker, p-monitor-arm, p-keycap-set
```

The probe cleans up after itself — the lab's six seed products are intact, which matters because a probe that leaves rows behind makes every later transcript a lie.

---

## 13. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | Validating in the render body | errors computed on every render, weird ordering, "cannot update during render" warnings | compute errors in handlers, or (`shown in file 05`) derive them with a memo |
| 2 | Showing errors on the first keystroke | the form calls the user wrong while they type | show on blur, then live after the first submit |
| 3 | Reimplementing rules per field | cross-field rules drift; two fields disagree about the same value | one `validate(values)` function |
| 4 | Trusting the client | the API accepts things your rules reject, or rejects things they accept | handle `422` and map it (section 9, transcript E) |
| 5 | `errors.name = undefined` instead of `delete` | `Object.keys(errors).length > 0` stays true; "the form is invalid" forever | delete the key |
| 6 | No focus management | the user submits, sees nothing, does not know which field failed | `focusField(firstInvalidField(errors))` |
| 7 | Error text without `aria-describedby` | screen readers announce the field with no message | attach the message id to the field |
| 8 | `role="alert"` re-announcing on every keystroke | unusable with a screen reader | only render the element when there is something to say |
| 9 | Losing values on failure | the user retypes everything after a `500` | never reset state in `catch` (transcript F keeps both values) |
| 10 | Un-debounced async checks | one request per keystroke | debounce + validate first (14 keystrokes → 1 request) |
| 11 | Async check without a race guard | an older response overwrites a newer verdict | `cancelled` flag in the effect cleanup |
| 12 | `Number(price)` then `priceMinor = price * 100` | floats, rounding, `NaN` in the payload | parse with a regex, `Math.round`, keep integers |

---

## 14. Best practices

1. **One pure `validate(values)` function** per form, with no React and no I/O. Test it directly (Part 13), reuse it on the server if you share code.
2. **Type errors against the field names** (`Partial<Record<keyof Values, string>>`) so a new field cannot be forgotten.
3. **Timing: silent → blur shows one field → submit shows everything → then live.** That sequence is what transcript B and C encode.
4. **Focus the first invalid field on a failed submit**, in visual order.
5. **Write messages that state the expectation**, not the mistake; one message per field; no blame.
6. **Server errors reuse the same error state** via a mapping function; keep the user's values no matter what failed.
7. **Distinguish `422` (fix the data) from `500`/network (try again later)** in both message and behaviour.
8. **Debounce async checks, validate locally first, and guard against races.** A failed check must never block submission.
9. **Build accessibility in**: `label htmlFor`, `aria-invalid`, `aria-describedby`, `role="alert"`, `role="status"` for async "checking" hints.
10. **Keep the guard rails up**: `noValidate` on the form (so your messages, not the browser's bubbles), one `submittingRef`, and the button disabled while saving.

---

## 15. Practice

### Beginner

1. Add a `sku` field with these rules: required, uppercase letters/digits/hyphens only (`/^[A-Z0-9-]+$/`), 3–12 characters. Add it to `ProductFormValues`, `initialProductValues`, `validateProduct`, the `firstInvalidField` order, and the form's JSX — and notice how many places the compiler forced you to touch.
2. Change the price rule so that ₹0 is allowed for free items, but **only** when `inStock` is false. Verify with the probe that unchecking "In stock" clears the error without touching the price.
3. Make the blurb counter turn red (`className="over"`) when it exceeds 200 characters, without adding a new error message. Then explain why the counter is *not* validation.

### Intermediate

1. Add a **stock quantity** field (`quantity: string`) with rules: required, integer, 0–999, and a cross-field rule "out-of-stock items must have quantity 0". Show that changing either field re-evaluates the other, and prove it with a probe run.
2. Change the timing policy to "validate on change, show on blur". Which parts of `visibleError`/`markTouched`/`setField` change? Then argue for one policy in a comment, referencing what each does to a user typing an email address.
3. Make the uniqueness check use the edit case: when editing an existing product, a name equal to *its own* current name is not a conflict. (Hint: the check needs to know the product's id — `?name=X` returns the row, so compare `rows[0].id !== currentId`.) Add a `currentProductId?: string` prop.
4. Replace the `fetch` in the uniqueness effect with the typed `listProducts` from Part 7's API client, then wrap the parser/validator around the response (Part 7, file 11). What did you gain, and what did the extra code cost?

### Challenge

1. Add a **multi-step** version of this form (3 steps: basics, price, details) with per-step validation, a step indicator, and a rule that a step cannot advance while invalid. Keep one `values` object and one `validateProduct`; validate only the fields of the current step to decide whether Next is allowed. Then answer: what should happen if the user goes back, breaks step 1, and jumps forward?
2. Extract the whole system into a reusable hook:

```ts
type UseFormResult<V> = {
  values: V;
  errors: Partial<Record<keyof V, string>>;
  touched: Partial<Record<keyof V, boolean>>;
  isDirty: boolean;
  isSubmitting: boolean;
  setField: <K extends keyof V>(field: K, value: V[K]) => void;
  setTouched: (field: keyof V) => void;
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  reset: () => void;
};
```

Then rewrite `ValidatedProductForm` on top of it, and compare line counts. This is the exercise that makes file 04 (`react-hook-form`) obvious: you have just built a small, slower version of it — and the library's API will look like a familiar shape rather than magic.

3. Write a probe that **fuzzes** the price field: generate 200 random strings, run each through `parsePriceToMinor` and `validateProduct`, and assert invariants (`parsePriceToMinor(x) === null` ⟺ a price error is produced; no error message contains `undefined`/`NaN`; the parsed value never exceeds `Number.MAX_SAFE_INTEGER`). Report any counterexample.

---

## 16. Solutions

### Beginner

1. `ProductFormValues` + `initialProductValues` + `validateProduct` + `firstInvalidField`'s order + the `<TextInput>` in JSX — five places, and the compiler flags the missing `sku` in the values object and the form state. That is the point of deriving types: `ProductField` automatically includes `'sku'`, so `ProductErrors` accepts it and `firstInvalidField` forces a decision about ordering.
2. ```ts
   if (values.inStock) {
     if (priceMinor === null || priceMinor < 1_000) errors.price = 'In-stock items must be priced at ₹100 or more.';
   } else if (priceMinor !== null && priceMinor < 0) {
     errors.price = 'Price cannot be negative.';
   }
   ```
   Unchecking "In stock" calls `setField('inStock', false)`, which re-runs `validateProduct` (because the form was submitted) — and because `errors.price === undefined` is no longer required for the cross-field branch, the message must be cleared explicitly by deleting the key (which the merge does). Always verify with a probe: the transcript style makes the before/after obvious.
3. The counter is *feedback*, not validation: it tells the user where they are against the limit while they type, but the rule that blocks submission lives in `validateProduct`. This is the same split as `maxLength` vs `validateProduct` in file 02 — feedback can be instant and cosmetic; validation decides what may be submitted.

### Intermediate

1. `quantity` needs a numeric parse (`Number.parseInt` with a strict regex to reject `1.5`/`1e3`), a range rule, and the cross-field pair: `if (!values.inStock && quantity !== 0) errors.quantity = 'Out-of-stock items must have quantity 0.'` plus `if (values.inStock && quantity === 0) errors.quantity = 'In-stock items need at least 1 unit.'` Because both rules read both fields, any change re-evaluates both — the probe shows the message moving between fields as you toggle the checkbox, which is exactly what "validate the whole form" buys you.
2. "Validate on change" means `setField` always calls `validateProduct` (drop the `if (submitted)` guard); "show on blur" means `visibleError` returns a message only when `touched[field]` (and `submitted`). The user typing `a@b` gets *no* message until they leave the field, even though the state is invalid — the difference is invisible to the user but real in the code: you computed an error and refused to show it. For email fields this is the right behaviour; for a live "password strength" indicator it is not (that is feedback, not validation).
3. `rows[0].id !== currentProductId` — with the id absent (create mode) any match is a conflict; in edit mode the row that matches by name but shares the id is the product itself. Add `currentProductId` to the effect's dependency array, or the verdict will be stale after switching products (the same class of bug as file 02's `defaultValue`).
4. You gain: parsing/validation of the response (Part 7, file 11), consistent error handling (`HttpError`), and one place that knows the API's shape. You pay: the client's `listProducts` wraps query params in a `ProductQuery` object, so the "check by name" call needs a new query option (`name`), and the `Page`-shaped return (`{ items, total }`) must be unwrapped. When a single-purpose check fights the general client, either extend the client properly or keep the small `fetch` and document why — both are defensible; silently duplicating the transport logic is not.

### Challenge

1. Keep **one** values object and run `validateProduct` over the whole thing; for "may I advance?" check `Object.keys(errors).filter(field => stepFields[step].includes(field)).length === 0`. Going back, breaking step 1, and jumping forward: because you validate the *whole* form on submit, the final submit still fails with the step-1 error — so the honest behaviour is to make the step indicator show an error count per step and, on "Next", refuse with a message pointing at the offending step. A wizard that only validates the current step lets users reach the end with a broken beginning.
2. The hook's state is exactly the `useState` calls in this file; `handleSubmit` becomes a callback taking a `submit(values)` function; `isDirty` compares against `initialValues`; `reset` calls `setValues(initialValues)` and clears errors/touched/submitted. The library version (file 04) replaces state-per-field with refs + a subscription, so typing does not re-render the form — the API you just built is otherwise nearly identical, which is the best possible preparation for reading it.
3. A fuzz harness in this lab looks like:

```ts
const cases = ['', ' ', '0', '-1', '12.345', '1e3', '₹1,299.50', 'NaN', 'Infinity', '00012', '12,34', '..', '9'.repeat(20)];
for (const price of cases) {
  const parsed = parsePriceToMinor(price);
  const errors = validateProduct({ ...initialProductValues, name: 'ok', category: 'accessories', price });
  const priceError = errors.price;
  console.log(JSON.stringify(price).padEnd(14), String(parsed).padEnd(10), priceError ?? '(valid)');
}
```

Invariants to assert: `parsed === null` implies a price error exists; `parsed !== null` and no other rule triggered implies no price error; no message contains `undefined` or `NaN`; `Number.isSafeInteger(parsed)` for every non-null result. Running it against the 200-case fuzzer in the challenge (random lengths, unicode digits, thousand separators) is how you find the input your rules quietly accept.

---

## 17. Summary

- Validation lives in **four layers**; the client is fast and friendly, the **server is authoritative**, and the `422` path is part of the design, not an afterthought (measured: a payload the client accepted was rejected by the server, and the messages landed on the right fields).
- Put the rules in **one pure function** — `validateProduct(values): ProductErrors` — with errors typed as `Partial<Record<keyof Values, string>>`, a derived field-name union, and `delete` (never `undefined`) for cleared fields.
- **Timing is the difference between helpful and hostile**: silent at first, validate the blurred field, validate everything on submit, then re-validate live (measured in transcripts A, B and C).
- **Focus the first invalid field** on a failed submit, in visual order, using `form.elements.namedItem`.
- Attach messages to fields with `aria-invalid`, `aria-describedby` and `role="alert"`; use `role="status"` for "checking…" hints.
- **Async rules need three things**: local validation first (so you never ask about nonsense), a debounce (14 keystrokes → 1 request, measured), and a race guard (only the latest answer may set state).
- **Server errors are mapped onto the same error state**, values are never lost on failure, and `500`/network errors are treated as *our* problem, not the user's (measured in transcript F).
- The whole system is ~120 lines of rules plus a `TextInput`, and it composes with everything from file 01 and 02: `FormData` for uncontrolled fields, the double-submit guard from Part 7, and the typed API client from Part 7, file 11.

---

**What's next →** [`04-react-hook-form.md`](./04-react-hook-form.md) takes every concern in this file — per-field state, timing, touched, dirty, submit, focus, server errors — and shows what `react-hook-form` replaces, what it keeps, and where it is genuinely faster (it stops re-rendering on every keystroke). Then [`05-zod.md`](./05-zod.md) puts the *rules* themselves in a schema and derives the TypeScript types from it, so the rules and the types can never disagree.
