// Part 17 / file 05 — measurement harness for "what actually costs time in a long list".
// Run: npx vitest run src/perf/renders --reporter=verbose
//
// Three variants of the same list:
//   1. List            — compiled by React Compiler 1.0 (this lab has `react({ compiler: true })`)
//   2. ListNoMemo      — `"use no memo"` opts the component out of compiler memoisation
//   3. MemoRow         — `"use no memo"` list whose rows are wrapped in `memo()`
import { memo, useState, type ComponentType, type ReactElement } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { describe, it } from 'vitest';

interface RowProps { index: number; onSelect: (index: number) => void }

let rowCalls = 0;

function Row({ index, onSelect }: RowProps) {
  rowCalls += 1;
  return <li><button onClick={() => onSelect(index)}>row {index}</button></li>;
}
const MemoRow = memo(Row);

function List({ rows, visible }: { rows: number; visible?: number }) {
  const [selected, setSelected] = useState(0);
  const count = visible === undefined ? rows : Math.min(visible, rows);
  return (
    <div>
      <p aria-live="polite">selected row {selected}</p>
      <ul>
        {Array.from({ length: count }, (_, index) => (
          <Row key={index} index={index} onSelect={setSelected} />
        ))}
      </ul>
    </div>
  );
}

// eslint-disable-next-line react-hooks/rules-of-hooks -- the directive only opts out of the compiler
function ListNoMemo({ rows, Row: RowComponent }: { rows: number; Row: ComponentType<RowProps> }) {
  'use no memo';
  const [selected, setSelected] = useState(0);
  return (
    <div>
      <p aria-live="polite">selected row {selected}</p>
      <ul>
        {Array.from({ length: rows }, (_, index) => (
          <RowComponent key={index} index={index} onSelect={setSelected} />
        ))}
      </ul>
    </div>
  );
}

function timed(label: string, element: ReactElement, clickRow = 1) {
  const { unmount } = render(element);
  const buttons = screen.getAllByRole('button');            // query outside the timer: the query itself costs time
  rowCalls = 0;
  const start = performance.now();
  act(() => { buttons[clickRow].click(); });                // row 1, not row 0: selecting 0 would bail out entirely
  const ms = performance.now() - start;
  console.log(`${label.padEnd(42)} ${ms.toFixed(1).padStart(7)} ms   rows re-rendered ${rowCalls}`);
  unmount();
  cleanup();
  return ms;
}

describe('Part 17 — what actually costs time in a long list', () => {
  it('costs of mounting a list', { timeout: 120_000 }, () => {
    render(<List rows={200} />);                             // warm-up
    cleanup();
    console.log('--- mounting (every row is rendered once) ---');
    for (const rows of [500, 1000, 2000, 4000]) {
      const start = performance.now();
      const { unmount } = render(<List rows={rows} />);
      console.log(`${`mount ${rows} rows`.padEnd(42)} ${(performance.now() - start).toFixed(1).padStart(7)} ms`);
      unmount();
      cleanup();
    }
    const start = performance.now();
    const { unmount } = render(<List rows={20000} visible={50} />);
    console.log(`${'mount 20 000 rows, windowed to 50'.padEnd(42)} ${(performance.now() - start).toFixed(1).padStart(7)} ms`);
    unmount();
    cleanup();
  });

  it('costs of updating one row', { timeout: 120_000 }, () => {
    render(<List rows={200} />);
    cleanup();
    console.log('--- one row changes state (1 000 rows) ---');
    timed('compiler memoised list', <List rows={1000} />);
    timed('"use no memo" list', <ListNoMemo rows={1000} Row={Row} />);
    timed('"use no memo" list + memo(Row)', <ListNoMemo rows={1000} Row={MemoRow} />);

    console.log('--- one row changes state (4 000 rows) ---');
    timed('compiler memoised list', <List rows={4000} />);
    timed('"use no memo" list', <ListNoMemo rows={4000} Row={Row} />);
    timed('"use no memo" list + memo(Row)', <ListNoMemo rows={4000} Row={MemoRow} />);
  });
});
