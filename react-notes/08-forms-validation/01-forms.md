# 01 — Forms: How HTML Forms Actually Work (and What React Changes)

> **Part 8 · Forms and Validation · File 1 of 5**

Why this file exists: almost every React bug involving forms comes from not knowing what the browser does *before* your JavaScript runs. A form is not a `<div>` with inputs in it — it is a stateful HTML mechanism with its own submission protocol, its own serialisation format (`FormData`), its own validation engine, and its own default behaviour of **navigating away from your app**. React does not remove any of that; it only gives you hooks to intercept it. This file walks the mechanism end to end with a jsdom probe that prints what actually happens at each step, then shows the two React styles you will meet for the rest of this part.

---

## 1. What a form is

A `<form>` is a container for **form-associated elements** (`input`, `select`, `textarea`, `button`, `fieldset`, `output`, `object`, `progress`, `meter`) that the browser groups together for one purpose: collecting named values and sending them somewhere.

```html
<form action="/search" method="get">
  <input name="q" />
  <button type="submit">Go</button>
</form>
```

Three pieces of machinery come with that markup:

1. **A submit protocol.** Some action — clicking a submit button, pressing Enter in a text field, calling `form.requestSubmit()`, or (in some browsers) implicit submission from a single-input form — triggers the same sequence: constraint validation → `submit` event → serialise fields → send a request (or, for `method="get"`, update the URL).
2. **A serialisation format.** The browser can turn all named fields into key/value pairs: `q=keyboard`. This is what `FormData` exposes to you.
3. **A validation engine.** `required`, `type="email"`, `pattern`, `min`/`max`, `maxlength`, `step` and friends are checked *by the browser* before the submit event fires. You get native messages for free — and, crucially for React, you get them **for free only if you let the browser finish its job**.

⚠️ **The default is a full-page navigation.** If you write a form in React with an `onSubmit` handler that does not call `event.preventDefault()`, the browser will do exactly what the form says: leave your single-page app and load a new document. Learning React forms is mostly learning the three ways to take over that default — and one of them (`action={fn}`) is new in React 19 and covered in section 8.

---

## 2. Why the browser's version is often enough

Before reaching for a form library, notice how much the platform already does:

| Browser feature | What you would otherwise have to build |
| --- | --- |
| `name` + `FormData` | manual state for every field |
| `required`, `type="email"`, `pattern`, `min`, `max`, `step` | a validation function per rule, per field |
| `:invalid` / `:valid` CSS | classes toggled by your own validation state |
| native error bubbles | an error-message component per field |
| implicit submission (Enter) | a keydown handler per input |
| `autocomplete`, password managers, mobile keyboards | nothing you *can* build — these come from correct markup |
| accessibility wiring (`<label for>`, `fieldset`/`legend`, `aria-invalid` semantics) | careful manual ARIA work |

Reach for your own controlled inputs **after** deciding you need React to know every keystroke. Section 7 is the decision table; the lab's `ProductForm` (file 05 of Part 7) is a controlled form, and file 05 of *this* part builds an uncontrolled one, so you can compare them honestly.

---

## 3. The submit sequence, traced

Run: the probe below renders a form with an `onSubmit` handler that logs, clicks the submit button, and records what happens. Both halves — *without* and *with* `preventDefault()` — are shown.

```text
=== A. submitting a form asks the browser to navigate ===
   the React handler ran: onSubmit fired (no preventDefault)
   jsdom then reported: Not implemented: HTMLFormElement's requestSubmit() method
   jsdom does not implement form submission, so it stops at the events. In a real browser this
   navigates to /search?q=keyboard (and in an SPA that is exactly what you do not want).
   the browser would send: GET /search?q=keyboard

   with preventDefault: onSubmit + preventDefault (defaultPrevented=true)
   jsdom reported: (nothing)
```

What to read out of this:

- The handler **did** run in both cases — `onSubmit` fires as part of the submit sequence, before any navigation.
- Without `preventDefault()`, the browser continues with its own plan. jsdom cannot navigate, so it logs `Not implemented: HTMLFormElement's requestSubmit()`; a real browser would issue `GET /search?q=keyboard` and replace the whole page.
- With `preventDefault()`, nothing else happens: the sequence stops, and you are free to talk to an API instead.

