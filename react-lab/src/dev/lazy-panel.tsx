// Part 16, file 03 — a module that is only downloaded when the user asks for it.
export default function LazyPanel() {
  return (
    <div data-testid="lazy-panel">
      <h3>Lazily loaded panel</h3>
      <p>This component lives in its own chunk, fetched on demand.</p>
    </div>
  );
}
