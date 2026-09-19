# TSX Cheatsheet — JSX in TypeScript

> **Reference · Cheatsheet 2 of 9**
> JSX is a syntax for describing UI as data; **TSX** is that syntax inside a `.tsx` file, where the compiler also checks types. File extension matters: JSX in a `.ts` file is an error (`TS17004`).

---

## 1. The two-layer mental model

```tsx
const element = <button className="btn" onClick={handleClick}>Save</button>;
```

```js
// What the compiler turns it into (React 17+ automatic runtime):
import { jsx as _jsx } from 'react/jsx-runtime';
const element = _jsx('button', { className: 'btn', onClick: handleClick, children: 'Save' });
```

`<X />` is **not HTML** and **not a string**: it is a function call that creates a plain object describing what should be on screen. React (or your renderer) turns that object into DOM.

---

## 2. Syntax rules (each one is an error if broken)

| Rule | ✅ |
| --- | --- |
| Return one root node | `<><Header /><Main /></>` |
| Close every tag | `<img … />`, `<input … />`, `<br />` |
| Use `className`, `htmlFor` | `<label htmlFor="id">` |
| camelCase attributes | `onClick`, `onChange`, `tabIndex`, `autoFocus`, `maxLength` |
| `style` takes an object | `style={{ marginTop: 8, color: 'red' }}` |
| Expressions in braces | `<p>{user.name}</p>`, `{items.length + 1}` |
| Comments in braces | `{/* note */}` |
| Boolean shorthand | `<button disabled />` |
| Spread props | `<input {...register('email')} />` |
| Custom components are capitalised | `<TaskRow />` vs `<tr>` |

**Attribute-name map:** `class`→`className` · `for`→`htmlFor` · `tabindex`→`tabIndex` · `onclick`→`onClick` · `readonly`→`readOnly` · `maxlength`→`maxLength` · `contenteditable`→`contentEditable` · `colspan`→`colSpan` · `srcset`→`srcSet` · `crossorigin`→`crossOrigin`.

---

## 3. Expressions, values and what renders

```tsx
const name = 'Asha';
const count = 0;
const items = ['a', 'b'];
const maybe = null;

<p>{name}</p>                     {/* Asha */}
<p>{2 + 2}</p>                    {/* 4 */}
<p>{items.length}</p>             {/* 2 */}
{maybe}                           {/* renders nothing: null/undefined/true/false are skipped */}
{count}                           {/* renders "0" — numbers are visible */}
{count && <Badge />}              {/* renders "0" ❌ use count > 0 && … */}
{String(count)}                   {/* explicit */}
{new Date().toLocaleDateString()} {/* expressions are allowed — keep them small */}
```

| Value | Renders as |
| --- | --- |
| `string`, `number` | the text (numbers render, including `0`) |
| `true` / `false` / `null` / `undefined` | nothing |
| array of elements | each item in order (needs keys) |
| object / function | ❌ error: “Objects are not valid as a React child” |
| `NaN` / `Infinity` | `NaN` / `Infinity` text — usually a bug upstream |

---

## 4. Conditionals in TSX

```tsx
{isOpen && <Panel />}                              {/* show or nothing */}
{count > 0 && <Badge>{count}</Badge>}              {/* numeric guard */}
{error !== null && <p role="alert">{error}</p>}    {/* explicit null check (also satisfies TS) */}
{isLoading ? <Spinner /> : <List items={items} />} {/* two branches */}
{role === 'admin' ? <AdminNav /> : <UserNav />}

// Early returns keep JSX shallow
if (isPending) return <p role="status">Loading…</p>;
if (error !== null && error !== undefined) return <div role="alert">{String(error)}</div>;
if (items.length === 0) return <p>Nothing here yet.</p>;
return <ul>{items.map(…)}</ul>;

// Exhaustive switch over a union (TypeScript checks for a missing case)
switch (state.status) {
  case 'idle': return <p>Search.</p>;
  case 'loading': return <p role="status">Loading…</p>;
  case 'success': return <Card report={state.report} />;
  case 'error': return <p role="alert">{state.message}</p>;
}
```