💡 The reason this matters so much in React is that a full navigation throws away all your React state, the router's location, and every in-flight request. In a single-page app, a submit handler without `preventDefault()` looks like "the app randomly reloaded".

### The three ways a submit starts

| Trigger | What the browser does | React equivalent |
| --- | --- | --- |
| Click a `<button type="submit">` (or `<input type="submit">`) | full sequence, `SubmitEvent.submitter` = that button | `onSubmit` / `action` |
| Press Enter inside a text input | same sequence (implicit submission) | `onSubmit` / `action` |
| `form.requestSubmit()` | same sequence (validation included) | — |
| `form.submit()` | **skips validation and the `submit` event**, sends immediately | — |

Verified — note especially the third line, which is the one people get wrong:

```text
=== C. click, submit() and requestSubmit() are three different things ===
   clicking the button            → onSubmit (submitter=save)
   form.requestSubmit()           → onSubmit (submitter=none)
   form.submit()                  →   (jsdom stopped at the submission itself)
   in browsers, requestSubmit() runs constraint validation first and submit() skips it entirely —
   so calling form.submit() from a handler is a validated-submit bypass you probably do not want.
```

`form.submit()` is a DOM method, **not** an event, and it deliberately bypasses everything you would want: constraint validation, the `submit` event, and therefore your React handler. If you ever need to submit programmatically, call `form.requestSubmit()`.

---

## 4. `FormData`: the browser's own serialiser

`new FormData(form)` reads every *successful* control in the form and produces key/value pairs. "Successful" is a term from the HTML spec, and its rules surprise people:

```text
=== B. what FormData collects (the browser's own serialisation) ===
   fields: name=Asha · search= · subscribe=on · plan=pro · tier=gold · tags=a · tags=c · note=hi there · hidden-field=hidden-value · file=[object File]
   plus the clicked submitter: name=Asha · search= · subscribe=on · plan=pro · tier=gold · tags=a · tags=c · note=hi there · hidden-field=hidden-value · file=[object File] · intent=save
   form.elements.length = 15
   note: an unchecked checkbox is absent, a radio group contributes only its checked member,
         a multiple select repeats the name, a disabled field is skipped, hidden/file are included
```

Reading that output rule by rule:

| Field in the probe | In `FormData`? | Why |
| --- | --- | --- |
| `<input name="name">` | ✅ `name=Asha` | a text input with a name is successful |
| `<input name="search">` (empty) | ✅ `search=` | empty is a value; *missing* is not the same as empty |
| `<input type="checkbox" defaultChecked>` | ✅ `subscribe=on` | a checked checkbox contributes `value`, default `"on"` |
| unchecked `<input type="checkbox" name="newsletter">` | ❌ absent | unchecked checkboxes are **not** successful |
| `<input type="radio" name="plan">` × 2 | ✅ only `plan=pro` | a radio group contributes its checked member only |
| `<input type="radio" name="size">` (none checked) | ❌ absent | the whole group is unsuccessful |
| `<select name="tier">` | ✅ `tier=gold` | single select contributes the selected option's value |
| `<select name="tags" multiple>` | ✅ `tags=a`, `tags=c` | the same name appears repeatedly — `getAll('tags')` |
| `<textarea name="note">` | ✅ `note=hi there` | textareas are named controls like inputs |
| `<input disabled>` | ❌ absent | disabled controls are never successful |
| `<input type="hidden">` | ✅ `hidden-value` | hidden inputs are exactly how you pass extra data |
| `<input type="file">` | ✅ a `File` object | files live only in `FormData`; you cannot JSON-serialise them |
| `<button type="submit" name="intent">` | ✅ *only when it is the submitter* | this is how you tell apart "Save" and "Cancel" buttons |
| `<button type="button" name="intent">` | ❌ never | `type="button"` does nothing on submit |

The submitter rule deserves its own line, because it is the standard way to build multi-action forms:

