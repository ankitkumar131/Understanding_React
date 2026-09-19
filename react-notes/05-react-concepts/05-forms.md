# 05 — Forms in Depth: Submit, Validate, Reset

> **Part 5 · React Concepts · File 5 of 9**
> Why this file exists: files 03 and 04 were about a single field; a form is a *process* — collect values, decide whether they are acceptable, show what is wrong, submit, and reset. This chapter builds one complete, accessible form and verifies the whole lifecycle (`errors → focus → submit → reset → success`), then covers the parts that are easy to get subtly wrong: what the browser does when you forget `preventDefault`, why `type="reset"` does nothing to controlled fields, how to stop a double submit, and how to run a multi-step form without losing the draft.

---

## 1. The complete form, verified

Here is the form the rest of this chapter explains — a product review with a rating, a title, a body and a recommend checkbox. It uses **both** field modes deliberately: controlled where the value is needed while typing, uncontrolled where it is read once on submit.

```tsx
// File: src/practice/ReviewForm.tsx (complete source is in the practice section)
export function ReviewForm({ onSubmitted }: { onSubmitted: (review: Review) => void }) { … }
```

**Verified** — the full lifecycle, driven in the lab's jsdom harness:

```text
1. fresh form: errors=(none) · success message? false
2. after submitting an empty form: errors: Choose a rating from 1 to 5 stars. | Give your review a title. | Please write at least 20 characters (you have 0).
3. focus moved to the first invalid control: select[name=rating]
4. onSubmit was called?: no — validation stopped it
5. after filling the fields: errors still shown: … (they only clear on the next submit)
6. after a valid submit — what the parent received: {"rating":4,"title":"Quiet and comfortable","body":"The keys are quiet enough for a shared office.","recommend":true}
7. the form reset itself: title="" · rating=0 · body="" · errors=(none)
8. success message: Thanks — your review was submitted.
9. where focus went: select[name=rating]
10. submitting the empty (reset) form again: errors: Choose a rating from 1 to 5 stars. | …
```

Every number and string above is the real output. Read it as the definition of "a working form":

- nothing is shown before the user acts (1);
- submitting something invalid shows **all** the problems at once, not one at a time (2);
- focus lands on the **first** problem, so keyboard users are not lost (3);
- invalid data never reaches the parent (4);
- a valid submit sends the parsed values (6), clears both modes (7), and reports success (8–9).

---

## 2. What the browser does with a `<form>`

Before React, forms were the original submission mechanism: pressing Enter in a field submits the form, and the browser **navigates** — either to the `action` URL (with `method="post"`) or to the current URL with the values in the query string (the default `method="get"`).

```html
<!-- No JavaScript: this navigates to /search?q=keyboard -->
<form action="/search">
  <input name="q" />
  <button type="submit">Search</button>
</form>
```

In a single-page app a navigation means a full page reload — state lost, scroll reset, the app re-bootstrapped. So the standard React pattern is to intercept the event:

```tsx
<form
  onSubmit={(event) => {
    event.preventDefault();            // stop the browser's navigation
    // …now do it the React way: validate, call the API, update state
  }}
>
```

Four facts about this event worth knowing, because they explain most form bugs:

1. **`onSubmit` fires on the `<form>`, not the button.** A submit can come from the button, from Enter inside a text field, or from `form.requestSubmit()`. Handle it in one place.
2. **`<button>` defaults to `type="submit"`.** A button inside a form that was only meant to do something local (open a modal, toggle a section) will submit the form unless you add `type="button"`. This is one of the most common form bugs in React.
3. **`event.currentTarget` is the form element**; `event.target` may be the button. Use `currentTarget` when you need `FormData`.
4. **`type="reset"` restores default values** — it is a browser reset, not a React one (section 7).

### React 19's `action` prop

React 19 adds a second way to submit: pass a function to `action` instead of using `onSubmit`.

```tsx
async function createReview(formData: FormData) {
  await fetch('/api/reviews', { method: 'POST', body: formData });
}

<form action={createReview}>
  <input name="title" required />
  <button type="submit">Submit</button>
</form>
```

From React's `<form>` documentation: an `action` *"runs in a Transition and calling `e.preventDefault()` isn't needed"*, **uncontrolled fields are reset automatically when the action succeeds**, and an action may be a Server Function (which `onSubmit` cannot be). When you need the event itself (to focus a field, to stop propagation), `onSubmit` remains the right choice. Part 8 builds on `action` with `useActionState`, `useFormStatus` and `useOptimistic`.

---

## 3. Collecting the values

| Approach | Code | When |
| --- | --- | --- |
| **`FormData`** at submit | `const data = new FormData(event.currentTarget); data.get('email')` | uncontrolled fields; the whole form at once; the React-documented default |
| **State** | `const [email, setEmail] = useState('')` | controlled fields; values needed during render |
| **`useForm`/library** | `const { register, handleSubmit } = useForm()` | big forms with many rules (Part 8) |

Mix them freely **per field** (never per field *over time*):

```tsx
const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);

  const payload = {
    title: title.trim(),                       // controlled field: from state
    body: String(data.get('body') ?? ''),       // uncontrolled field: from the form
    rating: Number(data.get('rating') ?? 0),
  };
  onSubmitted(payload);
};
```

