// Project 6 — the data layer: one module per feature owns its endpoints.
import type { Task, TaskDraft } from '../../types';

const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
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
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const tasksApi = {
  list: (signal?: AbortSignal) => request<Task[]>('/tasks', { signal }),
  create: (draft: TaskDraft) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify({ ...draft, status: 'todo' }) }),
  setStatus: (id: string, status: Task['status']) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  remove: (id: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
};
