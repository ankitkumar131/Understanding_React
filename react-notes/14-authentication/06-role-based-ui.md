# 06 — Role-Based UI: Permissions, Conditional Rendering and the Honest Boundary

> **Part 14 · Authentication · File 6 of 5** *(part closer)*

Why this file exists: files 01–05 built the session; this one decides what the interface *shows* a given user, and it is where authorisation bugs are easiest to introduce and hardest to notice — because a UI that hides a button looks identical to a UI that enforces a rule. This file establishes one source of truth for permissions, the rendering patterns that stay readable as roles multiply, role-aware navigation, the multi-tenant and ownership cases that roles alone cannot express, how to test permission-gated UI (this lab measured six tests in 1.73 s, including `blocks a route when the user lacks the role`), and the sentence that keeps everyone honest: **hiding is a courtesy to the user; the server is the authority.**

---

## 1. Roles versus permissions

| Model | Looks like | Good | Bad |
| --- | --- | --- | --- |
| **Roles** | `session.user.roles = ['admin']` | simple, matches how people talk | roles accumulate; "admin" becomes a bundle of unrelated powers |
| **Permissions** | `can('products:write')` | composable, testable, maps to endpoints | needs a mapping and someone to own it |
| **Ownership** | `can('orders:read', { ownerId })` | expresses "your own data" | easy to forget on the server |
| **Attributes** (ABAC) | tenant, plan, region, feature flags | flexible | complexity explodes without tooling |

The pragmatic design used by most products: **roles are what the server stores; permissions are what the UI asks about; ownership is checked server-side and reflected in what the API returns.**

```ts
// src/auth/permissions.ts — one source of truth
import { hasRole, type Session } from './tokenStore';

type Check = (session: Session | null) => boolean;

const rules = {
  'products:read': () => true,                                                     // public
  'products:write': (s) => hasRole(s, 'admin') || hasRole(s, 'editor'),
  'products:delete': (s) => hasRole(s, 'admin'),
  'orders:read': (s) => s !== null,                       // server returns only the user's orders
  'users:manage': (s) => hasRole(s, 'admin'),
} satisfies Record<string, Check>;

export type Permission = keyof typeof rules;

export function can(session: Session | null, permission: Permission): boolean {
  return rules[permission](session);
}
```

```tsx
// usage in components and guards
const { session } = useAuth();
{can(session, 'products:write') && <AddProductButton />}
<Route element={<ProtectedRoute permission="users:manage" />}>…</Route>
```

Why `satisfies Record<string, Check>` (Part 2): it keeps the keys as a literal union (`Permission` is `'products:read' | …`), so a typo in a `can('prodcuts:write')` call is a **type error**, not a silently-false check. That single line prevents the most common bug in permission code.

⚠️ **Every rule must name its server twin.** Put it in a comment:

```ts
// 'products:delete': mirrored by DELETE /api/products/:id (server checks role === 'admin')
```

If you cannot name the endpoint, either the rule is cosmetic (a UI nicety that needs no server check) or the endpoint is missing its check — and the second case is a vulnerability.

---

## 2. Rendering patterns that stay readable

```tsx
// ❌ the pattern that rots: role logic smeared through JSX
{session?.user.roles.includes('admin') || session?.user.roles.includes('editor') ? (
  <button onClick={onSave}>Save</button>
) : null}
{session?.user.roles.includes('admin') ? <button onClick={onDelete}>Delete</button> : null}
```

```tsx
// ✅ one helper, semantic names, and the reason stated when it matters
const canWrite = can(session, 'products:write');
const canDelete = can(session, 'products:delete');

{canWrite && <SaveButton onClick={onSave} />}
{canDelete && <DeleteButton onClick={onDelete} product={product} />}
{!canWrite && <p className="hint">Your role can view but not edit products.</p>}
```

| Pattern | When to use it | Watch out for |
| --- | --- | --- |
| `{canX && <Component />}` | hide something entirely | silent absence confuses users who expect it |
| Disabled + explanation | the action matters and discovery matters | reveals the feature exists (sometimes intentional) |
| `<Gate permission="x">…</Gate>` | many usages, one implementation | an indirection people must learn |
| Redirect to a 403 page | whole sections | a jarring navigation for a stray click |
| Filter data client-side (`items.filter(canSee)`) | the API already returned everything | ⚠️ this is **not** authorisation — it only hides data the client already has |

