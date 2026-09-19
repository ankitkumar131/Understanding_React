// Project 3 tests — the four states, with MSW as the fake network.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse, delay } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test/server';
import { WeatherApp } from './WeatherApp';

const PUNE = {
  now: {
    city: 'Pune', description: 'Sunny', temperatureC: 31.4, feelsLikeC: 34.1,
    humidity: 42, windKph: 12.6, observedAt: '2026-09-19T10:00:00.000Z',
  },
  forecast: [
    { date: '2026-09-20', minC: 22.1, maxC: 32.5, description: 'Sunny' },
    { date: '2026-09-21', minC: 21.8, maxC: 30.2, description: 'Cloudy' },
  ],
};

async function search(user: ReturnType<typeof userEvent.setup>, city: string) {
  await user.type(screen.getByLabelText('City'), city);
  await user.click(screen.getByRole('button', { name: 'Get weather' }));
}

describe('<WeatherApp />', () => {
  it('starts idle and explains what to do', () => {
    render(<WeatherApp />);
    expect(screen.getByText('Enter a city to see the weather.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get weather' })).toBeDisabled();
  });

  it('shows a loading state, then the weather', async () => {
    server.use(
      http.get('/api/weather', async () => {
        await delay(30);
        return HttpResponse.json(PUNE);
      }),
    );
    const user = userEvent.setup();
    render(<WeatherApp />);

    await search(user, 'Pune');
    expect(screen.getByRole('status')).toHaveTextContent('Loading weather for Pune…');

    expect(await screen.findByTestId('temperature')).toHaveTextContent('31°C');
    expect(screen.getByRole('article', { name: 'Weather for Pune' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('reports an unknown city without offering a retry', async () => {
    server.use(
      http.get('/api/weather', () => HttpResponse.json({ error: 'city_not_found' }, { status: 404 })),
    );
    const user = userEvent.setup();
    render(<WeatherApp />);

    await search(user, 'Atlantis');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not find a city called "Atlantis".');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('maps a server failure to a retryable message, and retry works', async () => {
    let attempts = 0;
    server.use(
      http.get('/api/weather', () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ error: 'boom' }, { status: 500, headers: { 'x-request-id': 'req_42' } })
          : HttpResponse.json(PUNE);
      }),
    );
    const user = userEvent.setup();
    render(<WeatherApp />);

    await search(user, 'Pune');
    expect(await screen.findByRole('alert')).toHaveTextContent('The weather service failed (500).');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('temperature')).toHaveTextContent('31°C');
    expect(attempts).toBe(2);
  });

  it('treats a network failure as retryable', async () => {
    server.use(http.get('/api/weather', () => HttpResponse.error()));
    const user = userEvent.setup();
    render(<WeatherApp />);

    await search(user, 'Pune');
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your connection');
  });

  it('keeps only the latest search when one is still in flight', async () => {
    server.use(
      http.get('/api/weather', async ({ request }) => {
        const city = new URL(request.url).searchParams.get('city');
        if (city === 'Slow') {
          await delay(80);
          return HttpResponse.json({ now: { ...PUNE.now, city: 'Slow', temperatureC: 1 } });
        }
        return HttpResponse.json({ now: { ...PUNE.now, city: 'Fast', temperatureC: 40 } });
      }),
    );
    const user = userEvent.setup();
    render(<WeatherApp />);

    await search(user, 'Slow');
    await user.clear(screen.getByLabelText('City'));
    await search(user, 'Fast');

    expect(await screen.findByTestId('temperature')).toHaveTextContent('40°C');
    await delay(120);
    expect(screen.getByTestId('temperature')).toHaveTextContent('40°C');      // the slow response never lands
  });

  it('rejects a malformed body instead of rendering undefined degrees', async () => {
    server.use(http.get('/api/weather', () => HttpResponse.json({ now: { city: 'Pune' } })));
    const user = userEvent.setup();
    render(<WeatherApp />);

    await search(user, 'Pune');
    expect(await screen.findByRole('alert')).toHaveTextContent('Malformed weather response');
  });
});
