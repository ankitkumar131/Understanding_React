# 02 — Controlled Forms: Typed State, Generic Handlers, and Field Components

> **Part 8 · Forms and Validation · File 2 of 5**

Why this file exists: file 01 ended with a choice. Uncontrolled forms are cheap, but the moment your UI has to *react* to what the user types — a live preview, a character counter, a conditional section, per-keystroke validation — React needs to own the value. That is a controlled input, and it comes with a data flow you must understand precisely, two warnings you will meet within a week, and half a dozen traps (numbers, checkboxes, stale state, remounting) that produce bugs which look like "React is broken". This file covers all of it, measured.

---

## 1. What "controlled" means

An input is **controlled** when React decides its value:

```tsx
<input value={name} onChange={(event) => setName(event.target.value)} />
```

Both props are doing work:

| Prop | Meaning | What breaks without it |
| --- | --- | --- |
| `value={name}` | "every time you render, the DOM value must equal `name`" | the field is uncontrolled (DOM owns the value) |
| `onChange={fn}` | "tell me what the user typed" | React warns, and the field becomes read-only (section 5) |

The DOM value is no longer the source of truth — your state is. The DOM is a **mirror** that React re-syncs on every render.

```text
state  ──render──▶  value prop  ──▶  DOM .value
  ▲                                     │
  └──────── onChange ◀── input event ◀──┘
```

That is the whole loop: state → render → DOM, and DOM → event → state. Every controlled-form problem you will ever debug is a broken arrow in that diagram.

⚠️ The word "controlled" is about **who owns the value**, not about validation, not about storing every field in one object, and not about `onChange` handlers existing. A controlled input that never updates state (section 5) is still controlled — it is just broken.

---

## 2. What happens on one keystroke

1. The user types `A` into the field. The browser puts `A` in the DOM value immediately — the DOM is not waiting for React.
2. The browser fires an `input` event (and a `change` event for selects/checkboxes).
3. React's synthetic `onChange` handler runs with the event.
4. You call the setter. In React 19 the update is scheduled; the handler returns.
5. React re-renders the component. `value` is now `"A"`.
6. React compares the new `value` prop with the DOM value. They match, so nothing is written back.

Steps 1 and 6 together are why controlled inputs *feel* native: the character appears instantly, and React's write-back is usually a no-op. The write-back matters in the broken case (section 5), where React overwrites the DOM with a stale value — which is exactly how "I type and nothing appears" happens.

