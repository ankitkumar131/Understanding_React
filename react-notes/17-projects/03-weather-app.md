# Project 3 — Weather App: Real APIs, Async, Loading and Error States

> **Part 17 · Projects · Project 3 of 6**

Why this project exists: projects 1 and 2 kept data in memory. Real apps get data from a
server, and that changes everything — the data may not arrive, may arrive late, may arrive
wrong, and may arrive *after you stopped caring*. This project builds a weather search against
a real, keyless public API and handles every one of those cases properly: `fetch` + `response.ok`,
`async`/`await`, TypeScript types for data you do not control, request cancellation, and the
four UI states.

**Concepts used:** `fetch`, `async`/`await`, response typing, narrowing `unknown`, loading /
error / empty / success states, request cancellation with `AbortController`, debouncing,
`useEffect` cleanup, environment configuration.

**Time:** 2–3 hours.

---

## 1. The API

We use **Open-Meteo** (<https://open-meteo.com>) — free, no API key, CORS enabled. Two
endpoints:

```bash
# 1. Geocoding: name → coordinates
curl "https://geocoding-api.open-meteo.com/v1/search?name=Berlin&count=3"

# 2. Forecast: coordinates → weather
curl "https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5"
```

⚠️ **Read the API's own documentation before trusting any field name here.** These notes were
written against Open-Meteo's current docs, but a public API can add or rename fields. The
*technique* — type what you verified, guard what you did not — is the transferable skill.

---

## 2. Set up

```bash
npm create vite@latest weather -- --template react-ts
cd weather && npm install && npm run dev
```

```text
weather/src/
├── App.tsx
├── config.ts
├── types.ts
├── lib/
│   ├── http.ts          # the fetch wrapper (Part 15 file 04)
│   └── weatherApi.ts    # the two endpoints
├── hooks/
│   └── useWeather.ts    # orchestration: loading, error, cancellation
└── components/
    ├── SearchForm.tsx
    ├── ResultList.tsx
    ├── CurrentWeather.tsx
    ├── Forecast.tsx
    └── StatusPanels.tsx  # Loading, ErrorPanel, EmptyState
```

---

## 3. Step 1 — Types for data you do not control

```ts
// src/types.ts

/** What the geocoding endpoint returns — only the fields we use. */
export interface GeoResult {
  id: number;
  name: string;
  country: string;
  admin1?: string;          // region/state — optional, the API omits it for some places
  latitude: number;
  longitude: number;
}

/** WMO weather interpretation codes, mapped to human text. */
export interface CurrentWeather {
  time: string;
  temperatureC: number;
  windSpeedKmh: number;
  code: number;
  description: string;
}

export interface DailyForecast {
  date: string;
  maxC: number;
  minC: number;
}

export interface Forecast {
  current: CurrentWeather;
  daily: DailyForecast[];
}

/** Our own error type: a `kind` we can switch on, not a string we have to parse. */
export type ApiErrorKind = 'network' | 'notFound' | 'server' | 'aborted' | 'unknown';

export class ApiError extends Error {
  constructor(readonly kind: ApiErrorKind, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
```

💡 **Type only what you use.** The real response has dozens of fields. Typing all of them is
wasted work and a maintenance burden; typing the six you render means a change elsewhere
cannot break you.

⚠️ **A TypeScript interface is a *claim*, not a check.** The compiler cannot see the network.
If the API returns `temperature_2m: "12.3"` (a string), your type says `number` and your app
renders `"12.3" °C` — or crashes on `.toFixed()`. For data you do not control, validate at the
boundary (Part 8 file 05 shows Zod, which does this properly).

---

## 4. Step 2 — The fetch wrapper

```ts
// src/lib/http.ts
import { ApiError } from '../types';

/**
 * The only place in the app that calls fetch.
 * - Checks response.ok (fetch does NOT reject on 404/500)
 * - Throws a typed ApiError
 * - Accepts an AbortSignal for cancellation
 */
export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { accept: 'application/json' } });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new ApiError('aborted', 'Request cancelled');
    }
    throw new ApiError('network', 'Cannot reach the server. Check your connection.');
  }

  if (!response.ok) {
    const kind = response.status === 404 ? 'notFound' : response.status >= 500 ? 'server' : 'unknown';
    throw new ApiError(kind, `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}
