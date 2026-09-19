# 04 — React Hook Form: register, formState, Controller, and Field Arrays

> **Part 8 · Forms and Validation · File 4 of 5**

Why this file exists: file 03 built a complete validation system by hand — and it works. So why does almost every React project add `react-hook-form`? Not because the hand-rolled version is wrong, but because of three costs you pay at scale: **every keystroke re-renders the form**, **every new concern (dirty, touched, focus, reset, field arrays) is more wiring**, and **cross-field and async rules need plumbing that RHF already ships**. This file measures what RHF actually changes (the render numbers are striking), then walks the API you will use daily: `register`, `handleSubmit`, `formState`, `setError`, `Controller`, `useFieldArray`, `useWatch`. And it tells you where RHF's model is *different* from file 03's, including one place where the difference bites.

---

## 1. The three costs of the hand-rolled system

| Cost | What file 03 does | What it costs |
| --- | --- | --- |
| **Renders** | one state object; `setField` on every keystroke | every field re-renders on every keystroke (measured in file 02: 5 fields → 15 field renders for 3 keystrokes) |
| **Wiring** | `errors`, `touched`, `submitted`, `status`, `formError`, plus `visibleError`/`markTouched`/`setField`/`focusField` | ~60 lines of machinery before the first rule |
| **Extras** | a dirty flag, reset, focus-on-error, array fields, async validation | each one is a new decision to make and test |

None of that is a reason to avoid writing your own — plenty of apps need exactly the system in file 03. But it explains why the library exists, and it tells you what to look for when you evaluate it: **fewer renders, less wiring, more built-in concerns.**

---

## 2. What RHF changes at the core

`react-hook-form` keeps field values in **refs and the DOM**, not in React state. Inputs stay *uncontrolled*; the hook subscribes to the events it needs (`onChange`, `onBlur`, plus its own `ref`) and stores values in an internal store. Components re-render only when the parts of `formState` they actually read change.

```bash
npm install react-hook-form
```

```tsx
// File: src/part8/RegisterProductForm.tsx (the smallest useful shape)
import { useForm, type SubmitHandler } from 'react-hook-form';

interface FormValues {
  name: string;
  price: string;
}

export function RegisterProductForm() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: { name: '', price: '' },
  });

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    console.log(values);                       // { name: '...', price: '...' }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name', { required: 'Name is required.' })} />
      {errors.name !== undefined && <p>{errors.name.message}</p>}

      <input {...register('price', { required: 'Price is required.' })} />
      {errors.price !== undefined && <p>{errors.price.message}</p>}

      <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</button>
    </form>
  );
}
```

Three things to notice before anything else:

- **`register('name')` returns props**, and `{...register('name')}` spreads them onto the input: `name`, `onChange`, `onBlur`, `ref`. The `ref` is how RHF reads the value later — the input's value never lives in React state.
- **`errors.name.message`** is a string you supplied in the rule.
- **`defaultValues`** is RHF's version of `defaultValue` — and unlike a raw `defaultValue`, RHF's copy is what `reset()` restores and what `isDirty` compares against.

---

## 3. The render measurements

This is the section that justifies the library. Same five fields, same three keystrokes as file 02's controlled form:

```text
=== A. what a keystroke costs in react-hook-form ===
   lab form   · form renders:      mount 2 → after keystroke 1: 3 → after keystroke 3: 3
              · useWatch preview:  mount 2 → after keystroke 1: 3 → after keystroke 3: 5
      the form re-rendered once when `isDirty` flipped (the Reset button uses it), then nothing:
      keystrokes 2 and 3 cost 0 form renders, while the preview asked to watch 3 fields and paid for them.
   DOM value: "Desk" — the input is uncontrolled; RHF reads it from its ref, not from state
   form.noValidate = false — RHF does not touch the form element. Its required/minLength rules
      are JavaScript, not HTML attributes, so the browser has nothing to block (progressive: true adds them).

   minimal form (subscribes to nothing but errors) · 3 keystrokes → renders: 2 → 2
      RHF costs zero renders per keystroke. You pay only for the formState you subscribe to (isDirty, watch…).
```

