// Part 12 — three styling strategies side by side, in one component tree.
import styles from '../styles/Button.module.scss';
import { lazy, Suspense, useState } from 'react';
import { readEnv } from '@/lib/env';   // Part 16, file 02: alias from vite.config.ts + tsconfig paths

// Part 16, file 03: a dynamic import becomes a separate chunk in the production build
const LazyPanel = lazy(() => import('../dev/lazy-panel'));

const inlineStyle = { color: 'var(--brand)', marginTop: '0.5rem' } as const;

export function StylingDemo({ label = 'Save' }: { label?: string }) {
  const [showPanel, setShowPanel] = useState(false);   // Part 16, file 03
  return (
    <section className="card">
      {/* 1. CSS Modules: scoped, hashed class names, no global collisions */}
      <button type="button" className={styles.button}>
        <span className={styles.icon}>★</span>
        {label} (module)
      </button>

      {/* 2. Tailwind utilities: styles live in the markup, no CSS files per component */}
      <button
        type="button"
        className="mt-4 rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
      >
        {label} (tailwind)
      </button>

      {/* 3. Inline style: one-off, dynamic values only */}
      <p style={inlineStyle}>Inline styles win every specificity fight and cannot be overridden by CSS.</p>

      {/* A debug log that ships to production unless the build drops console calls (Part 15, file 05) */}
      <button
        type="button"
        onClick={() => {
          console.log('[cart] add item', { sku: 'LAMP-01', priceMinor: 129950, email: 'buyer@example.com' });
          console.debug('[cart] debug detail');
        }}
      >
        Add item (logs)
      </button>

      {/* Lazy loading: the chunk arrives the first time this is opened (Part 16, file 03) */}
      <button type="button" onClick={() => setShowPanel(true)}>Show lazy panel</button>
      {showPanel && (
        <Suspense fallback={<p>Loading…</p>}>
          <LazyPanel />
        </Suspense>
      )}

      {/* The build's configuration, inlined at build time (Part 15, file 01) */}
      <p data-testid="env">
        {readEnv().appName} · {readEnv().apiUrl} · mode={readEnv().mode} · prod={String(readEnv().isProd)}
      </p>
    </section>
  );
}
