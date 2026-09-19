# 03 — Forms with Actions: `<form action>`, `FormData` and `useFormStatus`

> **Part 11 · Modern React · File 3 of 8**

Why this file exists: Part 8 built forms the "controlled" way — `useState` per field, an `onSubmit` with `event.preventDefault()`, React Hook Form and Zod on top. That stack is still the right answer for large forms with heavy validation, and it remains fully supported. React 19 adds a second path that is closer to how HTML forms work: **`<form action={fn}>`**, where React hands your function the form's `FormData`, wraps the call in a transition, and resets the fields afterwards. This file explains that path completely — what React does with your function (measured, including the reset and the reported method), how `useFormStatus` gives a submit button its pending state without prop drilling, how to read every input type out of `FormData`, how validation errors get back to the user, and, most importantly, **when to choose this over React Hook Form**.

Transcript from `npx tsx --tsconfig tsconfig.app.json src/dev/run-actions-probe.tsx`, section A.

---

## 1. Two ways to submit a form

```tsx
// 1. The controlled/JS way (Part 8) — still correct, still everywhere
function ControlledForm() {
  const [name, setName] = useState('');
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();                 // stop the browser navigation
    void api.create({ name });              // read from state
  };
  return <form onSubmit={onSubmit}><input value={name} onChange={(e) => setName(e.target.value)} /></form>;
}

// 2. The action way (React 19)
function ActionForm() {
  const action = async (formData: FormData) => {   // React calls this with the fields
    await api.create({ name: String(formData.get('name')) });
  };
  return <form action={action}><input name="name" /></form>;
}
```

Three differences are worth stating before the details, because they are the reason to pick one:

