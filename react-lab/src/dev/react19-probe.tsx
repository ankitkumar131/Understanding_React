// Part 11 — React 19.2/19.3 features measured locally: Activity, useEffectEvent,
// <Context> as provider, ref cleanup functions, document metadata.
import { Activity, useEffect, useEffectEvent, useState, useContext, createContext } from 'react';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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

// A. <Context> as a provider (React 19 lets you skip .Provider)
const ThemeContext = createContext('light');
function ThemeReader() {
  const theme = useContext(ThemeContext);
  return <span data-testid="theme">{theme}</span>;
}
function ContextCase() {
  return (
    <ThemeContext value="dark">
      <ThemeReader />
    </ThemeContext>
  );
}

// B. ref callbacks may return a cleanup function
const refLog: string[] = [];
function RefCleanupCase() {
  return (
    <input
      aria-label="focused"
      ref={(node) => {
        refLog.push(`attach ${node === null ? 'null' : node.tagName}`);
        return () => {
          refLog.push('cleanup');
        };
      }}
    />
  );
}

// C. <Activity mode="hidden"> keeps state, hides the DOM, cleans up effects
function Heavy() {
  const [text, setText] = useState('typed once');
  useEffect(() => {
    trace('Heavy:effect');
    return () => {
      trace('Heavy:cleanup');
    };
  }, []);
  return (
    <input
      aria-label="heavy"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
      }}
    />
  );
}
function ActivityCase() {
  const [visible, setVisible] = useState(true);
  return (
    <div>
      <button
        type="button"
        data-testid="toggle"
        onClick={() => {
          setVisible((current) => !current);
        }}
      >
        toggle
      </button>
      <Activity mode={visible ? 'visible' : 'hidden'}>
        <Heavy />
      </Activity>
    </div>
  );
}

// D. useEffectEvent: the effect runs once, the handler sees the latest prop
function Echo({ message }: { message: string }) {
  const onTick = useEffectEvent(() => {
    say(`   effect event fired with "${message}"`);
  });
  useEffect(() => {
    trace('Echo:effect');
    const id = setInterval(onTick, 10);
    return () => {
      clearInterval(id);
    };
  }, []);
  return <p>{message}</p>;
}
function EffectEventCase() {
  const [message, setMessage] = useState('first');
  return (
    <div>
      <button
        type="button"
        data-testid="change"
        onClick={() => {
          setMessage('second');
        }}
      >
        change
      </button>
      <Echo message={message} />
    </div>
  );
}

// E. Document metadata written from a component
function MetadataCase() {
  return (
    <article>
      <title>Product page — React Lab</title>
      <meta name="description" content="Written from inside a component" />
      <p>body</p>
    </article>
  );
}

export async function run(host: () => HTMLElement): Promise<void> {
  const mounted: Mounted[] = [];

  head('<Context value> replaces <Context.Provider value>');
  reset();
  const contextCase = await mountTree(host, <ContextCase />);
  mounted.push(contextCase);
  say(`   rendered: ${contextCase.host.querySelector('[data-testid="theme"]')?.textContent ?? ''}`);
  say('   no deprecation warning was logged: React 19 accepts the context as the provider');

  head('ref callbacks can return a cleanup function');
  const refCase = await mountTree(host, <RefCleanupCase />);
  say(`   after mount: ${refLog.join(' | ')}`);
  await act(async () => {
    refCase.root.unmount();
    refCase.container.remove();
  });
  say(`   after unmount: ${refLog.join(' | ')}`);

  head('<Activity mode="hidden"> preserves state and detaches effects');
  reset();
  const activity = await mountTree(host, <ActivityCase />);
  mounted.push(activity);
  const heavy = activity.host.querySelector<HTMLInputElement>('input[aria-label="heavy"]');
  if (heavy === null) throw new Error('no heavy input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(heavy, 'kept while hidden');
    heavy.dispatchEvent(new window.InputEvent('input', { bubbles: true }));
  });
  say(`   visible value: "${heavy.value}"`);
  await act(async () => {
    activity.host.querySelector<HTMLButtonElement>('[data-testid="toggle"]')?.click();
  });
  const hiddenWrapper = activity.host.querySelector('[style*="display: none"]');
  say(`   hidden: wrapper style="${hiddenWrapper?.getAttribute('style') ?? '(none)'}", DOM nodes still present: ${String((activity.host.querySelector('input[aria-label="heavy"]') !== null))}`);
  say(`   effects: ${report()}`);
  await act(async () => {
    activity.host.querySelector<HTMLButtonElement>('[data-testid="toggle"]')?.click();
  });
  const restored = activity.host.querySelector<HTMLInputElement>('input[aria-label="heavy"]');
  say(`   after showing again: value="${restored?.value ?? '(gone)'}" effects=${report()}`);

  head('useEffectEvent: one effect run, always-fresh values');
  reset();
  const effectEvent = await mountTree(host, <EffectEventCase />);
  mounted.push(effectEvent);
  await act(async () => {
    await sleep(25);
  });
  await act(async () => {
    effectEvent.host.querySelector<HTMLButtonElement>('[data-testid="change"]')?.click();
    await sleep(5);
  });
  say(`   effects: ${report()}`);
  await act(async () => {
    await sleep(25);
  });

  head('Document metadata written from a component is hoisted to <head>');
  const metadata = await mountTree(host, <MetadataCase />);
  mounted.push(metadata);
  say(`   document.title: "${window.document.title}"`);
  say(`   meta in <head>: ${String(window.document.head.querySelector('meta[name="description"]') !== null)}`);
  say(`   article body: ${metadata.host.querySelector('p')?.textContent ?? ''}`);
  await act(async () => {
    metadata.root.unmount();
    metadata.container.remove();
  });
  say(`   after unmount, document.title: "${window.document.title}"`);

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
