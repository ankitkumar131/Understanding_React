import { useState } from 'react';

export interface SearchBoxProps {
  items: string[];
  placeholder?: string;
}

export function SearchBox({ items, placeholder = 'Search' }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const visible = items.filter((item) => item.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div>
      <label htmlFor="search">Search products</label>
      <input
        id="search"
        type="search"
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query.trim() !== '' && visible.length === 0 ? (
        <p role="status">No products match “{query}”.</p>
      ) : (
        <ul>
          {visible.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