```tsx
// File: src/parts/DraftForm.tsx — two buttons, two intents, one handler
function DraftForm() {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form, (event.nativeEvent as SubmitEvent).submitter ?? undefined);
    const intent = data.get('intent');           // 'save' | 'discard' | null (Enter key)
    console.log('intent:', intent, '– draft:', data.get('draft'));
  }

  return (
    <form onSubmit={handleSubmit}>
      <textarea name="draft" defaultValue="" />
      <button type="submit" name="intent" value="save">Save</button>
      <button type="submit" name="intent" value="discard">Discard</button>
    </form>
  );
}
```

`new FormData(form, submitter)` — the two-argument form — is what includes the clicked button. Without it, `intent` is missing and both buttons look identical to your handler.

⚠️ **`FormData` is not JSON.** `new FormData(form)` gives you an iterable of string/`File` pairs. To send it as JSON you must convert it:

```ts
function formDataToObject(data: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of data.entries()) {
    const existing = result[key];
    if (existing === undefined) result[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else result[key] = [existing, value];      // repeated names → array (multiple select, checkboxes)
  }
  return result;
}
```

Note the repeated-name handling: because checkbox groups and multiple selects legitimately repeat a name, a naive `Object.fromEntries(data)` silently keeps only the **last** value. And `Object.fromEntries` cannot see the repetition at all — the helper above is the safe version, and file 02 uses its typed cousin.

💡 `entries()` skips nothing that was successful and invents nothing. If a field is missing from your payload, the answer is almost always: no `name` attribute, or the control is `disabled`, or it is an unchecked checkbox.

---

## 5. Native validation: the free tier

Constraint validation happens **before** the submit event. If any control is invalid, the browser blocks the submit, focuses the first bad field, and shows its own message — your handler never runs.

```text
=== D. the browser validates before your handler runs ===
   checkValidity() = false  (does not fire submit, does not show messages)
   email: valid=false typeMismatch=true valueMissing=false
   code : valid=false patternMismatch=true
   qty  : valid=false rangeOverflow=true
   selector input:invalid matches 3 of 3 inputs
   clicking Save while invalid     → (handler never ran — the browser blocked the submit)
   after setCustomValidity(...)    → email.validity.valid=false validationMessage="We already know that address."
   after fixing all three values   → form.checkValidity() = true
   clicking Save while valid       → onSubmit reached
   with novalidate + an invalid field → onSubmit reached (the handler runs; checkValidity() still reports false)
```

The API surface worth knowing:

| Member | Meaning |
| --- | --- |
| `form.checkValidity()` | returns a boolean; **does not** show messages, **does not** fire submit |
| `form.reportValidity()` | returns a boolean **and** shows the browser's messages |
| `form.noValidate = true` / `noValidate` prop | the browser stops blocking submits (your `onSubmit` always runs) |
| `input.validity` | an object of booleans: `valueMissing`, `typeMismatch`, `patternMismatch`, `tooShort`, `tooLong`, `rangeUnderflow`, `rangeOverflow`, `stepMismatch`, `badInput`, `customError`, `valid` |
| `input.validationMessage` | the localised string the browser would show |
| `input.setCustomValidity(msg)` | makes the field invalid with your message; `''` clears it |
| `:invalid` / `:valid` / `:user-invalid` CSS | style invalid fields without any JS state |

```tsx
// File: src/parts/EmailField.tsx — native rules, plus one server-side rule
function EmailField({ taken }: { taken: boolean }) {
  return (
    <label>
      Email
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        aria-describedby="email-hint"
        // Native rules cover shape; only the server knows about uniqueness.
        onInput={(event) => {
          const input = event.currentTarget;
          input.setCustomValidity(taken ? 'That address is already registered.' : '');
        }}
      />
      <small id="email-hint">We only use this for receipts.</small>
    </label>
  );
}
```

Two habits that make native validation pleasant instead of annoying:

1. **Style with `:user-invalid`** rather than `:invalid`. `:invalid` matches from the first paint, so a required-but-untouched field glows red before the user has typed anything; `:user-invalid` only matches after interaction.
2. **Use `noValidate` + `checkValidity()` when you want React to own the messages.** Put `noValidate` on the `<form>`, then in `onSubmit` call `form.checkValidity()` and use `form.elements` to decide what to show. That gives you full control of copy and layout while keeping the browser's rule engine. File 03 builds exactly this.