Read it carefully, because it is more nuanced than "RHF is faster":

| Observation | Why |
| --- | --- |
| Typing updates the DOM without React re-rendering it | the input is uncontrolled; the value lives in RHF's store |
| The lab form re-rendered **once**, when `isDirty` changed from `false` to `true` | the Reset button reads `formState.isDirty`, so RHF notifies it — and only once, because the value stays `true` after that |
| The `useWatch` preview re-rendered on **every** keystroke | it explicitly subscribed to `name`, `price` and `category` |
| A minimal form subscribing to nothing but `errors` re-rendered **zero** times for three keystrokes | no subscription, no re-render |
| `form.noValidate` is `false` | RHF does not touch the form element, and its `required` rule is JavaScript — not the HTML `required` attribute |

The lesson is portable beyond RHF: **the cost of a controlled field is proportional to the number of components that subscribe to its value.** RHF inverts the default (nothing subscribes) instead of file 03's default (the whole form subscribes because the state lives there).

💡 If you need a live preview, subscribe to it *narrowly* — `useWatch` in a small child, not `watch()` at the top of the form. `watch()` re-renders the component that called it, on every change, which is exactly the behaviour you were trying to avoid.

---

## 4. `register` in depth

```tsx
<input
  {...register('price', {
    required: 'Price is required.',
    minLength: { value: 2, message: 'Price looks too short.' },
    pattern: { value: /^\d+(\.\d{1,2})?$/, message: 'Use digits only, e.g. 1299.50.' },
    validate: {
      positive: (value) => Number(value) > 0 || 'Price must be greater than ₹0.',
      inStockMinimum: (value) =>
        !getValues('inStock') || parsePrice(value) >= 10_000 || 'In-stock items must be priced at ₹100 or more.',
    },
    // deps: ['inStock'],   ← see section 7: this does NOT re-validate on change
    setValueAs: (value: string) => value.trim(),
  })}
/>
```

| Option | Type | Notes |
| --- | --- | --- |
| `required` | `boolean \| string \| { value, message }` | `true` gives RHF's default message |
| `min` / `max` | for numbers | applies to `valueAsNumber` values, not strings |
| `minLength` / `maxLength` | for strings | `maxLength` also sets the native attribute? No — RHF keeps it as a *rule* unless you enable `progressive` |
| `pattern` | `{ value: RegExp, message }` | the regex is tested with `.test()` |
| `validate` | function or object of functions | each returns `true` or an error string; `{ all: … }` with `criteriaMode` surfaces several |
| `valueAsNumber` | boolean | RHF converts for you — but an empty input becomes `NaN`, which is the file 02 trap in a new costume |
| `setValueAs` | `(raw: string) => unknown` | transform on the way in (trimming, parsing) |
| `deps` | `string \| string[]` | **does not** re-validate on change — measured in section 7 |
| `disabled` | boolean | disabled fields are excluded from the submitted values |

Two of these deserve a warning:

⚠️ **`valueAsNumber: true`** on an empty number input produces `NaN` in your form values, and `Number.isNaN` checks then have to be everywhere. Prefer keeping the string and parsing where you validate (as files 02 and 03 do), unless your inputs can never be empty.

⚠️ **"RHF is uncontrolled, so `defaultValue` works"** — true, but type your form with `useForm<FormValues>()` and keep `defaultValues` complete. A key missing from `defaultValues` makes `value` `undefined` for that field, and *some* components then warn about switching between controlled and uncontrolled (file 02, section 5).

---

## 5. `handleSubmit`, validation timing, and `mode`

`handleSubmit(onValid, onInvalid)` runs your rules, and calls `onValid` **only if they pass**. If they fail it calls `onInvalid` (rarely used) and, by default, **focuses the first field with an error**:

