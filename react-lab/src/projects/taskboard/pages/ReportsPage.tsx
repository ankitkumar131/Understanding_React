// Project 6 — a lazily loaded page: it is in its own chunk, fetched when the route is visited.
import { useTasks } from '../features/tasks/hooks';

export default function ReportsPage() {
  const { data: tasks, isPending, error } = useTasks();

  if (isPending) return <p role="status">Loading report…</p>;
  if (error !== null && error !== undefined) return <p role="alert">{(error as Error).message}</p>;

  const list = tasks ?? [];
  const byStatus = {
    todo: list.filter((task) => task.status === 'todo').length,
    doing: list.filter((task) => task.status === 'doing').length,
    done: list.filter((task) => task.status === 'done').length,
  };
  const totalPoints = list.reduce((sum, task) => sum + task.points, 0);
  const donePoints = list.filter((task) => task.status === 'done').reduce((sum, task) => sum + task.points, 0);
  const completion = totalPoints === 0 ? 0 : Math.round((donePoints / totalPoints) * 100);

  return (
    <section aria-labelledby="report-heading">
      <h2 id="report-heading">Report</h2>
      <p data-testid="completion">{completion}% of points complete</p>
      <ul>
        <li>To do: {byStatus.todo}</li>
        <li>In progress: {byStatus.doing}</li>
        <li>Done: {byStatus.done}</li>
      </ul>
    </section>
  );
}