**Verified** (file 04's harness) — the `FormData` path end to end:

```text
8. uncontrolled form defaults (no React state involved): email=ada@example.com · plan=pro · renders=1
9. after submitting, read with FormData: submitted="email=grace@example.com · plan=free" · renders=2
10. after clicking the reset button: email=ada@example.com · plan=pro
```

⚠️ **`FormData.get` returns `string | File | null`.** Every value needs a decision: `String(data.get('x') ?? '')` for text, `Number(...)` for numbers, `data.get('file') as File` after checking it is not `null`. Silently passing `null` into a payload is a bug that surfaces as `"null"` in an API request.

---

## 4. Building the form, line by line

```tsx
<form ref={formRef} className="review" onSubmit={handleSubmit} noValidate>
  <h2>Write a review</h2>

  <label htmlFor="rating">Rating</label>
  <select
    id="rating"
    name="rating"
    value={rating}
    aria-invalid={errors.rating !== undefined}
    aria-describedby={errors.rating !== undefined ? 'rating-error' : undefined}
    onChange={(event) => setRating(Number(event.target.value))}
  >
    <option value={0}>Choose…</option>
    {[1, 2, 3, 4, 5].map((stars) => (
      <option key={stars} value={stars}>{'★'.repeat(stars)} ({stars})</option>
    ))}
  </select>
  {errors.rating !== undefined && <p id="rating-error" className="review__error" role="alert">{errors.rating}</p>}
  …
</form>
```

Decisions in that markup, one at a time:

| Piece | Why |
| --- | --- |
| `noValidate` on the form | turns off the browser's own popup messages so ours are the only ones (section 5 explains when to keep them) |
| `<label htmlFor="rating">` + `id="rating"` | clicking the label focuses the control; screen readers announce the field's name |
| `name="rating"` | read by `FormData`, used to focus the first invalid field, and shown in browser autofill/devtools |
| `value={rating}` + `onChange` | controlled: the rating drives the button's enabled state and the error message |
| `value={0}` with "Choose…" | a sentinel that is *not* a valid rating, so "nothing chosen" is representable (the `Number('') === 0` trap from file 03) |
| `aria-invalid` | marks the field as invalid for assistive technology |
| `aria-describedby={…}` | links the field to the message that explains it; the link is removed when there is no error |
| `role="alert"` on the error | announces the message when it appears |
| `id="rating-error"` | the target of `aria-describedby`; ids must be unique in the page |
| `errors.rating !== undefined && …` | a false, `0`, `''` or `NaN` would all render nothing in JSX — check explicitly (Part 3, file 10) |

### The submit handler

```tsx
const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();

  const body = bodyRef.current?.value ?? '';
  const nextErrors = validate(rating, title, body);
  setErrors(nextErrors);

  const firstInvalid = (Object.keys(nextErrors) as Array<keyof Errors>)[0];
  if (firstInvalid !== undefined) {
    // Focus the first problem so keyboard and screen-reader users land on it.
    formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
    return;                                     // ← invalid data never reaches the parent
  }

  onSubmitted({ rating, title: title.trim(), body: body.trim(), recommend });
  // …reset (section 7)
};
```

**Verified** — the sequence this produces:

```text
2. after submitting an empty form: errors: Choose a rating from 1 to 5 stars. | Give your review a title. | Please write at least 20 characters (you have 0).
3. focus moved to the first invalid control: select[name=rating]
4. onSubmit was called?: no — validation stopped it
```

Two design points hide in those lines:

- **The error object's key order decides focus order**, so build it in the order the fields appear on screen (`rating`, `title`, `body`). `Object.keys` preserves insertion order for string keys.
- **Focusing by `name` keeps the handler short.** The alternative — a ref per field — is more code and one more thing to keep in sync; the alternative pattern for large forms is to focus an **error summary** at the top and link to the fields.

---

## 5. Validation: three levels, one rule

| Level | Mechanism | What it gives you | What it costs |
| --- | --- | --- | --- |
| **Browser constraints** | `required`, `type="email"`, `min`/`max`, `pattern`, `minLength`, `maxLength` | free, accessible, translated, works before JavaScript loads | messages you do not control; styling is limited; **no cross-field rules** |
| **React** (state + your own messages) | `validate()` on submit, `aria-invalid`, error text | full control of wording, cross-field rules, disabling submit | you write and maintain it |
| **Server** | validate the payload again in the API | the only level that is actually **secure** | a network round trip |

The rule that ties them together: **decide one source of truth for the messages.** Either let the browser speak (skip `noValidate`, add the attributes, and let the popups appear) or silence it (`noValidate`) and render your own. Mixing them produces the classic bug where the browser's tooltip appears over your inline error, or your error never appears because the browser blocked submission first.

⚠️ **Client validation is UX, not security.** Everything the browser or React checks can be bypassed with devtools or a direct `fetch`. Value rules (is this a valid price? is this PIN well-formed?) must be re-checked on the server, and *permission* rules (may this user edit this product?) can only live on the server. Part 8 pairs `react-hook-form` with `zod` schemas shared by client and server for exactly this reason.

### When to show errors — the decision that users notice

Three options, in increasing order of forgiveness:

| Strategy | How it feels | Use when |
| --- | --- | --- |
| validate on every keystroke | "the form is yelling at me while I type" | almost never (only for instant-format fields) |
| validate **on submit**, show only then | calm; the user can finish a thought | short forms, forms that fail loudly (the verified example) |
| validate **on blur** (after a field has been touched), then live after that | the sweet spot for long forms | most real forms — file 03's `ProfileForm` |

The verified form above uses the second: errors appear on submit and **stay** until the next submit.

```text
5. after filling the fields: errors still shown: … (they only clear on the next submit)
```

Notice the slight annoyance: the user fixed the title but the message is still there. Options to improve it, in order of effort:

1. **Clear a field's error when that field changes** (cheap, and what most people expect):

   ```tsx
   const clearError = (field: keyof Errors) =>
     setErrors((current) => (current[field] === undefined ? current : { ...current, [field]: undefined }));
   // in onChange: clearError('title');
   ```

2. **Re-validate only the changed field** as the user types, once a submit has happened.
3. **`useActionState`** (React 19) returns errors from the submission itself, which fits server-side validation neatly (Part 8).

---

## 6. Accessibility checklist for forms

Worth applying to every form, in this order:

- [ ] **Every control has a label.** `<label htmlFor="id">Text</label>` or wrap the control inside the label. A `placeholder` is *not* a label — it disappears as soon as the user types.
- [ ] **Group related controls** with `<fieldset>` + `<legend>`: radio groups, checkbox groups, and any set of fields that share a heading ("Shipping address").
- [ ] **Mark required fields** with the `required` attribute *and* say so in text ("Required" or an asterisk with an explanation), not by colour alone.
- [ ] **Errors are announced**: `role="alert"` on the message (or `aria-live="assertive"` on a container).
- [ ] **Errors are linked**: `aria-invalid` + `aria-describedby` pointing at the message's `id`.
- [ ] **Focus moves to the first problem** (verified: `select[name=rating]`) or to an error summary that links to each field.
- [ ] **Success is announced too**: `role="status"` on a confirmation message that appears without a page change (verified: `Thanks — your review was submitted.`).
- [ ] **No keyboard traps**: every control reachable with Tab, the submit button operable with Enter/Space.
- [ ] **Autofill works**: correct `type` and `autoComplete` values (`email`, `name`, `street-address`, `postal-code`, `one-time-code`), so browsers and password managers can help.
- [ ] **Nothing depends on colour alone**: an invalid field is not marked only by a red border.

**Verified** — the emphasis of the whole checklist in one attribute pair:

```text
3. focus moved to the first invalid control: select[name=rating]
```

That line is invisible in a screenshot and decisive for a keyboard user: without it, the "Submit" press appears to do nothing, because the message is off-screen.

---

## 7. Reset, in both modes

`type="reset"` is a **browser** action: it restores every field in the form to its `defaultValue`/`defaultChecked`. That is exactly right for uncontrolled fields (verified in file 04: `email=ada@example.com · plan=pro` came back) and **does nothing you can see for controlled fields**, because React immediately re-renders them from state.

So a reset in a mixed form touches three things:

```tsx
const resetForm = () => {
  // 1. controlled fields: React state
  setRating(0);
  setTitle('');
  setRecommend(true);
  setErrors({});
  setSubmitted(null);

  // 2. uncontrolled fields: the DOM
  bodyRef.current!.value = '';        // or: formRef.current?.reset()
};
```

The verified output of doing exactly that, after a successful submit:

```text
7. the form reset itself: title="" · rating=0 · body="" · errors=(none)
8. success message: Thanks — your review was submitted.
9. where focus went: select[name=rating]
```

Two refinements worth knowing:

- **Reset by identity instead of by hand.** Wrapping the form in a `key` and bumping it (file 02) resets *everything* — state, uncontrolled defaults, focus, any library state — with one line:

  ```tsx
  const [formKey, setFormKey] = useState(0);
  <ReviewForm key={formKey} onSubmitted={…} />   // + setFormKey((k) => k + 1) to reset
  ```

  The trade: a remount throws away anything that should survive (an uploaded file preview, a draft saved elsewhere). Use it when "start fresh" is the whole intent.

- **Reset on success, not on submit.** A rejected submission must keep everything the user typed — that is the difference between an annoying form and a usable one. Our handler resets only after `onSubmitted` runs, i.e. after validation passes.

- **Move focus after success.** The verified run shows focus still on the rating select (`9. where focus went: select[name=rating]`) because nothing moved it. Better: focus the confirmation message (or the first field) so the user notices the change:

  ```tsx
  successRef.current?.focus();     // <p ref={successRef} role="status" tabIndex={-1}>…
  ```

---

## 8. Preventing double submits

A slow network plus an eager user equals two POSTs, two orders, or two emails. Three defences, all worth having:

```tsx
// 1. Track the in-flight state and disable the button (and say why).
const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  if (status === 'submitting') return;              // 2. guard the handler itself
  setStatus('submitting');
  try {
    await save(payload);
    setStatus('done');
  } catch (error) {
    setStatus('error');
  }
};

<button type="submit" disabled={status === 'submitting'} aria-busy={status === 'submitting'}>
  {status === 'submitting' ? 'Saving…' : 'Save review'}
</button>
```

```html
<!-- 3. The browser's own guard: disable the button's default behaviour while busy -->
<!-- (only needed if the button must stay clickable for styling reasons) -->
```

⚠️ **The server still needs protection.** Two tabs, a retried request, or a replayed payload can duplicate work regardless of what the client does — that is what **idempotency keys** and unique constraints are for (Part 7 discusses retries; Part 15 the API contract). Client-side guards are politeness; the server is the authority.

💡 **React 19 has this built in for actions.** `useFormStatus()` (from `react-dom`) reports `pending` for the nearest parent form, and an `action` runs in a Transition, so the button can show a pending state without hand-rolled flags:

```tsx
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();      // must be a CHILD of the <form>
  return <button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>;
}
```

Part 8 covers this property in full.

---

## 9. Field groups: radios, checkboxes and friends

```tsx
// A radio GROUP is one state value, wrapped in a fieldset with a legend.
const [plan, setPlan] = useState<'free' | 'pro'>('free');

<fieldset className="plan">
  <legend>Choose a plan</legend>
  <label>
    <input type="radio" name="plan" value="free" checked={plan === 'free'} onChange={() => setPlan('free')} />
    Free — 5 products
  </label>
  <label>
    <input type="radio" name="plan" value="pro" checked={plan === 'pro'} onChange={() => setPlan('pro')} />
    Pro — unlimited products
  </label>
</fieldset>
```

```tsx
// A checkbox GROUP is a set: store an array, toggle membership.
const [interests, setInterests] = useState<string[]>([]);
const toggle = (value: string) =>
  setInterests((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));

<fieldset>
  <legend>Which products interest you?</legend>
  {['keyboards', 'monitors', 'audio'].map((interest) => (
    <label key={interest}>
      <input
        type="checkbox"
        name="interests"
        value={interest}
        checked={interests.includes(interest)}
        onChange={() => toggle(interest)}
      />
      {interest}
    </label>
  ))}
</fieldset>
// With FormData, repeating a name gives you all the checked values:
// data.getAll('interests')  →  ['keyboards', 'audio']
```

**Verified** — the basics of grouped controls, from file 03's harness:

```text
5. mixed controls, initial: false · false · all · not · free · all · (no note)
6. mixed controls, after the user acts: checked=true · plan=[pro] · select=audio · renders=5
7. the state echo: subscribed · pro · audio · gift wrap
```

And the accessibility pay-off of `<fieldset>`: screen readers announce *"Choose a plan, group"* before each radio, which is what turns a list of inputs into a question with answers.

---

## 10. Multi-step forms

A checkout with three steps is **one** draft and one **step** pointer — not three forms with three copies of the data (file 02's rule, applied to a process):

```tsx
// File: src/practice/checkoutFormState.ts
export interface CheckoutDraft {
  email: string;
  address: Address;
  payment: { cardLast4: string; nameOnCard: string };
}

export type CheckoutStep = 'email' | 'address' | 'payment' | 'review';

export const emptyCheckoutDraft: CheckoutDraft = {
  email: '',
  address: { fullName: '', address: '', city: '', pincode: '' },
  payment: { cardLast4: '', nameOnCard: '' },
};
```

```tsx
function CheckoutWizard() {
  const [draft, setDraft] = useState(emptyCheckoutDraft);
  const [step, setStep] = useState<CheckoutStep>('email');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateStep = (current: CheckoutStep): Record<string, string> => {
    switch (current) {
      case 'email':
        return /@[^\s@]*\.[^\s@]+$/.test(draft.email) ? {} : { email: 'Enter a valid email address.' };
      case 'address':
        return draft.address.fullName !== '' && draft.address.pincode.length === 6
          ? {}
          : { address: 'A name and a six-digit PIN code are required.' };
      case 'payment':
        return draft.payment.cardLast4.length === 4 ? {} : { payment: 'Enter the last four digits of the card.' };
      case 'review':
        return {};
      default: {
        const unhandled: never = current;
        throw new Error(`Unhandled step: ${JSON.stringify(unhandled)}`);
      }
    }
  };

  const goNext = () => {
    const stepErrors = validateStep(step);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;              // stay on the step
    setStep(step === 'email' ? 'address' : step === 'address' ? 'payment' : 'review');
  };

  const goBack = () => setStep(step === 'review' ? 'payment' : step === 'payment' ? 'address' : 'email');

  return (
    <form onSubmit={(event) => { event.preventDefault(); submitOrder(draft); }}>
      <ol className="steps" aria-label="Checkout progress">
        {(['email', 'address', 'payment', 'review'] as const).map((name) => (
          <li key={name} aria-current={step === name ? 'step' : undefined}>{name}</li>
        ))}
      </ol>

      {step === 'email' && <EmailStep value={draft.email} onChange={(email) => setDraft({ ...draft, email })} error={errors.email} />}
      {step === 'address' && <AddressFields value={draft.address} onChange={(address) => setDraft({ ...draft, address })} error={errors.address} />}
      {step === 'payment' && <PaymentFields value={draft.payment} onChange={(payment) => setDraft({ ...draft, payment })} error={errors.payment} />}
      {step === 'review' && <OrderReview draft={draft} />}

      <div className="wizard__actions">
        {step !== 'email' && <button type="button" onClick={goBack}>Back</button>}
        {step !== 'review' ? (
          <button type="button" onClick={goNext}>Continue</button>
        ) : (
          <button type="submit">Place order</button>
        )}
      </div>
    </form>
  );
}
```

Four rules that keep multi-step forms sane:

1. **Steps are views of one draft.** Each step receives the slice it needs plus an `onChange` (file 01's callback pattern), so going back never loses data.
2. **Validate at the transition**, not on every keystroke, and **keep the user on the step** if it fails.
3. **`type="button"` on the step buttons.** Inside a form, a bare `<button>` submits — which would fire the final `onSubmit` from step one.
4. **Do not re-mount the steps.** Because all steps live in one component tree, the draft (and any uncontrolled field's DOM value) survives back-and-forth navigation.

⚠️ **An uncontrolled field inside a wizard is a trap**: when you leave step 2 and come back, an uncontrolled input re-created by `{step === 'address' && …}` **loses its DOM value**. Either keep all steps mounted (`hidden` attribute) or make a step's fields controlled, or read each step's values into the draft *before* leaving it. The last option is the most common in real code:

```tsx
const goNext = (event: FormEvent<HTMLFormElement>) => {
  const stepData = new FormData(event.currentTarget);      // read the step's uncontrolled fields
  setDraft((current) => ({ ...current, address: readAddress(stepData) }));
  …
};
```

---

## 11. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | forgetting `preventDefault()` | the page reloads; state and scroll lost | call it first in `onSubmit` (or use React 19's `action`) |
| 2 | a bare `<button>` inside a form | it submits (or resets) the form | `type="button"` unless submit is intended |
| 3 | `type="reset"` in a controlled form | "reset does nothing" | reset the state, or bump the `key` |
| 4 | mixing `noValidate` with browser messages | no messages at all, or two different ones | choose one source of messages |
| 5 | `Number('')` for a number field | clearing the field becomes `0` | keep the string, parse at the edge (file 03) |
| 6 | placeholder used as a label | screen readers announce nothing; the hint disappears on typing | real `<label>` (a `placeholder` is a bonus) |
| 7 | errors not linked to fields | assistive tech does not know which field failed | `aria-invalid` + `aria-describedby` |
| 8 | no focus move on invalid submit | "Submit did nothing" (the error is off-screen) | focus the first invalid control or an error summary |
| 9 | validating on every keystroke from the first character | the user is scolded while typing | validate on submit or blur; track "touched" |
| 10 | resetting the form when submission **fails** | the user loses everything they typed | reset only on success |
| 11 | no pending state | double submits, duplicate orders | `status` state or `useFormStatus`; guard in the handler |
| 12 | `data.get('x')` used as a string | `null` in the payload; `"null"` sent to the API | `String(data.get('x') ?? '')`, `Number(…)` deliberately |
| 13 | uncontrolled fields inside conditionally-rendered steps | values vanish when the user goes back | keep steps mounted, or lift values into the draft on each transition |
| 14 | trusting client validation for security | invalid/malicious data in the database | validate again on the server |

---

## 12. Best practices

1. **One submit handler, on the form.** Handle Enter, the button, and any programmatic submit in the same place.
2. **`preventDefault()` first** (unless you use React 19's `action`), then validate, then submit.
3. **Validate on submit or blur; show errors once.** Clear a field's error when that field changes.
4. **Focus the first invalid control** (verified) or render an error summary with links.
5. **Label everything, group what belongs together**, and wire `aria-invalid`/`aria-describedby`/`role="alert"`.
6. **Read uncontrolled values with `FormData`** and normalise them (`String(...)`, `Number(...)`) immediately.
7. **Reset on success only**, and reset all three layers: state, DOM, and errors (or remount with `key`).
8. **Guard against double submission** in the handler and on the button, and know the server must still be idempotent.
9. **Keep the draft in one object** for multi-step forms; validate at transitions; `type="button"` for step navigation.
10. **Never trust the client** for rules or permissions — validate again where the data is stored.

---

## 13. Real-world example: the lab's forms

Two forms in the lab, chosen for two different jobs:

**The search form** (`src/components/SearchBar.tsx`) — a *controlled* form that is really a live filter:

```tsx
<form className="search" role="search" onSubmit={(event) => event.preventDefault()}>
```

- `role="search"` marks it as a landmark, so screen-reader users can jump straight to it.
- `onSubmit` still prevents the default: pressing Enter in the box should change the filtered list, not navigate.
- The field is controlled because the results update as the user types (file 03's rule).
- A `type="search"` input gives the browser's own clear button; the lab adds its own visible `×` button that also restores focus through a ref.

**The review form** (`src/practice/ReviewForm.tsx`) — a *submitting* form, and the verified example of this chapter:

- controlled where the render needs the value (`rating` drives validation; `title` shows a character count; `recommend` is a checkbox with a derived label);
- **uncontrolled** for the body textarea, read once on submit through a ref — nothing needs it while typing, and the form avoids a re-render per character;
- browser-level constraints disabled (`noValidate`) because the messages are ours;
- errors rendered with `role="alert"`, linked with `aria-describedby`, and the first invalid field focused — verified;
- reset after a successful submit, for both modes — verified (`title="" · rating=0 · body=""`);
- a success message with `role="status"` — verified.

That combination — a quiet DOM for cold fields, React state for live ones, one validation function, and focus management — is what "a good form" means in practice, and it is the shape `react-hook-form` generalises in Part 8.

---

## 14. Practice

### Beginner — fix a broken form

The form below has seven bugs. Find them, fix them, and say what each would do at runtime.

```tsx
function BrokenForm() {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');

  return (
    <form onSubmit={() => console.log(email, note)}>
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <textarea value={note}>{note}</textarea>
      <input type="checkbox" checked onChange={(e) => setNote(e.target.value)} />

      <button onClick={() => setEmail('')}>Clear</button>
      <button type="submit">Send</button>
      <button type="reset">Reset</button>
    </form>
  );
}
```

### Intermediate — an error summary and per-field clearing

Extend the verified `ReviewForm` so that:

1. Errors are **cleared for a field as soon as the user edits it** (not only on the next submit).
2. Submitting an invalid form focuses an **error summary** at the top (`role="alert"`, `tabIndex={-1}`) that lists each problem as a link jumping to that field.
3. The summary disappears when no errors remain.
4. The submit button shows a pending state for 400 ms (simulate with `await new Promise((r) => setTimeout(r, 400))`) and is disabled while pending.
5. Re-submitting while pending is impossible from the UI **and** ignored by the handler.

Then answer: why is focusing the **summary** (rather than the first field) sometimes the better choice, and what does that do to the `aria-describedby` wiring?

### Challenge — a three-step checkout wizard

**File: `src/practice/CheckoutWizard.tsx`**

Build the wizard described in section 10 with three steps — **email**, **address**, **review** — using the lab's existing `AddressForm` for step 2:

1. One draft object; each step is a view of it (no duplicated state).
2. Validate on transition; block the transition and show the error on the step that fails.
3. Step 2's fields are **uncontrolled**; read them into the draft when leaving step 2 (see the trap in section 10).
4. A visible progress list (`aria-current="step"`) and Back/Continue buttons (`type="button"`).
5. On the review step, show what will be ordered (the cart from context + the address + the email) and a "Place order" submit button that logs the final draft.
6. Clearing/starting over resets everything to `emptyCheckoutDraft`.

---

## 15. Solutions

### Beginner

```tsx
function FixedForm() {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [subscribe, setSubscribe] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  return (
    <form
      className="fixed"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();                                  // ① was missing: the page reloaded
        console.log({ email, note, subscribe });
        setSent('Message sent.');
      }}
    >
      {/* ② the placeholder was doing the label's job */}
      <label htmlFor="fix-email">Email</label>
      <input
        id="fix-email"
        name="email"
        type="email"                                             // ③ no type meant no email keyboard/validation
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      {/* ④ <textarea>{note}</textarea> is not how a textarea takes text — React throws */}
      <label htmlFor="fix-note">Message</label>
      <textarea id="fix-note" name="note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} />

      {/* ⑤ the checkbox had `checked` with no onChange and wrote to the wrong state */}
      <label>
        <input
          name="subscribe"
          type="checkbox"
          checked={subscribe}
          onChange={(event) => setSubscribe(event.target.checked)}
        />
        Email me about replies
      </label>

      {/* ⑥ a bare <button> inside a form submits it — "Clear" was submitting the form */}
      <button type="button" onClick={() => { setEmail(''); setNote(''); setSubscribe(false); setSent(null); }}>
        Clear
      </button>

      {/* ⑦ type="reset" would reset the DOM, but these fields are controlled, so it looks dead */}
      <button
        type="reset"
        onClick={() => { setEmail(''); setNote(''); setSubscribe(false); setSent(null); }}
      >
        Reset
      </button>

      <button type="submit">Send</button>

      {sent !== null && <p role="status">{sent}</p>}
    </form>
  );
}
```

The seven bugs, and what each does at runtime: (1) missing `preventDefault` → the browser navigates and the app reloads; (2) missing label → screen readers announce an unlabelled text box; (3) missing `type="email"` → no email keyboard on mobile, no validation, no autofill; (4) textarea children → React throws *"Use the `defaultValue` or `value` props instead of setting children on `<textarea>`"*; (5) a `checked` checkbox with no `onChange` → React warns, and the box can never change (also `setNote(e.target.value)` was writing a checkbox's `"on"` value into the note); (6) a bare `<button>` → it submits, so "Clear" sent the form and then cleared nothing; (7) `type="reset"` in a controlled form → the DOM resets and React immediately overwrites it, so it looks broken. Note how each is invisible until you actually use the form — which is why manual testing of every control (including Tab and Enter) is part of building forms.

### Intermediate

```tsx
// Additions to ReviewForm:
const summaryRef = useRef<HTMLDivElement>(null);
const [pending, setPending] = useState(false);

const clearError = (field: keyof Errors) =>
  setErrors((current) => (current[field] === undefined ? current : { ...current, [field]: undefined }));

const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  if (pending) return;                                   // 5. ignore a double submit

  const body = bodyRef.current?.value ?? '';
  const nextErrors = validate(rating, title, body);
  setErrors(nextErrors);

  const invalidFields = Object.keys(nextErrors) as Array<keyof Errors>;
  if (invalidFields.length > 0) {
    summaryRef.current?.focus();                         // 2. focus the summary, not the field
    return;
  }

  setPending(true);                                      // 4. pending state
  await new Promise((resolve) => setTimeout(resolve, 400));
  onSubmitted({ rating, title: title.trim(), body: body.trim(), recommend });
  setPending(false);

  setRating(0);
  setTitle('');
  setRecommend(true);
  setErrors({});
  bodyRef.current!.value = '';
  setSubmitted('Thanks — your review was submitted.');
};

// …and in the JSX, above the fields:
{Object.keys(errors).length > 0 && (
  <div className="review__summary" role="alert" tabIndex={-1} ref={summaryRef}>
    <h3>Please fix {Object.keys(errors).length} problem{Object.keys(errors).length > 1 ? 's' : ''}:</h3>
    <ul>
      {(Object.keys(errors) as Array<keyof Errors>).map((field) => (
        <li key={field}>
          <a href={`#${field}`} onClick={() => formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus()}>
            {errors[field]}
          </a>
        </li>
      ))}
    </ul>
  </div>
)}
```

With per-field clearing wired into every `onChange` (`clearError('title')`, `clearError('rating')`), the summary shrinks as the user fixes things and disappears when the last error is gone — the state is derived from `errors`, so nothing else needs to be kept in sync (file 02).

**Focusing the summary instead of the first field** is the better choice when *several* fields are wrong: it tells the user how many problems there are and gives every one a link, while focusing a single field silently implies there is only one. The cost is the `aria-describedby` wiring: a summary is not `describedby` any single field (that role still belongs to each field's own message), so the summary is announced by virtue of receiving focus, and each field keeps its own `id`ed message for later re-reads. Two mechanisms, two jobs: the summary *announces*, the per-field message *describes*.

### Challenge

**File: `src/practice/CheckoutWizard.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import type { Address } from './AddressForm';         // the type from file 04's address form

interface WizardDraft {
  email: string;
  address: Address;
  notes: string;                      // an uncontrolled field read at the step transition
}

type Step = 'email' | 'address' | 'review';

const emptyDraft: WizardDraft = {
  email: '',
  address: { fullName: '', address: '', city: '', pincode: '' },
  notes: '',
};

const EMAIL_PATTERN = /@[^\s@]*\.[^\s@]+$/;

export function CheckoutWizard({ onPlaceOrder }: { onPlaceOrder: (draft: WizardDraft) => void }) {
  const [draft, setDraft] = useState<WizardDraft>(emptyDraft);
  const [step, setStep] = useState<Step>('email');
  const [error, setError] = useState<string | null>(null);

  const goNext = () => {
    if (step === 'email') {
      if (!EMAIL_PATTERN.test(draft.email)) {
        setError('Enter an email address like name@example.com.');
        return;
      }
      setError(null);
      setStep('address');
      return;
    }
    if (step === 'address') {
      if (draft.address.fullName.trim() === '' || draft.address.pincode.trim() === '') {
        setError('A name and a PIN code are required.');
        return;
      }
      setError(null);
      setStep('review');
    }
  };

  const goBack = () => {
    setError(null);
    setStep(step === 'review' ? 'address' : 'email');
  };

  const startOver = () => {
    setDraft(emptyDraft);
    setStep('email');
    setError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onPlaceOrder(draft);
    startOver();
  };

  return (
    <form className="wizard" onSubmit={handleSubmit} noValidate>
      <ol className="wizard__steps" aria-label="Checkout progress">
        {(['email', 'address', 'review'] as const).map((name) => (
          <li key={name} aria-current={step === name ? 'step' : undefined}>
            {name}
          </li>
        ))}
      </ol>

      {error !== null && <p className="wizard__error" role="alert">{error}</p>}

      {step === 'email' && (
        <div>
          <label htmlFor="wizard-email">Email for the receipt</label>
          <input
            id="wizard-email"
            name="email"
            type="email"
            autoComplete="email"
            value={draft.email}
            onChange={(event) => {
              setDraft((current) => ({ ...current, email: event.target.value }));
              setError(null);
            }}
          />
        </div>
      )}

      {step === 'address' && (
        <>
          {/*
            These fields are CONTROLLED, and they report every keystroke into the single
            draft. Two reasons, and both matter:
              1. the step unmounts when the user goes back, so an uncontrolled field's DOM
                 value would be lost (section 10's trap);
              2. file 04's <AddressForm> is a <form> of its own, and nesting a <form> inside
                 a <form> is invalid HTML — so inside the wizard the fields are plain labels
                 and inputs, not a nested form.
          */}
          <label htmlFor="wz-name">Full name</label>
          <input
            id="wz-name"
            name="fullName"
            autoComplete="name"
            value={draft.address.fullName}
            onChange={(event) => setDraft((current) => ({ ...current, address: { ...current.address, fullName: event.target.value } }))}
          />

          <label htmlFor="wz-address">Address</label>
          <input
            id="wz-address"
            name="address"
            autoComplete="street-address"
            value={draft.address.address}
            onChange={(event) => setDraft((current) => ({ ...current, address: { ...current.address, address: event.target.value } }))}
          />

          <label htmlFor="wz-city">City</label>
          <input
            id="wz-city"
            name="city"
            autoComplete="address-level2"
            value={draft.address.city}
            onChange={(event) => setDraft((current) => ({ ...current, address: { ...current.address, city: event.target.value } }))}
          />

          <label htmlFor="wz-pincode">PIN code</label>
          <input
            id="wz-pincode"
            name="pincode"
            inputMode="numeric"
            autoComplete="postal-code"
            value={draft.address.pincode}
            onChange={(event) => setDraft((current) => ({ ...current, address: { ...current.address, pincode: event.target.value } }))}
          />
        </>
      )}

      {step === 'review' && (
        <div className="wizard__review">
          <h3>Almost done</h3>
          <p>Receipt to: {draft.email}</p>
          <address>
            {draft.address.fullName}
            <br />
            {draft.address.address}
            <br />
            {draft.address.city} {draft.address.pincode}
          </address>
        </div>
      )}

      <div className="wizard__actions">
        {step !== 'email' && <button type="button" onClick={goBack}>Back</button>}
        {step !== 'review' && <button type="button" onClick={goNext}>Continue</button>}
        {step === 'review' && <button type="submit">Place order</button>}
        <button type="button" onClick={startOver}>Start over</button>
      </div>
    </form>
  );
}
```

The important details: every address field reports into the **single draft object**, so the review step can never be behind and going back never loses data; `Continue` and `Back` are `type="button"` so they cannot submit the form; `aria-current="step"` marks progress for assistive technology; and "Start over" resets the draft, the step and the error together, which is only possible because the draft is one object (file 02).

Two traps are visible in that code. First, **the step's fields are controlled** — the same design choice section 10 describes for conditionally-rendered steps: an uncontrolled field inside `{step === 'address' && …}` is destroyed when the user leaves the step, so its DOM value would be lost. Second, **file 04's `<AddressForm>` cannot be reused inside the wizard**: it is a `<form>` element, and a `<form>` inside a `<form>` is invalid HTML (the browser drops the inner one, and submitting hits the wrong handler). That is why the wizard renders plain labeled inputs and does its own validation — the same trade a real checkout makes when it needs a single draft across steps. If you *did* want uncontrolled fields inside a step, section 10 shows the pattern that makes it safe: read them with `FormData` at the transition, before the step unmounts.

---

## 16. Summary

- `onSubmit` fires on the **form**; call `preventDefault()` to stop the browser's navigation (or use React 19's `action`, which runs in a Transition, needs no `preventDefault`, and resets uncontrolled fields on success).
- **`<button>` defaults to `type="submit"`** — the most common form bug. Use `type="button"` for anything that is not a submission.
- Collect values with **`FormData`** (uncontrolled) or **state** (controlled), and normalise immediately: `String(data.get('x') ?? '')`, `Number(...)`.
- **Validated end-to-end, version-verified:** submitting an empty form produced three messages, focus moved to `select[name=rating]`, the parent was not called, and a valid submit delivered `{"rating":4,…}`, reset both modes (`title="" · rating=0 · body=""`) and announced success.
- **Three validation levels** — browser constraints, React messages, server checks. Pick one source of *messages*, and remember only the server is authoritative.
- **Show errors on submit or blur**, not on the first keystroke; clear a field's error when it changes; consider an error summary that links to each field.
- **Accessibility is part of the feature**: labels, `<fieldset>`/`<legend>` for groups, `aria-invalid`, `aria-describedby`, `role="alert"`, `role="status"`, and focus management.
- **`type="reset"` only resets the DOM** — controlled fields need their state reset (or a `key` bump). Reset on **success**, never on failure.
- **Prevent double submits** with a status flag or `useFormStatus` — and make the server idempotent, because the client cannot guarantee anything.
- **Multi-step forms are one draft plus a step pointer**; validate at transitions, use `type="button"` for navigation, and remember that conditionally-rendered uncontrolled fields lose their values unless you lift them at the transition.

---

**What's next →** [`06-refs.md`](./06-refs.md): the imperative escape hatch in full. We will verify a DOM ref focusing a real input, React 19's **`ref` as a normal prop** (with `forwardRef` now marked *deprecated* in the docs), `useImperativeHandle` exposing a hand-written API instead of a DOM node (`handle === DOM node? false`), the React 19 **ref-callback cleanup**, and a `Map` of refs for focusing one row among many — plus the rules that keep refs from becoming a second, invisible state system.
