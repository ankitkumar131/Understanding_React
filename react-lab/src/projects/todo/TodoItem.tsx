// Project 2 — a presentational component: props in, events out, no state of its own.
import { memo } from 'react';
import type { Todo } from './types';

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

export const TodoItem = memo(function TodoItem({ todo, onToggle, onRemove }: TodoItemProps) {
  return (
    <li className="todo-item">
      <label>
        <input
          type="checkbox"
          checked={todo.done}
          onChange={() => onToggle(todo.id)}
          aria-label={`Mark "${todo.title}" as ${todo.done ? 'active' : 'done'}`}
        />
        <span style={{ textDecoration: todo.done ? 'line-through' : 'none' }}>{todo.title}</span>
      </label>
      <button type="button" onClick={() => onRemove(todo.id)} aria-label={`Delete "${todo.title}"`}>
        ×
      </button>
    </li>
  );
});
