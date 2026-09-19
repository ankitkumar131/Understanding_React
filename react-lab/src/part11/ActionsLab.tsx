// Part 11 lab — React 19 actions, form status, optimistic UI and use().
import { Suspense, use, useActionState, useOptimistic, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { trace } from '../lib/renderTrace';

export interface Todo {
  id: string;
  text: string;
  saving?: boolean;
}

// ---------------------------------------------- a fake server
export const server = {
  calls: 0,
  delayMs: 20,
  failNext: false,
  todos: [{ id: 't1', text: 'Read part 11' }] as Todo[],
  reset(): void {
    server.calls = 0;
    server.delayMs = 20;
    server.failNext = false;
    server.todos = [{ id: 't1', text: 'Read part 11' }];
  },
  async add(text: string): Promise<Todo> {
    server.calls += 1;
    await new Promise((resolve) => setTimeout(resolve, server.delayMs));
    if (server.failNext) {
      server.failNext = false;
      throw new Error('server refused the todo');
    }
    const todo = { id: `t${server.todos.length + 1}`, text };
    server.todos = [...server.todos, todo];
    return todo;
  },
};

// ---------------------------------------------- A/B. <form action> + useActionState + useFormStatus
export function SubmitButton() {
  const { pending, data, method } = useFormStatus();
  trace(`SubmitButton:render pending=${String(pending)}`);
  return (
    <button type="submit" data-testid="save" disabled={pending}>
      {pending ? `saving ${String(data?.get('text') ?? '')} (${method})` : 'save'}
    </button>
  );
}

export function ActionFormCase() {
  trace('ActionFormCase:render');
  const [state, formAction, isPending] = useActionState(
    async (_previous: { count: number; last: string }, formData: FormData) => {
      const text = String(formData.get('text') ?? '');
      const todo = await server.add(text);
      return { count: _previous.count + 1, last: todo.text };
    },
    { count: 0, last: '' },
  );

  return (
    <form action={formAction}>
      <input name="text" aria-label="text" defaultValue="" />
      <SubmitButton />
      <p data-testid="result">
        saved={state.count} last={state.last} pending={String(isPending)}
      </p>
    </form>
  );
}

// ---------------------------------------------- C. useOptimistic with rollback
export function OptimisticCase() {
  trace('OptimisticCase:render');
  const [todos, setTodos] = useState<Todo[]>(server.todos);
  const [optimistic, addOptimistic] = useOptimistic(todos, (current: Todo[], text: string) => [
    ...current,
    { id: `pending-${current.length}`, text, saving: true },
  ]);

  const [, startTransition] = useTransition();

  const submit = (formData: FormData): void => {
    const text = String(formData.get('text') ?? '');
    startTransition(async () => {
      addOptimistic(text);
      try {
        const saved = await server.add(text);
        setTodos((current) => [...current, saved]);
      } catch {
        // nothing: the optimistic row disappears when the transition ends
      }
    });
  };

  return (
    <form action={submit}>
      <input name="text" aria-label="optimistic-text" defaultValue="" />
      <button type="submit" data-testid="add-optimistic">
        add
      </button>
      <ul data-testid="optimistic-list">
        {optimistic.map((todo) => (
          <li key={todo.id} data-saving={String(todo.saving ?? false)}>
            {todo.text}
          </li>
        ))}
      </ul>
    </form>
  );
}

// ---------------------------------------------- D. use() with a promise
const cache = new Map<string, Promise<string>>();
export function loadLabel(key: string): Promise<string> {
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const promise = new Promise<string>((resolve) => {
    setTimeout(() => resolve(`label for ${key}`), 30);
  });
  cache.set(key, promise);
  return promise;
}

function Label({ promise, index }: { promise: Promise<string>; index: number }) {
  const text = use(promise);
  trace(`Label:render #${index}`);
  return <span data-testid={`label-${index}`}>{text}</span>;
}

export function UsePromiseCase({ index }: { index: number }) {
  return (
    <Suspense fallback={<span data-testid="label-fallback">loading label</span>}>
      <Label promise={loadLabel('products')} index={index} />
    </Suspense>
  );
}

// ---------------------------------------------- E. use(context) instead of useContext
export function UseContextCase() {
  trace('UseContextCase:render');
  return <p>see the probe: use(ThemeContext) replaced useContext with no other change</p>;
}