⚠️ **Client-side validation is UX, not security.** Every rule you write in the browser can be bypassed by anyone with `curl`. Validation in the browser exists to help users; validation on the server exists to protect data. You need both, and they are not substitutes — Part 7's `422` handling (server truth) is the other half of this file's topic.

---

## 6. Two React styles: uncontrolled and controlled

Everything in this part is one of these two styles, or a library built on top of them.

**Uncontrolled** — the DOM keeps the value; React supplies the initial value and reads it at submit time:

```tsx
// File: src/parts/UncontrolledForm.tsx
import { useState, type FormEvent } from 'react';

export function UncontrolledForm() {
  const [result, setResult] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();                       // stop the navigation
    const form = event.currentTarget;             // the <form> element
    const data = new FormData(form, (event.nativeEvent as SubmitEvent).submitter ?? undefined);
    setResult(`email=${data.get('email')} · plan=${data.get('plan')}`);
    form.reset();                                 // back to defaultValue/defaultChecked
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Email
        <input name="email" type="email" defaultValue="ada@example.com" required />
      </label>
      <fieldset>
        <legend>Plan</legend>
        <label>
          <input type="radio" name="plan" value="free" defaultChecked /> Free
        </label>
        <label>
          <input type="radio" name="plan" value="pro" /> Pro
        </label>
      </fieldset>
      <button type="submit">Save</button>
      {result !== null && <p role="status">{result}</p>}
    </form>
  );
}
```

**Controlled** — React state keeps the value; every keystroke goes through `onChange` and a re-render:

```tsx
// File: src/parts/ControlledForm.tsx
import { useState } from 'react';

export function ControlledForm() {
  const [email, setEmail] = useState('ada@example.com');
  const [plan, setPlan] = useState<'free' | 'pro'>('free');

  return (
    <form onSubmit={(event) => { event.preventDefault(); console.log({ email, plan }); }}>
      <label>
        Email
        <input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>
      <fieldset>
        <legend>Plan</legend>
        <label>
          <input type="radio" name="plan" value="free" checked={plan === 'free'} onChange={() => setPlan('free')} /> Free
        </label>
        <label>
          <input type="radio" name="plan" value="pro" checked={plan === 'pro'} onChange={() => setPlan('pro')} /> Pro
        </label>
      </fieldset>
      <button type="submit">Save</button>
    </form>
  );
}
```

The two are not rivals — they are answers to different questions: *does React need the value while the user types?* File 02 covers controlled inputs in full, including multi-field state and generic change handlers; file 03 builds the validation layer on top; files 04 and 05 bring in `react-hook-form` and `zod`, which are the library-shaped versions of these same two ideas.

---

## 7. Which style, and when

