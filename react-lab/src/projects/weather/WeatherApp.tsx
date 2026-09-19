// Project 3 — the view: four states, each rendered deliberately.
import { useState, type FormEvent } from 'react';
import { useWeather } from './useWeather';
import type { WeatherReport } from './types';

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
            <li key={day.date}>
              {day.date}: {Math.round(day.minC)}° / {Math.round(day.maxC)}° — {day.description}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function WeatherApp() {
  const [city, setCity] = useState('');
  const { state, search, retry } = useWeather();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    search(city);
  };

  return (
    <section aria-labelledby="weather-heading">
      <h2 id="weather-heading">Weather</h2>

      <form onSubmit={handleSubmit}>
        <label htmlFor="city">City</label>
        <input
          id="city"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="Pune"
          autoComplete="off"
        />
        <button type="submit" disabled={city.trim() === ''}>Get weather</button>
      </form>

      {state.status === 'idle' && <p>Enter a city to see the weather.</p>}

      {state.status === 'loading' && (
        <p role="status" aria-live="polite">Loading weather for {state.city}…</p>
      )}

      {state.status === 'error' && (
        <div role="alert">
          <p>{state.message}</p>
          {state.retryable && (
            <button type="button" onClick={retry}>Try again</button>
          )}
        </div>
      )}

      {state.status === 'success' && <WeatherCard report={state.report} />}
    </section>
  );
}
