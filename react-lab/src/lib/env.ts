// Part 15, file 01 — one place where the app reads its configuration.
export interface AppEnv {
  apiUrl: string;
  appName: string;
  isDev: boolean;
  isProd: boolean;
  mode: string;
}

export function readEnv(): AppEnv {
  return {
    apiUrl: import.meta.env.VITE_API_URL ?? '/api',        // typed as string (vite/client)
    appName: import.meta.env.VITE_APP_NAME ?? 'React Lab',
    isDev: import.meta.env.DEV,
    isProd: import.meta.env.PROD,
    mode: import.meta.env.MODE,
  };
}

// ⚠️ `import.meta.env.DB_PASSWORD` is undefined by design: only VITE_-prefixed
// variables are exposed to client code (the prefix is the reminder that they are public).
export const leakedSecret = (import.meta as unknown as { env: Record<string, unknown> }).env['DB_PASSWORD'];
