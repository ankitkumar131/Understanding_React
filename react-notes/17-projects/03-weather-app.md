# 03 — Project: Weather App (API, Async, Loading, Errors, Types)

> **Part 17 · Projects · File 3 of 7**

Why this project: this is the first project whose data comes from outside your program, which means the data arrives late, can be wrong, can arrive out of order, and can fail entirely. A weather app is the smallest honest version of that problem: one input, one request, four states (`idle`, `loading`, `success`, `error`), one cancellation rule, and typed responses that are checked instead of assumed. The habits you build here — parse at the boundary, cancel stale requests, distinguish retryable from permanent failures, test every state with a fake network — are the same ones a payments screen needs.

Measured: the finished project's tests run in **750 ms** (7 tests) in this lab's suite — [`react-lab/evidence/part17-projects.txt`](../../react-lab/evidence/part17-projects.txt).

---

## 1. Requirements

| # | Requirement | The skill |
| --- | --- | --- |
| 1 | Search a city by name | controlled input + submit |
| 2 | Show a loading state while the request is in flight | the `loading` state is not optional |
| 3 | Show current conditions and a 5-day forecast | rendering a typed response |
| 4 | Show a specific message for an unknown city | 404 is not an error, it is an answer |
| 5 | Show a retryable message for server/network failures | retry is a UX decision |
| 6 | A new search cancels the previous one | `AbortController`, no stale results |
| 7 | Cancel on unmount | no state updates after unmount |
| 8 | Reject a malformed body instead of rendering `undefined°` | parse, do not cast |
| 9 | Do nothing for an empty input | cheap validation before the network |
| 10 | Every state above is tested | the fake network (MSW) |

---

## 2. The file tree

```text
src/projects/weather/
├── types.ts             # WeatherReport, errors, parseWeather()
├── api.ts               # fetchWeather(city, signal)
├── useWeather.ts        # the state machine + cancellation
├── WeatherApp.tsx       # the four states, rendered
└── WeatherApp.test.tsx  # 7 tests, one per state and per failure mode
```

