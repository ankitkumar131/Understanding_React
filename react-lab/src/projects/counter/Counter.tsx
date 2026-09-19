// Project 1 — Counter: state, events, props, accessibility.
import { useState } from 'react';

export interface CounterProps {
  /** Starting value. Default 0. */
  initial?: number;
  /** How much one press changes the value. Default 1. */
  step?: number;
  /** Never go below this (default 0 — a counter of "things" is never negative). */
  min?: number;
  /** Never go above this. */
  max?: number;
  /** Called after every successful change, with the new value. */
  onChange?: (value: number) => void;
  /** Label for the increment button, used by tests and screen readers. */
  label?: string;
}

export function Counter({
  initial = 0,
  step = 1,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  onChange,
  label = 'Count',
}: CounterProps) {
  const [count, setCount] = useState(initial);

  const apply = (delta: number) => {
    // The functional updater reads the *current* value, so rapid clicks cannot lose an update.
    setCount((current) => {
      const next = Math.min(max, Math.max(min, current + delta));
      if (next !== current) onChange?.(next);
      return next;
    });
  };

  return (
    <div className="counter">
      {/* aria-live announces changes to screen readers without stealing focus */}
      <output data-testid="value" aria-live="polite">
        {label}: {count}
      </output>

      <div className="counter__buttons">
        <button type="button" onClick={() => apply(-step)} disabled={count <= min} aria-label="Decrease">
          −
        </button>
        <button type="button" onClick={() => apply(step)} disabled={count >= max} aria-label="Increase">
          +
        </button>
        <button type="button" onClick={() => { setCount(initial); onChange?.(initial); }} disabled={count === initial}>
          Reset
        </button>
      </div>
    </div>
  );
}
