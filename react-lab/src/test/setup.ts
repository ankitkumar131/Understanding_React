import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount React trees between tests so each test starts from a clean document.
afterEach(() => {
  cleanup();
});

import { afterAll, afterEach as afterEachHook, beforeAll } from 'vitest';
import { server } from './server';

// Start the mock API for the whole run; reset handlers between tests so a test can override one.
beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); });
afterEachHook(() => { server.resetHandlers(); });
afterAll(() => { server.close(); });
