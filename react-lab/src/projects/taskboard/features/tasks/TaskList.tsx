// Project 6 — the list: loading, error (with retry) and empty states are all first-class.
import { useDeleteTask, useSetTaskStatus, useTasks } from './hooks';
import type { TaskStatus } from '../../types';

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'done', done: 'todo' };
const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', doing: 'In progress', done: 'Done' };

export function TaskList() {
  const { data: tasks, error, isPending, refetch } = useTasks();
  const setStatus = useSetTaskStatus();
  const remove = useDeleteTask();

  if (isPending) return <p role="status">Loading tasks…</p>;

  if (error !== null && error !== undefined) {
    return (
      <div role="alert">
        <p>{(error as Error).message}</p>
        <button type="button" onClick={() => void refetch()}>Try again</button>
      </div>
    );
  }

  if (tasks === undefined || tasks.length === 0) {
    return <p data-testid="empty">No tasks yet — add the first one above.</p>;
  }

  return (
    <>
      {setStatus.isError && <p role="alert">Could not update that task: {(setStatus.error as Error).message}</p>}
      <ul aria-label="Tasks">
        {tasks.map((task) => (
          <li key={task.id}>
            <span>{task.title}</span>
            <span> · {task.assignee} · {task.points} pt</span>
            <button
              type="button"
              onClick={() => setStatus.mutate({ id: task.id, status: NEXT_STATUS[task.status] })}
              aria-label={`Move ${task.title} from ${STATUS_LABEL[task.status]} to ${STATUS_LABEL[NEXT_STATUS[task.status]]}`}
            >
              {STATUS_LABEL[task.status]}
            </button>
            <button type="button" onClick={() => remove.mutate(task.id)} aria-label={`Delete ${task.title}`}>×</button>
          </li>
        ))}
      </ul>
    </>
  );
}