```tsx
// A tiny Gate component when the same check appears in many places
export function Gate({ permission, children, fallback = null }: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { session } = useAuth();
  return can(session, permission) ? <>{children}</> : <>{fallback}</>;
}
```

💡 The readability rules that survive a growing app: **(1)** compute the booleans at the top of the component, **(2)** name them after the intent (`canWrite`, `isOwner`), **(3)** never inline array membership checks in JSX, **(4)** say why when the absence is surprising.

⚠️ **Column/field-level permissions** are a different beast: hiding a table column is fine, but the data must not arrive in the response. If the API sends `costPrice` to a user who cannot see it, the value is one DevTools panel away. Field-level rules belong in the API's serialiser.

---

## 3. Role-aware navigation

| Element | Honest approach |
| --- | --- |
| Nav links to forbidden sections | hide them; do not render a link that 403s |
| A whole section the user cannot use | hide the section, or show a disabled item with a reason |
| Breadcrumbs/back links | keep them working — a user can still land on a 403 page |
| Deep links from email/other tools | the guard's 403 screen must be informative and offer a way back |
| Search results | filter server-side; a client-side filter still shows the result "exists" |

```tsx
// Navigation driven by the same permission source
const navItems = [
  { to: '/products', label: 'Products', permission: 'products:read' },
  { to: '/admin/users', label: 'Users', permission: 'users:manage' },
] satisfies { to: string; label: string; permission: Permission }[];

<nav>
  {navItems
    .filter((item) => can(session, item.permission))
    .map((item) => <NavLink key={item.to} to={item.to}>{item.label}</NavLink>)}
</nav>
```

💡 Two extras worth having: **a page the user cannot access should say so** (`You don't have access to Users. Ask an admin if you need it.`) rather than a blank screen, and **an empty state should distinguish "nothing here" from "nothing you can see"** — otherwise support tickets say "the page is broken".

---

## 4. Roles when they stop being enough

| Case | What roles miss | Design |
| --- | --- | --- |
| **Ownership** ("edit *your* comment") | the role is the same for everyone | the API returns only the user's rows; the UI compares `item.authorId === session.user.id` |
| **Multi-tenant** ("admin *of your* org") | role names collide across tenants | the token carries the tenant; every request is scoped server-side**
| **Plan/tier** ("Pro can export") | it is a subscription fact, not a permission | expose `plan` from the server and gate features on it, with the server enforcing limits |
| **Time/state** ("can edit while the order is a draft") | a state machine, not a role | derive from the entity's status — and enforce the transition server-side |
| **Feature flags** | not permissions at all | a flag service; keep flags and permissions in separate helpers so they can be reasoned about independently |

```tsx
// Ownership in the UI: the server has already scoped the data
const isOwner = item.authorId === session?.user.id;
{isOwner && <EditButton item={item} />}
// Server twin: PATCH /api/comments/:id rejects when authorId !== token.sub
```

⚠️ **The classic multi-tenant bug:** the UI scopes by the tenant it *thinks* the user is in (from a query param, a URL, or a stale token), while the server trusts that value. The rule is: **tenant scoping comes from the token on the server, and the client's job is to render what the server returned** — never to filter a cross-tenant payload client-side.

---

## 5. Testing permission-gated UI

```tsx
// src/auth/session.test.tsx (this lab, measured)
it('blocks a route when the user lacks the role', async () => {
  render(<App initialSession={{ ...session, user: { ...session.user, roles: ['viewer'] } }} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('do not have permission');
});
```

```text
 ✓ blocks a route when the user lacks the role 13ms
```

The patterns worth copying:

| What to test | How |
| --- | --- |
| Element hidden for a role | render with a `viewer` session, assert `queryByRole('button', { name: 'Delete' })` is absent |
| Element shown for a role | render with an `admin` session, assert it is present |
| Route blocked | the measured test — assert the accessible message, not just "no crash" |
| Route allowed | `findByText('Admin area')` with an admin session |
| **Server still enforces** | an API test with a low-privilege token asserting a 403 |
| Ownership | two sessions, one item, assert the edit control appears for the owner only |

```tsx
it('shows the delete control only to a user who can delete', async () => {
  const { rerender } = renderWithSession(<ProductRow product={lamp} />, { roles: ['viewer'] });
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

  rerender(<ProductRow product={lamp} />, { roles: ['admin'] });
  expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
});
```

