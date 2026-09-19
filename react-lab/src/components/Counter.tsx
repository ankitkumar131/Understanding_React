import { useState } from 'react';

export interface CounterProps {
  initial?: number;
  step?: number;
  label?: string;
}

export function Counter({ initial = 0, step = 1, label = 'Count' }: CounterProps) {
  const [count, setCount] = useState(initial);
  return (
    <div>
      <p>
        {label}: <output aria-live="polite" data-testid="count">{count}</output>
      </p>
      <button type="button" onClick={() => setCount((current) => current + step)}>
        Increment
      </button>
      <button type="button" onClick={() => setCount(initial)} disabled={count === initial}>
        Reset
      </button>
    </div>
  );
}