| | `onSubmit` (controlled) | `action={fn}` |
| --- | --- | --- |
| Where field values live | React state, one per field | the DOM (`FormData`), read on submit |
| Who calls `preventDefault` | you | React |
| Pending state | your `isSubmitting` boolean | React's transition (`isPending` / `useFormStatus`) |
| Fields after success | whatever your code does (usually left as typed) | **reset automatically** |
| Typing cost | a re-render per keystroke (unless RHF's uncontrolled tricks) | none — the DOM holds the value |

💡 The mental shift: with `action`, the form's fields are **uncontrolled by default**, and the submit handler receives a snapshot. That is the same trade Part 8 described for React Hook Form (fewer re-renders) — React 19 moved it from "library trick" to "platform feature".

---

## 2. `<form action={fn}>` measured end to end

```text
=== A. <form action={fn}> + useActionState + useFormStatus ===
   before: saved=0 last= pending=false
   mid-flight button: "saving Write the probe (get)" disabled=true
   after: saved=1 last=Write the probe pending=false
   input value after a successful action: "" (React reset the uncontrolled field)
   server calls: 1
   renders: ActionFormCase:render=4 SubmitButton:render pending=false=2 SubmitButton:render pending=true=1
```

```tsx
// src/part11/ActionsLab.tsx
export function SubmitButton() {
  const { pending, data, method } = useFormStatus();
  trace(`SubmitButton:render pending=${String(pending)}`);
  return (
    <button type="submit" data-testid="save" disabled={pending}>
      {pending ? `saving ${String(data?.get('text') ?? '')} (${method})` : 'save'}
    </button>
  );
}

export function ActionFormCase() {
  trace('ActionFormCase:render');
  const [state, formAction, isPending] = useActionState(
    async (previous: { count: number; last: string }, formData: FormData) => {
      const text = String(formData.get('text') ?? '');
      const todo = await server.add(text);            // a fake 20 ms server call
      return { count: previous.count + 1, last: todo.text };
    },
    { count: 0, last: '' },
  );

  return (
    <form action={formAction}>
      <input name="text" aria-label="text" defaultValue="" />
      <SubmitButton />
      <p data-testid="result">saved={state.count} last={state.last} pending={String(isPending)}</p>
    </form>
  );
}
```

**Line by line.**

- `<form action={formAction}>` — `formAction` is a *function* (produced by `useActionState`, file 04). React intercepts the submit, builds the `FormData` from the form's fields, and calls it. No `onSubmit`, no `preventDefault`.
- `<input name="text" … />` — the `name` attribute is now load-bearing: it is the key in `FormData`. An input without `name` is invisible to the action (a classic silent bug).
- `defaultValue=""` and no `value`/`onChange` — the field is **uncontrolled**; the DOM owns its value, so typing does not re-render the component. (⚠️ If you pass `value` without `onChange`, React makes it read-only — Part 8.)
- `formData.get('text')` — reads the field. `get` returns `string | File | null`, so `String(…)` normalises it; section 4 covers every field type.
- `await server.add(text)` — the action is async, so the transition stays pending for the whole call.
- `return { count: previous.count + 1, last: todo.text }` — the returned value becomes the new action state. The **first** parameter is the previous state, exactly like a reducer (Part 9, file 01) — which is why the count accumulates instead of resetting.
- `<SubmitButton />` — a separate child component so `useFormStatus` can read the form's status (section 5 explains why it must be a child, not the form itself).

**Reading the measured transcript, line by line, is reading React's contract:**

| Line | What it proves |
| --- | --- |
| `before: saved=0 last= pending=false` | the initial action state is what you passed (`{ count: 0, last: '' }`) |
| `mid-flight button: "saving Write the probe (get)" disabled=true` | `useFormStatus().pending` was `true`, `data` contained the field, and the button rendered disabled. Nothing else in the app re-rendered to make that happen |
| `after: saved=1 last=Write the probe pending=false` | the action's return value became the state, and pending cleared |
| `input value after a successful action: ""` | **React reset the uncontrolled field.** You did not ask for this |
| `server calls: 1` | one submit, one call — no double invocation |
| `renders: ActionFormCase:render=4 SubmitButton:render pending=false=2 … pending=true=1` | the form component rendered 4 times (mount, pending start, result, and one more from the input reset) while the **button rendered 3 times**, in its own subscription to the form status |

⚠️ **The automatic reset is the biggest surprise in this API.** After a *successful* action (no error thrown), React resets the form — exactly as a browser would after a native submit navigation. If your action returns a validation error instead of throwing, the reset still happens, which is why files 04 and this file's section 7 show the "return the user's values and re-render them" pattern. If you need the fields to survive, use a controlled input (`value` + `onChange`) or re-populate from the returned state.

---

## 3. Why `useFormStatus` is measured at `(get)`

`useFormStatus()` returns `{ pending, data, method, action }`:

| Field | Type | Meaning |
| --- | --- | --- |
| `pending` | `boolean` | true while the form's action is running |
| `data` | `FormData \| null` | the submitted data while pending |
| `method` | `string` | the form's HTTP method — `"get"` unless you set `method` |
| `action` | `string \| function \| null` | the `action` prop |

Two facts from the transcript deserve care:

1. **`(get)` is not a bug.** A `<form>` with no `method` attribute defaults to `GET`, and `useFormStatus` reports the form's method. When the `action` is a *function*, nothing is sent anywhere — React handles the submit locally. (When the `action` is a *string URL*, the browser performs the native submission, and React's docs note that a function action makes the request POST when it *is* sent to the server in a framework context.)
2. **`useFormStatus` reads the nearest parent `<form>`**, so `SubmitButton` must be **inside** the form and must be its own component. Calling `useFormStatus()` in the component that renders the `<form>` returns the status of some *outer* form (or nothing), which is the number-one mistake with this hook.

```tsx
// ❌ the hook is in the same component that renders the form: it sees no form
function Bad() {
  const { pending } = useFormStatus();
  return <form action={action}><button disabled={pending}>save</button></form>;
}

// ✅ a child component subscribes to the form it is inside
function Good() {
  return <form action={action}><SubmitButton /></form>;
}
function SubmitButton() {
  const { pending, data } = useFormStatus();
  return <button disabled={pending}>{pending ? `saving ${String(data?.get('name') ?? '')}` : 'save'}</button>;
}
```

💡 Notice the render counts again: `SubmitButton` re-rendered when the status changed while the *rest* of the form subtree did not. That is the point of the hook — a small, localised subscription instead of a `isSubmitting` prop threaded down through ten components.

---

## 4. Reading fields out of `FormData`

`FormData` is a browser API, not a React one, and it is worth knowing properly because it is the whole interface between your HTML and your action:

