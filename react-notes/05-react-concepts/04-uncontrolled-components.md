# 04 — Uncontrolled Components: Let the DOM Own the Value

> **Part 5 · React Concepts · File 4 of 9**
> Why this file exists: not every field needs to be in React state. Sometimes React only needs the value **once** — at submit — and pushing it through state means a re-render for every keystroke for no benefit. Uncontrolled inputs let the browser hold the text, and React read it when it matters, via a ref or `FormData`. This chapter measures what that buys (`renders=1` while typing a whole word), shows the browser doing the resetting for free, and covers the cases where uncontrolled is not a preference but the only option (a file input cannot be given a `value` at all — React throws).

---

## 1. What "uncontrolled" means

An input is **uncontrolled** when the DOM keeps its own value and React only sets the *initial* one:

```tsx
// uncontrolled: the field remembers what the user types
<input name="email" defaultValue="ada@example.com" />

// controlled: React state remembers, and the field follows it
<input name="email" value={email} onChange={(event) => setEmail(event.target.value)} />
```

The difference is not "which prop you use" — it is **who owns the value while the user is typing**:

| | Controlled | Uncontrolled |
| --- | --- | --- |
| Who holds the text? | React state | the DOM node |
| What React writes | `value` on every render | `defaultValue`, only when the element is created |
| Who sees each keystroke? | your `onChange` handler | nobody, unless you ask |
| Re-renders while typing | one per keystroke | **none** |

---

## 2. `defaultValue`, `defaultChecked`, and what "initial" means

```tsx
<input name="email" defaultValue="ada@example.com" />
<textarea name="bio" defaultValue="Tell us something." />
<select name="plan" defaultValue="pro">…</select>
<input type="checkbox" name="newsletter" defaultChecked />
```

Three facts about `defaultValue` that prevent most surprises:

1. **It is used once per element instance** — when React creates the DOM node. Later renders with a different `defaultValue` do *not* update the field.
2. **Changing `key` creates a new instance**, so the initial value is applied again. This is the supported way to "reset by identity" (file 02):

   ```tsx
   <CommentBox key={draftId} initialText={draft.text} />
   ```

3. **A later user edit is not lost by an unrelated re-render.** Because React does not write to the field, a parent re-render leaves the typed text alone. That is the behaviour people *expect* from an HTML input.

❌ The mistake this causes:

```tsx
// The user sorted the table, the component re-rendered, and the filter text is
// still there (good) — but a *new* default is silently ignored (surprising).
<FilterInput defaultValue={suggestedQuery} />
//                     ^ changes to "keyboard" never appear in the field.
```

If the value must follow state, use `value` + `onChange`. If it must be initial-only, use `defaultValue` and change the `key` when you want a fresh start.

---

## 3. Reading the value: three ways

### On submit, with `FormData` (the modern default)

```tsx
function SignupForm({ onSubmit }: { onSubmit: (data: FormData) => void }) {
  return (
    <form
      className="signup"
      onSubmit={(event) => {
        event.preventDefault();                       // stop the browser's navigation
        onSubmit(new FormData(event.currentTarget));  // collect every named field at once
      }}
    >
      <label>Email<input name="email" type="email" defaultValue="ada@example.com" required /></label>
      <label>
        Plan
        <select name="plan" defaultValue="pro">
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>
      </label>
      <button type="submit">Create account</button>
      <button type="reset">Reset</button>
    </form>
  );
}
```

This is the pattern React's own `<form>` documentation recommends for reading submitted values: *"This example reads the submitted values with `new FormData(e.target)`, which collects every field by its `name`. This keeps the inputs uncontrolled."*

### On submit, with a ref

```tsx
const emailRef = useRef<HTMLInputElement>(null);
<input ref={emailRef} name="email" />
// later, in a handler: const email = emailRef.current?.value ?? '';
```

Useful when you need one field's value outside a submit event (`onBlur` validation, a keyboard shortcut, an imperative "focus and select"). For a whole form, `FormData` is less code and fewer refs to keep aligned with field names.

### As the user types, but without re-rendering