💡 Because React's `onChange` is really the DOM's `input` event for text fields, `onChange` fires on **every keystroke** (unlike the DOM's `change`, which fires on blur for text inputs). For `<select>`, checkboxes and radios, React's `onChange` *is* mapped to the DOM's `click`/`change` behaviour — the same prop name covers all of them, which is convenient but hides that they are different events underneath.

---

## 3. The measured cost

Controlled state is not free. Three keystrokes in a five-field form:

```text
=== A. what one keystroke costs: controlled vs uncontrolled ===
   controlled · 5 fields · 3 keystrokes in ONE field
      form renders: 3 → 4 total
      field renders: 15 → 20 total
      (every field re-rendered on every keystroke, because the state lives in the form)

   uncontrolled · same 3 keystrokes
      form renders: 0 → 1 total
      field renders: 0 → 0 total
      DOM value after typing: "Ash" (React never heard about it)
```

Read the numbers rather than the adjectives:

- **Controlled**: one render of the form per keystroke (3 extra), and because each field is a component, 5 × 3 = **15 field renders**. React is not slow at this — 15 renders of a small component is microseconds — but on a 60-field form, or a field whose render is expensive, it becomes visible.
- **Uncontrolled**: **zero** React renders. The browser holds the value; React learns about it only when you read `FormData`.

A single re-render per keystroke is normal and fine. The techniques in section 11 (uncontrolled islands, memoised field components, or a library that isolates the re-render) are for when it is not.

💡 The good news, also measured:

```text
=== H. the thing people fear about controlled inputs ===
   value="hello world!"  focused=true
   focus events during 2 re-renders: 0 (the element is reused, not replaced)
```

Re-rendering does **not** lose focus, text selection, or an in-progress IME composition, because a controlled input is the *same DOM node* across renders. What loses focus is **remounting** the element — changing its `key`, moving it to a different position in the tree, or (the classic) defining a component *inside* another component so React sees a brand-new type on every render (Part 4's rules-of-hooks chapter shows that failure).

---

## 4. The five flavours of controlled field

Each family of element has its own props and event shape. This is the reference; section 5 onward explains the traps.

```tsx
// File: src/parts/ControlledFlavours.tsx
import { useState } from 'react';

export function ControlledFlavours() {
  const [text, setText] = useState('Desk Lamp');
  const [notes, setNotes] = useState('');
  const [subscribe, setSubscribe] = useState(true);
  const [plan, setPlan] = useState<'free' | 'pro'>('free');
  const [tier, setTier] = useState('gold');
  const [tags, setTags] = useState<string[]>(['a']);
  const [qty, setQty] = useState<number | ''>(1);

  return (
    <form onSubmit={(event) => event.preventDefault()}>
      {/* 1. text: value + event.target.value */}
      <input value={text} onChange={(event) => setText(event.target.value)} />

      {/* 2. textarea: exactly the same two props (no children as the value!) */}
      <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />

      {/* 3. checkbox: checked + event.target.checked (NOT value) */}
      <label>
        <input type="checkbox" checked={subscribe} onChange={(event) => setSubscribe(event.target.checked)} />
        Subscribe
      </label>

      {/* 4. radio group: same name, checked={value === option}, one onChange per radio */}
      <label>
        <input type="radio" name="plan" value="free" checked={plan === 'free'} onChange={() => setPlan('free')} />
        Free
      </label>
      <label>
        <input type="radio" name="plan" value="pro" checked={plan === 'pro'} onChange={() => setPlan('pro')} />
        Pro
      </label>

      {/* 5. single select: value on the <select>, not on the <option> */}
      <select value={tier} onChange={(event) => setTier(event.target.value)}>
        <option value="silver">Silver</option>
        <option value="gold">Gold</option>
      </select>

      {/* 6. multiple select: value is an ARRAY, and the event gives you options */}
      <select
        multiple
        value={tags}
        onChange={(event) => setTags(Array.from(event.target.selectedOptions, (option) => option.value))}
      >
        <option value="a">A</option>
        <option value="b">B</option>
        <option value="c">C</option>
      </select>

      {/* 7. number: keep the empty state explicit (section 7) */}
      <input
        type="number"
        value={qty}
        onChange={(event) => setQty(event.target.value === '' ? '' : Number(event.target.value))}
      />
    </form>
  );
}
```

Verified behaviour of the non-text families:

```text
=== D. checkboxes, radios, selects: three different event shapes ===
   checkbox onChange → checked=true
   checkbox onChange → checked=false
   radio pro
   textarea onChange → call before delivery
   select onChange → silver
   multi select → [c]
   clicking the already-checked "free" radio produced 0 onChange call(s) — nothing changed, so React did nothing
   final state: checkbox=false plan=pro tier=silver tags=[c]
```

Four rules to take from that:

1. **Checkboxes and radios read `event.target.checked`**, not `value`. `value` on a checkbox is the *payload* it contributes to `FormData` (`on` by default).
2. **A radio group is a set of radios with one `name`, each individually controlled.** `checked={plan === 'pro'}` — you never store "which radio", you store the group's value.
3. **Clicking an already-checked radio fires no `onChange`** (nothing changed). So never put side effects you always want into a radio's `onChange` — put them where the state change actually lands, or use `onClick`.
4. **`<select multiple>` needs `Array.from(event.target.selectedOptions)`.** `event.target.value` returns only the first selected option, which silently loses data.

---

## 5. The two warnings everyone meets

**Warning 1 — `value` without `onChange`:**

```text
   value without onChange →
      You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `def
      (the field renders and is effectively read-only — React re-writes the value on every render)
```

React is describing the mechanism from section 2 precisely: every render writes `value` into the DOM, and since nothing ever updates the state behind it, the value snaps back. Two legitimate fixes: add `onChange`, or use `defaultValue` if you really only wanted an initial value. A third case — `readOnly` — is what you want when the input is genuinely display-only but must stay selectable/copyable.

**Warning 2 — controlled becomes uncontrolled:**

```text
   controlled → uncontrolled (the value prop disappears) →
      A component is changing a controlled input to be uncontrolled. This is likely caused by the value changing from a defined to undefined, which should not happen. Decide between using a controlled or uncontrolled…
```

This fires when `value` goes from a string to `undefined` (or `null`) mid-life. Typical causes: `value={user?.name}` while `user` is still loading; `value={values[field]}` where a new field key was added to the JSX but not to the initial state object; `value={list[0]?.title}` when the list empties. Fix by guaranteeing a value: `value={user?.name ?? ''}`.

**The third failure has no warning — a no-op handler:**

```text
   value + onChange that ignores the event →
      typed "hello", the box still shows "typed over"
      React re-renders with the old value and overwrites what the browser put there. A controlled
      field that appears "impossible to type into" is almost always an onChange that does not set state.
```

If a user reports "I can't type in this field", the diagnosis in a controlled input is: the `onChange` runs but the state does not change (a typo in the setter, the wrong key, a state update on the wrong component, or a `setValue` from a library that needs `{ shouldDirty: true }`…). The browser accepts the keystroke, React immediately overwrites it, and the field looks frozen.

---

## 6. Form state: many `useState`s, or one object?

Both are correct, in different situations.

```tsx
// A. one useState per field — simple, obvious, verbose
const [name, setName] = useState('');
const [email, setEmail] = useState('');
const [sku, setSku] = useState('');
```

```tsx
// B. one object — scales past three fields, needed for generic handlers and resets
interface FormValues {
  name: string;
  email: string;
  sku: string;
  qty: string;
  plan: 'free' | 'pro';
}

const initialValues: FormValues = { name: '', email: '', sku: '', qty: '1', plan: 'free' };
const [values, setValues] = useState<FormValues>(initialValues);
```

The object form buys you three things that get painful to fake later: **one generic handler**, **one reset** (`setValues(initialValues)`), and **one place to type the shape**. It costs you `setValues((current) => ({ ...current, [key]: value }))` in the handler, and one subtlety: because the whole object is replaced, a render that only touches `name` still re-renders every field. (The measured cost in section 3 is exactly this — 5 field renders per keystroke.)

| Approach | Best for | Watch out for |
| --- | --- | --- |
| One `useState` per field | 1–3 fields, fields whose logic is genuinely independent, one-keystroke validation that never cross-references | handler sprawl; resetting means N calls |
| One state object | 4+ fields, generic handlers, `<Field>` components, reset/dirty tracking, forms that map over a config array | every field re-renders on every keystroke; spread bugs when nesting |

The generic handler, typed:

```tsx
// File: src/parts/GenericForm.tsx
import { useState, type ChangeEvent, type FormEvent } from 'react';

interface FormValues {
  name: string;
  email: string;
  sku: string;
  qty: string;
  plan: string;
}

const initialValues: FormValues = { name: '', email: '', sku: '', qty: '1', plan: 'free' };
const fieldNames: (keyof FormValues)[] = ['name', 'email', 'sku', 'qty', 'plan'];

export function GenericForm() {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [dirty, setDirty] = useState(false);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    const key = name as keyof FormValues;                 // the one cast we tolerate, because `name` is a string
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true);                                        // two setters, still one render (batched)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    console.log(values);                                   // already the right shape for JSON
    setValues(initialValues);
    setDirty(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      {fieldNames.map((field) => (
        <label key={field}>
          {field}
          <input name={field} value={values[field]} onChange={handleChange} />
        </label>
      ))}
      <button type="submit" disabled={!dirty}>Save</button>
    </form>
  );
}
```

Verified:

```text
=== E. one handler for five fields, typed ===
   Desk Lamp|pro|dirty=true
   one handleChange + the field name as the key: fewer handlers, fewer bugs, and setValues + setDirty
   still cost a single render per keystroke.
```

Note the two details that make this pattern safe:

- **The updater form `setValues((current) => …)`** — required, because the handler closes over a `values` that may be stale if two changes land in the same tick (section 9).
- **Two setters, one render** — `setValues` and `setDirty` are batched by React, so "dirty tracking" is free. In an event handler React batches automatically (no `unstable_batchedUpdates` needed).

⚠️ The `name as keyof FormValues` cast is the honest one: `event.target.name` is a `string` at runtime and TypeScript cannot know it matches your keys. Two ways to make it airtight: derive the fields from a config array (`const fieldNames = ['name','email'] as const`) and type `name` as that union, or check at runtime (`if (!(name in initialValues)) return;`). Do not skip both and assume the DOM only contains your fields — a stray `<input name="q">` in the same form will happily write `values.q = 'x'` at runtime, and TypeScript will never complain.

---

## 7. Numbers, and the `Number('')` trap

The natural-looking number field is broken in a way that is measurable:

```tsx
<input type="number" value={qty} onChange={(event) => setQty(Number(event.target.value))} />
```

```text
=== C. the number field trap: Number("") ===
   after mount:            naive="1"  text="1"  safe="1"
   after clearing the box: naive="0"  text=""  safe=""
   naive: Number("") is 0, so the field cannot be emptied — the user deletes the 1 and gets a 0 back.
   text : the value stays a string, so clearing works, but state is now "1" (a string) and needs parsing later.
   typing "abc" into a number input: the DOM value becomes "" (jsdom agrees with browsers): naive=0 text=""
   — Number("") is 0 again, so naive snaps back to 0; Number("abc") would be NaN and render as "NaN".
   safe : explicit empty-string state ("no value yet") — the input stays clearable and the type says so.
```

`Number('') === 0`, and empty is exactly what you get when the user deletes the last digit (or types letters into a number input). So the naive version turns "cleared" into `0` and the field can never be emptied. Three workable strategies:

```tsx
// 1. Keep the empty state in the type. Best for "quantity" / "price" fields.
const [qty, setQty] = useState<number | ''>(1);
<input
  type="number"
  value={qty}
  onChange={(event) => setQty(event.target.value === '' ? '' : Number(event.target.value))}
/>

// 2. Store text, parse on submit. Best when the field is really a string the server will validate.
const [price, setPrice] = useState('3499.00');
// at submit: const priceMinor = Math.round(Number(price) * 100)

// 3. Store text, keep a parsed mirror for the UI. Best for live previews.
const parsed = price.trim() === '' || Number.isNaN(Number(price)) ? null : Number(price);
```

And always validate *before* using the number: `Number('')`, `Number('  ')`, `Number('abc')` and `Number('0x10')` all deserve an explicit decision. `Number.isFinite(value)` is the check that excludes `NaN` and `Infinity` in one call. (Part 7, file 05's `ProductForm` used strategy 1 and converted rupees to paise at the boundary.)

💡 For money, never do arithmetic in floats: `0.1 + 0.2` is `0.30000000000000004`. Part 7 stored **minor units as integers** (`priceMinor`), and this part keeps that discipline in form state — the conversion to a number happens once, at submit.

---

## 8. A reusable field component

Once the handler is generic, the JSX wants to be too. This is the shape used across the rest of this part:

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
}

export function TextInput({
  label,
  name,
  value,
  onChange,
  type = 'text',
  hint,
  error,
  disabled = false,
  autoComplete,
}: TextInputProps) {
  const id = useId();                       // unique even with several copies of this field
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);           // the child converts the event; the parent owns the state
  }

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={error !== undefined}
        aria-describedby={[hint !== undefined ? hintId : null, error !== undefined ? errorId : null]
          .filter(Boolean)
          .join(' ') || undefined}
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

```tsx
// File: src/parts/ProfileForm.tsx — using it
import { useState, type FormEvent } from 'react';
import { TextInput } from '../components/TextInput';

interface ProfileValues {
  name: string;
  email: string;
}

const initialValues: ProfileValues = { name: '', email: '' };

export function ProfileForm() {
  const [values, setValues] = useState<ProfileValues>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileValues, string>>>({});

  function setName(next: string) {
    setValues((current) => ({ ...current, name: next }));
    setErrors((current) => ({ ...current, name: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (values.name.trim() === '') {
      setErrors({ name: 'Please enter your name.' });
      return;
    }
    console.log('submitting', values);
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <TextInput label="Name" name="name" value={values.name} onChange={setName} error={errors.name} />
      <TextInput
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        hint="We only use this for receipts."
        value={values.email}
        onChange={(next) => setValues((current) => ({ ...current, email: next }))}
      />
      <button type="submit">Save</button>
    </form>
  );
}
```

Why this shape works well:

- **The child owns nothing.** `value` in, `onChange(value)` out — a pure controlled component (Part 5's controlled/uncontrolled component chapter). It can be used in any form, and it can be unit-tested without a form.
- **`useId`** gives each copy a unique id, so `htmlFor`/`aria-describedby` stay correct when the field appears twice (Part 4's `useId` chapter).
- **Accessibility is automatic**: label association, hint association, `aria-invalid`, and `role="alert"` on the error.
- **The error clears on change** (or on blur — your choice; file 03 discusses the trade-off in detail).

⚠️ Note `errors.name` is `string | undefined`, which is why the prop is typed `error?: string | undefined` rather than `error?: string`. With `exactOptionalPropertyTypes` on (Part 2), an optional prop cannot receive an explicit `undefined` unless you write it that way.

---

## 9. Updater functions, and why stale state bites here

```text
=== G. why the updater function matters on fast fields ===
   two setDirect(count + 1) calls → "direct = 1"
   two setUpdater(v => v + 1) calls → "updater = 2"
```

Both handlers run in the same tick, so the second `setDirect(count + 1)` computes from the *same* stale `count`. The updater form reads the latest pending state instead. In forms this shows up as:

- Char counters that increment by one when two characters arrive from a paste or an autofill.
- Tag/chip inputs (`setTags([...tags, tag])`) where a fast double-Enter loses one tag.
- Any handler that does two updates: `setValues(...)` twice, or `setValues` + `setErrors` both derived from `values`.

The rule: **if the new value depends on the old value, use the updater form.** `setValues((current) => ({ ...current, [key]: value }))` is that rule applied to forms; it is why the generic handler in section 6 spreads `current` rather than `values`.

---

## 10. `defaultValue` is read once

```text
=== F. defaultValue is read once — the key remount fix ===
   mount:          no-key="ada@example.com"  with-key="ada@example.com"
   new prop:       no-key="ada@example.com"  with-key="grace@example.com"
   keying the field on the value it should show remounts it, so defaultValue is re-read (at the cost
   of losing focus and scroll position). The alternative — a controlled value — is usually better.
```

This is the single most common "React ignored my prop" complaint. `defaultValue` is, by definition, only the *initial* value; afterwards the DOM owns it. Your options, in order of preference:

1. **Control the field** (`value` + `onChange`) when the value must follow state — the normal answer, and what Part 7's `EditProductPage` does.
2. **Key the field on the identity of the thing it shows** (`key={product.id}`) when you want a fresh uncontrolled field per record — cheap, and it also resets any internal DOM state.
3. **Set `input.value` imperatively via a ref** in an effect — the least React-ish option; correct only when integrating with non-React widgets.

💡 The `key` trick appears in Part 7, file 06 for exactly this reason: `EditProductPage` renders `<ProductForm key={product.id} …/>` so an in-progress edit is discarded when the user switches products. Chapter 09 of that part explains the remount cost (focus, scroll, and any child state are reset).

---

## 11. When *not* to make a field controlled

| Situation | Why controlled hurts | Better |
| --- | --- | --- |
| Big form (50+ fields) with no per-keystroke UI | every keystroke re-renders the whole form (measured: 5 fields → 15 renders per 3 keystrokes) | uncontrolled + `FormData`, or `react-hook-form` (file 04) |
| `<input type="file">` | the DOM forbids setting its value programmatically | uncontrolled, read the `File` from `FormData` |
| Fields nobody looks at until submit | you pay re-renders for nothing | `defaultValue` |
| A field with an expensive sibling tree | one keystroke re-renders the expensive part too | isolate state in a small component, or `useDeferredValue` (Part 12) |
| Password managers / autofill-heavy fields | one subclass of autofill does not fire events in every browser, leaving state and DOM out of sync | uncontrolled |
| Third-party widgets (rich text, date pickers) | they own their own DOM | uncontrolled + ref, or their React bindings |

Three practical techniques for the "controlled, but expensive" case:

```tsx
// 1. Isolate the state in the smallest component that needs it.
function SearchBox({ onSearch }: { onSearch: (term: string) => void }) {
  const [term, setTerm] = useState('');           // typing re-renders only SearchBox
  return (
    <>
      <input value={term} onChange={(event) => setTerm(event.target.value)} />
      <button onClick={() => onSearch(term)}>Search</button>
    </>
  );
}

// 2. Debounce the expensive work, not the field (Part 7, file 09).
const [term, setTerm] = useState('');
const debouncedTerm = useDebouncedValue(term, 300);   // the request follows the debounce;
                                                       // the input stays perfectly responsive

// 3. Keep an uncontrolled island inside a controlled form.
<input defaultValue={product.name} ref={nameRef} />     // read nameRef.current.value on submit
```

---

## 12. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `value` without `onChange` | read-only field + console warning | add `onChange`, or use `defaultValue` |
| 2 | `onChange` that does not set state | field appears impossible to type in | check the setter, the key, and which component holds the state |
| 3 | `checked` missing on a checkbox, only `value` | React logs "You provided a `checked` prop…" only when you pass `checked` without `onChange`; a checkbox driven by `value` silently misbehaves | use `checked` + `onChange={e => setX(e.target.checked)}` |
| 4 | Number field using `Number(e.target.value)` | clearing the field produces `0`; `NaN` leaks into state | keep `''` in state, or store text and parse on submit |
| 5 | `value={user?.name}` while loading | controlled → uncontrolled warning | `value={user?.name ?? ''}` |
| 6 | Radio group without a shared `name` | clicking one radio does not uncheck the other | give the whole group the same `name` |
| 7 | `setValues({ ...values, [key]: v })` in a fast handler | lost updates from the same tick | use the updater form |
| 8 | Resetting with `form.reset()` | controlled fields do not change | `setValues(initialValues)` |
| 9 | Changing `defaultValue` and expecting an update | DOM keeps the old value | control it, or `key` the field |
| 10 | Storing the *displayed* string in state and parsing on submit without validation | `NaN`/`0` reaching the payload | validate, then convert (file 03) |
| 11 | One `useState` per field in a 20-field form | 20 setters, no generic handler, painful resets | one object with a typed key |
| 12 | `type="number"` for things that are not numbers (phone, card, ZIP) | leading zeros lost, `+`/`-` allowed, spinners appear | `type="text"` + `inputMode="numeric"` + `pattern` |

---

## 13. Best practices

1. **Decide ownership per field**, not per form. Controlled where the UI reacts; uncontrolled everywhere else is a valid, fast design.
2. **One state object for structured forms**, one `useState` for a lone field. Switch when the fourth field appears.
3. **Always the updater form** when the new value derives from the old.
4. **`value` from state, `onChange` that sets state** — if a field is controlled, both halves must be present and correct.
5. **Coerce at the edges**: strings from the input, typed values in state, validated numbers at submit (never floats for money).
6. **Build one `<TextInput>`-style component** and use it everywhere — accessibility, error display, and layout stop being a per-field decision.
7. **Key a form by the record it edits** (`key={product.id}`) when you want a clean remount instead of manual resets.
8. **Don't let the form re-render the world.** Isolate state in small components; debounce the expensive work; keep big subtrees out of the state's render path.
9. **Track `dirty` (and later `touched`)** — these cheap booleans drive save buttons, discard prompts, and error timing.
10. **Reset by setting state to the initial values**, not by calling `form.reset()`, and reuse the *same object* so resetting is one line.

---

## 14. Practice

### Beginner

1. Build a controlled form with `name` and `email`, both required by the browser, and print the state object on submit. Then delete the `onChange` from the email input, observe the warning, and describe what happens when you type.
2. Add a character counter under the `name` field (`{name.length}/40`) and a `maxLength={40}` attribute. Type past the limit and explain why only one of the two mechanisms is doing the work.
3. Reproduce the `Number('')` bug with a controlled quantity field. Then fix it with `useState<number | ''>` and prove that clearing the field leaves it empty.

### Intermediate

1. Convert a five-field form to the object-state + generic-handler pattern, typed with `keyof FormValues`. Then add a stray `<input name="q" />` to the JSX and show what happens to `values` at runtime — and why TypeScript did not catch it.
2. Extract a `<TextInput>` component (section 8) and use it for all five fields. Then add a checkbox and a select to the same form and design the props for those two (which props differ? which are shared?).
3. Add a live preview: as the user types the product name and price, show "Desk Lamp — ₹1,299.50" above the form. Then measure how many times the preview re-renders per keystroke and move the state into the smallest component that needs it.
4. Add a "dirty" flag and a "Discard changes" button that resets to the initial values. Then answer: what should happen if the user types and then undoes it manually — should the form still count as dirty? (There is no single right answer; argue both sides with the `initialValues` comparison technique.)

### Challenge

1. Build a controlled tag/chip input: type a tag, press Enter to add it, click a chip to remove it. Handle: trimming, empty input, duplicates, a maximum of 8 tags, and three same-tick Enter presses (use updater functions). Print the final `string[]`.
2. Build a reusable `<Select>` and `<Checkbox>` to go with `<TextInput>`, so a form can be rendered from a config array:

```ts
const config = [
  { kind: 'text', name: 'name', label: 'Product name' },
  { kind: 'select', name: 'category', label: 'Category', options: ['audio', 'keyboards', 'accessories'] },
  { kind: 'checkbox', name: 'inStock', label: 'In stock' },
] as const;
```

Typing this config so that `values` is inferred correctly (`name: string`, `category: 'audio' | 'keyboards' | 'accessories'`, `inStock: boolean`) is the hard part — that is exactly what `react-hook-form` + `zod` will hand you in files 04 and 05, so keep your version for comparison.

3. Take the Part 7 `ProductForm` (the controlled version from file 05) and refactor it in three ways: (a) generic handler with typed keys, (b) `useReducer` for its state (Part 4's reducer chapter), (c) `react-hook-form` (file 04). Write down the diff in lines of code and in behaviour for each refactor — especially the double-submit guard.

---

## 15. Solutions

### Beginner

1. With `onChange` deleted, the state never changes; React re-writes `value` on every render and the field stays empty. The console shows `You provided a 'value' prop to a form field without an 'onChange' handler. This will render a read-only field…` (verbatim in section 5). The browser's own typing is overwritten immediately — file 01's warning about controlled inputs being a *decision*, not a default.
2. `maxLength={40}` stops the browser from inserting the 41st character, so `name.length` never exceeds 40 and the counter never shows more. Only the attribute is doing work; the counter is honest UI feedback. Remove `maxLength` and the counter becomes your enforcement — which is also when you must decide whether to truncate, warn, or reject.
3. `Number('')` is `0`, so the cleared box re-renders as `0` (verified in section 7). With `useState<number | ''>` the state keeps `''`, the `value` prop renders an empty string, and clearing works. The type also forces every consumer to handle the empty case — which is the point.

### Intermediate

1. Runtime: `values.q === 'x'` appears in the object without ever being in `FormValues`, because the spread `{ ...current, ['q']: 'x' }` produces an object with an extra key, which TypeScript allows at that call site (`key` was cast). At submit, the console prints it, and if you send `values` straight to the API you have just sent an unintended field. Fixes: type the key as a union derived from a config array, or `if (!(name in initialValues)) return;`. This is a good example of why the `as` cast should be *one* line in *one* place — greppable, reviewable, replaceable.
2. Shared props: `label`, `name`, `error`, `hint`, `disabled`. Different: `value`/`onChange` types (`string`/`(s: string) => void` vs `boolean`/`(b: boolean) => void` vs `string` + `options`), plus `type`/`autoComplete` for text, `multiple` for select. The clean design is three components with a shared `<Field>` wrapper that renders label/hint/error and lets each control render itself — that is the `<Field>` from file 01's challenge, and the pattern `react-hook-form` generalises (`register` returns the props *for* the control).
3. Counting renders: the preview is inside the form component, so it re-renders on every keystroke — 1 render per keystroke for the form (verified in section 3). Moving the preview into a child that receives only `name`/`price` helps only if you memoise that child (`React.memo`, Part 12) — otherwise a parent re-render re-renders children regardless. Measure before optimising: for two fields, nothing is wrong.
4. `dirty = JSON.stringify(values) !== JSON.stringify(initialValues)` is fine for flat forms; a key-by-key comparison is safer (`Object.keys(initialValues).some(key => values[key] !== initialValues[key])`). The undo case: if the user types then restores the original text, the form is not dirty by this definition — which is arguably correct (there is nothing to save). The counter-argument is that the user "touched" the form, which matters for a "discard changes?" prompt; that is what `touched` state is for (file 03), and it is deliberately a different flag from `dirty`.

### Challenge

1. ```tsx
   function TagInput() {
     const [tags, setTags] = useState<string[]>([]);
     const [draft, setDraft] = useState('');
     const canAdd = tags.length < 8;

     function add() {
       const tag = draft.trim().toLowerCase();
       if (tag === '' || !canAdd) return;
       setTags((current) => (current.includes(tag) ? current : [...current, tag]));   // updater: same-tick safe
       setDraft('');
     }
     // Enter handler: onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }}
   }
   ```
   Three same-tick Enters: with `setTags([...tags, tag])` all three read the same stale `tags` and only one tag survives; with the updater all three land (subject to the duplicate/limit checks, which also read `current`). Note the `preventDefault()` — without it, Enter inside a form submits it (file 01, section 3).
2. The config-as-const-array trick works because `as const` preserves literal types; the value type is then derived with a mapped type over the union of `kind`s (a `TextConfig | SelectConfig | CheckboxConfig` discriminated union, with each variant carrying its own `name` type). The renderer switches on `kind` and passes the correctly-typed `value`/`onChange`. It is a genuinely useful exercise in "make impossible states unrepresentable" — and it is also *exactly* the boilerplate `zod` + `react-hook-form` remove in files 04–05, which makes those files much easier to appreciate.
3. Rough diffs: (a) generic handler removes 5 setters/handlers and adds one 4-line function; behaviour unchanged. (b) `useReducer` replaces 5 `useState`s with one reducer; better for state transitions that touch several fields at once (loading an existing product into the form), slightly more code. (c) `react-hook-form` removes the state and the handlers entirely (`register`/`handleSubmit`), keeps the ref-based double-submit guard you wrote in Part 7, and adds `formState.isSubmitting` for free. The behaviour worth preserving in every version: **one submit per click**, which state-only guards do not guarantee (verified in Part 7's form probe: 1 POST with the ref guard, 2 without).

---

## 16. Summary

- A **controlled input** means React owns the value: `value` from state, `onChange` into state, and the DOM as a mirror. The loop is state → render → `value` → DOM, and DOM → event → state.
- React's `onChange` for text inputs is the DOM's `input` event — it fires on **every keystroke**; selects/checkboxes/radios have their own shapes (`event.target.checked`, `selectedOptions`).
- The cost is real and measured: 5 controlled fields → **15 field renders for 3 keystrokes**; the same typing in an uncontrolled form costs **0 renders**. One render per keystroke is fine; know when it is not (section 11).
- **Focus is not lost** by re-rendering (measured: 0 focus events across 2 re-renders) — it is lost by **remounting**.
- Three failure modes: `value` without `onChange` (read-only warning), controlled → uncontrolled when `value` becomes `undefined`, and a no-op `onChange` (a field that looks frozen). All three are quoted verbatim in section 5.
- **`Number('')` is `0`**: a naive numeric field cannot be cleared. Keep `''` in the state type, or store text and parse on submit. Money stays in integer minor units.
- Use **one state object + a generic handler typed with `keyof FormValues`** once a form has more than ~3 fields, **always with the updater form** so same-tick updates do not clobber each other.
- **`defaultValue` is read once** — control the field, `key` it, or accept the initial value; there is no third option that is not imperative.
- Wrap all of this in **one `<TextInput>`-style component** so accessibility, hints and errors stop being per-field work — the pattern files 03–05 build on.

---

**What's next →** [`03-form-validation.md`](./03-form-validation.md) turns these controlled fields into a validated form: field-level vs form-level rules, when to validate (change/blur/submit), error state typed against your field names, focus management to the first invalid field, server errors mapped back onto fields, and the complete `ProductForm` with every failure path measured.
