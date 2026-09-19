// Project 4 — the API layer for the library: five endpoints, one error shape.
import type { Book, BookDraft } from './types';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  // Declared as a field, not a constructor parameter property: `erasableSyntaxOnly`
  // (tsconfig) forbids TypeScript-only syntax that cannot be stripped.
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(body.message ?? `Request failed with ${response.status}`, response.status);
  }
  if (response.status === 204) return undefined as T;         // DELETE returns no body
  return (await response.json()) as T;
}

export const booksApi = {
  list: (signal?: AbortSignal) => request<Book[]>('/books', { signal }),
  get: (id: string, signal?: AbortSignal) => request<Book>(`/books/${id}`, { signal }),
  create: (draft: BookDraft) => request<Book>('/books', { method: 'POST', body: JSON.stringify(draft) }),
  update: (id: string, draft: BookDraft) => request<Book>(`/books/${id}`, { method: 'PUT', body: JSON.stringify(draft) }),
  remove: (id: string) => request<void>(`/books/${id}`, { method: 'DELETE' }),
};