```tsx
<input
  name="query"
  defaultValue=""
  onChange={(event) => {
    // The DOM owns the value; this handler just reports it upward.
    // No state in THIS component → no re-render here.
    onQueryChanged(event.target.value);
  }}
/>
```

This is a real and useful hybrid: the field is uncontrolled (no `value` prop) but the parent hears about changes — which is exactly what a debounced search box wants:

```tsx
function DebouncedSearch({ onSearch }: { onSearch: (query: string) => void }) {
  const [committed, setCommitted] = useState('');            // controlled: only the COMMITTED value
  const debounced = useDebouncedValue(committed, 300);        // Part 4, file 09

  useEffect(() => {
    onSearch(debounced);
  }, [debounced, onSearch]);

  return <input name="query" defaultValue="" onChange={(event) => setCommitted(event.target.value)} />;
}
```

Note what is controlled and what is not: the input is uncontrolled (it never re-renders), while the *committed* value — the one that triggers work — is state. That is the professional version of "controlled costs a render per keystroke", and it is why the lab's search box, which is small and cheap, can afford to be fully controlled.

---

## 4. Measured: the whole form, without a single keystroke re-render

**File: `src/dev/forms-probe.tsx`** — a form with an input and a select, both uncontrolled, plus a submit button that reads `FormData` and stores only the *result*:

```tsx
function UncontrolledForm() {
  formRenders += 1;
  const [submitted, setSubmitted] = useState('(never submitted)');

  return (
    <div>
      <form
        className="plain-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setSubmitted(`email=${String(data.get('email'))} · plan=${String(data.get('plan'))}`);
        }}
      >
        <input className="email" name="email" defaultValue="ada@example.com" />
        <select className="plan" name="plan" defaultValue="pro">…</select>
        <button className="submit" type="submit">Submit</button>
        <button className="reset" type="reset">Reset</button>
      </form>
      <span className="submitted">{submitted}</span>
    </div>
  );
}
```

**Verified** — the whole session:

```text
8. uncontrolled form defaults (no React state involved): email=ada@example.com · plan=pro · renders=1
9. after submitting, read with FormData: submitted="email=grace@example.com · plan=free" · renders=2
10. after clicking the reset button: email=ada@example.com · plan=pro
```

Reading the numbers:

- The user typed a new email (`grace@example.com`) and changed the select to `free`. The component still says `renders=1` — **no re-render happened during editing**, because React was never told about the changes.
- Submitting produced the correct values from `FormData` (`email=grace@example.com · plan=free`) and rendered **once more** (`renders=2`) to show the result. Two renders for the entire interaction, versus one per keystroke for a controlled version.
- The native **reset** button restored the `defaultValue`s (`ada@example.com`, `pro`) with no React code at all. The browser did it, because the DOM owns the values.

⚠️ **The reset button is a reminder about ownership.** With uncontrolled inputs, `<button type="reset">` works. With controlled inputs it does *nothing you can see*: React immediately re-renders the fields from state, so the reset is undone. (That is a common bug report: "the reset button does not work" — and the answer is either to reset the state or to use `key`.) Part 8's forms chapter handles reset for both modes.

---

## 5. What uncontrolled gives you, and what it costs

**Verified**, single uncontrolled input:

```text
4. uncontrolled input after typing "ab": dom=ab · ref=ab · renders=1
```

Typing changed the DOM, the ref read exactly what the DOM held (`ab`), and the component rendered **once** (at mount).

| Freedom you gain | Responsibility you take on |
| --- | --- |
| no re-render per keystroke | no live validation, no derived preview, no conditional styling as the user types |
| the browser's own behaviour (autofill, undo, reset, caret) is untouched | React state cannot be the single source of truth for that field |
| less code for short forms | reading the value needs a ref or `FormData` at the right moment |
| third-party widgets that manage their own DOM work naturally | resetting programmatically means `form.reset()` or changing the `key` |
| **file inputs work at all** (see below) | you cannot force a value into a file input |

---

## 6. File inputs must be uncontrolled

**Verified** — React throws if you try:

```text
6. <input type="file" value="x" />: THROWN: This input element accepts a filename,
   which may only be programmatically set to the empty string.
```