⚠️ **`error !== null && undefined`**: with TanStack Query, `error` is `Error | null`; with `useState<Error | null>(null)` the same. If your type says `| undefined`, check both — or normalise at the source.

---

## 5. Lists and `key`

```tsx
<ul>
  {tasks.map((task) => (
    <li key={task.id}>{task.title}</li>
  ))}
</ul>
```

| Key choice | Verdict |
| --- | --- |
| `task.id` | ✅ stable and unique |
| `key={index}` | ⚠️ only for static, never-reordered lists |
| `key={Math.random()}` | ❌ remounts every render |
| `key={`${task.id}-${version}`} | ✅ intentional remount (resets state) |
| missing | ❌ console warning, wrong reuse |

Keys only need to be unique **among siblings**, and they are not passed as a prop (read `id` if you need it: `task.id`).

---

## 6. Fragments and grouping

```tsx
<>…</>                                       // short syntax, no key possible
<Fragment key={item.id}>…</Fragment>          // keyed fragment inside a list
<React.Fragment>…</React.Fragment>            // explicit
```

Fragments add no DOM node — use them instead of a wrapper `<div>` when the layout does not need one (e.g. returning `<td>`s from a component rendered inside a `<tr>`).

---

## 7. Events in TSX

```tsx
<button onClick={handleClick} />                     // MouseEventHandler
<button onClick={(e) => handleClick(e)} />           // the event type is inferred here
<input onChange={(e) => setName(e.target.value)} />  // ChangeEvent<HTMLInputElement>
<form onSubmit={(e) => { e.preventDefault(); save(); }} />
<div onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} />
<input onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />

// Explicit types when the handler is named or extracted:
const handleSubmit = (event: FormEvent<HTMLFormElement>) => { … };
const handleChange = (event: ChangeEvent<HTMLInputElement>) => { … };
const handleClick = (event: MouseEvent<HTMLButtonElement>) => { … };
```

`event.target.value` only exists on the right element type — that is why `ChangeEvent<HTMLInputElement>` matters. For `e.currentTarget`, the generic is the element the handler is attached to.

---

## 8. Props in TSX

```tsx
interface TaskRowProps {
  task: Task;
  onSelect: (id: string) => void;
  compact?: boolean;                  // optional
  children?: ReactNode;               // anything renderable
  as?: 'li' | 'div';                  // a variant
}

<TaskRow task={task} onSelect={select} compact />
<TaskRow {...taskRowProps} />                         // spread
<TaskRow task={task} onSelect={select} extra="no" />   // ❌ excess property check fails
```

| Type | Meaning |
| --- | --- |
| `ReactNode` | anything renderable (JSX, string, number, `null`, arrays) |
| `ReactElement` | exactly one element |
| `React.ReactElement<Props>` | one element with known props |
| `() => void` | a callback prop (returns are ignored) |
| `(value: T) => void` | callback with an argument |
| `readonly T[]` | an array you will not mutate |
| `ComponentType<Props>` | a component passed as a prop |

---

## 9. Children and composition

```tsx
function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section><h3>{title}</h3>{children}</section>;
}

<Card title="Invoices">
  <ul><li>#1042</li></ul>
</Card>
```

```tsx
// Slot pattern: named props instead of a prop-soup
function Page({ header, sidebar, children }: { header: ReactNode; sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className="page">
      <header>{header}</header>
      <aside>{sidebar}</aside>
      <main>{children}</main>
    </div>
  );
}