```

**Line by line**

- `try/catch` around `fetch` — `fetch` rejects **only** on network failure or abort. A 500
  resolves normally. This is the most-misunderstood fact about `fetch` (Part 7 file 02).
- `DOMException` / `AbortError` — how a cancelled request presents itself. You must
  distinguish it, or every keystroke that cancels the previous search logs an error.
- `if (!response.ok)` — the check everyone forgets. Without it, a 500 that returns HTML
  becomes `SyntaxError: Unexpected token '<' in JSON at position 0`, and the real cause is
  invisible.
- `<T>` — the caller declares the expected shape. It is a cast, not a validation (section 3).
- `signal` — the hook that makes cancellation possible (section 6).

---

## 5. Step 3 — The two endpoints

```ts
// src/lib/weatherApi.ts
import { getJson } from './http';
import type { CurrentWeather, DailyForecast, Forecast, GeoResult } from '../types';
import { config } from '../config';

// ---- raw response shapes (what the API actually sends) ----
interface GeoResponse { results?: GeoResult[] }

interface ForecastResponse {
  current?: { time: string; temperature_2m: number; wind_speed_10m: number; weather_code: number };
  daily?: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
}

const WMO: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Heavy showers', 82: 'Violent showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with heavy hail',
};

export function describeCode(code: number): string {
  return WMO[code] ?? 'Unknown conditions';
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const url = `${config.geocodingUrl}/v1/search?name=${encodeURIComponent(query)}&count=5`;
  const data = await getJson<GeoResponse>(url, signal);
  return data.results ?? [];                  // the API omits `results` when nothing matches
}

export async function getForecast(lat: number, lon: number, signal?: AbortSignal): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '5',
  });
  const data = await getJson<ForecastResponse>(`${config.forecastUrl}/v1/forecast?${params}`, signal);

  // --- Translate the API's shape into ours, in ONE place ---
  if (!data.current) throw new ApiError('unknown', 'The forecast response was missing current data');

  const current: CurrentWeather = {
    time: data.current.time,
    temperatureC: data.current.temperature_2m,
    windSpeedKmh: data.current.wind_speed_10m,
    code: data.current.weather_code,
    description: describeCode(data.current.weather_code),
  };

  const daily: DailyForecast[] = (data.daily?.time ?? []).map((date, index) => ({
    date,
    maxC: data.daily?.temperature_2m_max[index] ?? 0,
    minC: data.daily?.temperature_2m_min[index] ?? 0,
  }));

  return { current, daily };
}
```

**Line by line**

- `encodeURIComponent(query)` — **never build a URL by concatenating user input.** A query
  containing `&` or `#` changes the meaning of the request; a query containing certain
  characters can break it entirely.
- `new URLSearchParams({...})` — the safe way to build a query string. It encodes everything
  and is readable.
- Raw response interfaces marked with `?` — because a real API *does* omit fields (an unknown
  city returns no `results` key at all). Typing them as required is a lie that becomes a
  runtime crash.
- The translation block — **the boundary**. Snake_case in, camelCase out; the rest of the app
  never sees `temperature_2m` (Part 15 file 03).
- `?? []` and `?? 0` — explicit fallbacks, so an unexpected shape degrades instead of
  throwing `Cannot read properties of undefined`.

```ts
// src/config.ts
export const config = {
  geocodingUrl: import.meta.env.VITE_GEOCODING_URL ?? 'https://geocoding-api.open-meteo.com',
  forecastUrl: import.meta.env.VITE_FORECAST_URL ?? 'https://api.open-meteo.com',
} as const;
```

```bash
# .env.development — optional; the defaults above already work
VITE_GEOCODING_URL=https://geocoding-api.open-meteo.com
VITE_FORECAST_URL=https://api.open-meteo.com
```

---

## 6. Step 4 — The hook: loading, error and cancellation