💡 The **rerender** version is the interesting test: it proves the UI *reacts to a session change* rather than reading permissions once at mount. In a long-lived tab where a role is revoked (an admin demotes the user, the token refreshes), that behaviour is the difference between the UI catching up and the user seeing stale controls until a reload.

---

## 6. When the client and the server disagree

| Symptom | Cause | Handling |
| --- | --- | --- |
| UI shows an action, the API returns 403 | the client's permissions are stale (role changed) | show the server's message, then refresh the session/user data |
| UI hides an action, the user insists they have it | the token lacks the claim, or the UI rule is wrong | one source of truth (`can()`), refreshed from the server's `/me` |
| A 401 appears on a permitted action | the token expired | refresh + retry (Part 14, file 03) |
| Everything 403s after a deploy | the server's rule changed, the client's session is old | force a session refresh on version mismatch (a version header is the clean way) |

```tsx
// The honest response to a server-side 403: tell the user, refresh what you know
if (response.status === 403) {
  await refreshCurrentUser();                  // re-read permissions from the server
  showToast('Your permissions changed — the page has been updated.');
}
```

⚠️ **Never paper over a 403 by hiding the feature on the next render without telling the user.** "The button vanished" is a support ticket; a message that says permissions changed is a resolved incident.

---

## 7. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Hiding the button and calling it security | the API still allows it | enforce on the server, hide in the UI |
| 2 | Inline `roles.includes(...)` in JSX | unreadable, drifting rules | one `can()` helper |
| 3 | Stringly-typed permissions | typos silently deny access | `satisfies` + a `Permission` union (type-checked) |
| 4 | Filtering sensitive data client-side | the data was already sent | filter server-side |
| 5 | Hiding a nav link but leaving the route open (or vice versa) | inconsistent experience | guard routes and nav from the same rules |
| 6 | No distinction between "empty" and "no access" | users report broken pages | message the reason |
| 7 | Permission checks that never update | stale UI after a role change | refresh the user on a 403; react to session changes |
| 8 | Tenant scoping from a URL/param | cross-tenant leaks | derive the tenant from the token server-side |
| 9 | Ignoring ownership | users edit others' data | enforce `ownerId` checks on both sides |
| 10 | Roles that mean five things | you cannot explain who can do what | permissions as the vocabulary; roles as the storage |
| 11 | No tests for the denied path | denial is where bugs hide | test both directions (measured template) |
| 12 | Forgetting that a page can be reached by URL | deep links bypass hidden nav | guard the route |

---

## 8. Best practices

1. **One permission module**, typed so a typo is a compile error, with each rule naming its server twin.
2. **Compute booleans at the top of the component** (`canWrite`, `isOwner`) and use them in JSX.
3. **Guard routes and navigation from the same rules** so they cannot disagree.
4. **Say why** when something is hidden: an empty state, a disabled action with a tooltip, or a 403 page with a way back.
5. **Never send data the user may not see** — field-level rules live on the server.
6. **Derive tenant and ownership server-side**, and render what comes back.
7. **React to permission changes**: refresh the current user on a 403, and re-render when the session changes.
8. **Test both directions** for every gate, plus one API-level 403 test per sensitive endpoint.
9. **Keep flags separate from permissions** so neither concept has to explain the other.
10. **Write the boundary in the README**, once, so every future feature inherits it: *server enforces, client asks `can()`, UI explains.*

---

## 9. Practice

### Beginner

1. Write three permissions (`products:read`, `products:write`, `users:manage`) and use `can()` to hide a Delete button from a viewer while showing it to an admin.
2. Add a test for each direction (hidden for viewer, visible for admin).
3. Explain in one sentence each: why hiding is not securing, and what an empty state should say when the reason is permissions.

### Intermediate

1. Build `Gate` and use it in three places; then refactor two existing inline role checks to use `can()`.
2. Update the nav to be permission-driven from the same array, and add a test that a viewer does not see the Users link.
3. Add ownership: show Edit only when `item.authorId === session.user.id`, and write the note describing the server-side twin of that rule.

### Challenge

1. Implement field-level permissions end to end: a `costPrice` field visible only to admins, hidden in the API for others, with a contract test asserting the field is **absent** from the response (not `null`, not `0`).
2. Design the "role changed while the tab was open" flow: how the client learns (a 403, a version mismatch, a polling `/me`), what it shows, and how it avoids destroying the user's in-progress work. Implement the client half.
3. Audit an app's authorisation surface: list every route, control and field with its required permission, mark which have server enforcement, and produce a gap list ordered by risk. Then fix the top two gaps and add a regression test for each.

