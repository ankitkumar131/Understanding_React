# JSX / TSX Cheat Sheet — Syntax Rules

> What compiles, what does not, and the rules that catch people coming from HTML.
> Explanations: [Part 3 · 05 (JSX)](../03-react-fundamentals/05-jsx.md) · [Part 3 · 06 (TSX)](../03-react-fundamentals/06-tsx.md)

## The file extension rule

| Extension | Contains JSX? | Use for |
| --- | --- | --- |
| `.tsx` | ✅ yes | Any file with JSX |
| `.ts` | ❌ no | Logic, types, API modules, hooks without JSX |

⚠️ JSX in a `.ts` file is a **parse error**, not a type error: `';' expected`. Rename the file.

## What JSX compiles to

```tsx
<Card title="Hi"><b>x</b></Card>

// becomes (automatic runtime — no React import needed)
jsx(Card, { title: 'Hi', children: jsx('b', { children: 'x' }) })

// The result is a plain object — an "element", not a DOM node
{ type: Card, props: { title: 'Hi', children: … }, key: null }
```

Because it is a **function call**, JSX cannot contain statements — hence ternaries and `map`
instead of `if` and `for`.

## Attribute translation from HTML

| HTML | JSX | Note |
| --- | --- | --- |
| `class` | `className` | `class` is a JS keyword |
| `for` | `htmlFor` | |
| `tabindex` | `tabIndex` | camelCase |
| `onclick` | `onClick` | takes a **function**, not a string |
| `style="color: red"` | `style={{ color: 'red' }}` | object, camelCase properties |
| `contenteditable` | `contentEditable` | |
| `autocomplete` | `autoComplete` | |
| `maxlength` | `maxLength` | |
| `readonly` | `readOnly` | |
| `crossorigin` | `crossOrigin` | |
| `colspan` / `rowspan` | `colSpan` / `rowSpan` | |
| `accept-charset` | `acceptCharset` | |
| `http-equiv` | `httpEquiv` | |
| `<!-- comment -->` | `{/* comment */}` | |
| `<input checked>` | `checked={true}` + `onChange` | controlled inputs need both |
| `<div hidden>` | `hidden` or omit the element | prefer not rendering it |

⚠️ Custom attributes with dashes are passed through as-is: `data-id="5"`, `aria-label="Close"`.
Unknown camelCase attributes produce a warning.

## Values and expressions

```tsx
<p>{'literal string'}</p>
<p>{1 + 1}</p>                            {/* 2 */}
<p>{user.name.toUpperCase()}</p>
<p>{items.length} items</p>               {/* text and expression mixed */}
<p>{isAdmin ? 'Admin' : 'User'}</p>
<p>{`Hello, ${user.name}`}</p>            {/* template literal */}

{/* Rendered as NOTHING (safe to use in conditions) */}
{false} {null} {undefined} {true}

{/* ⚠️ Rendered as text — the classic bug */}
{count && <Badge />}                      {/* count === 0 renders "0" */}
{count > 0 && <Badge />}                  {/* ✅ */}
```

## Comments

```tsx
function App() {
  // A normal JS comment — inside the function body, outside JSX
  return (
    <div>
      {/* A JSX comment — must be inside braces */}
      <Child
        // a comment between props is fine
        id={1}
      />
    </div>
  );
}
```

⚠️ `<!-- html comment -->` inside JSX is parsed as a comparison expression and breaks the build.

## Fragments

```tsx
// ❌ Adjacent JSX elements must be wrapped
return <h1>a</h1><p>b</p>;

// ✅ Fragment — no extra DOM node
return (<><h1>a</h1><p>b</p></>);
return (<Fragment><h1>a</h1><p>b</p></Fragment>);

// ✅ With a key (the only prop a fragment accepts)
{groups.map((g) => <Fragment key={g.id}><h2>{g.name}</h2>{g.items.map(…)}</Fragment>)}
```

## Styles

```tsx
// Object literal — camelCase, numbers get px for most properties
<div style={{ backgroundColor: '#eee', marginTop: 16, zIndex: 2 }} />

// From a variable
const style: CSSProperties = { color: isError ? 'crimson' : 'inherit' };
<p style={style} />

// ✅ Prefer a class for anything reused
<p className={styles.error} />
<p className={`card ${isActive ? 'card--active' : ''}`} />
```

⚠️ `style="color: red"` (a string) is a type error in TSX. `{{ }}` is not a typo: the outer
braces are the JSX expression, the inner ones are the object literal.

## TypeScript-specific TSX rules

```tsx
// ✅ Generic arrow function in .tsx needs a trailing comma or a constraint
const identity = <T,>(value: T): T => value;          // .tsx
const identity = <T extends unknown>(value: T): T => value;
// In .ts, <T>(value: T) is fine — the parser is not looking for JSX there

// ✅ Type the props on the parameter
function Card({ title }: { title: string }) { … }
function Card({ title }: CardProps) { … }

// ✅ Generic component
function List<T>({ items, renderItem }: { items: T[]; renderItem: (item: T) => ReactNode }) { … }

// ✅ Typing the ref
const ref = useRef<HTMLDivElement>(null);
<div ref={ref} />

// ✅ Typing children
{ children: ReactNode }        // content, strings, fragments, null
{ icon: ReactElement }         // exactly one element
```

⚠️ **The `<T,>` comma is the classic TSX gotcha:** without it, `<T>` is parsed as the start of a
JSX tag. It is needed only in `.tsx` files.

## Spread and rest

```tsx
// Forward the remaining props to a native element
type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string };

function LabeledInput({ label, ...rest }: InputProps) {
  const id = useId();
  return (<><label htmlFor={id}>{label}</label><input id={id} {...rest} /></>);
}

// Spread an object of props
const props = { id: 1, name: 'Ada' };
<UserCard {...props} />

// ⚠️ Order matters — later wins
<input {...defaults} value={value} />     // value overrides defaults
<input value={value} {...defaults} />     // defaults may override value — usually a bug
```

## Booleans and optional attributes

```tsx
<input disabled={!canSave} />             // ✅
<input disabled="false" />                // ❌ the string "false" is truthy → always disabled
<input required />                        // ✅ shorthand for required={true}
<input aria-invalid={hasError || undefined} />   // omit the attribute entirely when false
```

## Whitespace and newlines

```tsx
<p>Hello {name}</p>              {/* space preserved around the expression */}
<p>
  Hello
  {name}
</p>                             {/* leading/trailing newlines + indentation are trimmed;
                                    the newline between "Hello" and {name} becomes one space */}
<p>Hello{name}</p>               {/* no space */}
<p>Hello{' '}{name}</p>          {/* an explicit space */}
```

## Quick diagnostics

| Error | Cause |
| --- | --- |
| `Adjacent JSX elements must be wrapped in an enclosing tag` | Return one root, or a fragment |
| `';' expected` in a `.ts` file | JSX in a `.ts` file — rename to `.tsx` |
| `JSX element implicitly has type 'any'` | The component is untyped or the import is wrong |
| `Property 'class' does not exist` | Use `className` |
| `Type 'string' is not assignable to type 'CSSProperties'` | `style` needs an object |
| `Expression expected` after `<` | A generic arrow function — write `<T,>` |
| `Element type is invalid: expected a string … but got: undefined` | A bad or mis-capitalised import — `Foo` is `undefined` |
