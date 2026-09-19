// Project 6 — a controlled form with validation, a pending state and server errors.
import { useState, type FormEvent } from 'react';
import { useCreateTask } from './hooks';
import { emptyTaskDraft, validateTaskDraft, type TaskDraft } from '../../types';

export function TaskForm() {
  const [draft, setDraft] = useState<TaskDraft>(emptyTaskDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateTask();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateTaskDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    try {
      await create.mutateAsync(draft);
      setDraft(emptyTaskDraft);
    } catch {
      // The mutation exposes `error`; the message is rendered below.
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Add a task">
      <h2>Add a task</h2>

      {create.isError && <p role="alert">{(create.error as Error).message}</p>}

      <label htmlFor="task-title">Title</label>
      <input
        id="task-title"
        value={draft.title}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        aria-invalid={errors.title !== undefined}
      />
      {errors.title !== undefined && <p role="alert">{errors.title}</p>}

      <label htmlFor="task-assignee">Assignee</label>
      <input
        id="task-assignee"
        value={draft.assignee}
        onChange={(event) => setDraft({ ...draft, assignee: event.target.value })}
        aria-invalid={errors.assignee !== undefined}
      />
      {errors.assignee !== undefined && <p role="alert">{errors.assignee}</p>}

      <label htmlFor="task-points">Points</label>
      <input
        id="task-points"
        type="number"
        min={1}
        max={21}
        value={draft.points}
        onChange={(event) => setDraft({ ...draft, points: Number(event.target.value) })}
        aria-invalid={errors.points !== undefined}
      />
      {errors.points !== undefined && <p role="alert">{errors.points}</p>}

      <button type="submit" disabled={create.isPending}>
        {create.isPending ? 'Adding…' : 'Add task'}
      </button>
    </form>
  );
}