// Render-prop / component-as-prop: the caller controls the rendering
function List<T>({ items, renderItem }: { items: readonly T[]; renderItem: (item: T) => ReactNode }) {
  return <ul>{items.map((item, i) => <li key={i}>{renderItem(item)}</li>)}</ul>;
}
```

---

## 10. TSX + TypeScript gotchas

| Symptom | Cause | Fix |
| --- | --- | --- |
| `JSX element 'X' has no corresponding closing tag` (TS17008) | mismatched tag | fix the markup (caret points at the opener) |
| `Cannot use JSX unless the '--jsx' flag is provided` (TS17004) | `.tsx` without `"jsx": "react-jsx"` | set it in `tsconfig.json` |
| `'X' cannot be used as a JSX component` (TS2786) | an `async` component or a wrong return type | components return elements, never promises |
| Type `'T'` is not assignable… on a generic component | inference lost at the boundary | annotate explicitly: `<List<Task> … />` |
| `<` parsed as an operator | a generic arrow component in `.tsx` | write `function List<T>(…)` or `<T,>` (comma) |
| Props look right but do not compile | excess property check on a literal | remove the extra prop or extend the interface |
| `style` complains | CSS property names in kebab-case | use camelCase keys (`marginTop`) |
| Attribute value is a string but a number is needed | TSX attributes are contextually typed | `width={300}` not `width="300"` (for SVG/number types) |
| `ref` type error on a function component | React < 19 expected `forwardRef` | React 19: `ref` is a normal prop |
| `key` not readable inside the component | `key` is not a prop | pass the value you need (`id={item.id}`) |

---

## 11. Style and class patterns

```tsx
<div className="card" />                                   // plain string
<div className={`card ${isActive ? 'card--active' : ''}`} />  // template literal
<div className={['card', isActive && 'card--active'].filter(Boolean).join(' ')} />
<div style={{ display: 'grid', gap: 12 }} />              // inline object (camelCase)
<label className={styles.label} htmlFor="email">Email</label>  // CSS modules
<button className="rounded bg-teal-700 px-4 text-white hover:bg-teal-800 disabled:opacity-50" />  // Tailwind
```

Avoid building class names by concatenation without a separator, and never put untrusted strings into `className`/`style` from user input.

---

## 12. Security in TSX

```tsx
<p>{userInput}</p>                                        // ✅ escaped by React (safe)
<img src={userInput} alt="" />                            // ⚠️ src/href from users can be dangerous
<a href={safeUrl(userUrl)}>Link</a>                        // ✅ allow-list http(s), reject javascript:
<div dangerouslySetInnerHTML={{ __html: sanitisedHtml }} />  // ⚠️ only after sanitising with a library
```

- React escapes text and (most) attributes — there is no HTML injection through `{}`.
- `dangerouslySetInnerHTML` **executes** whatever is in the string (the book measured this: a `<script>`/`onerror` payload runs).
- URLs are the other hole: a `javascript:` URL is blocked by React for `href`, but `src`/`style` need care; sanitise or allow-list.
- Never put tokens in JSX that ships to the client — anything in the bundle is public.

---

## 13. Formatting habits that prevent bugs

```tsx
// 1. One prop per line once there are more than two
<TaskRow
  key={task.id}
  task={task}
  onSelect={select}
  compact={isCompact}
/>

// 2. Extract before it gets deep — nesting is a smell
{isLoading ? <Spinner /> : <List />}      // ✅ flat
{a ? <b>{c ? <d>{e ? <f /> : null}</d> : null}</b> : null}   // ❌ indentation hides the logic

// 3. Name the conditions
const canEdit = task.status !== 'done' && hasRole(session, 'editor');
{canEdit && <EditButton />}

// 4. Reuse components, not markup blocks
{['todo', 'doing', 'done'].map((column) => <Column key={column} status={column} />)}
```

---

## 14. Quick reference: element → props (the ones you actually type)

```tsx
<input value={text} onChange={(e) => setText(e.target.value)} type="email" name="email"
       id="email" placeholder="you@example.com" required disabled autoComplete="email"
       aria-invalid={invalid} aria-describedby="email-error" />

<select value={status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Status">
  <option value="todo">To do</option>
</select>

<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} aria-label="Notes" />

<form onSubmit={handleSubmit} noValidate>…</form>

<button type="submit" disabled={isPending} formAction={submit} aria-pressed={pressed}>Save</button>

<img src="/logo.svg" alt="Taskboard" width={32} height={32} loading="lazy" />

<dialog ref={dialogRef} open={open} onClose={onClose} aria-labelledby="title" />

<label htmlFor="id">Label</label>
<fieldset><legend>Group</legend>…</fieldset>
<table><caption>Books</caption><thead><tr><th scope="col">Title</th></tr></thead><tbody>…</tbody></table>
<a href="/tasks/1" target="_blank" rel="noreferrer noopener">Open</a>
```
