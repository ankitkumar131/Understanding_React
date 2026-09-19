// Project 3 — a hook that owns the whole request lifecycle: idle → loading → success | error.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWeather } from './api';
import { ApiError, CityNotFoundError, type WeatherReport } from './types';

export type WeatherState =
  | { status: 'idle' }
  | { status: 'loading'; city: string }
  | { status: 'success'; city: string; report: WeatherReport }
  | { status: 'error'; city: string; message: string; retryable: boolean };

export interface UseWeather {
  state: WeatherState;
  search(city: string): void;
  retry(): void;
}

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
      const message =
        cause instanceof ApiError
          ? cause.message
          : 'We could not reach the weather service. Check your connection and try again.';
      setState({ status: 'error', city: trimmed, message, retryable: true });
    }
  }, []);

  // Cancel any in-flight request when the component unmounts.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const search = useCallback((city: string) => { void run(city); }, [run]);
  const retry = useCallback(() => { void run(lastCityRef.current); }, [run]);

  return { state, search, retry };
}
