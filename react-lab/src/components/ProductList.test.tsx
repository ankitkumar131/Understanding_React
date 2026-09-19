import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { ProductList } from './ProductList';
import { server } from '../test/server';
import { sampleProducts } from '../test/handlers';

describe('ProductList', () => {
  it('shows a loading state, then the products the API returned', async () => {
    render(<ProductList />);

    expect(screen.getByText(/Loading products/)).toBeInTheDocument();

    const list = await screen.findByRole('list', { name: 'products' });
    expect(list).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(/Desk Lamp/)).toHaveTextContent('1299.50');
  });

  it('renders an alert when the API fails', async () => {
    server.use(http.get('/api/products', () => HttpResponse.json({ message: 'boom' }, { status: 500 })));
    render(<ProductList />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Request failed with 500');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('calls onLoad once with the parsed products', async () => {
    const onLoad = vi.fn();
    render(<ProductList onLoad={onLoad} />);

    await screen.findByRole('list', { name: 'products' });
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith(sampleProducts);
  });
});
