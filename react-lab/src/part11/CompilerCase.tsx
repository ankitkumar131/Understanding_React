import { useState } from 'react';

export interface Item {
  id: string;
  name: string;
  priceMinor: number;
}

function ExpensiveRow({ item, onPick }: { item: Item; onPick: (id: string) => void }) {
  let total = 0;
  for (let index = 0; index < 5000; index += 1) total += index % 7;
  return (
    <li>
      <button type="button" onClick={() => onPick(item.id)}>
        {item.name} — {item.priceMinor + total - total}
      </button>
    </li>
  );
}

export function CompilerCase({ items }: { items: Item[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const visible = items.filter((item) => item.name.length > 0);
  return (
    <div>
      <p>{picked ?? 'none'}</p>
      <ul>
        {visible.map((item) => (
          <ExpensiveRow key={item.id} item={item} onPick={setPicked} />
        ))}
      </ul>
    </div>
  );
}
