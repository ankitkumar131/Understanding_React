# 01 — Testing Basics: What to Test, and What a Test Is Worth

> **Part 13 · Testing · File 1 of 5**

Why this file exists: most testing problems in React projects are not tool problems — they are decisions about *what* deserves a test. Teams either test nothing (and ship regressions) or test everything at the wrong level (asserting that a component renders a `<div>`, then rewriting the tests on every refactor while real bugs still ship). This file sets the level: what a test is worth, why **behaviour and accessibility roles** are the right things to assert, where the boundaries between unit, component, integration and end-to-end tests fall, how coverage should and should not be used (measured: this book's lab reports 98.66% statements, 86.66% branches — and the uncovered branches are the interesting part), and the habits that make tests cheaper than the bugs they prevent.

---

## 1. What a test is actually for

A test is a **bet**: you pay writing time and maintenance cost now, to avoid paying a defect later. The bet pays off when the test:

1. **fails when the behaviour is broken** (it detects real regressions),
2. **does not fail when the code is refactored** (it survives changes that do not alter behaviour),
3. **tells you what went wrong** without a debugging session.

Notice what is not on that list: "proves the code is correct". A test proves a *specific observation under specific conditions*. That is why the observation you choose — the assertion — is the entire design problem, and why "test the behaviour, not the implementation" is the single most useful rule in this part.

| Assertion | Detects regressions? | Survives refactors? | Verdict |
| --- | --- | --- | --- |
| `expect(screen.getByRole('button', { name: 'Increment' })).toBeInTheDocument()` | yes (the button is gone or mislabelled) | yes | ✅ good |
| `expect(screen.getByTestId('count')).toHaveTextContent('5')` | yes (the count is wrong) | mostly | ✅ good |
| `expect(container.firstChild).toHaveClass('counter-root')` | only if the class itself matters | ❌ breaks on any markup change | ❌ implementation detail |
| `expect(useState).toHaveBeenCalledWith(0)` | no (it does not test the UI) | ❌ breaks on any refactor | ❌ testing the framework |
| `expect(snapshot).toMatchSnapshot()` with no explanation | maybe | ❌ updated blindly | ⚠️ use deliberately |

---

## 2. The levels, and what each one costs

```text
        confidence  ▲            cost per test  ▲
  e2e (browser)     high      e2e               high (minutes, flaky, infra)
  integration       medium    integration       medium
  component         medium    component         low
  unit (pure fn)    low-med   unit              very low
```

| Level | What it runs | What it is good at | What it is bad at |
| --- | --- | --- | --- |
| **Unit** | a pure function (a formatter, a reducer, a Zod schema) | logic edge cases, fast feedback, exhaustive cases | anything involving rendering or user interaction |
| **Component** | one component tree in jsdom, interactions via Testing Library | props/state/events/conditional rendering | real network, real layout, cross-page flows |
| **Integration** | several components + mocked API (MSW), routing, a store | "does this page work when a user does X?" | browser-only behaviour (layout, scroll, downloads) |
| **End-to-end** | a real browser against a real (or test) server | critical journeys, wiring, auth, deployment config | speed, flakiness, debuggability — use sparingly |

💡 The practical shape for most React apps: **many unit tests for pure logic, many component tests for user-facing behaviour, a handful of integration tests for page flows, and a few end-to-end tests for the journeys that would end the business if broken** (sign in, pay, submit an order). That mix is usually called the testing trophy; the pyramid and the trophy disagree about the middle layer, not about the ends.

⚠️ The most common misallocation: dozens of snapshot tests of large components (cheap to write, expensive to maintain, low defect detection) and no test for the checkout flow (expensive to write, high value). Invert it.

---

## 3. What deserves a test (and what does not)

**Test these:**
- Pure logic with branches: price/date/currency formatting, permission checks, reducers, schema validation.
- Anything a user can do more than once: submit, filter, toggle, paginate, retry.
- Conditionals in the UI: loading, empty, error, long content, missing data.
- Mistakes that are expensive: money, auth, destructive actions, data loss.
- Anything that has already broken once — a regression test is the cheapest test you will ever write.

**Do not test these:**
- That React renders (`render(<App />)` and asserting it did not throw).
- Implementation details: internal state variable names, hook call counts, CSS classes, component file structure.
- Third-party libraries' own behaviour (that React Router navigates, that Zod validates) — test your *usage*.
- Trivial getters/setters with no branches.
- Layout and appearance (that belongs to screenshot/visual tests or a human).

💡 A useful question before writing a test: **"If this test fails tomorrow, what will I have learned?"** If the answer is "that I renamed something", skip it.

---

## 4. Coverage: a signal, not a goal

Coverage measures which lines/branches executed during tests. It says nothing about whether the assertions were meaningful: 100% coverage with `expect(true).toBe(true)` is 100% covered and 0% useful.

This lab's measured run (`npx vitest run --coverage`) looks like this:

```text
 % Coverage report from v8
File              | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
All files         |   98.66 |    86.66 |     100 |     100 |
  Counter.tsx     |     100 |    89.47 |     100 |     100 | 13
  ProductList.tsx |   95.65 |       75 |     100 |     100 | 23-24
  SearchBox.tsx   |     100 |    92.85 |     100 |     100 | 8
```

Read it as a **question generator**, not a score:

- `ProductList.tsx` at 75% branch coverage with lines **23-24** uncovered — those lines are the abort path (`if (caught instanceof DOMException && caught.name === 'AbortError') return;`). So the report is telling the truth about a real gap: unmounting mid-request is untested.
- `Counter.tsx` line 13 is the `Reset` button's `disabled={count === initial}` branch — one branch of that ternary never ran. If the reset behaviour matters, write the test.
- `SearchBox.tsx` line 8 is the empty-query path — covered by the "clears back to the full list" test, so the branch number is high because the *other* branch of the filter is covered.

Two rules that keep coverage useful: (1) set a **floor** (for example "changed files must be ≥ 80% branch coverage") rather than chasing 100%, and (2) never let coverage replace judgement — an uncovered error path is usually worth a test; an uncovered `default:` that cannot happen is not.

---

## 5. Arrange–Act–Assert, and naming

```tsx
it('disables Reset at the initial value and re-enables it after a change', async () => {
  // Arrange
  const user = userEvent.setup();
  render(<Counter />);
  const reset = screen.getByRole('button', { name: 'Reset' });

  // Act
  await user.click(screen.getByRole('button', { name: 'Increment' }));

  // Assert
  expect(reset).toBeEnabled();
});
```

The name is the specification: **"disables Reset at the initial value and re-enables it after a change"** tells you what broke when it fails. Compare with `it('works')` or `it('renders')`, which tell you nothing and encourage weak assertions.

| Naming pattern | Example |
| --- | --- |
| behaviour + condition | `shows the empty state when the query matches nothing` |
| given/when/then | `given a failed request, shows an alert and no list` |
| "does not" for the important negative | `does not call the API twice when the button is double-clicked` |

💡 Describe blocks should name the **unit** (`Counter`, `SearchBox`, `useDebouncedValue`), not the file path. If a describe block mirrors your folder structure, the tests will be reorganised every time the folders are.

---

## 6. The observation problem, in one example

Two tests for the same component. Which would you rather maintain?

```tsx
// ❌ Coupled to implementation: any markup or class change breaks it, and it never catches a real bug
it('renders the counter markup', () => {
  const { container } = render(<Counter initial={0} />);
  expect(container.querySelectorAll('p')[0]?.textContent).toBe('Count: 0');
  expect(container.querySelector('button')?.className).toBe('btn btn-primary');
});

// ✅ Coupled to behaviour and accessibility: it breaks when a user would notice
it('increments the visible count when the user clicks Increment', async () => {
  const user = userEvent.setup();
  render(<Counter initial={0} />);
  await user.click(screen.getByRole('button', { name: 'Increment' }));
  expect(screen.getByRole('status')).toHaveTextContent('1');
});
```

The second version has three properties worth naming explicitly:

1. **It would survive a redesign** that keeps the button and the output.
2. **It enforces accessibility**: `getByRole('button', { name })` fails if the button has no accessible name — so the test is also an a11y test, for free.
3. **It documents the feature** in a way a new developer can read.

⚠️ The exception that proves the rule: sometimes the observation *is* an implementation detail that users depend on — a `data-testid` used by analytics, an `aria-live` region, a focus order. Test those deliberately, and say why in a comment.

---

## 7. Test smells

| Smell | What it usually means | Fix |
| --- | --- | --- |
| A test with no `assert` | it only checks "did not throw" | assert the user-visible outcome |
| 200-line test | several behaviours in one test | split; one behaviour per test |
| `await new Promise(r => setTimeout(r, 500))` | waiting for something that should be awaited deterministically | `findBy*`, `waitFor`, or fake timers |
| Tests that fail in a random order | shared mutable state between tests | reset mocks/state in `afterEach` (this lab does `cleanup()`) |
| Snapshot with a huge diff nobody reads | snapshots used as a substitute for assertions | delete it, assert the important parts |
| Mocking the thing under test | the test proves the mock works | mock at the boundary (network, clock, storage), not the component |
| Assertions on class strings or `data-testid` everywhere | implementation coupling | query by role/label first, testid only as a last resort |
| "Fix the test by changing the expectation" | the test was the last line of defence | read the diff; if the behaviour changed on purpose, say so in the commit |

---

## 8. Common mistakes

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Testing implementation details | constant maintenance, low defect detection | assert behaviour through roles/text |
| 2 | Chasing 100% coverage | time spent on trivial branches | coverage floors + judgement (section 4) |
| 3 | Writing tests after "everything works" only | the tests encode the current bugs as expectations | write tests for behaviour as you build it |
| 4 | One enormous test per component | failures are ambiguous; can't run one case | one behaviour per test |
| 5 | No test for the error/empty path | the state users hit when things go wrong is unverified | always cover loading, empty, error |
| 6 | Mocking everything | the test asserts against your own mocks | mock at the edges (network, time), keep real components |
| 7 | Ignoring a11y in assertions | inaccessible UI passes tests | query by role/label |
| 8 | Fixed sleeps | slow, flaky tests | await user-visible changes (`findBy*`) |
| 9 | Shared state between tests | order-dependent failures | `cleanup()`, resets in `afterEach` |
| 10 | No regression test after a bug fix | the bug returns | add the failing test first, then fix |
| 11 | Tests that never fail | they assert nothing meaningful | mutate the code deliberately and watch the test fail |
| 12 | Testing the framework | wasted time | test your code's behaviour |

---

## 9. Best practices

1. **Test behaviour through the UI as a user sees it** (roles, labels, text) — it doubles as an accessibility check.
2. **One behaviour per test**, with a name that reads as a specification.
3. **Cover the four states of any data-driven view**: loading, empty, error, success.
4. **Mock at the boundaries** — network (file 05), clock, storage, `matchMedia` — and keep the rest real.
5. **Write the failing test first for a bug fix**, then fix; keep both.
6. **Prefer integration tests for page flows**; unit tests for pure logic; a few e2e for critical journeys.
7. **Treat coverage as a question generator** with a floor on changed files.
8. **Keep tests fast** (seconds, not minutes) so they run on every save and in CI.
9. **Make failures self-explanatory**: good names, meaningful assertions, no swallowed errors.
10. **Delete tests that no longer earn their keep.** A test nobody trusts is worse than no test.

---

## 10. Practice

### Beginner

1. Classify each: a test of a currency formatter; a test that clicking "Add to cart" updates the header count; a test that signing in and checking out works in a browser; a test that `useDebouncedValue` returns the delayed value.
2. Rewrite this to assert behaviour: `expect(container.querySelector('.error')).toBeTruthy();`
3. For the `Counter` component in this lab, list every behaviour a user could notice, then mark which you would test and which you would not.

### Intermediate

1. Take three assertions from an existing test suite and classify them as behaviour, implementation detail, or accessibility. Rewrite the implementation-detail ones.
2. Add the missing tests suggested by this lab's coverage report: the `Counter` Reset-disabled branch (line 13) and the `ProductList` abort path (lines 23–24). Then re-run coverage and compare the branch numbers.
3. Write a one-page testing policy for a team: what must be tested before merge, what is optional, what coverage floor applies to changed files, and what is explicitly out of scope.

### Challenge

1. Mutation-test a small module: for each assertion, deliberately break the implementation (invert a condition, change a default) and check whether a test fails. Report the "survived mutations" — they are your blind spots.
2. Design the test strategy for a checkout flow: which parts are unit, component, integration and e2e; what is mocked at each level; how you test the payment failure path without a payment provider; and the total runtime budget.
3. Take a large snapshot test in an existing project, delete it, and replace it with targeted behaviour tests. Measure: lines of test code, runtime, and — by introducing three deliberate bugs — how many the new suite catches.

---

## 11. Solutions

### Beginner

1. Currency formatter → unit (pure function, exhaustive edge cases). Add-to-cart header update → component/integration (several components, user interaction, possibly a store). Sign-in-and-checkout in a browser → end-to-end. `useDebouncedValue` → unit/component with fake timers.
2. `expect(await screen.findByRole('alert')).toHaveTextContent('Request failed with 500')` — it names the semantic role and the message the user sees, and it fails if the alert is unannounced to assistive technology.
3. Observable behaviours: the initial value displays; Increment adds the step; Reset returns to the initial value; Reset is disabled when the value is the initial one; the live region announces changes. Test: increment, reset, disabled states (three tests cover them). Not worth testing: the exact markup, the class names, that `useState` was called, or the fact that the component renders at all.

### Intermediate

1. Classification exercise. Behaviour: "the count shows 5 after two increments". Implementation: "the container has one `<p>`". Accessibility: "the output has `aria-live="polite"`". The first stays; the second becomes a role-based assertion; the third is worth keeping *deliberately* (announcements matter) with a comment explaining why.
2. ```tsx
   it('keeps Reset disabled after resetting back to the initial value', async () => {
     const user = userEvent.setup();
     render(<Counter initial={2} step={1} />);
     const reset = screen.getByRole('button', { name: 'Reset' });
     await user.click(screen.getByRole('button', { name: 'Increment' }));
     await user.click(reset);
     expect(reset).toBeDisabled();          // ← covers the `count === initial` branch
   });

   it('ignores an aborted request when the component unmounts mid-flight', async () => {
     const { unmount } = render(<ProductList />);
     unmount();                              // ← aborts; the catch must return silently
     expect(await screen.findByText(/Loading/).catch(() => null)).toBeNull();
   });
   ```
   The second test proves the abort path does not set state or throw; running coverage afterwards should move `ProductList`'s branch number up from 75%.
3. A workable policy: every PR touching a component adds/updates a component test for the changed behaviour; every bug fix adds a regression test; pure logic must be unit tested; changed files should keep branch coverage ≥ 80%; e2e covers only the three critical journeys; screenshots are reviewed manually for styling PRs. Out of scope: third-party internals, generated code, and "does this CSS class exist".

### Challenge

1. Typical survivors: default values in `switch` branches, fallback strings, and error branches whose tests only cover the happy path. Recording survivors is the point — each one is a place where a future refactor can change behaviour with no test complaining.
2. A defensible split: unit for the cart reducer/total maths and the Zod schema; component for the line-item and summary components (formatted prices, quantity changes, remove); integration for the full checkout page with MSW (submit → order created → cart cleared, and 422/500/network-failure paths); e2e for the one journey from sign-in to confirmation, run against a seeded test server. Payment testing avoids the provider by mocking at *your* boundary (the `PaymentProvider` interface) and having one contract test against the real sandbox, run nightly — not on every PR.
3. Expect the new suite to be shorter, faster and to catch *more* of the three deliberate bugs (snapshots catch visual changes but miss most logic bugs). Report the numbers; the interesting finding is usually that the snapshot caught a formatting change nobody cared about while the behaviour tests caught two bugs the snapshot was blind to.

---

## 12. Summary

- **A test is a bet**, and it pays off only when it fails on real regressions, survives refactors and explains itself. That is why assertions target **behaviour and accessibility roles**, not markup, classes or internal state.
- **Know the levels**: unit for pure logic, component for interactions in jsdom, integration for flows with a mocked API, end-to-end for a few critical journeys. Most value per minute sits in the middle two.
- **Coverage is a question generator**: this lab's report (`98.66%` statements, `86.66%` branches) pointed straight at a real gap — `ProductList.tsx` at `75%` branch coverage with the abort path (lines `23-24`) untested. Set floors for changed files; do not chase 100%.
- **Arrange–Act–Assert with specification-style names** (`disables Reset at the initial value and re-enables it after a change`) turns a test suite into documentation.
- **Always cover the four states** of a data view: loading, empty, error, success — the states users hit when things go wrong are the ones that ship broken.
- **Write the failing test for a bug before fixing it**, and delete tests that no longer earn their keep.
- **Test smells are diagnostic**: no assertions, fixed sleeps, implementation coupling, shared state and blind snapshot updates all predict a suite that nobody trusts.

---

**What's next →** [`02-vitest.md`](./02-vitest.md) sets up the runner this part uses: Vitest with the jsdom environment, the config that lives inside `vite.config.ts`, the measured test run (3 files, 8 tests, 4.28 s), coverage with v8, mocking with `vi.fn` and fake timers, and the performance note the runner itself printed about creating a jsdom per file.
