// Project 2 — all the state logic in one hook, so the components stay about rendering.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createTodo, type Filter, type Todo } from './types';

const STORAGE_KEY = 'react-lab:todos';

function loadInitial(): Todo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Todo =>
        typeof item === 'object' && item !== null &&
        typeof (item as Todo).id === 'string' && typeof (item as Todo).title === 'string' &&
        typeof (item as Todo).done === 'boolean',
    );
  } catch {
    return [];                       // corrupt storage must not break the app
  }
}

export interface UseTodos {
  todos: Todo[];
  visible: Todo[];
  filter: Filter;
  remaining: number;
  add(title: string): void;
  toggle(id: string): void;
  remove(id: string): void;
  clearCompleted(): void;
  setFilter(filter: Filter): void;
}

export function useTodos(): UseTodos {
  const [todos, setTodos] = useState<Todo[]>(loadInitial);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  const add = useCallback((title: string) => {
    const trimmed = title.trim();
    if (trimmed === '') return;                       // empty input is not a todo
    setTodos((current) => [createTodo(trimmed), ...current]);
  }, []);

  const toggle = useCallback((id: string) => {
    setTodos((current) => current.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo)));
  }, []);

  const remove = useCallback((id: string) => {
    setTodos((current) => current.filter((todo) => todo.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setTodos((current) => current.filter((todo) => !todo.done));
  }, []);

  const visible = useMemo(() => {
    if (filter === 'active') return todos.filter((todo) => !todo.done);
    if (filter === 'completed') return todos.filter((todo) => todo.done);
    return todos;
  }, [todos, filter]);

  const remaining = useMemo(() => todos.filter((todo) => !todo.done).length, [todos]);

  return { todos, visible, filter, remaining, add, toggle, remove, clearCompleted, setFilter };
}