```tsx
// src/hooks/useWeather.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { getForecast, searchPlaces } from '../lib/weatherApi';
import { ApiError, type Forecast, type GeoResult } from '../types';

type Status = 'idle' | 'searching' | 'loading' | 'ready' | 'error';

interface WeatherState {
  status: Status;
  places: GeoResult[];
  selected: GeoResult | null;
  forecast: Forecast | null;
  error: string | null;
}

const INITIAL: WeatherState = {
  status: 'idle', places: [], selected: null, forecast: null, error: null,
};

export function useWeather() {
  const [state, setState] = useState<WeatherState>(INITIAL);
  /** The signal of the request currently in flight, so we can cancel it. */
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (query: string): Promise<void> => {
    abortRef.current?.abort();                          // cancel whatever was in flight
    const controller = new AbortController();
    abortRef.current = controller;

    if (query.trim().length < 2) {
      setState(INITIAL);
      return;
    }

    setState((prev) => ({ ...prev, status: 'searching', error: null }));
    try {
      const places = await searchPlaces(query.trim(), controller.signal);
      if (controller.signal.aborted) return;            // a newer request superseded this one
      setState({ ...INITIAL, status: 'ready', places });
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'aborted') return;   // not an error
      setState({ ...INITIAL, status: 'error', error: messageFor(error) });
    }
  }, []);

  const select = useCallback(async (place: GeoResult): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, status: 'loading', selected: place, error: null }));
    try {
      const forecast = await getForecast(place.latitude, place.longitude, controller.signal);
      if (controller.signal.aborted) return;
      setState((prev) => ({ ...prev, status: 'ready', forecast, places: [] }));
    } catch (error) {
      if (error instanceof ApiError && error.kind === 'aborted') return;
      setState((prev) => ({ ...prev, status: 'error', error: messageFor(error) }));
    }
  }, []);

  // Cancel any in-flight request if the component unmounts mid-request
  useEffect(() => () => abortRef.current?.abort(), []);

  return { ...state, search, select };
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.kind) {
      case 'network':  return 'Cannot reach the weather service. Check your connection.';
      case 'notFound': return 'That place was not found.';
      case 'server':   return 'The weather service is having problems. Try again shortly.';
      default:         return 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}
```

**Line by line**

- `abortRef.current?.abort()` — cancels the previous request **before** starting a new one.
  Without this, typing "Berlin" then "Paris" can resolve in either order, and the user sees
  Berlin's weather under Paris's name. This is a **race condition**, and it is the single most
  common async bug in React (Part 7 file 04).
- `if (controller.signal.aborted) return;` — the second line of defence. Even if the response
  arrives, we ignore it when it is no longer the current request.
- `'aborted'` is not an error — cancelling is *our* doing, so it must not show an error panel.
- The cleanup `useEffect(() => () => abortRef.current?.abort(), [])` — if the user navigates
  away mid-request, we cancel rather than calling `setState` on an unmounted component.
- Returning `{ ...state, search, select }` — a single object the component destructures.

⚠️ **The React 18 note:** "Can't perform a React state update on an unmounted component" is no
longer warned about in React 18+, because it was almost never a real leak. Cancellation is
still worth doing — not to silence a warning, but because it stops wasted network traffic and
stale updates.

---

## 7. Step 5 — The UI: four states, always

```tsx
// src/components/StatusPanels.tsx
export function Loading({ label }: { label: string }) {
  return <p role="status" aria-live="polite">{label}…</p>;
}

export function ErrorPanel({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{ border: '1px solid #c33', padding: '1rem', borderRadius: 8 }}>
      <p style={{ margin: 0 }}>{message}</p>
      {onRetry && <button onClick={onRetry} style={{ marginTop: '0.5rem' }}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ textAlign: 'center', color: '#666', padding: '2rem 0' }}>
      <p style={{ fontWeight: 600, margin: 0 }}>{title}</p>
      <p style={{ margin: '0.25rem 0 0' }}>{hint}</p>
    </div>
  );
}
```

