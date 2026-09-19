# 03 — Controlled Components: React Owns the Value

> **Part 5 · React Concepts · File 3 of 9**
> Why this file exists: a controlled input is the most important pattern in React forms, and it is also the source of two of the most confusing symptoms a beginner meets — a field that refuses to accept typing ("it looks read-only"), and a field that shows the wrong text after a state update. Both have the same explanation: **the DOM's value is a rendering of React state, and React will overwrite anything the DOM does on its own.** This chapter shows the loop in slow motion (`dom=ab · state="ab" · renders=2`), reproduces the read-only symptom on purpose, and captures React's exact warning messages for the four ways people get it wrong.

---

## 1. What "controlled" means

An input is **controlled** when its displayed value comes from React state:

```tsx
const [name, setName] = useState('');
return <input value={name} onChange={(event) => setName(event.target.value)} />;
```

Two props make it so:

- **`value`** — React writes this into the DOM field on every render.
- **`onChange`** — React tells you when the user changed it, and expects you to update the state that feeds `value`.

The consequence, stated bluntly: **if you do not update the state, the field will not change.** React re-renders, writes the old `value` back into the DOM, and the keystroke vanishes. That is not a bug in React — it is the definition of "controlled". Section 4 shows exactly this happening, on purpose, with the warning React prints to warn you.

---

## 2. The loop, measured

**Verified** — a controlled input, typed into the way a browser types:

```text
1. controlled input, before typing (renders so far): (empty) · renders=1
2. after typing "ab" into the controlled input: dom=ab · state="ab" · renders=2
```

Follow one keystroke around the loop:

```text
user presses "a"
   ↓
the browser puts "a" in the DOM field and fires an `input` event
   ↓
React's onChange handler runs: setName("a")
   ↓
React re-renders the component with name === "a"
   ↓
`<input value="a">` — React compares the new value prop with the DOM and writes it
   ↓
the DOM and the state agree; the second keystroke repeats the loop
```

The measured output shows the end state after two keystrokes: the DOM says `ab`, the state (rendered into a sibling `<span>`) says `ab`, and the component rendered **twice** — once at mount, once for the change. One re-render per keystroke is the normal, expected cost of a controlled input (section 9 discusses when that matters).

💡 **The single most useful debugging habit with forms**: render the state next to the input (`<span className="echo">{name || '(empty)'}</span>`). When the DOM and that echo disagree, you know React wrote a value the DOM refused — which almost always means the state did not change.

---

## 3. Line by line

```tsx
// File: src/components/ProductSearchField.tsx
import { useState, type ChangeEvent } from 'react';

export function ProductSearchField() {
  const [query, setQuery] = useState('');                       // ① the value lives here

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);                               // ② read the DOM value, store it
  };

  return (
    <label>
      Search products
      <input
        type="search"                                           // ③ a real input type: gets the browser's clear button
        value={query}                                           // ④ React writes this into the field
        onChange={handleChange}                                 // ⑤ and listens for changes
        placeholder="Try “keyboard”"
        autoComplete="off"
      />
      <span className="echo">{query === '' ? '(empty)' : query}</span>
    </label>
  );
}
```

1. **State is the source of truth.** One string, in one place (file 02).
2. **`event.target.value` is always a `string`** — even for `type="number"` (section 5).
3. **Types of inputs matter**: `type="search"` gives the browser's clear button and a different mobile keyboard; `type="email"` gives an email keyboard; `inputMode="numeric"` gives a numeric keypad without changing validation.
4. **`value` is the only thing the user sees.** Everything the field shows comes from here.
5. **`onChange` fires on every keystroke** (in React, `onChange` is the `input` event — Part 3, file 12). If you want "only when the user leaves the field", that is `onBlur`, and it is a different design (see the "commit on blur" pattern below).

### The event types you will need

