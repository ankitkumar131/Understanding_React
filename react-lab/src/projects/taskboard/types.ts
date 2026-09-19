// Project 6 — the model, and the rules that keep it valid.
export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: string;
  points: number;              // effort estimate; used by the reports page
}

export type TaskDraft = Pick<Task, 'title' | 'assignee' | 'points'>;

export const emptyTaskDraft: TaskDraft = { title: '', assignee: '', points: 1 };

export function validateTaskDraft(draft: TaskDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (draft.title.trim().length < 3) errors.title = 'Give the task a title of at least 3 characters.';
  if (draft.assignee.trim().length < 2) errors.assignee = 'Who is doing it?';
  if (!Number.isInteger(draft.points) || draft.points < 1 || draft.points > 21) errors.points = 'Points must be between 1 and 21.';
  return errors;
}