Note the direction of dependencies: `WeatherApp` → `useWeather` → `api` → `types`. Nothing imports upwards, and only `api.ts` knows that a URL exists (Part 15, file 02's rule, in miniature).

---

## 3. Types and the boundary

```ts
// src/projects/weather/types.ts
export interface WeatherNow {
  city: string;
  description: string;
  temperatureC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  observedAt: string;
}

export interface ForecastDay {
  date: string;               // YYYY-MM-DD
  minC: number;
  maxC: number;
  description: string;
}

export interface WeatherReport {
  now: WeatherNow;
  forecast: ForecastDay[];
}

export class CityNotFoundError extends Error {
  readonly city: string;

  constructor(city: string) {
    super(`We could not find a city called "${city}".`);
    this.name = 'CityNotFoundError';
    this.city = city;
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly requestId: string | undefined;

  constructor(message: string, status: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
  }
}

/** Turn an unknown API body into a WeatherReport, or throw. */
export function parseWeather(body: unknown): WeatherReport {
  if (typeof body !== 'object' || body === null) throw new ApiError('Malformed weather response', 502);
  const { now, forecast } = body as { now?: Partial<WeatherNow>; forecast?: Partial<ForecastDay>[] };

  if (now === undefined || typeof now.temperatureC !== 'number' || typeof now.city !== 'string') {
    throw new ApiError('Malformed weather response', 502);
  }

  const forecastDays: ForecastDay[] = Array.isArray(forecast)
    ? forecast
        .filter((day): day is ForecastDay =>
          day !== undefined && typeof day.date === 'string' && typeof day.minC === 'number' &&
          typeof day.maxC === 'number' && typeof day.description === 'string')
        .slice(0, 5)
    : [];

  return {
    now: {
      city: now.city,
      description: typeof now.description === 'string' ? now.description : 'Unknown',
      temperatureC: now.temperatureC,
      feelsLikeC: typeof now.feelsLikeC === 'number' ? now.feelsLikeC : now.temperatureC,
      humidity: typeof now.humidity === 'number' ? now.humidity : 0,
      windKph: typeof now.windKph === 'number' ? now.windKph : 0,
      observedAt: typeof now.observedAt === 'string' ? now.observedAt : new Date().toISOString(),
    },
    forecast: forecastDays,
  };
}
```

**Why parse instead of cast?** `const data = (await response.json()) as WeatherReport` is a lie: TypeScript checks nothing at runtime, and a missing `temperatureC` becomes `undefined°C` in the UI — or worse, `NaN` after arithmetic — at a point far from the cause. `parseWeather` is twenty lines that turn "the API changed" into an error message with a location.

⚠️ **A TypeScript detail worth knowing** (this lab hit it for real): declaring the error classes as `constructor(message: string, readonly status: number)` — a *parameter property* — produces `error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.` Modern configs (`erasableSyntaxOnly`, used by Node's type stripping and by this lab) forbid TypeScript-only syntax that cannot be erased: parameter properties, `enum`, `namespace`. The fix is the explicit field above — which is also easier for a reader to see.

---

## 4. The API layer

```ts
// src/projects/weather/api.ts
import { ApiError, CityNotFoundError, parseWeather, type WeatherReport } from './types';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

export async function fetchWeather(city: string, signal?: AbortSignal): Promise<WeatherReport> {
  const url = `${BASE}/weather?city=${encodeURIComponent(city.trim())}`;
  const response = await fetch(url, { signal });

  if (response.status === 404) throw new CityNotFoundError(city);
  if (!response.ok) {
    const requestId = response.headers.get('x-request-id') ?? undefined;
    throw new ApiError(`The weather service failed (${response.status}).`, response.status, requestId);
  }

  return parseWeather(await response.json());
}
```

| Line | Why it exists |
| --- | --- |
| `encodeURIComponent` | a city called "São Paulo" or "Washington, D.C." must not break the URL |
| `fetch(url, { signal })` | the caller owns cancellation; `fetch` cannot be cancelled without a signal |
| `response.status === 404` → `CityNotFoundError` | a domain answer, handled differently from a failure |
| `!response.ok` → `ApiError` with the status | `fetch` does **not** reject on 4xx/5xx; without this check you parse an error body as data (Part 15, file 04) |
| `x-request-id` captured | support can trace a user's failure to the server (Part 15, file 05) |
| `parseWeather(await response.json())` | the boundary check, in one place |

---

## 5. The state machine

```ts
// src/projects/weather/useWeather.ts
export type WeatherState =
  | { status: 'idle' }
  | { status: 'loading'; city: string }
  | { status: 'success'; city: string; report: WeatherReport }
  | { status: 'error'; city: string; message: string; retryable: boolean };

export function useWeather(): UseWeather {
  const [state, setState] = useState<WeatherState>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);
  const lastCityRef = useRef('');

  const run = useCallback(async (city: string) => {
    const trimmed = city.trim();
    if (trimmed === '') return;

    controllerRef.current?.abort();                    // a new search cancels the previous one
    const controller = new AbortController();
    controllerRef.current = controller;
    lastCityRef.current = trimmed;

    setState({ status: 'loading', city: trimmed });

    try {
      const report = await fetchWeather(trimmed, controller.signal);
      if (controller.signal.aborted) return;           // a newer search won; drop this result
      setState({ status: 'success', city: trimmed, report });
    } catch (cause) {
      if (controller.signal.aborted) return;           // an abort is not an error to show
      if (cause instanceof CityNotFoundError) {
        setState({ status: 'error', city: trimmed, message: cause.message, retryable: false });
        return;
      }
      const message = cause instanceof ApiError
        ? cause.message
        : 'We could not reach the weather service. Check your connection and try again.';
      setState({ status: 'error', city: trimmed, message, retryable: true });
    }
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);   // cancel on unmount

  const search = useCallback((city: string) => { void run(city); }, [run]);
  const retry = useCallback(() => { void run(lastCityRef.current); }, [run]);

  return { state, search, retry };
}
```

Four rules, each of which fixes a bug you would otherwise ship:

| Rule | The bug it prevents |
| --- | --- |
| A **union type** for the state, not three booleans | `isLoading && data && error` combinations that cannot happen yet are representable — and someone will render them |
| **Abort the previous request** on a new search | the first search's slow response overwriting the second's result (the "I searched Pune and got London's weather" bug) |
| **Check `signal.aborted`** before setting state | treating an intentional cancellation as a failure and showing an error for a search the user already replaced |
| **Cancel on unmount** in the effect cleanup | a state update after unmount, and a warning in development |

💡 **`retryable` is a design decision, not a technicality**: an unknown city will not become known because the user clicks again, so offering "Try again" would be a lie. A 500 or a dropped connection might be transient, so retrying is honest. Making that explicit in the state means the UI cannot accidentally show the wrong affordance.

---

## 6. Rendering the four states

```tsx
// src/projects/weather/WeatherApp.tsx (the state branches)
{state.status === 'idle' && <p>Enter a city to see the weather.</p>}

{state.status === 'loading' && (
  <p role="status" aria-live="polite">Loading weather for {state.city}…</p>
)}

{state.status === 'error' && (
  <div role="alert">
    <p>{state.message}</p>
    {state.retryable && <button type="button" onClick={retry}>Try again</button>}
  </div>
)}

{state.status === 'success' && <WeatherCard report={state.report} />}
```

```tsx
function WeatherCard({ report }: { report: WeatherReport }) {
  const { now, forecast } = report;
  return (
    <article aria-label={`Weather for ${now.city}`}>
      <h3>{now.city}</h3>
      <p data-testid="temperature">{Math.round(now.temperatureC)}°C</p>
      <p>{now.description} · feels like {Math.round(now.feelsLikeC)}°C</p>
      <dl>
        <dt>Humidity</dt><dd>{now.humidity}%</dd>
        <dt>Wind</dt><dd>{Math.round(now.windKph)} km/h</dd>
      </dl>
      {forecast.length > 0 && (
        <ul aria-label="Forecast">
          {forecast.map((day) => (
            <li key={day.date}>{day.date}: {Math.round(day.minC)}° / {Math.round(day.maxC)}° — {day.description}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
```

Notes on the details that matter: `role="status"` announces the loading message politely (a screen-reader user should not be left wondering), `role="alert"` interrupts for a failure, `aria-label` on the article gives the card an accessible name, `key={day.date}` is the natural stable key, and rounding happens in the view — the model keeps full precision.

---

## 7. Run it

```bash
npm install
npm run dev      # render <WeatherApp />
npm test -- --run src/projects/weather
```

Because the API does not exist in a tutorial environment, tests fake it with MSW. To click through the app in a browser, add your own dev handler (Part 13, file 05) or a tiny mock in `src/dev/` — the same trick the capstone project uses (Part 17, file 06).

---

## 8. The tests: every state, faked

```tsx
it('shows a loading state, then the weather', async () => {
  server.use(
    http.get('/api/weather', async () => { await delay(30); return HttpResponse.json(PUNE); }),
  );
  const user = userEvent.setup();
  render(<WeatherApp />);

  await search(user, 'Pune');
  expect(screen.getByRole('status')).toHaveTextContent('Loading weather for Pune…');

  expect(await screen.findByTestId('temperature')).toHaveTextContent('31°C');
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
});

it('reports an unknown city without offering a retry', async () => {
  server.use(http.get('/api/weather', () => HttpResponse.json({ error: 'city_not_found' }, { status: 404 })));
  const user = userEvent.setup();
  render(<WeatherApp />);

  await search(user, 'Atlantis');
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('We could not find a city called "Atlantis".');
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
});

it('maps a server failure to a retryable message, and retry works', async () => {
  let attempts = 0;
  server.use(http.get('/api/weather', () => {
    attempts += 1;
    return attempts === 1
      ? HttpResponse.json({ error: 'boom' }, { status: 500, headers: { 'x-request-id': 'req_42' } })
      : HttpResponse.json(PUNE);
  }));
  // …asserts the message, clicks "Try again", asserts the weather appears and attempts === 2
});

it('keeps only the latest search when one is still in flight', async () => {
  server.use(http.get('/api/weather', async ({ request }) => {
    const city = new URL(request.url).searchParams.get('city');
    if (city === 'Slow') { await delay(80); return HttpResponse.json({ now: { ...PUNE.now, city: 'Slow', temperatureC: 1 } }); }
    return HttpResponse.json({ now: { ...PUNE.now, city: 'Fast', temperatureC: 40 } });
  }));
  // …searches 'Slow', then 'Fast', asserts 40°C now and still 40°C after the slow response would have landed
});
```

```text
 ✓ src/projects/weather/WeatherApp.test.tsx (7 tests) 750ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
```

| Test | The failure mode it locks out |
| --- | --- |
| loading then weather | a spinner that never resolves into content |
| unknown city, no retry | offering a retry that cannot succeed |
| 500 → retryable → retry succeeds | a retry button that does nothing |
| network error → retryable | a raw `TypeError: Failed to fetch` shown to the user |
| stale search never wins | results arriving out of order |
| malformed body rejected | `undefined°` or `NaN°` in the UI |
| empty input does nothing | a pointless request (and a confusing error) |

⚠️ **A measured trap worth repeating** (this lab hit it while building the project): the app read `VITE_API_URL` from the test environment, where it was set to `http://localhost:3001/api`, while the MSW handlers matched `/api/weather`. Every test failed with the *network* message, because the request never matched a handler. **The test environment and the handlers must agree on the base URL** — either make it relative (`'/api'`) so handlers written as `/api/...` match, or write the handlers with the absolute URL. It is the same class of bug as a CORS failure: the code was fine; the two sides disagreed.

---

## 9. Common mistakes in this project

| # | Mistake | What goes wrong | Do instead |
| --- | --- | --- | --- |
| 1 | Not checking `response.ok` | a 500 body parsed as data | check and throw a typed error |
| 2 | `as WeatherReport` on the parsed body | runtime shape errors appear in the UI | parse/validate at the boundary |
| 3 | Three booleans (`isLoading`, `isError`, `isSuccess`) | impossible combinations get rendered | one discriminated union |
| 4 | No cancellation | stale results overwrite fresh ones | `AbortController` per request |
| 5 | Showing an error for an aborted request | cancelled searches look like failures | check `signal.aborted` first |
| 6 | Not cancelling on unmount | state updates after unmount | cleanup in `useEffect` |
| 7 | Retrying a 404 | a loop that cannot succeed | distinguish permanent from transient |
| 8 | Dropping the request id | no way to trace the failure | keep it on the error |
| 9 | Reading `import.meta.env` in components | the API base is decided in five places | one API module (Part 16, file 04) |
| 10 | Testing only the happy path | every bug above ships | fake the network and test all states (MSW) |
| 11 | Using `setTimeout` debouncing without cleanup | leaks and out-of-order updates | abort + clear timers in cleanup |
| 12 | `key={index}` for the forecast | wrong rows reused when the list changes | `key={day.date}` |

---

## 10. Practice (extend the project)

### Beginner

1. Add a "feels like" highlight when the difference from the actual temperature exceeds 3°C, with a test.
2. Show the observation time ("Updated 14:32") formatted with `Intl.DateTimeFormat`.
3. Disable the submit button while a request is in flight, and test that the double-submit cannot start two requests.

### Intermediate

1. Add recent searches (last five) with click-to-search, persisted in `localStorage` — reuse the defensive parsing from the todo project.
2. Debounce the search as the user types (300 ms) *and* keep the submit button working; test that typing quickly performs one request (Part 13's fake timers).
3. Add a unit toggle (°C/°F) stored in state, and convert in the view; test that switching does not refetch.

### Challenge

1. Add a second endpoint (hourly forecast) that loads independently: the card must render as soon as *its* data is ready, and a failure of the hourly endpoint must not blank the current conditions. This is the "partial failure" case from Part 15, file 04.
2. Replace the hook with TanStack Query (`useQuery({ queryKey: ['weather', city], queryFn: ({ signal }) => fetchWeather(city, signal) })`), and compare: what code disappeared (loading/error/abort), what you had to add (query keys, enabling the query on submit), and how the stale-request test changes.
3. Add offline behaviour: when `navigator.onLine` is false, show the last successful report with a clear "offline — showing data from 14:32" note, and test both the online and offline paths.

---

## 11. Solutions

### Beginner

1. `{Math.abs(now.feelsLikeC - now.temperatureC) > 3 && <p>Feels noticeably different.</p>}`; the test covers both sides of the threshold (4°C difference → shown, 1°C → not).
2. `new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(now.observedAt))` — locale-correct without a date library.
3. `disabled={state.status === 'loading'}`; the test clicks twice quickly and asserts the handler ran once (with MSW counting requests).

### Intermediate

1. A `searches` array in `localStorage` with the same validate-on-read pattern; clicking one calls `search(city)` and moves it to the front.
2. `useDebouncedValue(city, 300)` from Part 10, driving a `search` effect; the test types "Pune" one character at a time with fake timers advanced once, and asserts a single request. Keep the button so users can search immediately.
3. `unit` in state and a `toDisplay(tempC, unit)` helper; the test asserts the value changes and the query count stays at one — the conversion is a view concern.

### Challenge

1. Two `useQuery`-style hooks (or one hook with two independent requests), each with its own state, and a card that renders the sections it has. On the hourly failure, show an inline retry *inside* that section only — which is exactly what a per-widget error boundary or per-section error state is for.
2. Query moves the mechanics into the library: you delete the manual `useState`, the `AbortController`, and the `useEffect`; you add a `queryKey` including the city and (usually) `enabled: city !== ''` so nothing fetches before a search. The stale-request test becomes an assertion about the query key: two cities are two cache entries, and the UI shows the current key's data — no manual cancellation needed.
3. Listen to `online`/`offline` events (with cleanup), keep the last success in state, and render a labelled stale banner when offline; tests dispatch the events and assert the banner plus the retained data.

---

## 12. Summary

- **A request has four states**: `idle`, `loading`, `success`, `error` — modelled as a **discriminated union** so impossible combinations cannot be rendered.
- **Parse at the boundary, never cast**: `parseWeather` turns a changed API into a clear error instead of `undefined°` (and the `erasableSyntaxOnly` error was a real, current TypeScript lesson about what cannot be erased).
- **Check `response.ok`** — `fetch` does not reject on 404/500 — and map statuses to *domain* errors (`CityNotFoundError` versus `ApiError`).
- **Cancel stale requests and unmounts** with `AbortController`, and treat an abort as silence, not as an error to display.
- **`retryable` is a UX decision baked into the state**: retry a 500 or a dropped connection, never an unknown city.
- **The API base URL lives in one module** and must agree with the test environment; the lab's own failure (`/api/weather` handlers versus an absolute `VITE_API_URL`) is the exact bug to check for when *every* test fails at once.
- **Seven tests, one per state and failure mode**, using MSW to fake delays, 404s, 500s, network errors and out-of-order responses — including the stale-search test that no amount of manual clicking would have caught reliably.

---

**What's next →** [`04-crud-app.md`](./04-crud-app.md) combines everything so far into a routed CRUD app: list, detail, create, edit and delete against a fake API, with server-state caching and invalidation (TanStack Query), form validation that protects the network, navigation that lands where the user expects, and eight tests that cover the whole lifecycle.
