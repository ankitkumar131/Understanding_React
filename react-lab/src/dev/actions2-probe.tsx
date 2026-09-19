// Part 11 — async transitions: pending, ordering, errors.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Component, startTransition, useTransition, useState } from 'react';
import { trace, reset, report } from '../lib/renderTrace';

let step = 0;
const say = (line = ''): void => console.log(line);
const head = (title: string): void => {
  step += 1;
  say('');
  say(`=== ${String.fromCharCode(64 + step)}. ${title} ===`);
};
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

interface Mounted {
  host: HTMLElement;
  container: HTMLElement;
  root: Root;
}

async function mountTree(host: () => HTMLElement, tree: ReactNode): Promise<Mounted> {
  const container = window.document.createElement('div');
  host().appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(tree);
  });
  return { host: container, container, root };
}

const log: string[] = [];
const outsideRenderCountRef = { value: 0 };

// A. isPending across an async transition
function PendingCase() {
  trace('PendingCase:render');
  const [isPending, startAsync] = useTransition();
  const [saved, setSaved] = useState(0);

  const submit = (): void => {
    startAsync(async () => {
      await sleep(40);
      log.push('server answered');
      setSaved((current) => current + 1); // ← safe: this is inside an action
    });
  };

  return (
    <div>
      <button type="button" data-testid="save" onClick={submit}>
        save
      </button>
      <p data-testid="state">
        pending={String(isPending)} saved={saved}
      </p>
    </div>
  );
}

// B. Two overlapping actions: the newest one wins
function RaceCase() {
  const [isPending, startAsync] = useTransition();
  const [label, setLabel] = useState('none');

  const load = (name: string, ms: number): void => {
    startAsync(async () => {
      await sleep(ms);
      log.push(`resolved ${name}`);
      setLabel(name);
    });
  };

  return (
    <div>
      <button type="button" data-testid="slow" onClick={() => load('slow', 80)}>
        slow
      </button>
      <button type="button" data-testid="fast" onClick={() => load('fast', 10)}>
        fast
      </button>
      <p data-testid="label">
        label={label} pending={String(isPending)}
      </p>
    </div>
  );
}

// C. An error inside an action reaches the nearest error boundary
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): ReactNode {
    return this.state.failed ? <p data-testid="boundary">something failed</p> : this.props.children;
  }
}

function ThrowingCase() {
  const [isPending, startAsync] = useTransition();
  const [status, setStatus] = useState('idle');

  const submit = (): void => {
    startAsync(async () => {
      await sleep(10);
      setStatus('about to fail');
      throw new Error('the action failed');
    });
  };

  return (
    <div>
      <button type="button" data-testid="fail" onClick={submit}>
        fail
      </button>
      <p data-testid="status">
        status={status} pending={String(isPending)}
      </p>
    </div>
  );
}

export async function run(host: () => HTMLElement): Promise<void> {
  const mounted: Mounted[] = [];

  head('Async transition: isPending is true while the action awaits');
  reset();
  const pending = await mountTree(host, <PendingCase />);
  mounted.push(pending);
  const state = (): string => pending.host.querySelector('[data-testid="state"]')?.textContent ?? '';
  say(`   before: ${state()}`);
  await act(async () => {
    pending.host.querySelector<HTMLButtonElement>('[data-testid="save"]')?.click();
    await sleep(5);
  });
  say(`   mid-flight: ${state()}`);
  await act(async () => {
    await sleep(60);
  });
  say(`   after: ${state()}`);
  say(`   renders: ${report()}`);

  head('Two overlapping actions: React does not cancel or reorder them');
  log.length = 0;
  const race = await mountTree(host, <RaceCase />);
  mounted.push(race);
  const label = (): string => race.host.querySelector('[data-testid="label"]')?.textContent ?? '';
  await act(async () => {
    race.host.querySelector<HTMLButtonElement>('[data-testid="slow"]')?.click();
    await sleep(2);
    race.host.querySelector<HTMLButtonElement>('[data-testid="fast"]')?.click();
    await sleep(20);
  });
  say(`   after the fast one resolved: ${label()}  ← the slow action is still in flight`);
  say(`   resolution order so far: ${log.join(' → ')}`);
  await act(async () => {
    await sleep(90);
  });
  say(`   after the slow one resolved: ${label()}`);
  say(`   completion order: ${log.join(' → ')}`);
  say('   both actions committed, in the order their awaits finished — so the label ends up');
  say('   "slow" even though "fast" was clicked last. An action is not a request canceller:'); 
  say('   guard with a request id or an AbortController when the newest answer must win');

  head('An error thrown inside an action reaches the error boundary');
  const boundary = await mountTree(
    host,
    <Boundary>
      <ThrowingCase />
    </Boundary>,
  );
  mounted.push(boundary);
  await act(async () => {
    boundary.host.querySelector<HTMLButtonElement>('[data-testid="fail"]')?.click();
    await sleep(40);
  });
  say(`   boundary rendered: "${boundary.host.querySelector('[data-testid="boundary"]')?.textContent ?? '(nothing)'}"`);
  say('   the action error was not swallowed: React re-threw it during the commit it triggered');

  head('startTransition also works outside a component');
  let outsideRendered = false;
  const OutsideCase = () => {
    const [, setValue] = useState(0);
    outsideRendered = true;
    outsideRenderCountRef.value += 1;
    return (
      <button
        type="button"
        onClick={() => {
          setValue((current) => current + 1);
        }}
      >
        outside
      </button>
    );
  };
  const outside = await mountTree(host, <OutsideCase />);
  mounted.push(outside);
  const before = outsideRenderCountRef.value;
  startTransition(() => {
    say('   startTransition called from module scope: marking the update non-urgent');
  });
  say(`   renders before/after the module-scope call: ${String(before)}/${String(outsideRenderCountRef.value)} (no state changed, so no render)`);
  say(`   outsideRendered flag: ${String(outsideRendered)}`);

  head('Cleaning up');
  await act(async () => {
    for (const item of mounted) {
      item.root.unmount();
      item.container.remove();
    }
  });
  say('   trees unmounted');
  say('');
  say('=== done ===');
}
