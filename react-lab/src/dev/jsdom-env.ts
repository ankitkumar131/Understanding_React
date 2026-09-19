// Install a jsdom window before react-dom is imported (see the notes for why).
import { JSDOM } from 'jsdom';

export interface Env {
  host: () => HTMLElement;
}

export function installJsdom(url = 'http://localhost/'): Env {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url,
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const keys = [
    'window', 'document', 'navigator', 'location', 'history', 'getComputedStyle',
    'Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement',
    'HTMLSelectElement', 'HTMLButtonElement', 'HTMLFormElement', 'HTMLAnchorElement',
    'DocumentFragment', 'Event', 'InputEvent', 'MouseEvent', 'KeyboardEvent', 'SubmitEvent',
    'CustomEvent', 'FormData', 'File', 'FileList', 'Blob', 'MutationObserver',
    'requestAnimationFrame', 'cancelAnimationFrame', 'CSSStyleDeclaration', 'DOMRect',
  ] as const;
  for (const key of keys) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: (window as unknown as Record<string, unknown>)[key],
    });
  }
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });
  return { host: () => window.document.getElementById('root') as HTMLElement };
}