| Field | How to read it | Notes |
| --- | --- | --- |
| text/number/date input | `formData.get('price')` → `string \| null` | always a string; convert explicitly |
| textarea | `formData.get('notes')` | same as text |
| select | `formData.get('status')` | the selected option's `value` |
| checkbox (single) | `formData.get('terms') === 'on'` | unchecked boxes are **absent**, so `get` returns `null` |
| multiple checkboxes | `formData.getAll('tags')` → `string[]` | only checked ones appear |
| radio group | `formData.get('size')` | the checked one; `null` if none |
| file input | `formData.get('photo')` → `File` | `instanceof File` to narrow; `<input type="file">` cannot be controlled |
| repeated fields | `formData.getAll(name)` | order is DOM order |

A typed reader is the difference between a safe action and a `string | null` mess at every line:

```tsx
// src/actions/formData.ts
export function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

export function readNumber(formData: FormData, key: string): number | null {
  const raw = readString(formData, key);
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  return value instanceof File ? value : null;
}
```

⚠️ Do not put the conversion in the JSX. `value={Number(formData.get('price'))}` in the *view* mixes parsing with rendering; parse once at the edge of the action (and, better, validate with Zod at the same edge — Part 8's schema, now applied to `FormData`):

```tsx
const ProductFormSchema = z.object({
  name: z.string().trim().min(3, 'Name needs at least 3 characters'),
  price: z.coerce.number().positive('Price must be greater than zero'),
});

async function createProduct(formData: FormData) {
  const parsed = ProductFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors, values: Object.fromEntries(formData) };
  await api.createProduct(parsed.data);
  return { errors: {}, values: {} };
}
```

`Object.fromEntries(formData)` works when there is one value per name; if a field repeats, build the object with `getAll` instead (`{ ...Object.fromEntries(formData), tags: formData.getAll('tags') }`).

---

## 5. Progressive enhancement, and the string-URL action

The `action` prop accepts **a string URL** as well as a function:

```tsx
<form action="/api/products" method="post">…</form>
```

With a string, the browser performs a normal form submission (page navigation), and React does not intercept it. With a function, React intercepts. The consequence is that a function action's form is *not* progressively enhanced by itself — if JavaScript fails to load, submitting does nothing. Frameworks that support Server Functions fix this by generating a real POST to the server for you; in a plain SPA (which is what this book builds) the practical stance is:

| Context | If JS fails | Recommendation |
| --- | --- | --- |
| Plain Vite SPA, function action | the form does nothing | acceptable; the app is a JS app |
| Server-rendered framework with server functions | the form still submits (or hydrates) | the reason frameworks push actions |
| String-URL action | the browser submits natively | use for genuinely server-handled forms |

💡 Where this matters for interviews and code review: "use `<form action>` for progressive enhancement" is true **only** in a server-rendering framework. In a client-only app it is a convenience API, not a resilience feature. Say that precisely and you will be ahead of most answers.

---

## 6. Field errors, aria and staying usable

An action is expected to fail in ways the user must fix: duplicate product name, too-short password, a price that is not a number. The pattern (developed fully in file 04) is:

1. Validate in the action (Zod).
2. On failure, **return** `{ values, errors }` — do not throw.
3. Render the errors next to their fields, and re-populate the values from the returned state.

```tsx
function AddProductForm() {
  const [state, formAction, isPending] = useActionState(createProduct, {
    errors: {} as Record<string, string[] | undefined>,
    values: {} as Record<string, string>,
  });
  return (
    <form action={formAction} noValidate>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          name="name"
          defaultValue={state.values['name'] ?? ''}   // ← values survive the reset
          aria-invalid={state.errors['name'] !== undefined}
          aria-describedby={state.errors['name'] !== undefined ? 'name-error' : undefined}
        />
        {state.errors['name'] !== undefined && <p id="name-error" className="error">{state.errors['name']?.[0]}</p>}
      </div>
      <button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</button>
    </form>
  );
}
```

⚠️ `defaultValue` is read only on **mount**, so re-populating after a reset needs one of two things: a `key` that changes with the values (`key={JSON.stringify(state.values)}` — heavy-handed), or `defaultValue` on a form that React remounts, or making the fields controlled. In practice, with actions, the clean approach is: **only reset on success, and return the values on failure** so the *unmount-free* path re-renders with the same values (React's reset applies after each successful action, and the returned values are already in the DOM). If you find yourself fighting this, that is the signal to use React Hook Form (section 8).

---

## 7. The rest of the form toolkit with actions

| Need | Tool | Note |
| --- | --- | --- |
| pending inside a child of the form | `useFormStatus()` | must be a child component (section 3) |
| pending + state in the form's own component | `useActionState`'s third value | file 04 |
| reset from your own code | `requestFormReset(form)` from `react-dom` | when you reset from a button outside the form |
| optimistic UI while saving | `useOptimistic` | file 06 — the form keeps the old value, the list shows the optimistic one |
| client-side validation before submit | `onSubmit` + `noValidate`, or RHF | actions fire *on submit*; you may want earlier feedback |
| autofocus on the first error | your code (`errors` order → `document.getElementById(...)?.focus()`) | RHF does this for you (`shouldFocusError`, Part 8) |
| unsaved-changes guard | `beforeunload` + your own dirty tracking | the router's blocker (Part 6) is the other half |

---

## 8. Choosing: actions vs React Hook Form + Zod

| Dimension | React 19 actions | React Hook Form + Zod (Part 8) |
| --- | --- | --- |
| Field state | the DOM (uncontrolled) | RHF's internal store (uncontrolled by default) |
| Re-render per keystroke | none (DOM holds the value) | none by default; watch/subscribe where needed |
| Validation timing | on submit (you choose) | on submit, change, blur, or `mode`-driven |
| Cross-field rules (`confirmPassword`) | manual | `validate`, `deps`, `resolver` built in |
| Arrays of fields (`useFieldArray`) | manual (keys + `getAll`) | `useFieldArray` with `append`/`remove`/`move` |
| Error focus management | manual | `shouldFocusError` (register order) |
| Schema reuse with an API | Zod in the action | Zod via `zodResolver` |
| Pending state | React tracks it (`useActionState`/`useFormStatus`) | `formState.isSubmitting` |
| Progressive enhancement (in a framework) | yes | no |
| Best for | small-to-medium forms, action-driven flows, form-heavy *pages* that want zero re-renders | large, deeply validated, dynamic forms |

💡 **The honest rule:** if the form has more than ~8 fields, dynamic arrays, or validation that depends on other fields, use React Hook Form and `zodResolver` — you are buying a decade of edge cases (focus, dirty state, `shouldUnregister`, array identity). If the form is a "quick add" with two or three fields, `<form action>` plus a schema in the action is less code than the RHF setup and gives you pending state for free. Mixing is fine: RHF for the checkout form, actions for the newsletter box in the footer.

⚠️ Do not rewrite a working RHF form just because actions exist. The migration buys less code in small forms and *loses* the features you already rely on in large ones.

---

## 9. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Putting `useFormStatus` in the component that renders `<form>` | it reads the wrong form (or nothing) | put it in a child component |
| 2 | Forgetting `name` on an input | the field is missing from `FormData` | `name` is required for every field |
| 3 | Expecting fields to keep their values | React resets uncontrolled fields after a successful action (measured: `input value: ""`) | return `values` on failure; use `value` + `onChange` if it must persist |
| 4 | Treating `formData.get(...)` as a string | `get` returns `string \| File \| null` | normalise with a typed reader |
| 5 | `value` without `onChange` | the input is read-only and React warns | use `defaultValue`, or make it fully controlled |
| 6 | Throwing on validation failure | the boundary replaces the form; the user loses their input | return errors as state |
| 7 | Doing validation only in the action | no instant feedback; the user waits for a round trip | client-side validation/pre-check *plus* the action's authoritative check |
| 8 | Assuming a checkbox is `'off'` when unchecked | unchecked boxes are absent from `FormData` (`null`) | test `=== 'on'`, or `getAll().includes(...)` |
| 9 | Using `useFormStatus().pending` to guard a double submit | same-tick double clicks can both land (Part 8) | `ref` guard for expensive writes |
| 10 | Reading `method` and expecting `'post'` | it reports the form's attribute (`'get'` by default; measured) | set `method="post"` explicitly if you care |
| 11 | Making every field controlled "to be safe" | you lose the zero-re-render benefit and gain Part 8's problems | let the DOM hold values; read them on submit |
| 12 | Skipping `noValidate` while using a schema | the browser's own validation blocks submit with its own messages | `noValidate` and validate yourself |

---

## 10. Best practices

1. **Give every field a `name`**, and treat the input's `name` and the schema's key as the same contract.
2. **Validate at the edge of the action** with a Zod schema on `Object.fromEntries(formData)`; reuse the schema on the server.
3. **Return errors, throw bugs.** A returned error keeps the form usable; a thrown error is for the boundary.
4. **Return the submitted values on failure** so the user's typing is not lost to the automatic reset.
5. **Use `useFormStatus` in a small child component** to keep pending UI local instead of re-rendering the form.
6. **Disable the submit button while pending**, and show *what* is being saved (`saving Write the probe`) when that is cheap — the measured button does it from `data`.
7. **Add `noValidate`** when you validate yourself, and render errors with `aria-invalid` + `aria-describedby`.
8. **Keep `onSubmit` for client-side pre-checks** if you want earlier feedback; it runs before the action.
9. **Reach for RHF** at the complexity threshold (section 8) rather than reinventing field arrays and error focus.
10. **Test the whole loop**: fill, submit, fail, see the error, fix, succeed, see nothing weird left behind (Part 13).

---

## 11. Practice

### Beginner

1. Build a two-field form with `<form action>`: a name and a price. On submit, log `Object.fromEntries(formData)` to the console and show the result in the page. Confirm the field resets afterwards.
2. Add a `SubmitButton` child that shows `Saving…` while `useFormStatus().pending`, then move it *inside* the `<form>` (it already is) and then accidentally use the hook in the parent — describe the difference you observe.
3. For each field, write the `FormData` read: a text input `title`, a checkbox `featured`, a file input `image`, a multi-select `tags`, and a `select` `status`.

### Intermediate

1. Add Zod validation to the two-field form: on failure, return `{ values, errors }` and render the errors next to the fields while keeping the values. Verify with the transcript/lab that the values survive.
2. Implement a form with a dynamic list of tags (an array of `{ value }`) using actions only. How do you read repeated values, and how do you keep the row keys stable while allowing removal?
3. Take the checkout form you built in Part 8 (RHF + Zod) and write a one-page decision memo: what moving to actions would save, what it would cost, and your recommendation.

### Challenge

1. Build a `<Form>` wrapper component that accepts a Zod schema and an action, renders `errors`/`values` from `useActionState`, wires `aria-invalid`/`aria-describedby`, focuses the first invalid field after a failed submit, and exposes `children` for the fields. Compare its API with RHF's, honestly: list three things RHF does better and two things your wrapper does better.
2. Design the error-handling policy for a form that talks to a real API with four failure modes: 422 field errors (from the server), 409 duplicate, 500 unknown, and a network timeout. For each: does the action return or throw, what does the user see, and how is it tested?
3. Build a form that submits optimistically: the list updates immediately, the form resets, and on failure the row is removed **and** the form's values are restored so the user can correct them. Use `useOptimistic` (file 06) + `useActionState` together, and write down the order of state updates you observed.

---

## 12. Solutions

### Beginner

1. ```tsx
   function AddProduct() {
     const [state, formAction] = useActionState(async (_previous: string, formData: FormData) => {
       const values = Object.fromEntries(formData);
       console.log(values);                       // { name: 'Lamp', price: '1299.5' }
       return `${String(values['name'])} — ${String(values['price'])}`;
     }, '');
     return (
       <form action={formAction}>
         <input name="name" aria-label="name" />
         <input name="price" aria-label="price" />
         <button type="submit">Add</button>
         <p data-testid="result">{state}</p>
       </form>
     );
   }
   ```
   After a successful submit both inputs are empty (React's automatic reset) while `state` shows the submitted values — the same "data survives, DOM does not" split measured in section 2.
2. With the hook in the parent, `pending` stays `false` (the parent is not inside the form it renders), so the button never shows `Saving…`. In the child it works, and only the child re-renders — the measured `SubmitButton:render pending=true=1` versus `ActionFormCase:render=4`.
3. `String(formData.get('title') ?? '')`; `formData.get('featured') === 'on'`; `formData.get('image') instanceof File ? formData.get('image') : null`; `formData.getAll('tags').map(String)`; `String(formData.get('status') ?? '')`. The checkbox is the one people get wrong: unchecked means absent, not `'off'`.

### Intermediate

1. The action returns `{ values, errors }`; the fields use `defaultValue={state.values['name'] ?? ''}` and the errors render under each field with `aria-invalid`. Verify: submit an empty form → errors appear, values are as typed (the reset happened, but the *rendered* values come from state); submit valid data → success. The one caveat to observe: because `defaultValue` only applies at mount, an input the user cleared before a failed submit will re-render with the returned value; if you need truly controlled behaviour here, use `value` + `onChange`.
2. Render rows with a stable `key` from a client-side id (not the array index — Part 10, file 01), each with a hidden input carrying the id: `<input type="hidden" name={`tag-${id}`} />` plus `<input name={`value-${id}`} />`. In the action, collect ids with `formData.keys()` filtered by prefix, then map to values. Removal is a `useState` array of ids; the DOM rows follow. This is exactly the case where `useFieldArray` (Part 8) is better — the exercise exists to make the trade-off visible.
3. A fair memo: **saves** the `useState`-per-field code, `isSubmitting`, the resolver wiring, and gives progressive-enhancement potential in a framework; **costs** `mode`-driven validation, `useFieldArray`, `shouldFocusError`, `watch` subscriptions for dependent fields, and the schema-error-to-field mapping RHF already solved. Recommendation for a checkout form: keep RHF; adopt actions for the newsletter/footer forms and any new "quick add" flows.

### Challenge

1. The wrapper's value is *consistency*: one place for the error rendering, aria wiring, focus management and `values` handling, so twenty small forms look alike. RHF wins on: field arrays, per-field subscription modes (`watch`, `getValues`), `shouldUnregister`/`keepDirtyValues` semantics, `criteriaMode: 'all'` for multi-error fields, and the mature integration with resolvers and devtools. Be explicit about the focus implementation: after a failed action, `requestAnimationFrame(() => document.getElementById(firstErrorField)?.focus())`, and make sure the ids in the DOM match the schema keys.
2. **422 field errors:** return them (`{ errors }`), render per field, keep the user's input. **409 duplicate:** return a form-level error plus the offending field's message (usually the same thing); do not throw. **500 unknown:** throw to the boundary *or* return a generic form-level "Something went wrong — try again"; choose based on whether retrying in place is meaningful (usually it is, so return). **Timeout:** return a retryable error and offer a retry button; the request layer (Part 7) already distinguishes `ECONNABORTED` from other failures. Tests: one per mode, asserting the visible message, the field state, and that no navigation/unhandled rejection occurs.
3. Order observed: submit → `addOptimistic(row)` runs synchronously inside the action (the row appears in the same commit as the pending flag) → the form's uncontrolled fields reset after the action resolves on success → on failure, the optimistic row's `setRows` is never reached, so the row disappears when the transition settles, and the action's returned `values` re-populate the fields (`defaultValue` from state). The subtlety worth writing down: the optimistic row and the real row must not both appear after success — key them by the server's id, and let the optimistic entry be replaced rather than appended.

---

## 13. Summary

- **`<form action={fn}>` hands React the submit**: React calls your function with the form's `FormData`, wraps it in a transition, and — measured — **resets the uncontrolled fields after a successful action** (`input value after a successful action: ""`).
- **Fields become uncontrolled**: a `name` on every input is required, typing costs no re-renders, and the DOM holds the values until submit.
- **`useFormStatus` gives a submit button its pending state locally** (measured: `saving Write the probe (get)`, `disabled=true`, button renders `pending=true=1` while the form rendered 4 times), but it **must be called in a child of the form**, and `method` is the form's attribute (`get` by default).
- **`FormData` is the interface**: `get`/`getAll`, strings for text, `'on'` for checkboxes, `File` for file inputs, absent for unchecked boxes. Normalise with typed readers rather than casting at every call site.
- **Validate in the action with Zod** (`Object.fromEntries(formData)`), return `{ values, errors }` on failure, throw only for bugs — because the automatic reset means the *state* is what carries the user's input back to the screen.
- **Progressive enhancement applies when a server function handles the submit**, not in a client-only SPA — say it precisely.
- **Choose actions for small forms and action-driven flows; keep React Hook Form + Zod for large, dynamic, cross-validated forms.** The comparison table in section 8 is the argument, and it has no universal winner.
- **Guard expensive writes with a `ref`**, test the failure path, and add `aria-invalid`/`aria-describedby` so the errors are usable by assistive technology.

---

**What's next →** [`04-useactionstate.md`](./04-useactionstate.md) takes `useActionState` apart: the `[state, action, isPending]` triple, the reducer-like contract that makes a counter work, how to model success and field errors so the form stays usable, the same-tick double-submit guard, and the comparison with `useState` + `try/catch` that shows exactly which lines you stop writing.