`<input type="file">` is uncontrolled by nature: the browser forbids scripts from setting a filename (a security measure — a page must not be able to upload a file the user did not choose). So the React pattern is always:

```tsx
function AvatarUpload({ onFile }: { onFile: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const file = inputRef.current?.files?.[0];
        if (file !== undefined) onFile(file);
      }}
    >
      <label htmlFor="avatar">Choose a picture</label>
      <input id="avatar" ref={inputRef} name="avatar" type="file" accept="image/*" />
      {/* Clearing a file input IS allowed — the empty string is the only legal value. */}
      <button type="button" onClick={() => { if (inputRef.current) inputRef.current.value = ''; }}>
        Clear chosen file
      </button>
      <button type="submit">Upload</button>
    </form>
  );
}
```

💡 `inputRef.current.files` is a `FileList` (array-like, not an array). Convert with `Array.from(input.files ?? [])` when you need array methods, and validate `type` and `size` before uploading — the `accept` attribute is only a hint to the file picker, not a constraint.

---

## 7. When uncontrolled is the right answer

| Situation | Why uncontrolled wins |
| --- | --- |
| **Long, cold forms** (20 fields nobody validates live) | a re-render per keystroke buys nothing; read everything with `FormData` on submit |
| **Search boxes with debounce** | the DOM holds the text; only the committed value goes into state (section 3) |
| **File uploads** | the only option (section 6) |
| **Wrapping a third-party widget** (a date picker, a rich text editor, a map) | the widget owns its DOM; a ref is your bridge |
| **Progressive enhancement** | a plain HTML form submits and works before (or without) JavaScript; React reads `FormData` when it is there |
| **Settings screens with "Save"/"Cancel"** | the browser's reset button restores defaults; no state to unwind |
| **Performance-critical screens** | typing in one field must not re-render a large tree (file 02's colocation problem, solved by not having the state at all) |
| **Autofill-heavy flows** (login, address, payment) | the browser's autofill writes into the DOM; a controlled field needs the autofill to trigger `input` events correctly, whereas uncontrolled simply works |

---

## 8. When controlled is the right answer

| Situation | Why controlled wins |
| --- | --- |
| Validation, error messages, character counters **as the user types** | the value must be readable during render |
| Formatting/masking (phone numbers, currency, uppercase codes) | you must transform each keystroke (file 03, section 9) |
| Conditional UI (disable submit, show suggestions, enable a next step) | the UI depends on the value, now |
| Cross-field rules ("confirm password matches") | two values must be compared during render |
| Programmatic changes (a "fill with sample data" button, clearing on a filter change) | only state can push values in |
| Values shared with siblings or the parent | the owner is above the field (files 01–02) |
| Undo/redo, time travel, or `useReducer`-driven forms | the value is part of a bigger state machine (Part 4, file 06) |

---

## 9. The decision, in one question

> **"Does anything in the app need this value *while the user is still typing it*?"**

| Answer | Mode |
| --- | --- |
| No — it is needed at submit, on blur, or after a debounce | **uncontrolled** (`defaultValue` + `FormData`/ref) |
| Yes — validation, formatting, derived UI, sharing, programmatic changes | **controlled** (`value` + `onChange`) |

And when a form mixes both (very common):

```tsx
function CheckoutStep() {
  const [coupon, setCoupon] = useState('');      // controlled: validated as you type
  return (
    <form onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget), coupon); }}>
      {/* uncontrolled: address fields, needed only at submit */}
      <input name="address" defaultValue="" />
      <input name="city" defaultValue="" />
      {/* controlled: the discount is applied live */}
      <input name="coupon" value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} />
      <button type="submit">Place order</button>
    </form>
  );
}
```

⚠️ **Do not mix modes for the same field** across renders — that is React's "changing a controlled input to be uncontrolled" error (file 03, section 6). Mixing across *fields* is normal and encouraged.

---

## 10. React 19: form `action`s (a preview)

React 19 added a third option for submitting a form — passing a **function** to `action` instead of using `onSubmit`:

```tsx
// React 19: `action` runs the submission in a Transition, and React resets the
// uncontrolled fields automatically when the action succeeds.
async function subscribe(formData: FormData) {
  await fetch('/api/subscribe', { method: 'POST', body: formData });
}

<form action={subscribe}>
  <input name="email" type="email" required />
  <button type="submit">Subscribe</button>
</form>
```

From the official `<form>` documentation, the differences that matter here:

- *"Unlike `onSubmit`, an `action` runs in a **Transition** and calling `e.preventDefault()` isn't needed."*
- *"After the `action` function succeeds, all **uncontrolled** field elements in the form are reset."* — so `defaultValue` fields clear themselves when the submission works.
- An `action` can be a **Server Function**, which `onSubmit` cannot.
- *"When a function is passed to `action` or `formAction` the HTTP method will be POST regardless of value of the `method` prop."*

`onSubmit` + `FormData` remains fully supported and is the right choice when you want direct access to the event or when you are not using actions/transitions yet. Part 8 covers `action`, `useActionState`, `useFormStatus` and `useOptimistic` in depth; the reason it belongs in *this* chapter is that the feature depends on uncontrolled fields: it can only reset fields the DOM owns.

---

## 11. Side by side

| | Controlled | Uncontrolled |
| --- | --- | --- |
| Value lives in | React state | the DOM |
| API | `value` + `onChange` | `defaultValue` (+ `name`), read with a ref or `FormData` |
| Re-render per keystroke | yes | no (measured: `renders=1` for a whole editing session) |
| Read the value | any time, during render | on submit / on blur / via a ref |
| Live validation & formatting | natural | awkward (you would add state, i.e. go controlled) |
| Programmatic write | `setState` | only by remounting (`key`) or the DOM API |
| Browser reset button | ineffective (React re-renders the old state) | works (measured) |
| Browser autofill/undo/caret | can fight React if you transform values | untouched |
| File inputs | **impossible** (React throws) | the only way |
| Reading many fields at once | one state object + a generic handler | `new FormData(form)` |
| Best for | interactive, validated, shared values | short/cold forms, files, third-party widgets, performance |

⚠️ **There is no universal winner.** A login form with live validation and a status message is cleaner controlled. A 25-field onboarding form whose only rule is "everything filled" is cleaner uncontrolled, and it renders less. What is *wrong* is choosing a mode by habit and then fighting it: the two symptoms to recognise are "I need a re-render per keystroke but kept the DOM" (add state — go controlled) and "I keep re-rendering a huge tree to read a value once" (remove the state — go uncontrolled).

---

## 12. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `value` without `onChange` (the "uncontrolled" attempt that is actually controlled) | React's read-only warning; the field will not accept typing | `defaultValue`, or add `onChange` |
| 2 | expecting `defaultValue` to update when the prop changes | the field keeps the first value | change the `key` (new instance) or go controlled |
| 3 | a `<button type="reset">` in a controlled form | "the reset button does nothing" | reset the state, or change the `key`, or use uncontrolled fields |
| 4 | a file input with `value` | React throws: "This input element accepts a filename…" | read `input.files` through a ref |
| 5 | forgetting `name` on fields read with `FormData` | `data.get('email')` is `null` | name every field you read |
| 6 | reading `FormData` outside the submit event | values from a form that has since changed | read inside `onSubmit` (or from a ref at the moment you need it) |
| 7 | validating live on an uncontrolled field by keeping a parallel state copy | two sources of truth again (file 02) | go controlled, or validate on blur/submit |
| 8 | treating `input.files` as a real array | `files.map is not a function` | `Array.from(input.files ?? [])` |
| 9 | trusting `accept="image/*"` | non-images get uploaded | check `file.type` and `file.size` in code, and again on the server |
| 10 | expecting autofill/clearing to update React state | the state and the field disagree | read the DOM, or go controlled |
| 11 | mixing modes for the same field over time | "changing a controlled input to be uncontrolled" | pick one mode per field and keep the prop type stable |
| 12 | uncontrolled inputs with no submit handler | the page reloads and the values vanish | `onSubmit` + `preventDefault()`, or React 19's `action` |

---

## 13. Best practices

1. **Default to controlled for interactive fields, uncontrolled for cold ones** — and say out loud which one you chose, and why (the one-question test in section 9).
2. **Always name your fields** (`name="email"`), even in controlled forms: autofill, `FormData`, and readability all depend on it.
3. **Read on submit with `new FormData(event.currentTarget)`** rather than assembling values from many refs.
4. **Use `form.reset()`** for uncontrolled resets, and `key` when you want to reset a component's *identity* (file 02).
5. **File inputs are always uncontrolled**; validate type and size before uploading, and clear them by setting `value = ''`.
6. **Debounce the commit, not the keystroke**: uncontrolled field + controlled committed value (section 3).
7. **Do not fight the browser**: autofill, undo, and caret behaviour are free if you let the DOM own the text.
8. **Prefer a plain HTML form** when it is enough — progressive enhancement is a feature, and React reads `FormData` happily.
9. **Measure before optimising**: the win of uncontrolled is "no re-render per keystroke", which only matters when the tree above the field is expensive (file 02).
10. **Keep the mode stable per field**: controlled or uncontrolled for the instance's whole life (file 03, section 6).

---

## 14. Real-world example: an address form that only speaks at submit

The lab's checkout step is a form the user fills once and submits — no live validation, no siblings, nothing derived:

```tsx
// src/practice/AddressForm.tsx
export interface Address {
  fullName: string;
  address: string;
  city: string;
  pincode: string;
}

export function AddressForm({ onSubmit, savedAddress }: { onSubmit: (address: Address) => void; savedAddress?: Address }) {
  // `key` on the form: when the saved address changes, the whole form is a new
  // instance, so every uncontrolled field picks up the new default values.
  return (
    <form
      key={savedAddress === undefined ? 'empty' : `${savedAddress.pincode}-${savedAddress.city}`}
      className="address-form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          fullName: String(data.get('fullName') ?? ''),
          address: String(data.get('address') ?? ''),
          city: String(data.get('city') ?? ''),
          pincode: String(data.get('pincode') ?? ''),
        });
      }}
    >
      <label htmlFor="fullName">Full name</label>
      <input id="fullName" name="fullName" defaultValue={savedAddress?.fullName ?? ''} autoComplete="name" required />

      <label htmlFor="address">Address</label>
      <input id="address" name="address" defaultValue={savedAddress?.address ?? ''} autoComplete="street-address" required />

      <label htmlFor="city">City</label>
      <input id="city" name="city" defaultValue={savedAddress?.city ?? ''} autoComplete="address-level2" required />

      <label htmlFor="pincode">PIN code</label>
      <input id="pincode" name="pincode" defaultValue={savedAddress?.pincode ?? ''} autoComplete="postal-code" inputMode="numeric" pattern="\d{6}" />

      <div className="address-form__actions">
        <button type="submit">Save address</button>
        <button type="reset">Reset</button>
      </div>
    </form>
  );
}
```

Why uncontrolled here:

- **Nothing needs the values while typing** — the address is not filtered, formatted, or compared against anything.
- **Autofill is the primary input method**, and leaving the DOM in charge makes autofill behave exactly as the browser intends.
- **`pattern="\d{6}"`** gives browser-level validation with an accessible message, so even the PIN code needs no React state.
- **`type="reset"` works**, and the `key` handles "load a saved address" by remounting with new defaults.

Where the lab *does* use controlled fields: the search box (results update per keystroke), the category filter (two components share the value), the quantity stepper (bounds and derived totals), and the coupon field (live discount). Same app, two modes, chosen per field by the one-question test — which is what "knowing both patterns" actually looks like in a real codebase.

---

## 15. Practice

### Beginner — choose a mode and justify it

For each field, decide controlled or uncontrolled, write the JSX (complete, with label, `name`, and the reading mechanism), and give the one-sentence reason:

1. An email field in a newsletter signup (nothing happens until submit).
2. A search box filtering a 1,000-row table as the user types.
3. A "confirm password" field that must match the password field.
4. An avatar file picker.
5. A coupon code that shows "Coupon applied: ₹200 off" live.
6. A "Date of birth" field that shows a live age ("32 years") next to it.
7. A textarea in a 25-field onboarding form, validated only on submit.

### Intermediate — convert a form the other way

Take the controlled `CheckoutForm` from file 03 (email, full name, address, city, PIN) and write an **uncontrolled** version with the same appearance and submission behaviour:

1. Use `defaultValue`, `name` attributes and `FormData`.
2. Keep the same submit result type (`CheckoutDraft`).
3. Add a "Load sample data" button that fills every field — then explain why this is awkward in the uncontrolled version, and how you solved it (`key` remount? a ref per field? both?).
4. Measure the render counts of both versions while typing: `console.count('CheckoutForm')` in each.

Then answer: with a 25-field form, which mode would you ship, and what changes if the product asks for live validation on all 25 fields?

### Challenge — a hybrid file + metadata upload form

**File: `src/practice/UploadForm.tsx`**

Build an upload form for a product image:

1. A file input (uncontrolled, with a ref) that validates `type` starts with `image/` and `size <= 2 MB`, showing an error otherwise.
2. A title field that is **controlled** (live character count, max 60) and an alt-text textarea that is **uncontrolled** (required, validated by the browser).
3. A preview: after a file is chosen, show its name, size (formatted) and a local preview URL via `URL.createObjectURL` — and **revoke** the URL when the file changes or the component unmounts.
4. A submit handler that assembles `{ title, altText, file }` and passes it up. Use `FormData` for the uncontrolled fields and the ref for the file.
5. A "Clear" button that empties the file input (the only legal programmatic value) and resets the title to `''`.

Then answer two questions: (a) why does the preview need special cleanup, and what leak happens without it? (b) Why is the title controlled while the alt text is not, when both are "text the user types"?

---

## 16. Solutions

### Beginner

```tsx
// 1. Newsletter email — UNCONTROLLED. Nothing needs the value until submit.
<form onSubmit={(event) => { event.preventDefault(); subscribe(new FormData(event.currentTarget)); }}>
  <label htmlFor="news-email">Email</label>
  <input id="news-email" name="email" type="email" autoComplete="email" defaultValue="" required />
  <button type="submit">Subscribe</button>
</form>

// 2. Table search — CONTROLLED. Results must update as the user types.
const [query, setQuery] = useState('');
<input name="query" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />

// 3. Confirm password — CONTROLLED. Two values must be compared during render.
const [password, setPassword] = useState('');
const [confirm, setConfirm] = useState('');
const mismatch = confirm !== '' && confirm !== password;
<input name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
<input name="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
       aria-invalid={mismatch} aria-describedby={mismatch ? 'confirm-error' : undefined} />
{mismatch && <p id="confirm-error" role="alert">Passwords do not match.</p>}

// 4. Avatar picker — UNCONTROLLED, always (React throws on a file value).
const fileRef = useRef<HTMLInputElement>(null);
<input ref={fileRef} name="avatar" type="file" accept="image/*" />

// 5. Coupon code — CONTROLLED. The discount is shown live, so the value is needed during render.
const [coupon, setCoupon] = useState('');
const discount = coupon.toUpperCase() === 'SAVE200' ? 20000 : 0;   // ₹200 in paise
<input name="coupon" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} />
{discount > 0 && <p>Coupon applied: ₹200 off</p>}

// 6. Date of birth with a live age — CONTROLLED. The age is derived from the value as it changes.
const [dob, setDob] = useState('');
const age = dob === '' ? null : new Date().getFullYear() - new Date(dob).getFullYear();
<input name="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
{age !== null && <span>{age} years</span>}

// 7. Onboarding textarea — UNCONTROLLED. Nothing reads it until submit.
<label htmlFor="notes">Anything we should know?</label>
<textarea id="notes" name="notes" rows={4} defaultValue="" />
```

The pattern in the answers: **if something in the UI must change while the characters are being typed, the value must be state.**

### Intermediate

```tsx
// Uncontrolled twin of the controlled CheckoutForm.
export function CheckoutFormUncontrolled({ onSubmit }: { onSubmit: (draft: CheckoutDraft) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [formKey, setFormKey] = useState(0);     // bumping the key remounts → new defaults

  const readDraft = (form: HTMLFormElement): CheckoutDraft => {
    const data = new FormData(form);
    return {
      email: String(data.get('email') ?? ''),
      fullName: String(data.get('fullName') ?? ''),
      address: String(data.get('address') ?? ''),
      city: String(data.get('city') ?? ''),
      pincode: String(data.get('pincode') ?? ''),
    };
  };

  const sample: CheckoutDraft = {
    email: 'ada@example.com',
    fullName: 'Ada Lovelace',
    address: '12 MG Road',
    city: 'Pune',
    pincode: '411001',
  };

  return (
    <form
      key={formKey}
      ref={formRef}
      className="checkout"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(readDraft(event.currentTarget));
      }}
    >
      <label>Email<input name="email" type="email" defaultValue="" autoComplete="email" required /></label>
      <label>Full name<input name="fullName" defaultValue="" autoComplete="name" required /></label>
      <label>Address<input name="address" defaultValue="" autoComplete="street-address" /></label>
      <label>City<input name="city" defaultValue="" autoComplete="address-level2" /></label>
      <label>PIN code<input name="pincode" defaultValue="" inputMode="numeric" autoComplete="postal-code" /></label>

      <button type="submit">Place order</button>
      {/* Filling several uncontrolled fields at once is done by REMOUNTING them
          with new defaults — not by assigning to .value through refs, which would
          be five imperative writes that React does not know about. */}
      <button
        type="button"
        onClick={() => {
          setFormKey((k) => k + 1);
          // A remount resets to the defaults, so give the defaults the sample data
          // on the next render:
          setSeedSample(true);
        }}
      >
        Load sample data
      </button>
      <button type="reset">Reset</button>
    </form>
  );
}
```

A cleaner form of the same idea is to make the defaults a piece of state and mount the fields from it:

```tsx
const [seed, setSeed] = useState<CheckoutDraft>(emptyDraft);
return (
  <form key={JSON.stringify(seed)} …>          {/* key changes whenever the seed changes */}
    <input name="email" defaultValue={seed.email} … />
    …
    <button type="button" onClick={() => setSeed(sample)}>Load sample data</button>
  </form>
);
```

**Why "Load sample data" is awkward here**: uncontrolled fields can only be changed by remounting (or by writing to the DOM imperatively through refs, which React will not know about — fine for a reset, risky in general because it bypasses the value tracker). In the controlled version it is one `setDraft(sample)`. That is the honest trade: *uncontrolled is cheaper per keystroke; controlled is better at programmatic changes.*

**Render counts**: typing ten characters in the uncontrolled form keeps `CheckoutForm` at **1** render; in the controlled version it reaches **11**. Whether that matters depends on what else renders when the form does — in a page with a chart next to it, it matters a lot (file 02's colocation lesson).

**25 fields + live validation on all of them** → controlled (or a form library — Part 8). Live validation *requires* the values during render, which is exactly the definition of a controlled form. The mitigation for the cost is not "go uncontrolled"; it is colocating state, splitting the form into field-level components, and memoising what is expensive.

### Challenge

**File: `src/practice/UploadForm.tsx`**

```tsx
import { useEffect, useRef, useState, type ChangeEvent } from 'react';

export interface UploadPayload {
  title: string;
  altText: string;
  file: File;
}

const MAX_BYTES = 2 * 1024 * 1024;
const formatBytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

export function UploadForm({ onUpload }: { onUpload: (payload: UploadPayload) => void }) {
  const [title, setTitle] = useState('');                 // controlled: char count is live
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Create and revoke the object URL in ONE effect: cleanup always runs before the
  // next URL is created, and once more on unmount.
  useEffect(() => {
    if (file === null) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);       // without this, the blob is kept alive forever
    };
  }, [file]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    if (chosen === null) {
      setFile(null);
      setFileError(null);
      return;
    }
    if (!chosen.type.startsWith('image/')) {
      setFile(null);
      setFileError('That file is not an image.');
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setFile(null);
      setFileError(`That image is ${formatBytes(chosen.size)} — the limit is 2.00 MB.`);
      return;
    }
    setFileError(null);
    setFile(chosen);
  };

  const clearAll = () => {
    setTitle('');
    setFile(null);
    setFileError(null);
    if (fileRef.current !== null) fileRef.current.value = '';   // the ONLY legal value
  };

  return (
    <form
      className="upload"
      onSubmit={(event) => {
        event.preventDefault();
        if (file === null) return;
        const data = new FormData(event.currentTarget);
        onUpload({ title, altText: String(data.get('altText') ?? ''), file });
      }}
    >
      <label htmlFor="title">Title ({title.length}/60)</label>
      <input id="title" name="title" value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} />

      <label htmlFor="altText">Alt text (describes the image for screen readers)</label>
      <textarea id="altText" name="altText" rows={2} defaultValue="" required />

      <label htmlFor="image">Image (max 2 MB)</label>
      <input id="image" ref={fileRef} name="image" type="file" accept="image/*" onChange={handleFileChange} />
      {fileError !== null && <p role="alert">{fileError}</p>}

      {file !== null && (
        <figure className="upload__preview">
          {previewUrl !== null && <img src={previewUrl} alt="" width={120} />}
          <figcaption>
            {file.name} · {formatBytes(file.size)} · {file.type}
          </figcaption>
        </figure>
      )}

      <div className="upload__actions">
        <button type="submit" disabled={file === null || title.trim() === ''}>Upload</button>
        <button type="button" onClick={clearAll}>Clear</button>
      </div>
    </form>
  );
}
```

The two answers:

- **(a) The preview URL must be revoked.** `URL.createObjectURL(file)` allocates a blob URL that the browser holds until the document is unloaded *unless* you revoke it; each new file creates another one. Uploading twenty images in one session without revocation keeps twenty file blobs in memory (potentially hundreds of megabytes) — a real leak that shows up as an unresponsive tab. Putting create **and** revoke in the same effect makes it airtight: React runs the cleanup before creating the next URL, and once more on unmount, so exactly one URL is alive at a time and none survive the component.
- **(b) Title is controlled because a live character counter is derived from it** (`{title.length}/60`) and because `maxLength` alone does not tell the user how close they are. Alt text is uncontrolled because nothing reads it until submit — the browser's `required` attribute handles the only rule it has, and the DOM keeps the text without a render per keystroke. Both are "text the user types"; they differ in whether **the render needs the value**. That is the whole decision rule, applied twice.

---

## 17. Summary

- **Uncontrolled** means the DOM owns the value: React sets an initial `defaultValue`/`defaultChecked` once per element instance and otherwise keeps its hands off.
- Reading it: **`new FormData(event.currentTarget)`** on submit (React's documented approach), a **ref** for one field or a moment outside submit, or an `onChange` handler that reports upward **without storing** the value locally.
- **Measured:** a whole editing session on an uncontrolled form cost **one** render; submitting cost one more (`renders=1` → `renders=2`), and the browser's own `type="reset"` button restored the defaults with zero React code.
- The trade is explicit: **no re-render per keystroke** versus **no live validation, formatting, conditional UI, or programmatic writes**. Uncontrolled values are readable at submit, on blur, or through a ref — not during render.
- **File inputs are always uncontrolled** (React throws on a `value` prop); use a ref, validate type and size, and clear with `value = ''`.
- **`defaultValue` is initial-only**: to change it, change the `key` (a new instance) — the same identity trick as file 02.
- Hydrids are normal and recommended: an uncontrolled field that reports changes upward, with only the **committed** value in state (the debounced-search pattern).
- **React 19's `action` prop** runs submissions in a Transition and resets uncontrolled fields automatically when the action succeeds — one more reason the uncontrolled mode is not legacy.
- The decision, in one question: *does anything need the value while the user is still typing?* Yes → controlled (file 03). No → uncontrolled. Never mix modes within one field's lifetime.

---

**What's next →** [`05-forms.md`](./05-forms.md): the two modes working together in real forms. We will build a complete, accessible product-review form: correct labels, grouped radios, a `fieldset`, browser-level validation plus React-level messages, a submit button with a pending state, reset that respects both modes, and the trick for focusing the first invalid field — plus a first look at React 19 form `action`s and where `react-hook-form` fits in Part 8.