```text
=== B. mode: onSubmit (the default) ===
   typed "A" and blurred, before any submit → errors: (none)
   after submitting empty → 3 errors
      · Name must be at least 2 characters.
      · Price is required.
      · Choose a category.
   focused: #rhf-name (shouldFocusError defaults to true)
   POST requests: 0

   mode: onTouched
   typed "A", still focused   → errors: (none)
   after blur                → Name must be at least 2 characters.
```

That is file 03's timing policy, expressed as one option:

| `mode` | Validation runs on | Equivalent to file 03's… |
| --- | --- | --- |
| `'onSubmit'` (default) | submit; then re-validate on change | "validate on submit, then live" |
| `'onBlur'` | blur; then on change | "validate the field you just left" |
| `'onChange'` | every change | "shout while typing" (RHF's docs warn about the render cost) |
| `'onTouched'` | first blur, then every change | file 03's `touched` map, exactly |

`reValidateMode` (default `'onChange'`) controls the after-submit behaviour, and `shouldFocusError: true` is the built-in version of file 03's `focusField(firstInvalidField(errors))` — with one caveat from the docs: it works when the registered `ref` is attached to a real DOM element, and the focus order is **registration order**, not visual order.

✅ Verified: **zero requests while the form is invalid** — `POST requests: 0` in both the `onSubmit` and `onTouched` runs.

---

## 6. The double-submit finding (read this before shipping)

`isSubmitting` is RHF's pending flag, and the docs' examples disable the button with it. That is good UX — and it is **not** a correctness guard:

```text
=== C. submitting twice: same tick vs after the button disables ===
   two clicks in the SAME tick → 2 POSTs (isSubmitting is not a same-tick guard)
   body: {"name":"RHF Lamp","priceMinor":129950,"category":"accessories","blurb":"Registered with react-hook-form.","inStock":true}
   success message: Product saved.
   name field after reset: ""

   one click, 60 ms into a slow request → button disabled: true, label: "Saving…"
   clicking again while the button is disabled → 1 POST in total
```

Two clicks in one tick created **two records**, exactly like Part 7's naive state guard. The second click happened before React re-rendered the disabled button. So the rule from Part 7, file 05 applies to RHF forms too:

```tsx
const submittingRef = useRef(false);

const onSubmit: SubmitHandler<FormValues> = async (values) => {
  if (submittingRef.current) return;      // same-tick guard, synchronously readable
  submittingRef.current = true;
  try {
    const created = await createProduct(toDraft(values));
    onSaved?.(created);
  } finally {
    submittingRef.current = false;        // always release, success or failure
  }
};

<form onSubmit={handleSubmit(onSubmit)}>
  <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save product'}</button>
</form>
```

`isSubmitting` still earns its place: it disables the button (measured: clicking a disabled button sent nothing) and it drives the label. The ref stops the same-tick duplicate; the state makes the button *look* busy. Same division of labour as Part 7 — different library, same physics.

---

## 7. Cross-field rules: the measured surprise

RHF validates **the field that changed**. A rule on `price` that reads `inStock` therefore does *not* re-run when the checkbox changes — the message goes stale. Measured with a minimal standalone form (identical rule, with and without `deps`):

```text
--- deps: yes ---
   after blur (price=50, inStock=true): too cheap
   after unchecking inStock:            too cheap
      [handler] inStock=false error=too cheap
      [after trigger] error=(none)
--- deps: no ---
   after blur (price=50, inStock=true): too cheap
   after unchecking inStock:            too cheap
      [handler] inStock=false error=too cheap
      [after trigger] error=(none)
```

Both variants kept the stale message; **only an explicit `trigger('price')` cleared it**. `deps` (which exists in the type definitions and sounds like it should do this) did not re-validate in the measured version. The reliable fixes, in order of preference:

```tsx
// 1. Ask for the dependent field explicitly, from the field it depends on.
<input
  type="checkbox"
  {...register('inStock', {
    onChange: () => {
      void trigger('price');
    },
  })}
/>
```

```text
   price "50" while in stock   → In-stock items must be priced at ₹100 or more.
   after unchecking in-stock   → (no error)  (an explicit trigger('price') re-checked it)

   same rule, no trigger()     → In-stock items must be priced at ₹100 or more.
   after unchecking in-stock   → In-stock items must be priced at ₹100 or more.  — stale: nothing asked the price to re-check
```

```tsx
// 2. Validate the whole form on submit — the cross-field rule is then always evaluated.
handleSubmit(async (values) => { const combined = validateEverything(values); … })
```

```tsx
// 3. Put the rules in a schema resolver (file 05) — zod validates the whole object,
//    so cross-field rules behave like file 03's validateProduct again.
useForm({ resolver: zodResolver(productSchema) })
```

⚠️ This is the most important difference between file 03's design and RHF's: **file 03 validates the whole form, RHF validates fields.** Whole-form validation makes cross-field rules free and field-level re-renders more expensive; per-field validation is faster and makes dependencies explicit. Neither is "better" — but if your form has many interdependent rules, a resolver (option 3) will save you from sprinkling `trigger` calls.

💡 `useWatch({ control, name: 'price' })` gives you a *live* value in a component for display (measured: the preview re-rendered per keystroke). Use it for the preview, not for validation decisions — validation belongs in rules or the resolver.

---

## 8. `formState`, and what you pay for

```tsx
const {
  register,
  handleSubmit,
  formState: {
    errors,          // { [field]: { type, message } }
    isSubmitting,    // true while an async submit is in flight
    isDirty,         // any field differs from defaultValues
    dirtyFields,     // per-field dirty map (a DeepPartial — see the warning)
    touchedFields,   // per-field "has been blurred" map
    isValid,         // form-level validity; depends on `mode` (see the note)
  },
} = useForm<FormValues>({ mode: 'onTouched', defaultValues });
```

RHF wraps `formState` in a **Proxy** so that a component only re-renders for the properties it reads. That is why the lab form re-rendered *once* (for `isDirty`) instead of on every keystroke — and it is also why "just read everything" is a performance decision:

| Reading | Re-renders when |
| --- | --- |
| `errors` | an error appears, changes message, or clears |
| `isDirty` | the form becomes dirty (and again if it becomes pristine) |
| `isSubmitting` | the submit starts and ends |
| `isValid` | validity changes — **only if `mode` is not `'onSubmit'`**, because in `onSubmit` mode nothing runs until submit |
| `watch()` at the form level | every change of every watched field |

⚠️ `dirtyFields` is a `DeepPartial<FormValues>`, so `dirtyFields.name` is `boolean | undefined`, and nested objects need optional chaining. Comparing `isDirty` is usually enough.

⚠️ `isValid` in the default `'onSubmit'` mode is `false` until the first submit, because validation has not run yet. If you want it to gate a disabled button, set `mode: 'onChange'` or `'onTouched'` — and read the docs' warning about the render cost of `'onChange'`.

---

## 9. Server errors: `setError` and `clearErrors`

File 03 mapped a `422` body onto its own error state. RHF has that built in:

```tsx
const onSubmit: SubmitHandler<FormValues> = async (values) => {
  try {
    await createProduct(toDraft(values));
  } catch (error) {
    if (error instanceof HttpError && error.status === 422) {
      const body = error.body as { errors?: Record<string, string> } | null;
      for (const [key, message] of Object.entries(body?.errors ?? {})) {
        setError(key === 'priceMinor' ? 'price' : (key as keyof FormValues), { type: 'server', message });
      }
      setFormError('The server rejected some fields. See the messages below.');
    }
  }
};
```

Measured, with the API's own messages:

```text
=== D. 422 mapped back onto fields with setError ===
   requests: 1 (the client's rules passed)
      · Name must be at least 3 characters.
      · Price must be a positive number.
   form-level: The server rejected some fields. See the messages below.
```

Two details worth copying:

- **`type: 'server'`** tags the error, so you can distinguish "the server said so" from "my rules said so" — useful when a later change re-validates the field and should clear only the local error.
- **`clearErrors()` before a new submit**, otherwise a stale server error can survive a successful re-validation of that field.

RHF also accepts a `errors` option at `useForm` time (since 7.49) for externally-fetched errors — handy when the server returns errors before the form is created. Keep the object reference stable, or you will re-render forever.

---

## 10. `Controller`: custom and third-party inputs

`register` works by spreading props onto a real DOM input. A custom component (a chip picker, a date picker, a design-system `<Select>`) has its own API, so RHF needs a bridge:

```tsx
<Controller
  name="category"
  control={control}
  rules={{ required: 'Choose a category.' }}
  render={({ field, fieldState }) => (
    <>
      <CategoryPicker value={field.value} onChange={field.onChange} disabled={isSubmitting} />
      <input type="hidden" name={field.name} value={field.value} readOnly ref={field.ref} />
      {fieldState.error !== undefined && <p className="error" role="alert">{fieldState.error.message}</p>}
    </>
  )}
/>
```

The `render` prop receives:

| Field | What it gives you |
| --- | --- |
| `field.name` | the registered name (spread it for `FormData`/tests/accessibility) |
| `field.value` | the current value, from RHF's store |
| `field.onChange` | the setter — accepts a value *or* an event, so `onChange={field.onChange}` works on native inputs too |
| `field.onBlur` | marks the field touched (needed for `mode: 'onTouched'` — the docs call this out) |
| `field.ref` | attach it to a real element if you want RHF's focus-on-error to work |
| `fieldState.error` / `.isDirty` / `.touched` | per-field state without reading the whole `formState` |

⚠️ `Controller` makes the field **controlled by RHF**, so you pay a re-render for its changes (it calls `setState` internally). That is the price of integrating a component that owns its own value — and it is why the rule is: use `register` for native inputs, `Controller` only when you must.

---

## 11. `useFieldArray`: repeating rows

```tsx
interface TagFormValues {
  tags: { label: string }[];
}

const { register, control, handleSubmit, formState: { errors } } = useForm<TagFormValues>({
  defaultValues: { tags: [{ label: 'new' }] },
});
const { fields, append, remove } = useFieldArray({ control, name: 'tags' });

return (
  <form onSubmit={handleSubmit((values) => onSave?.(values))}>
    {fields.map((field, index) => (
      <div key={field.id}>                                  {/* ← field.id, never the index */}
        <input {...register(`tags.${index}.label`, { required: 'Every tag needs a label.' })} />
        <button type="button" onClick={() => remove(index)}>Remove</button>
        {errors.tags?.[index]?.label !== undefined && <p className="error">{errors.tags[index]?.label?.message}</p>}
      </div>
    ))}
    <button type="button" onClick={() => append({ label: '' })}>Add tag</button>
    <button type="submit">Save tags</button>
  </form>
);
```

Measured behaviour:

```text
=== F. useFieldArray: repeating rows ===
   rows at mount: 1 · values: ["new"]
   after two "Add tag" clicks: 3 rows · values: ["new","second","third"]
   after removing row 1: 2 rows · values: ["second","third"] (rows keep their own values)
   submitting with an empty label → errors: Every tag needs a label.
   did onSubmit run? no — validation blocked it
   after fixing both rows → onSave received {"tags":[{"label":"audio"},{"label":"sale"}]}
```

Four facts from that transcript:

1. **`key={field.id}`** — RHF gives each row a stable id, which is exactly the "stable key" requirement from Part 4/05. Using the array index would move typed text into the wrong row when a row is removed (the measured index-key bug).
2. **Values follow their rows.** After removing row 1, the remaining values are `["second","third"]` — not shifted, not duplicated.
3. **Nested rules work per row** (`tags.${index}.label`) and the error is reported at the row's index.
4. **Invalid rows block the submit** (`did onSubmit run? no`).

Other members you will meet: `insert`, `move`, `swap`, `replace`, `update`, `prepend`, and `fields`/`append` typing. Nested field arrays are possible and remain a sign that your data model is complicated — consider a flat list of rows instead.

---

## 12. Reset, edit mode, and reactive values

```tsx
const { reset, resetField, getValues } = useForm<FormValues>({ defaultValues: emptyValues });

reset(emptyValues);        // clear everything, and the new values become the default for isDirty
reset(product);            // prefill (edit mode) — keys must match the form's field names
resetField('price');       // clear one field back to its default
getValues('price');        // read the current value synchronously (inside a rule or handler)
```

For an edit form, three approaches, in order of simplicity:

| Approach | Code | When |
| --- | --- | --- |
| `defaultValues` from the product, plus `key={product.id}` | `<ProductForm key={product.id} product={product} />` | the record is loaded before the form mounts (the Part 7, file 06 pattern) |
| `reset(product)` in an effect | `useEffect(() => { reset(product) }, [product, reset])` | the record arrives later than the form |
| `values` option | `useForm({ values: product })` | RHF reacts to the object changing (7.41+); mind the `resetOptions` (`keepDirtyValues`, `keepErrors`) |

⚠️ `reset` is not a "re-render everything" button: it replaces values *and* resets `isDirty`, `touchedFields` and errors. In an edit form that is exactly what you want after a successful save; in a create form that is what makes "save and add another" work.

---

## 13. When to use RHF, and when not to

| Situation | Hand-rolled (file 03) | RHF | RHF + zod (file 05) |
| --- | --- | --- | --- |
| 3 fields, one submit, native constraints | ✅ simplest | fine | overkill |
| Live previews and heavy per-keystroke UI | ✅ state is already there | `useWatch` in small children | same |
| 40+ fields | ⚠️ re-renders the form per keystroke | ✅ zero-render typing | ✅ |
| Many cross-field / dependent rules | ✅ whole-form validation is natural | ⚠️ needs `trigger` wiring | ✅ resolver validates the whole object |
| Complex rules you want unit-tested without React | ✅ (pure function) | ⚠️ rules live in JSX options | ✅ schema is a pure, testable object |
| Repeating rows | hand-written arrays | ✅ `useFieldArray` | ✅ |
| Bundle budget | 0 kB | ~10 kB gzip | + a schema library |
| Team familiarity | whatever you wrote | widely known, documented | widely known |
| Server error mapping | manual | `setError` | `setError` / resolver errors |

No universal winner, and the honest summary is: **RHF trades a dependency for less wiring and fewer renders; a schema library trades another dependency for rules-and-types-in-one-place.** Use the smallest combination that fits the form.

---

## 14. Common mistakes

| # | Mistake | Symptom | Fix |
| --- | --- | --- | --- |
| 1 | Trusting `isSubmitting` as a duplicate guard | two records from one double-click | add a `useRef` guard (measured) |
| 2 | `useForm<FormValues>()` without `defaultValues` | fields are uncontrolled-then-controlled warnings, `undefined` values | always pass complete `defaultValues` |
| 3 | Calling `watch()` at the top of a big form | re-renders on every keystroke — the thing RHF was avoiding | `useWatch` in the smallest component |
| 4 | Using `deps` and expecting re-validation | stale cross-field messages | `trigger('otherField')` from the dependency's `onChange`, or a resolver |
| 5 | `valueAsNumber` on a clearable input | `NaN` in your values | keep the string, or model `''` explicitly |
| 6 | `name` missing on `Controller`'s hidden input | `FormData`/tests cannot find the field | spread `field.name` |
| 7 | Forgetting `field.onBlur` in `Controller` | `mode: 'onTouched'` never validates | pass `onBlur` through |
| 8 | Using the array index as `key` in `useFieldArray` | typed text moves to the wrong row after remove | `key={field.id}` |
| 9 | Reading `formState.isValid` in `'onSubmit'` mode | the submit button stays disabled forever | switch `mode`, or gate on something else |
| 10 | `reset()` on failure | the user's values are gone | reset only on success |
| 11 | Editing `errors` or `formState` directly | state fights the library | use `setError`/`clearErrors` |
| 12 | Mixing `register` and `Controller` for the same field name | two sources of truth for one value | pick one per field |

---

## 15. Best practices

1. **Type the form** with `useForm<FormValues>()` (and a resolver's output type when you add zod) — every field name becomes checked.
2. **`defaultValues` always**, complete, and reuse the same object for `reset`.
3. **`mode: 'onTouched'`** is the friendliest default for most forms: silent until blur, live afterwards.
4. **Keep the ref guard** for the same-tick case; use `isSubmitting` for the UI.
5. **Subscribe narrowly**: `useWatch` for previews, `formState.errors` for messages, and avoid `watch()` at the top of large forms.
6. **Cross-field rules**: prefer a resolver; otherwise `trigger` the dependent field from the field it depends on.
7. **`Controller` only for components that are not native inputs** — and pass `onBlur` and `ref` through.
8. **`setError` with a `type`** for server errors, and `clearErrors()` at the start of a submit.
9. **`useFieldArray` with `field.id` keys**, and validate nested fields with the templated name.
10. **`key={record.id}` for edit forms** so a different record gets a fresh form instead of a stale one.

---

## 16. Practice

### Beginner

1. Build the section 2 form and log the submitted values. Then delete `{...register('name')}` and put `name="name"` alone — what breaks, and what does the input do when you type?
2. Change `mode` from the default to `'onTouched'` and record when the error appears in both versions. Which one would you ship for a sign-up form, and why?
3. Add a `terms` checkbox registered with `required: 'You must accept the terms.'` and confirm the error message appears on submit.

### Intermediate

1. Reproduce the double-submit bug: click submit twice in one tick (a probe, or two `dispatchEvent`s in a test) and count the POSTs. Then add the ref guard and prove one request.
2. Add a live preview with `useWatch` showing `name` and `price`, and measure renders (a `data-renders` attribute is enough) while typing three characters. Compare with a version that uses `watch()` inside the form.
3. Add an inline "price per unit" field with a cross-field rule: if `units > 1`, `unitPrice` must be present. Make it re-validate correctly when either field changes — first with `trigger`, then by moving the rule into `handleSubmit`, then decide which you prefer.
4. Convert a `Controller` field back to `register`: which components can take `register` directly, and what breaks when you try it with a component that owns its own state (a date picker, a rich-text editor)?

### Challenge

1. Build a **variant editor** with `useFieldArray`: rows of `{ sku, price, stock }`, with per-row validation, "add row", "remove row", "duplicate row", and a computed total shown above the list. Which rows re-render when you type in row 3, and what does `useWatch({ control, name: `variants.${index}.price` })` do to that answer?
2. Add **async SKU uniqueness** to the variant rows: debounce per row, cancel the previous check when a row changes, and show "checking…" without blocking submission. Then explain where this belongs in a resolver-based design (file 05) — and why RHF's `validate` functions can be async but should not be un-debounced.
3. Take the `ValidatedProductForm` from file 03 and rewrite it with RHF + `Controller` (for the category picker), keeping: blur timing, server `422` mapping, the in-stock cross-field rule, and the same-tick submit guard. Write a short comparison of line counts, renders per keystroke, and the number of concepts a newcomer must learn.

---

## 17. Solutions

### Beginner

1. Without `register`, the input renders with only `name`. Typing works (it is a plain uncontrolled input), but RHF never sees the value: `handleSubmit` receives `{ name: undefined, price: … }` (or omits the key), validation never runs on it, and `reset()` cannot clear it. The spread is the subscription.
2. Default (`onSubmit`): no error until you submit, then everything is validated and updated live. `onTouched`: the error appears right after the first blur of each field, and then live. For sign-up, `onTouched` is usually the better experience — the user is told about a mistake when they have finished a field, not while typing, and not only at the end.
3. `required` on a checkbox uses the boolean value; RHF reports the message on submit, and `shouldFocusError` moves focus to the checkbox (a real element, so focus works). Note that the *native* `required` attribute is not added unless you opt into `progressive: true`.

### Intermediate

1. Two clicks in one tick → two POSTs (the lab's transcript is the proof). The ref guard, written before the first `await` and released in `finally`, makes it one. Keep `isSubmitting` for the disabled state; a *third* click after a re-render is then blocked by the button itself.
2. `useWatch` in a child: the child re-renders per keystroke (measured: 3 keystrokes → +2 renders after the first `isDirty` change), and the form does not. `watch()` inside the form: the *form* re-renders per keystroke, which also re-renders every child — the exact cost RHF exists to avoid.
3. With `trigger`: `register('units', { onChange: () => { void trigger('unitPrice') } })` and the same in reverse — two lines, easy to forget. In `handleSubmit`: validate the whole object, set errors with `setError` for all of them, and return early — one place, evaluated on submit, not live. With a resolver: the schema's `.refine()` covers it and both fields re-validate together (file 05). Most teams end at the resolver for cross-field rules.
4. `register` works for anything that spreads props onto a native input (`<input>`, `<select>`, `<textarea>`, and simple wrappers that forward props). A component with internal state (a date picker that keeps its own "open" state, a rich-text editor, a chip input) needs `Controller`: it must receive `value` and call your `onChange` instead of owning the value.

### Challenge

1. Only the row you are typing in re-renders if you isolate it: `useWatch` per row component, or `Controller` per row. Typing in row 3 re-renders row 3's subscriber; the parent re-renders only if it reads the whole `formState`. For the total, subscribe once at the parent level with `useWatch({ control, name: 'variants' })` — you then pay a parent re-render per keystroke, which is the honest cost of a live total.
2. Debounce inside the rule: `validate: async (value) => { await sleep(300); const taken = await checkSku(value); return taken ? 'Taken' : true; }` — but a rule cannot cancel the *previous* call by itself, so track an id per row (`useRef` map) and ignore stale answers; better, debounce in the row component's `onChange` and call `trigger` once. In a resolver design the async check typically moves to a `superRefine`/`.refine` with the same "only the latest result wins" guard, or out of the resolver entirely (submit-time + server-side uniqueness), because resolvers run on every validation pass.
3. Refactors of this kind typically *lose* about half the state-wiring lines and gain one dependency plus a new vocabulary (`register`, `Controller`, `formState`, `trigger`, `useFieldArray`). Renders per keystroke drop to zero for the form (one for `isDirty` if you use it) and stay one for any component that watches a field. The concepts multiply — which is why files 01–03 come first: you cannot evaluate whether RHF is helping until you know what it replaced.

---

## 18. Summary

- RHF keeps values in **refs and the DOM**, not React state: typing costs **0** form renders, and you pay a render only for the `formState` you subscribe to (measured). This is the clearest practical difference from file 03's controlled-state design.
- `register('field', rules)` returns props to spread; `handleSubmit(onValid)` runs the rules and calls `onValid` only when they pass, focusing the first error by default; `mode`/`reValidateMode` express the same timing policy file 03 built by hand.
- **`isSubmitting` is not a duplicate-click guard** — two clicks in one tick produced **2 POSTs** (measured). Keep the `useRef` guard from Part 7; use `isSubmitting` for the button.
- **Cross-field rules need explicit wiring**: measured, `deps` did not re-validate, and an explicit `trigger('price')` did. A schema resolver (file 05) restores whole-object validation if you have many dependent rules.
- `setError(field, { type: 'server', message })` maps a `422` body onto fields (measured), and `clearErrors()` prevents stale server errors.
- `Controller` bridges custom inputs (pass `field.value`/`field.onChange`/`field.onBlur`, and `field.ref` if you want focus management); it makes that field controlled again, so use it only where `register` cannot reach.
- `useFieldArray` handles repeating rows with **`key={field.id}`**, per-row validation, and value-preserving removals (measured).
- Use the smallest of the three designs — hand-rolled, RHF, RHF + schema — that fits the form. There is no universal winner.

---

**What's next →** [`05-zod.md`](./05-zod.md) takes the rules out of JSX and into a schema: `z.object`, `.refine` for cross-field rules, **transforms** (so `"1,299.50"` becomes `129950` before your submit handler runs), `z.input` vs `z.output` for two different types from one definition, `zodResolver` wiring, and the same schema reused to validate the API's **responses** — closing the loop with Part 7, file 11.
