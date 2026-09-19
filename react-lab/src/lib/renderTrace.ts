// Render counters used by the probes in the notes.
const counts = new Map<string, number>();

export function trace(label: string): void {
  counts.set(label, (counts.get(label) ?? 0) + 1);
}

export function reset(): void {
  counts.clear();
}

export function report(): string {
  return [...counts.entries()].map(([label, count]) => `${label}=${count}`).join(' ');
}