```tsx
// src/App.tsx
import { useState } from 'react';
import { CurrentWeather } from './components/CurrentWeather';
import { Forecast } from './components/Forecast';
import { ResultList } from './components/ResultList';
import { SearchForm } from './components/SearchForm';
import { EmptyState, ErrorPanel, Loading } from './components/StatusPanels';
import { useWeather } from './hooks/useWeather';

export default function App() {
  const { status, places, selected, forecast, error, search, select } = useWeather();
  const [query, setQuery] = useState('');

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 560, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>Weather</h1>

      <SearchForm query={query} onChange={setQuery} onSearch={search} isBusy={status === 'searching'} />

      {status === 'error' && <ErrorPanel message={error ?? 'Unknown error'} onRetry={() => search(query)} />}
      {status === 'searching' && <Loading label="Searching" />}
      {status === 'loading' && <Loading label={`Loading weather for ${selected?.name ?? '…'}`} />}

      {status === 'ready' && places.length === 0 && !forecast && (
        <EmptyState title="No places found" hint="Try a different spelling, or add a country: 'Paris, France'." />
      )}

      {status === 'ready' && places.length > 0 && <ResultList places={places} onSelect={select} />}

      {status === 'ready' && forecast && selected && (
        <>
          <CurrentWeather place={selected} current={forecast.current} />
          <Forecast days={forecast.daily} />
        </>
      )}

      {status === 'idle' && (
        <EmptyState title="Search for a city" hint="Try 'Berlin', 'Lagos' or 'São Paulo'." />
      )}
    </main>
  );
}
```

**Line by line**

- `role="status"` / `aria-live="polite"` — a screen reader announces "Searching…" when it
  appears. Without it, a loading state is invisible to non-sighted users.
- `role="alert"` — announced immediately. Correct for errors, wrong for loading (it
  interrupts).
- The **four states are exhaustive**: `idle`, busy (`searching`/`loading`), `error`, `ready`
  (with an empty sub-case). Every screen that loads data needs all four (Part 15 file 04).
- `error ?? 'Unknown error'` — TypeScript knows `error` is `string | null`, and it will not
  let you render a possibly-null value into a required prop. That is the type system earning
  its keep.

---

## 8. Step 6 — Debounce the search (one line that saves a lot)

```tsx
// src/components/SearchForm.tsx
import { useEffect, type FormEvent } from 'react';

interface SearchFormProps {
  query: string;
  onChange: (value: string) => void;
  onSearch: (value: string) => void;
  isBusy: boolean;
}

export function SearchForm({ query, onChange, onSearch, isBusy }: SearchFormProps) {
  // Wait 350 ms after the user stops typing before searching
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(() => onSearch(query), 350);
    return () => clearTimeout(timer);      // cleanup: the next keystroke cancels this timer
  }, [query, onSearch]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSearch(query);                        // Enter searches immediately
  }

  return (
    <form onSubmit={handleSubmit} role="search">
      <label htmlFor="place">City</label>
      <input
        id="place"
        value={query}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Berlin"
        autoComplete="off"
        aria-busy={isBusy}
      />
      <button type="submit" disabled={query.trim().length < 2}>Search</button>
    </form>
  );
}
```

🔍 **Why the cleanup *is* the debounce:** every keystroke changes `query`, which re-runs the
effect, which first runs the *previous* cleanup — clearing the pending timer. Only the last
keystroke's timer survives to fire. Debounce is not a library; it is an effect with a cleanup
function (Part 4 file 03).

⚠️ **Debounce alone does not fix races.** It reduces them. A user can still press Enter twice
quickly, and two responses can still arrive out of order. The `AbortController` in the hook is
what makes the result correct; the debounce just makes it cheap.

---

## 9. Run it

```bash
npm run dev
```

**Expected result:** type "ber" — nothing happens (< 2 chars). Type "berlin" — after ~350 ms a
list of Berlins appears. Click one — "Loading weather for Berlin…" then the current
temperature and a 5-day forecast. Switch to DevTools → Network → "Offline" and search: a
friendly error panel with a working "Try again".

```bash
npx tsc -b --noEmit && npm run lint
```

**Now break it on purpose** (this is where the learning is):

```text
1. Remove `if (!response.ok)` in http.ts, then request a nonsense URL that 404s.
   → You get "Unexpected token '<'" instead of a clean 404 message.
2. Remove `abortRef.current?.abort()`. Type "Berlin" then quickly "Paris".
   → Sometimes Berlin's forecast appears under Paris.
3. Remove `encodeURIComponent`. Search for "Rio & Janeiro".
   → The request breaks or returns the wrong place.
4. Type the raw response interfaces without `?` on `results`, then search "zzzz".
   → `Cannot read properties of undefined (reading 'map')` — the crash your `?` prevented.
```

---