---

## 10. Solutions

### Beginner

1. ```tsx
   const rules = {
     'products:read': () => true,
     'products:write': (s) => hasRole(s, 'admin') || hasRole(s, 'editor'),
     'users:manage': (s) => hasRole(s, 'admin'),
   } satisfies Record<string, (s: Session | null) => boolean>;
   // …in the component
   {can(session, 'products:write') && <DeleteButton id={id} />}
   ```
2. `renderWithSession(<Row />, { roles: ['viewer'] })` → `expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();` and the same render with `{ roles: ['admin'] }` → `getByRole('button', { name: 'Delete' })`.
3. Hiding changes what React renders, not what the API returns or allows — an attacker calls the endpoint directly, so the server must reject. An empty state caused by permissions should say so ("You don't have access to this data — ask an admin for the `orders:read` permission"), because "No results" sends users to support with the wrong question.

### Intermediate

1. `Gate` as in section 2; refactoring the inline checks replaces `session?.user.roles.includes('admin')` with `can(session, 'products:delete')`, which also makes the rules testable in isolation (a pure function of the session).
2. `navItems.filter((item) => can(session, item.permission))`; the test renders with a viewer session and asserts `queryByRole('link', { name: 'Users' })` is absent while `Products` is present.
3. `const isOwner = item.authorId === session?.user.id;` with the comment `// Server twin: PATCH /api/comments/:id rejects unless comment.authorId === token.sub`. Two tests: owner sees Edit, non-owner does not (and the API test that the non-owner's PATCH returns 403).

### Challenge

1. API: the serialiser omits `costPrice` unless the token has `products:cost:read`; the client's column renders only when `can('products:cost:read')`. The contract test asserts the key is **absent** (`expect('costPrice' in body).toBe(false)`), which catches the common mistake of returning `costPrice: null` — that still leaks the schema and is often enough for inference.
2. The client learns via a 403 from an action (immediate, precise) or a periodic/`focus`-triggered `/me` refresh (proactive). On learning: refresh the user, re-render gates, and show a non-destructive banner ("Your permissions changed; some actions are now unavailable") — never clear forms or force navigation. The implementation: a `refreshCurrentUser()` in the auth provider, called from the HTTP client's 403 branch, plus a focus listener for long-lived tabs.
3. The audit output is a table: route/control/field → required permission → enforced server-side (yes/no) → test exists (yes/no). Typical gaps: a bulk endpoint missing the check that the single-item endpoint has; an export endpoint revealing all fields; an "admin" page whose API is only guarded by the UI; a `PATCH` that allows changing a field the user cannot read. Fix the highest-risk two, add regression tests (403 for a low-privilege token; field-absence for a field-level rule), and put the table in the repo so the next audit is a diff, not a discovery.

---

## 11. Summary

- **Roles are storage; permissions are the vocabulary; ownership is a server concern.** One typed `can()` module, with each rule naming its server twin, is the whole design.
- **`satisfies Record<string, Check>` turns a permission typo into a compile error** — the cheapest possible protection against silently-false checks.
- **Readable rendering comes from computing booleans at the top** (`canWrite`, `isOwner`) and never inlining role membership in JSX; a small `<Gate>` helps when the same check appears often.
- **Navigation and routes should be driven by the same rules**, and hiding should be accompanied by a reason — an empty state or a 403 that explains itself.
- **Client-side filtering is not authorisation**: field-level rules belong in the API's serialiser, and the test that matters asserts the field is *absent* from the response.
- **Roles are not enough for ownership, tenancy, plans or state machines**, and each of those has a server-side twin that the UI merely reflects.
- **Test both directions** for every gate (measured template: `blocks a route when the user lacks the role`, 13 ms) plus one API-level 403 per sensitive endpoint — and prefer the `rerender` version so you prove the UI reacts to permission changes.
- **When client and server disagree, tell the user and refresh what you know** — a vanishing button is a bug report; a message that permissions changed is a resolved incident.

---

**What's next →** [`../15-production/01-environment-variables.md`](../15-production/01-environment-variables.md) opens Part 15: shipping. Environment variables in Vite (and the hard truth that anything in a `VITE_` variable is public), modes and `.env` files, secrets that must never reach the bundle, and how to configure the same code for development, staging and production without forking it.
