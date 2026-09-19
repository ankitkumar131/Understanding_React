import { http, HttpResponse } from 'msw';

export const sampleProducts = [
  { id: 'p1', name: 'Desk Lamp', priceMinor: 129950 },
  { id: 'p2', name: 'Wireless Mouse', priceMinor: 249900 },
];

export const handlers = [
  http.get('/api/products', () => HttpResponse.json(sampleProducts)),
];
