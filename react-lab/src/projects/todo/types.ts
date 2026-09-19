// Project 2 — the data model first: one type, used everywhere.
export interface Todo {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
}

export type Filter = 'all' | 'active' | 'completed';

export function createTodo(title: string): Todo {
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    done: false,
    createdAt: Date.now(),
  };
}
