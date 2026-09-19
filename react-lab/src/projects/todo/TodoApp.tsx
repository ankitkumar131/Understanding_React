// Project 2 — the container: it owns the input state, renders the list, and delegates logic to the hook.
import { useState, type FormEvent } from 'react';
import { TodoItem } from './TodoItem';
import { useTodos } from './useTodos';
import type { Filter } from './types';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
];

export function TodoApp() {
  const { visible, filter, remaining, add, toggle, remove, clearCompleted, setFilter } = useTodos();
  const [title, setTitle] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    add(title);
    setTitle('');                                  // clear after adding
  };

  return (
    <section className="todo-app" aria-labelledby="todo-heading">
      <h2 id="todo-heading">Todos</h2>

      <form onSubmit={handleSubmit}>
        <label htmlFor="new-todo">New todo</label>
        <input
          id="new-todo"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs doing?"
          autoComplete="off"
        />
        <button type="submit" disabled={title.trim() === ''}>
          Add
        </button>
      </form>

      <div role="group" aria-label="Filter todos">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <p data-testid="remaining">
        {remaining} {remaining === 1 ? 'item' : 'items'} left
      </p>

      {visible.length === 0 ? (
        <p data-testid="empty">Nothing here yet.</p>
      ) : (
        <ul>
          {visible.map((todo) => (
            <TodoItem key={todo.id} todo={todo} onToggle={toggle} onRemove={remove} />
          ))}
        </ul>
      )}

      <button type="button" onClick={clearCompleted}>
        Clear completed
      </button>
    </section>
  );
}
