// Project 3 — the API layer: one place that knows URLs, statuses and parsing.
import { ApiError, CityNotFoundError, parseWeather, type WeatherReport } from './types';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

export async function fetchWeather(city: string, signal?: AbortSignal): Promise<WeatherReport> {
  const url = `${BASE}/weather?city=${encodeURIComponent(city.trim())}`;
  const response = await fetch(url, { signal });

  if (response.status === 404) throw new CityNotFoundError(city);
  if (!response.ok) {
    // Read the API's error body if it has one; never show a raw status to the user.
    const requestId = response.headers.get('x-request-id') ?? undefined;
    throw new ApiError(`The weather service failed (${response.status}).`, response.status, requestId);
  }

  return parseWeather(await response.json());
}