| Control | Handler type | What you read |
| --- | --- | --- |
| text / search / email / password | `ChangeEvent<HTMLInputElement>` | `event.target.value` (`string`) |
| number | `ChangeEvent<HTMLInputElement>` | `event.target.value` (**still a `string`**) or `event.target.valueAsNumber` |
| checkbox | `ChangeEvent<HTMLInputElement>` | `event.target.checked` (`boolean`) |
| radio group | `ChangeEvent<HTMLInputElement>` | `event.target.value` (the chosen option's value) |
| select (single) | `ChangeEvent<HTMLSelectElement>` | `event.target.value` |
| select (multiple) | `ChangeEvent<HTMLSelectElement>` | `Array.from(event.target.selectedOptions, (option) => option.value)` |
| textarea | `ChangeEvent<HTMLTextAreaElement>` | `event.target.value` |
| form submit | `FormEvent<HTMLFormElement>` | `new FormData(event.currentTarget)` or your own state |

⚠️ **`type="number"` does not give you a number.** `event.target.value` is a string, and it is `''` when the field is empty or contains something the browser considers invalid. Storing `Number(event.target.value)` directly turns "the user cleared the field" into `0`, which is a real bug (an empty price of ₹0). Section 5 shows the fix.

---

## 4. The read-only symptom, reproduced on purpose

Here is a controlled input whose state never changes:

```tsx
function FrozenInput() {
  const [saved] = useState('');                        // never updated
  return (
    <input
      value={saved}
      onChange={() => { /* deliberately does nothing */ }}
    />
  );
}
```

**Verified** — typing `hello` into it:

```text
3. typing into an input whose value never changes: dom value after typing = "" (React reset it) · renders=1
```

The keystroke arrived, `onChange` ran, nothing changed, React re-rendered (it does not here, because the state is identical — `useState` bails out on equal values, Part 4 file 02) and the DOM value React wrote was `''` again. The field looks broken: you type, and the characters never appear.

React also warns about the most common variant of this mistake — a `value` prop with **no** `onChange` handler at all. Captured from React 19.3 (file `src/dev/form-warnings-probe.tsx`):

```text
You provided a `value` prop to a form field without an `onChange` handler. This will render
a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set either
`onChange` or `readOnly`.
```

Every clause of that message is a fix:

| The message says | What to do |
| --- | --- |
| "without an `onChange` handler" | add an `onChange` that updates the state behind `value` |
| "should be mutable → use `defaultValue`" | if React does not need to know the value, use an uncontrolled input (file 04) |
| "Otherwise, set either `onChange` or `readOnly`" | if the field really is not editable, say so explicitly with `readOnly` |

**Verified** — the same input plus `readOnly` produces no warning at all:

```text
2. <input value="locked" readOnly /> (the fix): (no warning, no error)
```

### The five real causes of "my input will not accept typing"

| Cause | How it looks | Fix |
| --- | --- | --- |
| no `onChange` at all | React warns; field never changes | add the handler |
| `onChange` exists but does not update the state behind `value` | no warning; field never changes | call the setter with the new value |
| the state lives in a different component than the input | the echo elsewhere updates, the field does not | lift the state to the common owner (file 02) |
| `value` is computed from something that never changes (`value={items.length}`) | the field shows a constant | make the state the source, or use `defaultValue` |
| the input is disabled (`disabled`) | greyed out | remove `disabled` (or fix the condition that set it) |
| `useState`'s initial value was the prop and the prop changed | shows the first value forever (measured in file 02) | derive it, or reset with `key` |

---

## 5. Typing the state properly

### Text

```tsx
const [query, setQuery] = useState('');                    // string, and '' is a valid state
```

### Numbers (the empty-field problem)

```tsx
// ❌ Number('') === 0 — clearing the field silently becomes "free"
const [price, setPrice] = useState(0);
<input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />

// ✅ keep the raw string in state; parse when you need the number
const [priceText, setPriceText] = useState('');
const priceMinor = priceText === '' ? null : Math.round(Number(priceText) * 100);
<input
  type="number"
  inputMode="decimal"
  min={0}
  step="0.01"
  value={priceText}
  onChange={(event) => setPriceText(event.target.value)}
  aria-invalid={priceText !== '' && !Number.isFinite(Number(priceText))}
/>
```

The rule: **a text field's state is a string.** Convert it at the edges (to a number for the API, to a number for calculations) instead of converting on every keystroke, and represent "empty" explicitly (`null`, `''`, or a union) rather than as `0`.

### Checkboxes and radios

```tsx
const [subscribed, setSubscribed] = useState(false);
const [plan, setPlan] = useState<'free' | 'pro'>('free');

<label>
  <input type="checkbox" checked={subscribed} onChange={(event) => setSubscribed(event.target.checked)} />
  Email me about new products
</label>

<fieldset>
  <legend>Plan</legend>
  {(['free', 'pro'] as const).map((option) => (
    <label key={option}>
      <input
        type="radio"
        name="plan"
        value={option}
        checked={plan === option}
        onChange={() => setPlan(option)}
      />
      {option === 'free' ? 'Free' : 'Pro'}
    </label>
  ))}
</fieldset>
```

⚠️ **Radios are a group with one state value.** The state holds *which* option is selected (a union is ideal here — Part 2), not a boolean per option. And the `name` attribute is what makes them one group in the browser (arrow keys move between them, the group submits one value).

### Select and textarea

```tsx
const [category, setCategory] = useState<CategoryChoice>('all');
const [note, setNote] = useState('');

<select value={category} onChange={(event) => setCategory(event.target.value as CategoryChoice)}>
  <option value="all">All</option>
  <option value="audio">Audio</option>
</select>

{/* ‼️ value goes in the PROP, never as children — see the error below */}
<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
```

**Verified** — putting text inside `<textarea>` is not a style choice, it is an error React will throw:

```text
4. <textarea>hello</textarea> (children): Use the `defaultValue` or `value` props instead of setting children on <textarea>.
5. <textarea defaultValue="">hello</textarea>: THROWN: If you supply `defaultValue` on a <textarea>, do not pass children.
```

In HTML you would write `<textarea>hello</textarea>`; in React the textarea's content is its `value` (controlled) or `defaultValue` (uncontrolled), exactly like an input. The same applies to `<select multiple>` with an array value:

```tsx
const [chosen, setChosen] = useState<string[]>(['audio']);
<select
  multiple
  value={chosen}
  onChange={(event) => setChosen(Array.from(event.target.selectedOptions, (option) => option.value))}
>
  <option value="audio">Audio</option>
  <option value="displays">Displays</option>
</select>
```

### The full set, verified in one place

```text
5. mixed controls, initial: false · false · all · not · free · all · (no note)
6. mixed controls, after the user acts: checked=true · plan=[pro] · select=audio · renders=5
7. the state echo: subscribed · pro · audio · gift wrap
```

Four different controls (checkbox, radio group, select, textarea), all controlled by one component's state, and the echo shows all four values in agreement after the user interacted with each: 1 render at mount + 4 interactions = 5 renders.

---

## 6. The controlled → uncontrolled switch

React decides once, per instance, whether a field is controlled (it has `value`) or uncontrolled (it does not). Switching later is an error, and React names it precisely. **Verified:**

```text
7. controlled input whose state becomes undefined:
    A component is changing a controlled input to be uncontrolled. This is likely caused by the
    value changing from a defined to undefined, which should not happen. Decide between using a
    controlled or uncontrolled input element for the lifetime of the component.
    More info: https://react.dev/link/controlled-components
```

How people trigger it:

```tsx
// ❌ `user` is undefined on the first render, so the field starts uncontrolled…
const [user, setUser] = useState<User | null>(null);
<input value={user?.name} onChange={...} />
// …and later `value` becomes a string: React is now switching modes.

// ✅ keep the prop's TYPE stable — always a string
<input value={user?.name ?? ''} onChange={...} />
```

The same error appears from the other direction ("changing an uncontrolled input to be controlled") when a field starts as `undefined` and later receives a value. The rule that prevents both: **`value` must always be a `string` (or `number`/array for the specific control), never `undefined` and never `null`.**

💡 **Also verified** — passing both `value` and `defaultValue` is reported at render time:

```text
ValueAndDefault contains an input of type  with both value and defaultValue props. Input elements
must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop,
but not both).
```

Pick one mode per field. `defaultValue` belongs to file 04.

---

## 7. Many fields at once

A form with eight controlled fields does not need eight `useState` calls and eight handlers. Two patterns scale:

### One state object + one generic handler

```tsx
// File: src/practice/CheckoutForm.tsx
import { useState, type ChangeEvent, type FormEvent } from 'react';

interface CheckoutDraft {
  email: string;
  fullName: string;
  address: string;
  city: string;
  pincode: string;
}

const emptyDraft: CheckoutDraft = { email: '', fullName: '', address: '', city: '', pincode: '' };

export function CheckoutForm({ onSubmit }: { onSubmit: (draft: CheckoutDraft) => void }) {
  const [draft, setDraft] = useState<CheckoutDraft>(emptyDraft);

  // One handler for every text field, driven by the input's `name` attribute.
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setDraft((current) => ({ ...current, [name]: value }));    // ← spread keeps the other fields
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(draft);
  };

  return (
    <form className="checkout" onSubmit={handleSubmit} noValidate>
      <label>Email<input name="email" type="email" autoComplete="email" value={draft.email} onChange={handleChange} /></label>
      <label>Full name<input name="fullName" autoComplete="name" value={draft.fullName} onChange={handleChange} /></label>
      <label>Address<input name="address" autoComplete="street-address" value={draft.address} onChange={handleChange} /></label>
      <label>City<input name="city" autoComplete="address-level2" value={draft.city} onChange={handleChange} /></label>
      <label>PIN code<input name="pincode" inputMode="numeric" autoComplete="postal-code" value={draft.pincode} onChange={handleChange} /></label>

      <button type="submit" disabled={draft.email === '' || draft.fullName === ''}>Place order</button>
      <button type="button" onClick={() => setDraft(emptyDraft)}>Clear</button>
    </form>
  );
}
```

⚠️ **The generic handler has a typing catch**: `{ ...current, [name]: value }` is not automatically safe, because `name` is a `string` at runtime. With `strict` TypeScript it still compiles (the computed key widens), and it silently accepts a typo in a `name` attribute — the field would update a property nobody reads. Two defences: keep the `name` attributes in a union by declaring the handler as

```tsx
const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
  const key = event.target.name as keyof CheckoutDraft;
  const value = event.target.value;
  setDraft((current) => ({ ...current, [key]: value }));
};
```

and add a test (or a render) that fills every field and checks the draft. Part 8 covers the mature version of this pattern — `react-hook-form`, which solves exactly this bookkeeping.

### A reducer when the rules grow

The moment validation and cross-field rules appear ("the PIN code must match the city", "the email must be valid before the button enables"), a `useReducer` (Part 4, file 06) keeps every rule in one testable place:

```tsx
type CheckoutAction =
  | { type: 'fieldChanged'; field: keyof CheckoutDraft; value: string }
  | { type: 'cleared' };

function checkoutReducer(state: CheckoutDraft, action: CheckoutAction): CheckoutDraft {
  switch (action.type) {
    case 'fieldChanged':
      return { ...state, [action.field]: action.value };
    case 'cleared':
      return emptyDraft;
    default: {
      const unhandled: never = action;
      throw new Error(`Unhandled action: ${JSON.stringify(unhandled)}`);
    }
  }
}
```

The component then calls `dispatch({ type: 'fieldChanged', field: 'email', value })`, and the rules can be unit-tested without a renderer.

---

## 8. Validation, on the edge

A controlled input is where validation belongs, because it is the only place that knows the value *as the user is forming it*. Three levels, from cheap to thorough:

```tsx
const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email);
const emailError = draft.email !== '' && !emailLooksValid;

<label>
  Email
  <input
    name="email"
    type="email"
    value={draft.email}
    onChange={handleChange}
    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
    aria-invalid={touched.email && emailError}         {/* announce the state */}
    aria-describedby={emailError ? 'email-error' : undefined}
    required
  />
</label>
{touched.email && emailError && <p id="email-error" role="alert">That does not look like an email address.</p>}
```

| Level | Mechanism | Notes |
| --- | --- | --- |
| The field itself | `required`, `minLength`, `type="email"`, `pattern`, `min`/`max` | free, accessible, blocks submit; the browser shows its own messages |
| React state | `aria-invalid`, error text, disabling submit | full control of the message, live feedback |
| On submit | validate everything, focus the first bad field | the last line of defence |

⚠️ **Client-side validation is a UX feature, never a security feature.** Anyone can bypass it (devtools, `fetch`, curl). Value rules must be enforced again on the server, and permission rules (who may edit what) must be enforced *only* on the server. Part 8 returns to this with schema validation (`zod`).

⚠️ **Do not validate on the first keystroke** of a field the user has not finished typing. Track "touched" (blurred once) or validate on submit, then live afterwards — otherwise the user is told their email is invalid while they are still typing the "a" of "ada@".

---

## 9. What controlled inputs cost

One re-render per keystroke is fine for a login form and a search box. It becomes visible when:

| Symptom | Why | Mitigation |
| --- | --- | --- |
| typing lags in a long form | every keystroke re-renders the whole form (and its children) | colocate state (file 02), `memo` the expensive children, or split the form into smaller components |
| a table of 500 rows re-renders per keystroke | the state that feeds the input lives too high | move the draft down; only the *committed* value needs to go up (debounce) |
| a heavy derived computation runs per keystroke | the filter runs on every render | `useMemo` (Part 4, file 07) or `useDeferredValue` (Part 10) |
| the cursor jumps to the end while typing in the middle | you are normalising the value on every keystroke | let the input hold the raw text; format on blur or on submit |

The last row is a classic: uppercase-and-strip formatters applied on every change fight the user's caret. The professional pattern is **uncontrolled-style editing with controlled validation**: keep the raw string in state, show the formatted/normalised version elsewhere, and normalise when the field loses focus (or when submitting).

---

## 10. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | `value` with no `onChange` | React's read-only warning; field will not accept typing | add the handler, or use `defaultValue`/`readOnly` |
| 2 | `onChange` that does not update the state behind `value` | field refuses typing, no warning (measured: `dom=""`) | call the setter |
| 3 | `value={undefined}` on first render | "changing a controlled input to be uncontrolled" | use `?? ''` |
| 4 | `value` **and** `defaultValue` | React's explicit warning | choose one mode |
| 5 | `Number(event.target.value)` for a number field | clearing the field becomes `0` | keep the string, parse at the edge |
| 6 | **children inside `<textarea>`** | thrown error: use `value`/`defaultValue` | move the text to the prop |
| 7 | `checked` without `onChange` on a checkbox | React warns; the box never toggles | add `onChange` with `event.target.checked` |
| 8 | radios each with their own boolean state | two radios can be on at once | one state value for the group (`name` + union) |
| 9 | `<select value>` without `onChange` | the selection snaps back | add the handler |
| 10 | replacing the state object instead of spreading | other fields clear themselves | `{ ...current, [key]: value }` |
| 11 | validating on every keystroke from the first character | the user is told it is invalid while typing | validate on blur/submit; track "touched" |
| 12 | believing client-side validation is security | rules bypassed with devtools or a direct `fetch` | validate again on the server |

---

## 11. Best practices

1. **Decide the mode per field**: controlled (React needs the value) or uncontrolled (React reads it on submit — file 04). Do not mix within one field.
2. **Always give `onChange` a real update**, and keep the echo trick (`<span>{value}</span>`) while you build the form.
3. **Keep the state's type stable**: `string`, never `undefined`.
4. **Store strings for text fields**; convert to numbers/money at the edges.
5. **Keep the raw text while typing**; format and normalise on blur or submit so the caret behaves.
6. **Colocate the draft** with the form; lift only the committed value if something above needs it.
7. **Use `name` attributes** even with controlled inputs: they document the field, help browser autofill, and enable the generic handler.
8. **Label every control** (`<label>` wrapping the input, or `htmlFor` + `id`) and wire `aria-invalid`/`aria-describedby` to the error text.
9. **Disable submit only for real problems** — and prefer showing why over a mysteriously dead button.
10. **Never trust the client**: validate on the server too (Part 8).

---

## 12. Real-world example: the lab's search box

The lab's search field is controlled, and every part of the pattern is visible in it:

```tsx
// src/components/SearchBar.tsx (essentials)
export interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
  onClear: () => void;
  inputRef?: Ref<HTMLInputElement>;
}

export function SearchBar({ value, onChange, onClear, inputRef }: SearchBarProps) {
  return (
    <form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
      <label htmlFor="product-search">Search products</label>
      <input
        id="product-search"
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}   {/* the whole loop, one line */}
        placeholder="Try “keyboard”"
        autoComplete="off"
      />
      {value !== '' && (
        <button type="button" className="search__clear" onClick={onClear} aria-label="Clear search">
          ×
        </button>
      )}
      <span className="visually-hidden" aria-live="polite">
        {value === '' ? '' : `${value} — results update as you type`}
      </span>
    </form>
  );
}
```

Why this shape:

- **The state lives in `Shop`** because `ProductList` also needs the query (file 02's ownership rule); `SearchBar` is a pure `value`/`onChange` component that could be dropped anywhere.
- **`value !== '' &&` for the clear button** — the button exists only when there is something to clear.
- **The `x` button calls `onClear()`**, a semantic callback (file 01), not `onChange('')` — the parent decides that clearing also means restoring focus, which is why `inputRef` is passed in and `focusSearch` lives in `Shop`.
- **The live region** announces results changing as the user types, without moving focus.
- **The user's keystrokes go through `setQuery`**, so the filtering happens during render of `Shop`'s `visible` value — one state, one derived list, no synchronisation (file 02).

The same pattern appears in `CategoryFilter` (a controlled `<select>`/chip group) and would appear in any real login, checkout or settings form. Once you have written it twice, the shape is always the same: **state in the owner, `value` down, `onChange` up, derived values computed during render.**

---

## 13. Practice

### Beginner — from broken to controlled

Each snippet below is a controlled input that misbehaves. Fix each one and say which of React's warnings (if any) it would produce.

```tsx
// 1.
<input value={name} />

// 2.
<input value={name} onChange={(event) => console.log(event.target.value)} />

// 3.
const [user, setUser] = useState<User | null>(null);
<input value={user?.name} onChange={(event) => setUser({ name: event.target.value })} />

// 4.
const [price, setPrice] = useState(0);
<input type="number" value={price} onChange={(event) => setPrice(Number(event.target.value))} />

// 5.
<textarea value={note} onChange={(event) => setNote(event.target.value)}>Write your review…</textarea>
```

### Intermediate — a typed, validated profile form

**File: `src/practice/ProfileForm.tsx`**

Build a controlled form with `fullName`, `email`, `bio` (textarea) and `newsletter` (checkbox):

1. One state object, one generic `handleChange` for the text fields, plus a dedicated handler for the checkbox.
2. Validation: `fullName` required, `email` must contain `@` and a dot after it, `bio` at most 200 characters. Show errors only after a field has been blurred once (track `touched`).
3. The submit button is disabled while any error is visible, and enabled otherwise.
4. On submit, log the parsed draft and reset the form to its empty state.
5. Accessibility: every field has a label, errors are `role="alert"` and wired with `aria-describedby`, and invalid fields carry `aria-invalid`.

Then answer: why does the error text need `role="alert"`, and what goes wrong if you render it only when the user has typed *and* blurred?

### Challenge — a money input and an OTP input

**File: `src/practice/MoneyInput.tsx`** and **`src/practice/OtpInput.tsx`**

1. **`MoneyInput`** — a controlled field for an amount in rupees that:
   - keeps the raw text in state so the user can type freely (`','`, partial values like `1,2`),
   - accepts only digits, one decimal point and at most two decimals,
   - formats with thousand separators **on blur**, and stores a `number | null` upward via `onChange` (so `''` means "no amount" rather than ₹0),
   - shows the parsed value, and never fights the caret while typing.
2. **`OtpInput`** — six single-character boxes that behave like one field:
   - typing a digit moves the focus to the next box,
   - backspace on an empty box moves back,
   - pasting `"123456"` fills all six,
   - the parent receives the joined string once all six are filled,
   - the boxes are individual controlled inputs (or refs — your choice; say which and why).

Explain in a sentence each: which of the two components benefits from being **uncontrolled internally**, and why an array of refs is a legitimate use of refs here.

---

## 14. Solutions

### Beginner

```tsx
// 1. Missing onChange → React's read-only warning; the field never changes.
<input value={name} onChange={(event) => setName(event.target.value)} />
//    (If the field should not be mutable, keep it and add `readOnly`.)

// 2. onChange logs but does not update state → no warning, the field still refuses input.
<input value={name} onChange={(event) => setName(event.target.value)} />

// 3. `value` is `undefined` on the first render → "changing a controlled input to be uncontrolled".
<input value={user?.name ?? ''} onChange={(event) => setUser({ name: event.target.value })} />

// 4. Number('') === 0 → clearing the field silently becomes ₹0.
const [priceText, setPriceText] = useState('');
const priceMinor = priceText === '' ? null : Math.round(Number(priceText) * 100);
<input type="number" value={priceText} onChange={(event) => setPriceText(event.target.value)} />

// 5. Children on a textarea → React throws
//    "Use the `defaultValue` or `value` props instead of setting children on <textarea>."
<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Write your review…" />
```

Only cases 1 and 3 are *warned about*; case 2 is silent, which is exactly why it is the more dangerous mistake. Case 4 is silent too — the bug appears later, as an order for ₹0. Case 5 is loud and immediate.

### Intermediate

**File: `src/practice/ProfileForm.tsx`**

```tsx
import { useState, type ChangeEvent, type FormEvent } from 'react';

interface ProfileDraft {
  fullName: string;
  email: string;
  bio: string;
  newsletter: boolean;
}

const emptyProfile: ProfileDraft = { fullName: '', email: '', bio: '', newsletter: false };

type Touched = Partial<Record<keyof ProfileDraft, boolean>>;

function validate(draft: ProfileDraft) {
  const emailDotAfterAt = /@[^\s@]*\.[^\s@]+$/.test(draft.email);
  return {
    fullName: draft.fullName.trim() === '' ? 'Please tell us your name.' : null,
    email: draft.email === '' || !emailDotAfterAt ? 'Enter an email address like name@example.com.' : null,
    bio: draft.bio.length > 200 ? `That is ${draft.bio.length - 200} characters too long.` : null,
    newsletter: null,
  };
}

export function ProfileForm({ onSave }: { onSave: (draft: ProfileDraft) => void }) {
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfile);
  const [touched, setTouched] = useState<Touched>({});

  const errors = validate(draft);
  const hasVisibleError = (Object.keys(errors) as (keyof ProfileDraft)[]).some(
    (field) => touched[field] === true && errors[field] !== null,
  );

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const field = event.target.name as keyof ProfileDraft;
    const value = event.target.value;
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const handleBlur = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const field = event.target.name as keyof ProfileDraft;
    setTouched((current) => ({ ...current, [field]: true }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Mark everything touched so any remaining error becomes visible.
    setTouched({ fullName: true, email: true, bio: true, newsletter: true });
    if (Object.values(errors).some((error) => error !== null)) return;
    onSave(draft);
    setDraft(emptyProfile);
    setTouched({});
  };

  const show = (field: keyof ProfileDraft) => (touched[field] === true ? errors[field] : null);

  return (
    <form className="profile" onSubmit={handleSubmit} noValidate>
      <label htmlFor="fullName">Full name</label>
      <input
        id="fullName"
        name="fullName"
        value={draft.fullName}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-invalid={show('fullName') !== null}
        aria-describedby={show('fullName') !== null ? 'fullName-error' : undefined}
      />
      {show('fullName') !== null && <p id="fullName-error" role="alert">{show('fullName')}</p>}

      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        value={draft.email}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-invalid={show('email') !== null}
        aria-describedby={show('email') !== null ? 'email-error' : undefined}
      />
      {show('email') !== null && <p id="email-error" role="alert">{show('email')}</p>}

      <label htmlFor="bio">Bio ({draft.bio.length}/200)</label>
      <textarea
        id="bio"
        name="bio"
        rows={4}
        value={draft.bio}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-invalid={show('bio') !== null}
      />
      {show('bio') !== null && <p role="alert">{show('bio')}</p>}

      <label>
        <input
          name="newsletter"
          type="checkbox"
          checked={draft.newsletter}
          onChange={(event) => setDraft((current) => ({ ...current, newsletter: event.target.checked }))}
        />
        Send me product news
      </label>

      <button type="submit" disabled={hasVisibleError}>Save profile</button>
    </form>
  );
}
```

**Why `role="alert"`?** It makes assistive technology announce the message the moment it appears, without moving focus — which matters when the error appears *because* the user just left the field. `aria-describedby` links the message to the input so that re-focusing the field reads the problem out again.

**What goes wrong without the "touched and typed" rule?** The user gets told "Please tell us your name" while the field is still empty and untouched — i.e. immediately on page load — and "Enter an email address like…" after the first character of a valid address. Errors that fire while the user is still typing train people to ignore errors, which defeats their purpose. The `touched` set is the smallest mechanism that fixes it: validate always, *show* only after the user has finished with a field (or attempted to submit).

### Challenge

**File: `src/practice/MoneyInput.tsx`**

```tsx
import { useState } from 'react';

export interface MoneyInputProps {
  /** Called with the parsed amount in rupees, or null when the field is empty. */
  onChange: (rupees: number | null) => void;
  value?: number | null;
  label: string;
  id: string;
}

const MAX_DECIMALS = 2;
const formatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: MAX_DECIMALS });

/** Keeps the user's raw text while focused; formats and parses on blur. */
export function MoneyInput({ onChange, value, label, id }: MoneyInputProps) {
  const [text, setText] = useState(value == null ? '' : String(value));

  // Accept digits, optional single dot, at most two decimals — nothing else.
  const sanitize = (raw: string): string => {
    const cleaned = raw.replace(/[^\d.]/g, '');
    const [whole = '', ...rest] = cleaned.split('.');
    const decimals = rest.join('').slice(0, MAX_DECIMALS);
    return rest.length === 0 ? whole : `${whole}.${decimals}`;
  };

  const handleChange = (raw: string) => {
    const next = sanitize(raw);
    setText(next);                                    // the field shows exactly what was typed
    onChange(next === '' || next === '.' ? null : Number(next));
  };

  const handleBlur = () => {
    if (text === '' || text === '.') {
      setText('');
      onChange(null);
      return;
    }
    const parsed = Number(text);
    setText(formatter.format(parsed));                // format only when the user is done typing
    onChange(parsed);
  };

  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={handleBlur}
        placeholder="1,999.00"
      />
    </>
  );
}
```

**File: `src/practice/OtpInput.tsx`**

```tsx
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';

const LENGTH = 6;

export function OtpInput({ onComplete, label }: { onComplete: (code: string) => void; label: string }) {
  const [digits, setDigits] = useState<string[]>(Array.from({ length: LENGTH }, () => ''));
  // An array of refs: the ONLY way to move focus between siblings. Focus is a DOM
  // concern, not state — storing "which box is focused" in state would re-render on
  // every arrow key for no benefit (Part 4, file 04).
  const boxes = useRef<Array<HTMLInputElement | null>>([]);

  const commit = (next: string[]) => {
    setDigits(next);
    if (next.every((digit) => digit !== '')) onComplete(next.join(''));
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);        // keep the last typed digit only
    if (digit === '') return;
    const next = [...digits];
    next[index] = digit;
    commit(next);
    boxes.current[Math.min(index + 1, LENGTH - 1)]?.focus();   // focus moves forward
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && digits[index] === '') {
      event.preventDefault();
      boxes.current[Math.max(index - 1, 0)]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (pasted === '') return;
    const next = Array.from({ length: LENGTH }, (_, i) => pasted[i] ?? '');
    commit(next);
    boxes.current[Math.min(pasted.length, LENGTH - 1)]?.focus();
  };

  return (
    <fieldset className="otp">
      <legend>{label}</legend>
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            boxes.current[index] = node;
          }}
          className="otp__box"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          aria-label={`Digit ${index + 1} of ${LENGTH}`}
          value={digit}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
        />
      ))}
    </fieldset>
  );
}
```

Two answers:

- **`MoneyInput` benefits from being uncontrolled *internally*** — it holds the raw text (a string the user is mid-way through editing) but reports a **parsed number** upward. The parent does not need to know about `1,2` or a trailing dot; it needs the amount. Keeping the "editing syntax" local and lifting only the value is what allows formatting on blur without fighting the caret. (It is still a *controlled* component — `value` and `onChange` are both wired; the distinction is between which value is stored where.)
- **The ref array is legitimate** because the goal is a DOM action (focus), which no state can express. The alternative — state like `const [focusedIndex, setFocusedIndex] = useState(0)` plus an effect that calls `.focus()` — re-renders six inputs on every keystroke and still ends up calling the same DOM method, one render later. Refs are the correct tool for imperatives; `useState` is for what the user sees (file 06 goes deeper).

---

## 15. Summary

- A **controlled** component gets its displayed value from React state via `value`, and reports changes via `onChange`; React writes the value back into the DOM on every render.
- The loop, measured: keystroke → `onChange` → `setState` → re-render → the DOM matches the state (`dom=ab · state="ab" · renders=2`).
- **If the state does not change, the field does not change** — that is the whole definition. Verified: a frozen `value` produced `dom=""` after typing, and React's warning explains every case: *"You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field…"*
- Fixes for the read-only symptom: add `onChange` + update the state; use `defaultValue` if React does not need the value; use `readOnly` if the field genuinely is not editable.
- **Keep the state's type stable**: `value={user?.name ?? ''}` prevents React's "changing a controlled input to be uncontrolled" error.
- Text fields hold **strings**; `Number('')` is `0`, so parse at the edges and model "empty" explicitly.
- `<textarea>` takes `value`/`defaultValue`, **never children** (verified: React warns, and throws when both are present); `<select multiple>` takes an array; radios are one state value for the group; checkboxes read `event.target.checked`.
- Scale forms with **one state object and a generic handler** (spread the state on update), and move to a **reducer** when the rules grow. Part 8 covers `react-hook-form` and `zod` for the mature version.
- Validate on blur/submit and show errors after "touched" — not on the first keystroke — and treat client-side validation as UX, never as security.
- The cost of a controlled field is one re-render per keystroke: fine in a form, worth colocating or memoising when the state sits above something expensive.

---

**What's next →** [`04-uncontrolled-components.md`](./04-uncontrolled-components.md): the other half — letting the DOM own the value. We will read a form with `defaultValue`, a ref and `FormData` (measured: typing changed the DOM and the ref, and the component rendered **once**), reset a form with the browser's own reset button, watch React throw when a file input is given a `value`, and learn the rule for choosing between the two modes: *does React need the value while the user is typing?*