## 10. Common mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Not checking `response.ok` | `Unexpected token '<' in JSON` | The `getJson` wrapper |
| No cancellation | Stale results overwrite fresh ones | `AbortController` + `signal.aborted` check |
| Treating `AbortError` as a failure | Error panel flashes while typing | Check `kind === 'aborted'` |
| String-concatenated query strings | Broken searches, injection | `URLSearchParams` / `encodeURIComponent` |
| Typing optional API fields as required | Crash on an empty result set | `?` + `?? []` |
| Rendering before the data arrives | `undefined.toFixed is not a function` | Guard with the status state |
| No loading state | The app looks frozen | `role="status"` panel |
| `console.log` as error handling | Users see nothing | An `ErrorPanel` |
| Debounce without cleanup | Every keystroke fires a request | `return () => clearTimeout(timer)` |

---

## 11. Exercises

### Beginner
1. Show the temperature in °F as well, using a unit toggle in the UI (not another API call).
2. Add a "feels like" field to the request and display it.

### Intermediate
1. Cache the last 10 forecasts in a `Map` keyed by place id, so re-selecting a city is
   instant. Add a "Refresh" button that bypasses the cache.
2. Replace the hand-rolled hook with TanStack Query (Part 9 file 06) and delete the loading,
   error and cancellation code. Count the lines you removed.

### Challenge
1. Validate the API response with Zod at the boundary, so a changed field name produces a
   clear error instead of a crash.
2. Add a retry-with-backoff for `kind === 'network'` (max 3 attempts) and surface a single
   message when all attempts fail. Test it with fake timers.

---

## 12. Solutions

### Beginner
1. `const toF = (c: number) => c * 9 / 5 + 32;` and a `unit` state in `App`. Converting in the
   view (not the API layer) means one request serves both — and the raw data stays canonical.
2. Add `apparent_temperature` to the `current=` parameter list, extend `ForecastResponse` and
   `CurrentWeather`, and render it. Note how one field addition touches exactly three places —
   which is the boundary pattern paying off.

### Intermediate
1. ```ts
   const cache = useRef(new Map<number, Forecast>());
   // in select(): const hit = cache.current.get(place.id);
   // if (hit) { setState(...); return; }
   ```
   A `useRef` (not `useState`) because the cache should not trigger a re-render when it
   changes (Part 4 file 04).
2. `useQuery({ queryKey: ['forecast', place.id], queryFn: () => getForecast(...), enabled: !!place })`
   gives you caching, retries, cancellation and deduplication for free. The typical result:
   ~60 lines of hook deleted, replaced by ~8. That is the argument for server-state libraries
   (Part 9 file 06).

### Challenge
1. ```ts
   const CurrentSchema = z.object({
     time: z.string(), temperature_2m: z.number(), wind_speed_10m: z.number(), weather_code: z.number(),
   });
   const parsed = CurrentSchema.safeParse(data.current);
   if (!parsed.success) throw new ApiError('unknown', `Unexpected forecast shape: ${parsed.error.issues[0].path.join('.')}`);
   ```
   The error message names the missing field, which turns a 20-minute mystery into a
   20-second read.
2. ```ts
   for (let attempt = 0; attempt < 3; attempt++) {
     try { return await getForecast(lat, lon, signal); }
     catch (e) { if (!(e instanceof ApiError && e.kind === 'network')) throw e;
                 await new Promise((r) => setTimeout(r, 2 ** attempt * 500)); }
   }
   ```
   Test with `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(500)` and assert three
   `fetch` calls but **one** surfaced error.

---

## 13. What you proved you can do

- [ ] Call a real API with `fetch` and handle the fact that it resolves on HTTP errors.
- [ ] Type a response you do not control, marking genuinely optional fields.
- [ ] Translate an API's shape into your app's shape in one place.
- [ ] Build safe URLs with `URLSearchParams`.
- [ ] Cancel in-flight requests and ignore superseded responses.
- [ ] Distinguish a cancellation from a failure.
- [ ] Render all four states, with accessible live regions.
- [ ] Debounce with an effect and its cleanup.

---

**What's next →** [`04-crud-app.md`](./04-crud-app.md) puts all of this behind a router: a
list page, a detail page, create/edit forms with validation, optimistic updates, and a real
REST API — the shape of most business applications you will be paid to build.
