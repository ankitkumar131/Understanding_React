# 02 — Project Architecture: Layers vs Features, and Boundaries That Hold

> **Part 15 · Production · File 2 of 8**

Why this file exists: a folder structure is not a cosmetic choice — it is the shape of
every future change. Two apps with identical features age very differently depending on
whether their code is organised by *technical layer* ("all components here, all hooks
there") or by *feature* ("everything for authentication here"). This file explains both,
when each one is right, the dependency rules that keep either one from rotting, and the
concrete structure used by the production app in Part 17.

---

## 1. The two questions architecture answers

Every structure is an answer to:

1. **Where do I put new code?** If the answer takes more than five seconds, the structure
   is failing — people will invent their own and the codebase forks.
2. **What breaks when I change this?** If deleting a feature means touching ten folders,
   the structure is hiding coupling instead of managing it.

A third, quieter question matters most in teams: **who owns what?** A folder per feature
maps cleanly onto "this squad owns checkout"; a folder per layer does not.

---

## 2. Layer-based (technical) architecture

Grouped by *what kind of thing* the file is:

```text
src/
├── components/       # 60+ files: Button, Modal, UserCard, CartSummary, …
├── hooks/            # 30+ files
├── pages/            # 20+ files
├── services/         # api.ts, auth.ts, cart.ts
├── types/            # user.ts, cart.ts, api.ts
├── utils/            # format.ts, date.ts, validation.ts
└── store/            # slices, providers
```

**What it is good at**

- Small apps (< ~20 files). Everything is one hop away.
- Highly reusable UI: a design system where `components/` genuinely *is* a library.
- Zero decisions to make while learning.

**How it fails as the app grows**

- `components/` becomes a 200-file junk drawer where `UserCard.tsx` sits next to
  `Button.tsx`, even though one is a business feature and one is a primitive.
- **Changing one feature touches seven folders.** "Update checkout" = edit
  `pages/CheckoutPage.tsx`, `components/CheckoutForm.tsx`, `components/CartSummary.tsx`,
  `hooks/useCart.ts`, `services/cart.ts`, `types/cart.ts`, `store/cartSlice.ts`.
- **Nothing can be deleted safely.** Is `utils/format.ts` used by checkout, or only by
  reporting? You have to grep to find out — every time.
- Ownership is impossible to express: nobody "owns" `components/`.

⚠️ **The telltale symptom:** a `utils/` or `helpers/` folder with 40 files and no README.
That folder is where architecture goes to die, because "shared" has silently become
"unowned".

---

## 3. Feature-based architecture

Grouped by *what the code does for the user*:

```text
src/
├── app/                    # app-level wiring only
│   ├── router.tsx
│   ├── providers.tsx       # QueryClient, theme, auth provider
│   └── main.tsx
├── features/
│   ├── auth/
│   │   ├── components/     # LoginForm.tsx, RegisterForm.tsx
│   │   ├── hooks/          # useSession.ts
│   │   ├── api/            # authApi.ts
│   │   ├── store/          # authSlice.ts
│   │   ├── types.ts
│   │   └── index.ts        # the public API of this feature
│   ├── tasks/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api/
│   │   └── index.ts
│   └── billing/
├── shared/                 # genuinely shared, business-agnostic
│   ├── ui/                 # Button, Modal, Input, Spinner
│   ├── lib/                # fetch client, date/format helpers
│   └── hooks/              # useDebounce, useMediaQuery
└── config.ts
```

**What it is good at**

- **Locality.** "Work on checkout" = open `features/checkout/`.
- **Deletability.** Removing a feature = delete the folder, fix the imports that break.
- **Parallel teams.** Two people work in two folders without merge conflicts.
- **Scales to hundreds of files** because the top level stays ~5 folders.

**What it costs**

- You must make a decision ("is this shared or feature-local?") on day one, and enforce it.
- Duplication can creep in when two features write their own `formatCurrency`.
- The `index.ts` barrel needs discipline, or it hides the dependency graph.

💡 **The rule that makes features work:** *`shared/` contains only code that knows nothing
about your business.* `Button` doesn't know what a Task is. `formatDate` doesn't know what
an Order is. The moment a "shared" file imports from `features/`, it has stopped being
shared.

---

## 4. Dependency rules (this is the actual architecture)

Folders are just labels. **The rules about what may import what are the architecture.**
For a feature-based app:

```text
app/       →  may import from features/ and shared/
features/  →  may import from shared/ and OTHER features' index.ts only
shared/    →  may import from shared/ only   (never from features/ or app/)
```

Three rules, three benefits:

1. **`shared/` never imports `features/`** — otherwise a "primitive" drags business logic
   into every consumer, and the dependency graph becomes a cycle.
2. **Cross-feature imports go through `index.ts`** — so a feature exposes an *interface*,
   not its internals. `features/tasks` may use `features/auth`'s `useSession` because it
   is exported from `auth/index.ts`; it may not reach into
   `auth/components/LoginForm.tsx`.
3. **`app/` is the only place that knows about everything** — routing and providers. This
   is where features are composed, and it is the one file set that legitimately imports
   broadly.

```ts
// src/features/auth/index.ts — the public API of the feature
export { AuthProvider, useSession } from './store/AuthProvider';
export { login, logout, refresh } from './api/authApi';
export type { Session, User, Role } from './types';
// NOT exported: LoginForm, RegisterForm — they are internals
```

```tsx
// ✅ another feature uses the public API
import { useSession } from '../auth';

// ❌ another feature reaches into internals — now it breaks when auth refactors
import { LoginForm } from '../auth/components/LoginForm';
```

🔍 **Enforce it with tooling, not willpower.** With ESLint:

```js
// eslint.config.js — boundary rule (eslint-plugin-boundaries, or a no-restricted-imports rule)
{
  files: ['src/shared/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{ group: ['@/features/*', '@/app/*'],
                   message: 'shared/ must not import from features/ or app/.' }],
    }],
  },
}
```

A rule people can trip over in CI beats a convention written in a README.

---

## 5. Choosing: a decision table

| Situation | Use |
| --- | --- |
| Solo project, < 20 files, might stay small | **Layers** — simplest thing that works |
| Component library / design system | **Layers** inside the library, features in the app |
| 3+ developers, or any app expected to grow | **Features** |
| Multiple teams owning different areas | **Features**, one folder per team |
| App where you must delete features for clients (white-label) | **Features** — deletability is the requirement |

⚠️ **Do not migrate architecture mid-project "because it's cleaner".** Migrate when a
specific pain appears: "I cannot find checkout's code" or "two teams keep conflicting in
`components/`". Premature structure is as costly as none.

---

## 6. Migration path: layers → features

You do not rewrite. You move, one feature at a time, in commits that stay green.

```bash
# 1. Pick the smallest, least-entangled feature first
mkdir -p src/features/tasks/{components,hooks,api}

# 2. Move its files with git so history is preserved
git mv src/components/TaskList.tsx   src/features/tasks/components/
git mv src/hooks/useTasks.ts         src/features/tasks/hooks/
git mv src/services/tasks.ts         src/features/tasks/api/tasksApi.ts

# 3. Add the barrel
printf "export { TaskList } from './components/TaskList';\n" > src/features/tasks/index.ts

# 4. Fix imports and verify
npx tsc --noEmit && npx vitest run && npm run build
```

Repeat per feature. Keep `src/components/` for genuine shared UI and rename it
`src/shared/ui/` at the end, once the distinction is obvious.

🏭 **Do it behind a branch with `tsc --noEmit` in CI.** The compiler is your safety net:
every broken import is a compile error, so a move is either complete or visibly incomplete
— never half-done-and-shipped.

---

## 7. Boundaries inside a feature

A feature folder has its own tiny architecture. The rule is the same one, applied one
level down:

```text
features/tasks/
├── components/     # presentation: receive props, render, no fetching
├── hooks/          # orchestration: combine state + API, expose values and actions
├── api/            # transport: fetch/axios calls, request/response types, nothing else
├── types.ts        # domain types for this feature
└── index.ts        # public exports
```

- **`components/` never calls `fetch`.** It receives data and callbacks. This is what makes
  them testable without a network (Part 13).
- **`api/` never touches React.** No hooks, no JSX. It is plain TypeScript that returns
  promises — testable with `vi.fn()` and callable from a Node script.
- **`hooks/` is the seam** between them, and where server state (TanStack Query, Part 9)
  usually lives.

```tsx
// ❌ component that cannot be tested or reused
function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => { fetch('/api/tasks').then(r => r.json()).then(setTasks); }, []);
  return <ul>{tasks.map(t => <li key={t.id}>{t.title}</li>)}</ul>;
}

// ✅ component that is a pure function of its props
function TaskList({ tasks }: { tasks: Task[] }) {
  return <ul>{tasks.map(t => <li key={t.id}>{t.title}</li>)}</ul>;
}
// …and the fetching lives in features/tasks/hooks/useTasks.ts
```

---

## 8. Common mistakes

| Mistake | Consequence | Fix |
| --- | --- | --- |
| `shared/` imports from `features/` | Cycles, "primitives" that need the API to render | Move that file into the feature |
| No `index.ts` on a feature | Everyone deep-imports; refactors break the world | Add a barrel, restrict deep imports with lint |
| A `common/` + `shared/` + `utils/` + `helpers/` set | Four homes for the same idea | Pick one name (`shared/`) |
| Feature named after a screen (`pages/dashboard/`) | Screens change; features persist | Name it after the domain (`features/metrics/`) |
| Everything in `shared/` "just in case" | `shared/` becomes the app | Rule: shared = knows nothing about the business |
| Types duplicated per feature and in `types/` | Two `User` types drift apart | Domain types live in the owning feature, exported |

---

## 9. Practice

### Beginner
1. Draw the current structure of a project you have (or the playground) as a tree and label
   each folder "layer" or "feature".
2. Write the three dependency rules from section 4 as a `CONTRIBUTING.md` section.

### Intermediate
1. Convert a 3-feature toy app from layers to features, using `git mv`, keeping
   `npx tsc --noEmit` green after every move.
2. Add barrels to each feature and list what each one exports. Note anything you exported
   only to satisfy an import — that is a boundary violation to fix.

### Challenge
1. Add a lint rule forbidding `shared/ → features/` imports and prove it fails CI on a
   deliberate violation.
2. Design the structure for a white-label app that must ship with or without a `billing`
   feature, using an env flag. Show the import graph that makes deleting `features/billing/`
   a one-folder change.

---

## 10. Solutions

### Beginner
1. `components/ hooks/ pages/ services/` are layers; `features/tasks/` is a feature. Most
   real apps are mixed — the exercise is noticing which, not fixing it.
2. The three rules, verbatim, plus one line each of *why* (cycles, encapsulation, composition
   point). A rule without a reason gets ignored in a hurry.

### Intermediate
1. Order matters: move the feature with the fewest inbound imports first, because each move
   only breaks the files that imported it. `git mv` keeps `git log --follow` working, which
   future-you will need.
2. A barrel that exports something only used once, by one neighbour, is usually a sign that
   the file belongs in `shared/` or that the neighbour should own it.

### Challenge
1. As in section 4; the CI proof is a branch with `import { TaskList } from '@/features/tasks'`
   inside `src/shared/ui/` and a failing `npm run lint`.
2. `features/billing/` exports `BillingProvider` and `billingRoutes`; `app/providers.tsx`
   does `{config.enableBilling && <BillingProvider>…</BillingProvider>}` and
   `app/router.tsx` spreads `...(config.enableBilling ? billingRoutes : [])`. Deleting the
   feature = delete the folder + remove two conditional lines. No grep archaeology.

---

## 11. Summary

- **Architecture answers "where does new code go" and "what breaks when this changes"** —
  not "what folders look nice".
- **Layers suit small apps and libraries; features suit growing apps and teams.** The
  switch is a pain response, not a fashion statement.
- **The dependency rules are the architecture:** `shared/` imports nothing above it,
  features import each other only through `index.ts`, `app/` composes everything.
- **`shared/` = business-agnostic.** If it knows what a Task is, it belongs in a feature.
- **Inside a feature: components render, api talks, hooks orchestrate.** Components never
  fetch; api never touches React.
- **Enforce boundaries with lint rules in CI**, because conventions decay and rules do not.
- **Migrate with `git mv`, one feature per commit, `tsc --noEmit` green throughout.**

---

**What's next →** [`03-folder-structure.md`](./03-folder-structure.md) takes the production
app from Part 17 and walks through *every* folder and file, explaining what belongs in each
one, what does not, and how to justify the structure to another developer in five minutes.
