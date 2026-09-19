import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));
    expect(result.current).toBe('a');
  });

  it('updates only after the delay has passed', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    expect(result.current).toBe('a');          // still debounced

    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('a');          // 299 ms is not enough

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');          // 300 ms is
  });

  it('cancels the pending update when the value changes again quickly', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ value: 'c' });                  // cancels b's timer
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe('a');          // b never arrived

    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe('c');          // only the last value arrives
  });
});
