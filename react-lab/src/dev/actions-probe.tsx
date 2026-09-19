// Part 11 — React 19 actions: measured behaviour.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ActionFormCase, OptimisticCase, server, UsePromiseCase, loadLabel } from '../part11/ActionsLab';
import { report, reset } from '../lib/renderTrace';

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

const setInputValue = (input: HTMLInputElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new window.InputEvent('input', { bubbles: true }));
};

export async function run(host: () => HTMLElement): Promise<void> {
  const mounted: Mounted[] = [];

  head('<form action={fn}> + useActionState + useFormStatus');
  reset();
  server.reset();
  const form = await mountTree(host, <ActionFormCase />);
  mounted.push(form);
  const input = form.host.querySelector<HTMLInputElement>('input[name="text"]');
  if (input === null) throw new Error('no input');
  say(`   before: ${form.host.querySelector('[data-testid="result"]')?.textContent ?? ''}`);
  await act(async () => {
    setInputValue(input, 'Write the probe');
    await sleep(5);
    form.host.querySelector<HTMLButtonElement>('[data-testid="save"]')?.click();
    await sleep(5); // mid-flight: the action is still awaiting
  });
  const submit = form.host.querySelector<HTMLButtonElement>('[data-testid="save"]');
  say(`   mid-flight button: "${submit?.textContent ?? ''}" disabled=${String(submit?.disabled)}`);
  await act(async () => {
    await sleep(40);
  });
  say(`   after: ${form.host.querySelector('[data-testid="result"]')?.textContent ?? ''}`);
  say(`   input value after a successful action: "${input.value}" (React reset the uncontrolled field)`);
  say(`   server calls: ${server.calls}`);
  say(`   renders: ${report()}`);

  head('useOptimistic: the row appears before the server answers, and rolls back on failure');
  reset();
  server.reset();
  server.delayMs = 60;
  const optimistic = await mountTree(host, <OptimisticCase />);
  mounted.push(optimistic);
  const optInput = optimistic.host.querySelector<HTMLInputElement>('input[name="text"]');
  if (optInput === null) throw new Error('no optimistic input');
  await act(async () => {
    setInputValue(optInput, 'New lamp');
    optimistic.host.querySelector<HTMLButtonElement>('[data-testid="add-optimistic"]')?.click();
    await sleep(20);
  });
  say(`   mid-flight list: ${optimistic.host.querySelector('[data-testid="optimistic-list"]')?.textContent ?? ''}`);
  say(`   mid-flight saving row: ${optimistic.host.querySelector('[data-saving="true"]')?.textContent ?? '(none)'}`);
  await act(async () => {
    await sleep(90);
  });
  say(`   after the server answered: ${optimistic.host.querySelector('[data-testid="optimistic-list"]')?.textContent ?? ''}`);

  head('The same flow when the server refuses');
  server.reset();
  server.delayMs = 60;
  server.failNext = true;
  const failing = await mountTree(host, <OptimisticCase />);
  mounted.push(failing);
  const failInput = failing.host.querySelector<HTMLInputElement>('input[name="text"]');
  if (failInput === null) throw new Error('no failing input');
  await act(async () => {
    setInputValue(failInput, 'Rejected lamp');
    failing.host.querySelector<HTMLButtonElement>('[data-testid="add-optimistic"]')?.click();
    await sleep(20);
  });
  say(`   mid-flight list: ${failing.host.querySelector('[data-testid="optimistic-list"]')?.textContent ?? ''}`);
  await act(async () => {
    await sleep(120);
  });
  say(`   after the failure: ${failing.host.querySelector('[data-testid="optimistic-list"]')?.textContent ?? ''}`);
  say('   the optimistic row was rolled back because the action threw');

  head('use() with a promise: Suspense while pending, the value after resolution');
  reset();
  const useCase = await mountTree(host, <UsePromiseCase index={1} />);
  mounted.push(useCase);
  say(
    `   first frame: ${useCase.host.querySelector('[data-testid="label-1"]')?.textContent ?? useCase.host.querySelector('[data-testid="label-fallback"]')?.textContent ?? '(nothing)'}`,
  );
  await act(async () => {
    await sleep(70);
  });
  say(`   after resolution: ${useCase.host.querySelector('[data-testid="label-1"]')?.textContent ?? '(nothing)'}`);
  say(`   loadLabel returns the same promise for the same key: ${String(loadLabel('products') === loadLabel('products'))}`);
  say(`   renders: ${report()}`);

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
