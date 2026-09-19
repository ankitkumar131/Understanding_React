import { useEffect, useState } from 'react';

export interface Product {
  id: string;
  name: string;
  priceMinor: number;
}

export function ProductList({ onLoad }: { onLoad?: (products: Product[]) => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/products', { signal: controller.signal });
        if (!response.ok) throw new Error(`Request failed with ${response.status}`);
        const data = (await response.json()) as Product[];
        setProducts(data);
        onLoad?.(data);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : 'Unknown error');
      }
    })();
    return () => {
      controller.abort();
    };
  }, [onLoad]);

  if (error !== null) return <p role="alert">{error}</p>;
  if (products === null) return <p>Loading products…</p>;

  return (
    <ul aria-label="products">
      {products.map((product) => (
        <li key={product.id}>
          {product.name} — {(product.priceMinor / 100).toFixed(2)}
        </li>
      ))}
    </ul>
  );
}