| Question | Uncontrolled | Controlled |
| --- | --- | --- |
| Do I need the value on every keystroke? (live search preview, character counter, conditional fields) | ❌ awkward | ✅ natural |
| Do I need to *transform* input as it is typed? (digits only, phone formatting, uppercase codes) | ❌ hard | ✅ easy |
| Do I need per-keystroke validation feedback? | ❌ only on submit/blur | ✅ easy (but see file 03's warnings) |
| Simple form, mostly native constraints, one submit? | ✅ less code, fewer re-renders | ⚠️ overkill |
| File inputs? | ✅ `FormData` handles `File` natively | 🚫 `value` cannot be set on `<input type="file">` — it must be uncontrolled |
| Very large form (50+ fields see `04`) | ✅ | ⚠️ one re-render per keystroke |
| Sensitive values you would rather not keep in app state? | ✅ (the DOM holds them) | ⚠️ state holds them |

```text
Decision shortcut:
  Does any UI on screen depend on the value while typing?
    no  → uncontrolled + FormData on submit  (files 01–02)
    yes → controlled state, or a library that isolates the re-render (files 02–04)
```

💡 The one-line version for real projects: **start uncontrolled, and promote a field to controlled only when something on screen depends on its value.** You can mix both in the same form — controlled for the name with a live preview, uncontrolled for the six fields nobody looks at.

---

## 8. React 19's `action` prop (the third way)

React 19 added a second, non-event way to handle a form: pass a **function** to `action` instead of a URL. React calls it with the `FormData`, runs it inside a transition (so `isPending` is available from `useFormStatus`), routes any thrown error to the nearest error boundary, and resets uncontrolled fields after a successful submit.

```tsx
// File: src/parts/NewsletterForm.tsx — the React 19 style
import { useActionState } from 'react';

async function subscribe(_previous: string | null, formData: FormData): Promise<string | null> {
  const email = String(formData.get('email') ?? '');
  const response = await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) return 'That did not work. Please try again.';
  return null;
}

export function NewsletterForm() {
  const [error, submitAction] = useActionState(subscribe, null);

  return (
    <form action={submitAction}>
      <input name="email" type="email" required />
      <button type="submit">Subscribe</button>
      {error !== null && <p role="alert">{error}</p>}
    </form>
  );
}
```

Worth knowing, but deliberately *not* this part's main path:

- The `action` prop is React-19-only, and it changes semantics: `action` runs in a transition, so there is no `event` object and no `preventDefault()` (there is nothing to prevent — React does not navigate).
- With a function `action`, the HTTP method is **POST** regardless of the `method` prop, and uncontrolled fields reset automatically after a successful action.
- It composes beautifully with `useFormStatus` (a child component reads the parent form's pending state) and `useOptimistic`.
- The equivalents for the classic style are `onSubmit` + `isSubmitting` state (files 03–05), which work in every React version and give you explicit control of when to validate, when to disable, and what to do on failure.

Files 03, 04 and 05 build on `onSubmit`; section 12 of file 05 converts that same form to the `action` style so you can see both. If you are on React 18 or older, `useActionState`, `useFormStatus` and `action={fn}` simply do not exist — the rest of the part stands on its own.

---

## 9. Line by line: the file-01 example, annotated

Every line of the running example, and the reasoning behind it:

```tsx
import { useState, type FormEvent } from 'react';
```

`useState` holds the submitted summary; `FormEvent` types the handler. Importing the type with `type` keeps it out of the runtime bundle and satisfies `verbatimModuleSyntax`-style configs (Part 2).

```tsx
const [result, setResult] = useState<string | null>(null);
```

`null` means "nothing submitted yet" — a state that is genuinely different from "submitted an empty summary". Making that explicit is why the render below checks `result !== null` rather than `result &&` (an empty string is falsy, and `result &&` would hide it).

```tsx
function handleSubmit(event: FormEvent<HTMLFormElement>) {
```

The generic is the *element* type, not the event type: React passes you a synthetic event whose `currentTarget` is an `HTMLFormElement`. Using `SubmitEvent` (the DOM type) compiles but gives you no `currentTarget` typing in React.

```tsx
  event.preventDefault();
```

Stops the browser's navigation. Without it the page reloads (section 3).

```tsx
  const form = event.currentTarget;
```

Capture the element **before** any `await`. React reuses synthetic event objects' properties (and `currentTarget` is nulled after the handler in React 17's pooling era; React 18+ no longer pools, but the habit is still correct and `currentTarget` genuinely becomes `null` after the event handler returns).

```tsx
  const data = new FormData(form, (event.nativeEvent as SubmitEvent).submitter ?? undefined);
```

The two-argument `FormData` constructor, so the clicked button's `name`/`value` are included — the `intent` pattern from section 4. `event.nativeEvent` is the real DOM `SubmitEvent`; React's synthetic type does not promise a `submitter`, so we assert it once, here.

```tsx
  setResult(`email=${data.get('email')} · plan=${data.get('plan')}`);
```

`data.get()` returns `FormDataEntryValue | null` (`string | File | null`). Read it defensively: a missing field returns `null`, and using the value in a template literal turns `null` into the string `"null"` — see the mistakes table in section 11.

```tsx
  form.reset();
```

Real form reset. It restores `defaultValue` / `defaultChecked` on every field and fires a `reset` event. **It does not touch React state** — which is the whole reason controlled inputs behave differently:

```text
=== E. resetting, with and without React state ===
   typed value: grace@example.com
   submitted: email=grace@example.com
   after form.reset(): ada@example.com
   form.reset() restores defaultValue/defaultChecked. React state is untouched by it, which is
   exactly why a controlled input cannot be reset this way.
```

For a controlled input, `form.reset()` changes the DOM value to `defaultValue`, and then React's next render writes the state value straight back. Resetting a controlled form means `setEmail('ada@example.com')` — or a single `setValues(initialValues)`.

---

## 10. Run it

The example is real, and so is the probe that produced every transcript above. To reproduce it in your own project:

**a. Create the project** (Vite, per Part 3 — never Create React App):

```bash
npm create vite@latest forms-lab -- --template react-ts
cd forms-lab
npm install
npm run dev
```

**b. Put the two files in place.** The tree:

```text
forms-lab/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── parts/
    │   ├── UncontrolledForm.tsx      ← section 6, first example
    │   └── ControlledForm.tsx        ← section 6, second example
    └── index.css
```

```tsx
// File: src/App.tsx
import { ControlledForm } from './parts/ControlledForm';
import { UncontrolledForm } from './parts/UncontrolledForm';

export default function App() {
  return (
    <main>
      <h1>Forms lab</h1>
      <h2>Uncontrolled</h2>
      <UncontrolledForm />
      <h2>Controlled</h2>
      <ControlledForm />
    </main>
  );
}
```

**c. Run it:**

```bash
npm run dev
# ➜  Local:   http://localhost:5173/
```

**d. Watch it.** Open the DevTools **Network** tab, submit the uncontrolled form, and look for a document request — there is none, because `preventDefault()` ran. Remove the `preventDefault()` line, submit again, and watch the page reload (that request is the one you just prevented). Then open the **Elements** tab and inspect the email input: in the controlled form, typing changes the `value` *attribute*'s React bookkeeping, and React logs a warning if you ever set `value` without `onChange`.

**Expected result:** both forms render, the uncontrolled one resets its inputs to the initial values after submit, the controlled one keeps its typed value after submit (nothing resets state), and neither navigates.

---

## 11. Common mistakes

| # | Mistake | What happens | Fix |
| --- | --- | --- | --- |
| 1 | Forgetting `event.preventDefault()` | full page reload; all React state lost | always preventDefault in `onSubmit` (or use `action={fn}`) |
| 2 | Calling `form.submit()` to "trigger submit" | validation and `submit` handlers skipped | `form.requestSubmit()` |
| 3 | No `name` on an input | field missing from `FormData` | add `name`; that is the key |
| 4 | `Object.fromEntries(formData)` with repeated names | only the last checkbox/multiple-select value survives | group repeats into arrays (section 4 helper) |
| 5 | Reading `data.get('x')` and using it directly | `null` becomes the string `"null"` | check for `null`, or coerce with `String(...)` |
| 6 | `value={email}` with no `onChange` | React warns "You provided a `value` prop to a form field without an `onChange` handler" and the field is read-only | add `onChange`, or switch to `defaultValue` |
| 7 | `defaultValue={x}` where `x` changes later | the DOM keeps the first value forever | use `key` to remount, or go controlled |
| 8 | Expecting `form.reset()` to clear state | the DOM resets, then React re-writes the state value | reset state explicitly |
| 9 | `type="button"` on the button you meant as submit | Enter still submits; clicking does nothing | `type="submit"` (default *inside* a form) — be explicit always |
| 10 | A `<button>` outside the form expecting to submit | nothing happens | use the `form="form-id"` attribute or move it inside |
| 11 | No `<label>` / using placeholder as the label | screen readers announce an unlabeled field; clicking the text does not focus | `<label htmlFor>` / wrap the input |
| 12 | Trusting native validation for security | anyone can bypass it with `curl` | validate again on the server (Part 7's `422` path) |

---

## 12. Best practices

1. **Always `type="submit"` on the submit button** and `type="button"` on every other button inside a form. The default is `submit`, which surprises people with "Cancel" buttons that submit.
2. **Name everything.** `name` is not optional metadata — it is the key in `FormData`, the key in your payload, and the label your server sees.
3. **Prefer `FormData` for reading values at submit time.** One handler reads every field, no state, no controlled re-renders, and file inputs work.
4. **Use `preventDefault()` in `onSubmit`, or the `action` prop — never neither.** A React form that navigates is a bug, not a browser quirk.
5. **Use native constraints first** (`required`, `type="email"`, `min`, `max`, `pattern`, `step`) and add JS rules only for what HTML cannot express (uniqueness, cross-field rules).
6. **Style with `:user-invalid`, not `:invalid`,** so untouched fields are not marked as errors before the user interacts.
7. **Reset deliberately.** For uncontrolled forms `form.reset()` is correct; for controlled forms reset the state that drives the values.
8. **Make the submit state visible** — disable the button, show "Saving…", keep the values on failure. Part 7's double-submit ladder applies to forms specifically, not just to `fetch` calls.
9. **Hide nothing important behind JS-only validation.** `required` + a server check works even if your bundle fails to load.
10. **Build the accessibility wiring in from the start**: `<label htmlFor>`, `<fieldset>`/`<legend>` for groups, `aria-describedby` for hints, `role="alert"` for errors. Retrofitting it is far more expensive.

---

## 13. Practice

### Beginner

1. Build an uncontrolled newsletter form with three fields: `email` (required, `type="email"`), `topics` (a `<select multiple>` with four options), and `newsletter` (a checkbox, default checked on). On submit, log the payload as JSON using the `formDataToObject` helper from section 4, and log `data.getAll('topics')` separately. Then remove the `name` from the checkbox and explain the difference.
2. Add a second submit button named `intent` with values `save` and `draft`. Print which one was clicked. Confirm that pressing Enter logs `intent: null`.
3. Put an invalid email in the field and click Save. Read `email.validity` in the console, then set `noValidate` on the form and click again. Explain both results in one sentence each.

### Intermediate

1. Add native constraints to a "Create account" form: `username` (`required`, `minLength={3}`, `pattern="[a-z0-9_]+"`), `password` (`required`, `minLength={8}`), `age` (`type="number"`, `min={13}`, `max={120}`), and a required checkbox `terms`. Submit while everything is empty and record how many `:invalid` fields you can select for. Then make the form show your own messages with `noValidate` + `checkValidity()` + `setCustomValidity()` instead of the browser's.
2. Add a "same as billing" checkbox that, when unchecked, keeps the address fields enabled and required, and when checked disables them (`disabled` inputs are excluded from `FormData` — prove it).
3. Add a Reset button (`type="reset"`) and a "Clear" button (`type="button"`) that calls `form.reset()`. For an uncontrolled form they look identical — explain why, then convert one field to controlled and show that Reset no longer clears the visible value.

### Challenge

1. Rebuild the entire form using React 19's `action` prop, `useActionState` and `useFormStatus`, against a real endpoint. Make the button disabled while pending, keep the typed values after a failure, and show the server's field errors. Then answer: which parts got shorter, and which parts did you lose?
2. Write a small `<Field>` component that renders a `<label>`, any input, a hint, and a `role="alert"` error slot, wiring `id`/`htmlFor`/`aria-describedby`/`aria-invalid` automatically. Then refactor both the controlled and uncontrolled examples to use it, and write down which props it needs in each style.
3. Take the `ProductForm` from Part 7, file 05 and convert it to uncontrolled (`FormData` + `defaultValue`) — then measure how many `useState` calls and re-renders per keystroke you removed. Keep both versions; file 03's validation section will use the controlled one and file 05 will compare them again.

---

## 14. Solutions

### Beginner

1. The payload helper returns `{ email: '…', newsenv: … }` with `topics` as an array (repeated names) and `newsletter` as `'on'` when checked. Removing the `name` from the checkbox removes it from `FormData` entirely — no error, no entry, just absence. `data.getAll('topics')` returns every selected value; `data.get('topics')` returns only the first.
2. The clicked button is included **only** if you pass the submitter: `new FormData(form, event.nativeEvent.submitter ?? undefined)`. Pressing Enter produces no submitter (or, in some browsers, the form's default button — jsdom reproduces the "none" case as verified in section 3), so `intent` is `null` and your handler must have a default.
3. Invalid: `email.validity.typeMismatch === true`, `valid === false`, and clicking Save logs nothing because the browser blocks the submit and shows its bubble. With `noValidate`, the submit event fires and your handler runs — validation becomes entirely your responsibility; `checkValidity()` still reports `false` (verified in section 5, last line) so you can use it as your gate.

### Intermediate

1. All four fields are `:invalid` at once (`document.querySelectorAll(':invalid').length === 4`), because the rule engine evaluates every constraint, not just the first. With `noValidate` you take over: `form.checkValidity()` returns `false`, and `form.elements` lets you walk each control, read `validity` for the failing rule, and write your own message with `setCustomValidity(...)`. Note the correct order: set the custom message **first**, then either call `reportValidity()` or render it yourself.
2. Disabled inputs are excluded (verified: `disabled-field` is absent from the payload while `hidden-field` is present). So "same as billing" can simply set `disabled={sameAsBilling}` and the fields vanish from `FormData` for free — no need to strip keys from the payload by hand.
3. A `type="reset"` button and `form.reset()` do the same thing: restore the *default* values. In an uncontrolled form the visible value and the default are the only two states, so both buttons look right. Make `email` controlled (`value={email}`) and Reset appears broken: the DOM value snaps back to `defaultValue`, React immediately re-renders with the state value, and the user sees no change. That is the clearest possible demonstration that controlled inputs live in React state, not in the DOM.

### Challenge

1. With `action`: no `preventDefault`, no `isSubmitting` state (`useFormStatus().pending` in a child button component), automatic reset of uncontrolled fields, thrown errors routed to an error boundary, and `useActionState` returning `[state, submitAction, isPending]` for error display. What you lose: explicit control over *when* validation runs (the action runs before you can stop it), synchronous access to the event, `preventDefault`-based logic, and compatibility with React 18. What you gain: less boilerplate, built-in pending state, and progressive enhancement when the action is a server function.
2. The `<Field>` component needs `label`, `name`, `error`, `hint`, `children` and an `id` — and, in the controlled style, the caller passes `value`/`onChange` into the child input; in the uncontrolled style the caller passes `defaultValue` and nothing else. `id` must be generated (`useId`) when not supplied so `htmlFor`/`aria-describedby` cannot collide between two copies of the same field (Part 4's `useId` chapter).
3. Uncontrolled `ProductForm`: `useState` drops from five fields × one state each to a single `status` state; per-keystroke renders drop to zero. The trade-offs: you lose the live price preview, the client-side per-field errors (they become submit-time), and the ability to disable exactly the field being edited. Part 7's double-submit rule does not change — you still need a ref guard, because the browser will happily fire two submits in the same tick.

---

## 15. Summary

- A `<form>` brings four things with it: a **submit protocol**, a **serialisation format** (`FormData`), a **validation engine**, and a default action that **navigates the page**.
- `onSubmit` runs during that protocol; `preventDefault()` is what stops the navigation. Without it, a React form reloads the app (verified).
- `form.requestSubmit()` runs validation and fires the submit event; **`form.submit()` does neither** (verified).
- `FormData` includes only *successful* controls: named, not disabled, checked (for checkboxes/radios); repeated names for checkbox groups and multiple selects; `File` objects for file inputs; the clicked submitter only when you pass it (verified field by field).
- Native validation blocks the submit before your handler runs, exposes `validity`/`validationMessage`, `checkValidity()`/`reportValidity()`, `setCustomValidity()`, and `:invalid` CSS — and can be switched off with `noValidate` (verified in both modes).
- **Uncontrolled** (`defaultValue` + `FormData`, `form.reset()`) is the cheaper default; **controlled** (`value` + `onChange`) is what you need when the UI depends on the value while typing. Mixing both in one form is normal.
- React 19's `action={fn}` form submission (with `useActionState`/`useFormStatus`) is the third style: transitions, built-in pending state, and progressive enhancement — at the cost of explicit control.
- Client-side validation is **UX**; server-side validation is **security**. You need both.

---

**What's next →** [`02-controlled-forms.md`](./02-controlled-forms.md) takes the controlled style and makes it scale: typed field state, one generic `handleChange` instead of five handlers, checkbox/select/number handling without the classic `parseFloat` mistakes, controlled `<textarea>` and radio groups, and the `TextInput`/`SelectInput` component pattern used by the rest of this part.
