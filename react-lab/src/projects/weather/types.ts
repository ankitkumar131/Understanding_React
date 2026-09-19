// Project 3 — types describe the contract with the API, and parsing defends it at the boundary.
export interface WeatherNow {
  city: string;
  description: string;
  temperatureC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  observedAt: string;              // ISO string from the API
}

export interface ForecastDay {
  date: string;                    // YYYY-MM-DD
  minC: number;
  maxC: number;
  description: string;
}

export interface WeatherReport {
  now: WeatherNow;
  forecast: ForecastDay[];
}

/** Thrown by the API layer when the API says the city is unknown. */
export class CityNotFoundError extends Error {
  readonly city: string;

  constructor(city: string) {
    super(`We could not find a city called "${city}".`);
    this.name = 'CityNotFoundError';
    this.city = city;
  }
}

/** Thrown for anything else the API returns (or fails to return). */
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

interface ApiWeatherBody {
  now?: Partial<WeatherNow>;
  forecast?: Partial<ForecastDay>[];
}

/**
 * Turn an unknown API body into a WeatherReport, or throw.
 * Every field is checked because the network is outside your control: a missing
 * field that reaches the UI becomes `undefined°` and a confused user.
 */
export function parseWeather(body: unknown): WeatherReport {
  if (typeof body !== 'object' || body === null) throw new ApiError('Malformed weather response', 502);
  const { now, forecast } = body as ApiWeatherBody;

  if (now === undefined || typeof now.temperatureC !== 'number' || typeof now.city !== 'string') {
    throw new ApiError('Malformed weather response', 502);
  }

  const forecastDays: ForecastDay[] = Array.isArray(forecast)
    ? forecast
        .filter((day): day is ForecastDay =>
          day !== undefined &&
          typeof day.date === 'string' &&
          typeof day.minC === 'number' &&
          typeof day.maxC === 'number' &&
          typeof day.description === 'string')
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
